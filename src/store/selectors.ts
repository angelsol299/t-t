import { createSelector } from '@reduxjs/toolkit';
import { isLate } from '@shared/protocol';
import { channelApi } from './api/channelApi';
import type { RootState } from './index';

// One receipt per message (handoff "Receipts" table).
export type Receipt =
  | { kind: 'time' } // someone else's message: just the time
  | { kind: 'heard'; n: number } // mine, committed: "Heard by N"
  | { kind: 'queued' } // mine, on the phone, auto-retrying: "Not sent yet"
  | { kind: 'sending'; percent: number | null } // mine, uploading: "Sending 60%" / "Sending…"
  | { kind: 'failed' }; // mine, needs a manual retry: "Not sent"

export interface Row {
  id: string;
  mine: boolean;
  name: string;
  durationMs: number;
  at: number; // when it was said
  receipt: Receipt;
  late: boolean;
  missed: boolean;
  cutShort: boolean;
  pending: boolean; // still in my outbox (deletable)
}

const selectMessages = channelApi.endpoints.getMessages.select();

export const selectRows = createSelector(
  [
    (state: RootState) => selectMessages(state).data,
    (state: RootState) => state.outbox.items,
    (state: RootState) => state.playback.missed,
    (state: RootState) => state.session.clientId,
    (state: RootState) => state.session.serverOffset,
    (state: RootState) => state.connection.net,
    (state: RootState) => state.connection.linkUp,
  ],
  (messages = [], outbox, missed, me, offset, net, linkUp): Row[] => {
    const committed = new Set(messages.map((message) => message.id));
    const rows: Row[] = messages.map((message) => ({
      id: message.id,
      mine: message.senderId === me,
      name: message.senderName,
      durationMs: message.durationMs,
      at: message.recordedAt - offset,
      receipt: message.senderId === me ? { kind: 'heard', n: message.heardBy } : { kind: 'time' },
      late: isLate(message),
      missed: missed.includes(message.id),
      cutShort: false,
      pending: false,
    }));
    // My unsent clips sit at the bottom in the order I recorded them.
    const pending = Object.values(outbox)
      .filter((entry) => entry.status !== 'recording' && !committed.has(entry.clipId))
      .sort((first, second) => first.recordedAt - second.recordedAt);
    for (const entry of pending) {
      let receipt: Receipt;
      if (entry.status === 'failed') receipt = { kind: 'failed' };
      else if (net === 'offline' || !linkUp) receipt = { kind: 'queued' };
      else receipt = { kind: 'sending', percent: net === 'weak' ? Math.round(entry.progress * 100) : null };
      rows.push({
        id: entry.clipId,
        mine: true,
        name: 'You',
        durationMs: entry.durationMs,
        at: entry.recordedAt - offset,
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

export const selectSavedCount = (state: RootState) =>
  Object.values(state.outbox.items).filter((entry) => entry.status !== 'recording').length;
