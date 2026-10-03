import { isAnyOf, type ListenerMiddlewareInstance } from '@reduxjs/toolkit';
import { randomUUID } from 'expo-crypto';
import { keyValueStore, messageCache } from '@/services/db';
import type { RootState } from './index';
import { setHeardBy, upsertMessages, type MessagesState } from './slices/messages';
import { finished, markMissed, type PlaybackState } from './slices/playback';
import { advanceSeq, setName, setServerOffset, type SessionState } from './slices/session';

// What survives an app restart, all in SQLite:
//
//   session           name, clientId, lastSeq, serverOffset   kv table
//   playback.missed   which messages are tagged MISSED         kv table
//   messages          this shift's committed messages          messages table
//   outbox            my clips not on the server yet           outbox table (saved by services/outbox.ts as it works)
//
// loadSavedState() fills the store at launch; startSaving() writes changes back.

const SHIFT_MS = 12 * 60 * 60 * 1000; // the message list only keeps the current shift

export function loadSavedState(): { session: SessionState; playback: PlaybackState; messages: MessagesState } {
  let clientId = keyValueStore.get<string | null>('clientId', null);
  if (!clientId) {
    clientId = randomUUID(); // first launch: this phone's permanent id
    keyValueStore.set('clientId', clientId);
  }
  messageCache.prune(Date.now() - SHIFT_MS);
  return {
    session: {
      name: keyValueStore.get<string | null>('name', null),
      clientId,
      lastSeq: keyValueStore.get<number>('lastSeq', 0),
      serverOffset: keyValueStore.get<number>('serverOffset', 0),
    },
    playback: { current: null, queue: [], missed: keyValueStore.get<string[]>('missed', []) },
    messages: { list: messageCache.load() },
  };
}

export function startSaving(listener: ListenerMiddlewareInstance) {
  listener.startListening({
    matcher: isAnyOf(setName, advanceSeq, setServerOffset),
    effect: (_, api) => {
      const session = (api.getState() as RootState).session;
      keyValueStore.set('name', session.name);
      keyValueStore.set('lastSeq', session.lastSeq);
      keyValueStore.set('serverOffset', session.serverOffset);
    },
  });

  listener.startListening({
    matcher: isAnyOf(markMissed, finished),
    effect: (_, api) => keyValueStore.set('missed', (api.getState() as RootState).playback.missed),
  });

  listener.startListening({
    actionCreator: upsertMessages,
    effect: (action) => messageCache.upsert(action.payload),
  });

  listener.startListening({
    actionCreator: setHeardBy,
    effect: (action, api) => {
      const messages = (api.getState() as RootState).messages.list;
      const message = messages.find((existing) => existing.id === action.payload.messageId);
      if (message) messageCache.upsert([message]);
    },
  });
}
