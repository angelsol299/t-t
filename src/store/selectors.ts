import { createSelector } from '@reduxjs/toolkit';
import { isLate } from '@shared/protocol';
import { channelApi } from './api/channelApi';
import type { RootState } from './index';

// One receipt per message (handoff "Receipts" table).
export type Receipt =
  | { kind: 'time' } // someone else's message: just the time
  | { kind: 'heard'; n: number } // mine, committed: "Heard by N"
  | { kind: 'queued' } // mine, on the phone, auto-retrying: "Not sent yet"
  | { kind: 'sending'; pct: number | null } // mine, uploading: "Sending 60%" / "Sending…"
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
    (s: RootState) => selectMessages(s).data,
    (s: RootState) => s.outbox.items,
    (s: RootState) => s.playback.missed,
    (s: RootState) => s.session.clientId,
    (s: RootState) => s.session.serverOffset,
    (s: RootState) => s.connection.net,
    (s: RootState) => s.connection.linkUp,
  ],
  (messages = [], outbox, missed, me, offset, net, linkUp): Row[] => {
    const committed = new Set(messages.map((m) => m.id));
    const rows: Row[] = messages.map((m) => ({
      id: m.id,
      mine: m.senderId === me,
      name: m.senderName,
      durationMs: m.durationMs,
      at: m.recordedAt - offset,
      receipt: m.senderId === me ? { kind: 'heard', n: m.heardBy } : { kind: 'time' },
      late: isLate(m),
      missed: missed.includes(m.id),
      cutShort: false,
      pending: false,
    }));
    // My unsent clips sit at the bottom in the order I recorded them.
    const pending = Object.values(outbox)
      .filter((o) => o.status !== 'recording' && !committed.has(o.clipId))
      .sort((a, b) => a.recordedAt - b.recordedAt);
    for (const o of pending) {
      let receipt: Receipt;
      if (o.status === 'failed') receipt = { kind: 'failed' };
      else if (net === 'offline' || !linkUp) receipt = { kind: 'queued' };
      else receipt = { kind: 'sending', pct: net === 'weak' ? Math.round(o.progress * 100) : null };
      rows.push({
        id: o.clipId,
        mine: true,
        name: 'You',
        durationMs: o.durationMs,
        at: o.recordedAt - offset,
        receipt,
        late: false,
        missed: false,
        cutShort: !!o.cutShort,
        pending: true,
      });
    }
    return rows;
  },
);

export const selectSavedCount = (s: RootState) =>
  Object.values(s.outbox.items).filter((o) => o.status !== 'recording').length;
