import { micPermission } from '@/audio/recorder';
import type { AppStore } from '@/store';
import { netEvent, setNextRetry } from '@/store/slices/connection';
import { setHolding, setMicDenied, setMyTalkMode, setNotice } from '@/store/slices/floor';
import NetInfo from '@react-native-community/netinfo';
import { Alert, Linking } from 'react-native';
import { createOutbox } from './outbox';
import { createPlayback } from './playback';
import { registry } from './registry';
import { createServerEvents, type ServerEvents } from './serverEvents';
import { createSocket } from './socket';
import { createTalk } from './talk';

// The app's engine, created once the user has a name. It builds the parts and
// connects them; the screens call the methods it returns.
//
//   socket.ts        one WebSocket with heartbeats and reconnects
//   serverEvents.ts  what to do with each message from the server
//   talk.ts          pressing the button: record, go live, hand the clip to the outbox
//   outbox.ts        uploading my clips until the server has committed them
//   playback.ts      playing recorded messages, one at a time

const NETWORK_TICK_MS = 250; // how often the network state machine checks its timers
const NOTICE_MS = 5000;

export function createController(store: AppStore) {
  const { dispatch, getState } = store;

  let noticeTimer: ReturnType<typeof setTimeout> | null = null;
  /** A short line under the channel name, cleared after a few seconds. */
  function showNotice(text: string, durationMs = NOTICE_MS) {
    dispatch(setNotice(text));
    if (noticeTimer) clearTimeout(noticeTimer);
    noticeTimer = setTimeout(() => dispatch(setNotice(null)), durationMs);
  }

  // The socket and the server-event handlers need each other, so the socket
  // forwards to `serverEvents`, which is created once everything else exists.
  let serverEvents: ServerEvents;
  const socket = createSocket({
    hello: () => serverEvents.hello(),
    onLinkUp: () => serverEvents.onLinkUp(),
    onLinkDown: () => serverEvents.onLinkDown(),
    onPong: (roundTripMs, serverTime) => serverEvents.onPong(roundTripMs, serverTime),
    onPingMissed: () => serverEvents.onPingMissed(),
    onRetryScheduled: (at) => dispatch(setNextRetry(at)),
    onMessage: (message) => serverEvents.onMessage(message),
    onBinary: (data) => serverEvents.onBinary(data),
  });
  const outbox = createOutbox({
    dispatch,
    getState,
    onCommitted: (message) => serverEvents.onCommitted([message], false),
  });
  const playback = createPlayback({
    store,
    socket,
    showNotice,
    isSomeoneTalking: () => talk.isRecording() || getState().floor.speaker !== null,
  });
  const talk = createTalk({ store, socket, outbox, playback, showNotice });
  serverEvents = createServerEvents({ store, socket, outbox, talk, playback, showNotice });

  // ── always running in the background ──────────────────────────────────────

  const networkTicker = setInterval(() => dispatch(netEvent({ type: 'tick', at: Date.now() })), NETWORK_TICK_MS);

  // The OS knows about wifi on/off before any timeout would: act on it at once.
  const stopListeningToNetInfo = NetInfo.addEventListener((networkInfo) => {
    if (networkInfo.isConnected === false) socket.dropNow();
    else if (networkInfo.isConnected) socket.retryNow();
  });

  // Streaming needs a good link: if it degrades mid-talk, keep recording and
  // send the clip whole afterwards (record-and-send).
  let previousNetwork = getState().connection.net;
  const stopWatchingNetwork = store.subscribe(() => {
    const network = getState().connection.net;
    if (network === previousNetwork) return;
    previousNetwork = network;
    const myTalk = getState().floor.myTalk;
    if (myTalk && myTalk.mode !== 'local' && (network === 'weak' || network === 'offline')) {
      dispatch(setMyTalkMode('local'));
    }
  });

  // ── what the screens call ──────────────────────────────────────────────────

  const controller = {
    async start() {
      outbox.restore();
      const granted = (await micPermission(false)) || (await micPermission(true));
      dispatch(setMicDenied(!granted));
      if (!granted) {
        Alert.alert(
          'Microphone access needed',
          'Teton Talk needs your microphone to talk on the channel. Turn it on in Settings.',
          [
            { text: 'Not now', style: 'cancel' },
            { text: 'Open Settings', onPress: () => Linking.openSettings() },
          ],
        );
      }
      socket.start();
    },
    stop() {
      clearInterval(networkTicker);
      stopListeningToNetInfo();
      stopWatchingNetwork();
      socket.stop();
    },
    pressIn() {
      dispatch(setHolding(true));
      // Someone is live: keep holding and you go live when they stop (04).
      if (getState().floor.speaker) return;
      void talk.begin();
    },
    pressOut() {
      dispatch(setHolding(false));
      if (talk.isRecording()) void talk.end();
    },
    togglePlay: (messageId: string) => playback.toggle(messageId),
    replayAll: () => playback.playAllMissed(),
    retryNow() {
      socket.retryNow();
      outbox.flushNow();
    },
    /** New name: reconnect so the server announces it. */
    reconnect() {
      socket.stop();
      socket.start();
    },
    retryClip: (clipId: string) => outbox.retry(clipId),
    deleteQueued(clipId: string) {
      playback.stopIfPlaying(clipId);
      outbox.discard(clipId);
    },
  };
  registry.controller = controller;
  return controller;
}

export type Controller = ReturnType<typeof createController>;
