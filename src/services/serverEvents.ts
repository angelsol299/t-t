import { streamPlayer } from '@/audio/streamPlayer';
import type { AppStore } from '@/store';
import { netEvent, setMissedOnReturn, setOnline } from '@/store/slices/connection';
import { setLevel, setLostRaceTo, setMyTalkMode, setSpeaker } from '@/store/slices/floor';
import { setHeardBy, upsertMessages } from '@/store/slices/messages';
import { enqueue, markMissed } from '@/store/slices/playback';
import { advanceSeq, setServerOffset } from '@/store/slices/session';
import { meterLevel, mulawRootMeanSquare } from '@shared/mulaw';
import { chunkCountFor, decodeChunkFrame, type ChannelMessage, type ClientMessage, type ServerMessage } from '@shared/protocol';
import { doubleBuzz } from './haptics';
import type { Outbox } from './outbox';
import type { Playback } from './playback';
import type { Socket } from './socket';
import type { Talk } from './talk';

// Reacting to the server. The socket calls these: link events (up, down,
// heartbeats), one handler per server message type, and binary audio frames.

const CLOCK_DRIFT_TOLERANCE_MS = 250; // ignore tiny changes in the server clock offset

interface ServerEventDependencies {
  store: AppStore;
  socket: Socket;
  outbox: Outbox;
  talk: Talk;
  playback: Playback;
  showNotice: (text: string, durationMs?: number) => void;
}

type MessageOf<T extends ServerMessage['type']> = Extract<ServerMessage, { type: T }>;

