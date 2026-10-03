import { createSelector } from '@reduxjs/toolkit';
import { isLate } from '@shared/protocol';
import type { RootState } from './index';

// Everything the screens show is derived here from the store, so components
// only render. Selectors built with createSelector return the same object until
// one of their inputs changes, which keeps re-renders to what actually changed.

// ── message list ─────────────────────────────────────────────────────────────

/** One receipt per message (handoff "Receipts" table). */
export type Receipt =
  | { kind: 'time' } // someone else's message: just the time
  | { kind: 'heard'; heardBy: number } // mine, committed: "Heard by N"
  | { kind: 'queued' } // mine, on the phone, auto-retrying: "Not sent yet"
  | { kind: 'sending'; percent: number | null } // mine, uploading: "Sending 60%" / "Sending…"
  | { kind: 'failed' }; // mine, needs a manual retry: "Not sent"

export interface Row {
  id: string;
  mine: boolean;
  name: string;
  durationMs: number;
  at: number; // when it was said, in phone time
  receipt: Receipt;
  late: boolean;
  missed: boolean;
  cutShort: boolean;
  pending: boolean; // still in my outbox (deletable)
}

export const selectRows = createSelector(
  [
    (state: RootState) => state.messages.list,
    (state: RootState) => state.outbox.items,
    (state: RootState) => state.playback.missed,
    (state: RootState) => state.session.clientId,
    (state: RootState) => state.session.serverOffset,
    (state: RootState) => state.connection.net,
    (state: RootState) => state.connection.linkUp,
  ],
  (messages, outbox, missed, myClientId, serverOffset, network, linkUp): Row[] => {
    const committed = new Set(messages.map((message) => message.id));
    const rows: Row[] = messages.map((message) => ({
      id: message.id,
      mine: message.senderId === myClientId,
      name: message.senderName,
      durationMs: message.durationMs,
      at: message.recordedAt - serverOffset,
      receipt: message.senderId === myClientId ? { kind: 'heard', heardBy: message.heardBy } : { kind: 'time' },
      late: isLate(message),
      missed: missed.includes(message.id),
      cutShort: false,
      pending: false,
    }));
    // My unsent clips sit at the bottom in the order I recorded them.
    const unsent = Object.values(outbox)
      .filter((entry) => entry.status !== 'recording' && !committed.has(entry.clipId))
      .sort((first, second) => first.recordedAt - second.recordedAt);
    for (const entry of unsent) {
      let receipt: Receipt;
      if (entry.status === 'failed') receipt = { kind: 'failed' };
      else if (network === 'offline' || !linkUp) receipt = { kind: 'queued' };
      else receipt = { kind: 'sending', percent: network === 'weak' ? Math.round(entry.progress * 100) : null };
      rows.push({
        id: entry.clipId,
        mine: true,
        name: 'You',
        durationMs: entry.durationMs,
        at: entry.recordedAt - serverOffset,
        receipt,
        late: false,
        missed: false,
        cutShort: !!entry.cutShort,
        pending: true,
      });
    }
    return rows;
  },
);

/** Which clip is loaded in the player, without its position, so the list doesn't re-render on every progress tick. */
export const selectNowPlaying = createSelector(
  [
    (state: RootState) => state.playback.current?.messageId ?? null,
    (state: RootState) => state.playback.current?.playing ?? false,
    (state: RootState) => state.playback.current?.durationMs ?? 0,
    (state: RootState) => state.playback.queue[0] ?? null,
  ],
  (messageId, playing, durationMs, firstInQueue) => ({
    messageId,
    playing,
    durationMs,
    nextMessageId: playing ? firstInQueue : null,
  }),
);

export const selectSavedCount = (state: RootState) =>
  Object.values(state.outbox.items).filter((entry) => entry.status !== 'recording').length;

// ── channel screen ───────────────────────────────────────────────────────────

/** Everyone online except me. */
const selectListeners = (state: RootState) => Math.max(0, state.connection.online - 1);

/** What the big push-to-talk button shows (screens 02–08). */
export type PushToTalkState =
  | { kind: 'idle'; offline: boolean }
  | { kind: 'pending' }
  | { kind: 'live'; startedAt: number; listeners: number; level: number }
  | { kind: 'local'; startedAt: number; level: number; offline: boolean }
  | { kind: 'receiving'; name: string; startedAt: number; level: number }
  | { kind: 'micOff' };

export const selectPushToTalkState = createSelector(
  [
    (state: RootState) => state.floor.micDenied,
    (state: RootState) => state.floor.myTalk,
    (state: RootState) => state.floor.speaker,
    (state: RootState) => state.floor.level,
    (state: RootState) => state.connection.net === 'offline',
    (state: RootState) => state.session.serverOffset,
    selectListeners,
  ],
  (micDenied, myTalk, speaker, level, offline, serverOffset, listeners): PushToTalkState => {
    if (micDenied) return { kind: 'micOff' };
    if (myTalk?.mode === 'live') return { kind: 'live', startedAt: myTalk.startedAt, listeners, level };
    if (myTalk?.mode === 'local') return { kind: 'local', startedAt: myTalk.startedAt, level, offline };
    if (myTalk?.mode === 'pending') return { kind: 'pending' };
    if (speaker) return { kind: 'receiving', name: speaker.name, startedAt: speaker.startedAt - serverOffset, level };
    return { kind: 'idle', offline };
  },
);

/** The line under the channel name. Later rules win: a notice beats everything. */
export function selectSubtitle(state: RootState): string {
  const { connection, floor } = state;
  if (floor.notice) return floor.notice;
  if (connection.net === 'offline') return `${connection.onlineAtDrop ?? connection.online} online when you lost signal`;
  if (floor.myTalk?.mode === 'live') return `Live to ${selectListeners(state)}`;
  return connection.everConnected ? `${connection.online} online` : 'Connecting…';
}