export function createServerEvents({ store, socket, outbox, talk, playback, showNotice }: ServerEventDependencies) {
  const { dispatch, getState } = store;

  // ── link ───────────────────────────────────────────────────────────────────

  /** The first message on every new connection: who I am and the last message I saw. */
  function hello(): Extract<ClientMessage, { type: 'hello' }> {
    const session = getState().session;
    return { type: 'hello', clientId: session.clientId, name: session.name ?? 'Unknown', lastSeq: session.lastSeq };
  }

  function onLinkUp() {
    dispatch(netEvent({ type: 'link_up', at: Date.now() }));
  }

  function onLinkDown() {
    dispatch(netEvent({ type: 'link_down', at: Date.now() }));
    // I can no longer hear the speaker or reach listeners.
    streamPlayer.end();
    dispatch(setSpeaker(null));
    const myTalk = getState().floor.myTalk;
    if (myTalk && myTalk.mode !== 'local') dispatch(setMyTalkMode('local'));
  }

  function onPong(roundTripMs: number, serverTime: number) {
    dispatch(netEvent({ type: 'pong', at: Date.now(), roundTripMs }));
    const offset = Math.round(serverTime - Date.now());
    if (Math.abs(offset - getState().session.serverOffset) > CLOCK_DRIFT_TOLERANCE_MS) dispatch(setServerOffset(offset));
  }

  function onPingMissed() {
    dispatch(netEvent({ type: 'ping_missed', at: Date.now() }));
  }

  // ── server messages ────────────────────────────────────────────────────────

  /** Connected: presence, the clock, who is talking, and everything I missed while away. */
  function onWelcome(welcome: MessageOf<'welcome'>) {
    dispatch(setOnline(welcome.online));
    dispatch(setServerOffset(welcome.serverTime - Date.now()));
    const someoneElseIsTalking = welcome.floor && welcome.floor.clientId !== getState().session.clientId;
    dispatch(setSpeaker(someoneElseIsTalking ? welcome.floor : null));
    const isFirstJoin = getState().session.lastSeq === 0;
    const missedCount = onCommitted(welcome.missed, isFirstJoin);
    if (getState().connection.net === 'recovering') dispatch(setMissedOnReturn(missedCount));
    outbox.flushNow();
  }

  /** 08: someone else's request reached the server first. Nothing of mine is recorded. */
  function onFloorDenied(denied: MessageOf<'floor_denied'>) {
    if (!talk.isRecordingClip(denied.clipId)) return;
    void talk.discard();
    dispatch(setLostRaceTo(denied.speaker));
    dispatch(setSpeaker(denied.speaker));
    streamPlayer.begin(denied.speaker.clipId);
    doubleBuzz();
  }

  /** 04: someone else started talking. */
  function onFloorTaken(taken: MessageOf<'floor_taken'>) {
    dispatch(setSpeaker(taken.speaker));
    streamPlayer.begin(taken.speaker.clipId);
    playback.pauseForTalk();
  }

  /** The speaker stopped, or their link dropped (the full clip still arrives later). */
  function onFloorFree(free: MessageOf<'floor_free'>) {
    const speaker = getState().floor.speaker;
    if (!speaker || speaker.clipId !== free.clipId) return;
    streamPlayer.end();
    dispatch(setSpeaker(null));
    dispatch(setLevel(0));
    if (free.reason !== 'released') showNotice(`${speaker.name}'s signal dropped — the message will arrive in full`);
    // Still holding after losing the race: you go live the moment they stop.
    if (getState().floor.holding && !talk.isRecording()) {
      dispatch(setLostRaceTo(null));
      void talk.begin(true);
    } else {
      playback.resumeAfterTalk();
    }
  }

  function onMessage(message: ServerMessage) {
    switch (message.type) {
      case 'welcome':
        return onWelcome(message);
      case 'presence':
        return dispatch(setOnline(message.online));
      case 'floor_granted':
        return talk.onFloorGranted(message.clipId);
      case 'floor_denied':
        return onFloorDenied(message);
      case 'floor_taken':
        return onFloorTaken(message);
      case 'floor_free':
        return onFloorFree(message);
      case 'chunk_ack':
        outbox.markAcknowledged(message.clipId, message.upTo);
        return talk.onLiveChunksAcknowledged(message.clipId, message.upTo);
      case 'message':
        onCommitted([message.message], false);
        return;
      case 'receipt':
        return dispatch(setHeardBy({ messageId: message.messageId, heardBy: message.heardBy }));
    }
  }

  /** A live audio chunk from the current speaker. */
  function onBinary(data: Uint8Array) {
    const frame = decodeChunkFrame(data);
    const speaker = getState().floor.speaker;
    if (!frame || !speaker || speaker.clipId !== frame.clipId) return;
    if (talk.isLive()) return; // half duplex: no listening while I'm on air
    streamPlayer.chunk(frame.clipId, frame.seq, frame.payload);
    dispatch(setLevel(meterLevel(mulawRootMeanSquare(frame.payload))));
  }

  /**
   * New committed messages, from the socket, a catch-up, or my own upload.
   * Returns how many I missed (didn't hear live in full): the "2 missed" count.
   * On a first join the history is not tagged MISSED.
   */
  function onCommitted(messages: ChannelMessage[], isFirstJoinHistory: boolean): number {
    if (messages.length === 0) return 0;
    dispatch(upsertMessages(messages));
    dispatch(advanceSeq(Math.max(...messages.map((message) => message.seq))));
    const myClientId = getState().session.clientId;
    const missedIds: string[] = [];
    for (const message of messages) {
      if (message.senderId === myClientId) {
        outbox.markCommitted(message.id);
        continue;
      }
      const heardItAllLive = streamPlayer.heardChunks(message.id) >= chunkCountFor(message.durationMs);
      if (heardItAllLive) {
        socket.send({ type: 'played', messageId: message.id });
      } else if (!isFirstJoinHistory && !getState().playback.missed.includes(message.id)) {
        missedIds.push(message.id);
      }
      streamPlayer.forget(message.id);
    }
    if (missedIds.length > 0) {
      dispatch(markMissed(missedIds));
      dispatch(enqueue(missedIds));
      playback.playNext();
    }
    return missedIds.length;
  }

  return { hello, onLinkUp, onLinkDown, onPong, onPingMissed, onMessage, onBinary, onCommitted };
}

export type ServerEvents = ReturnType<typeof createServerEvents>;
