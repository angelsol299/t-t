import { configureStore, createListenerMiddleware, isAnyOf } from '@reduxjs/toolkit';
import { useDispatch, useSelector } from 'react-redux';
import { keyValueStore, messageCache } from '@/services/db';
import connection from './slices/connection';
import floor from './slices/floor';
import messages, { setHeardBy, upsertMessages } from './slices/messages';
import outbox from './slices/outbox';
import playback, { finished, markMissed } from './slices/playback';
import session, { advanceSeq, setName, setServerOffset } from './slices/session';

export const listener = createListenerMiddleware();

export const store = configureStore({
  reducer: {
    session,
    connection,
    floor,
    playback,
    outbox,
    messages,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({ serializableCheck: false, immutableCheck: false }).prepend(listener.middleware),
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
export const useAppDispatch = useDispatch.withTypes<AppDispatch>();
export const useAppSelector = useSelector.withTypes<RootState>();

// Persist the small bits of state that must survive a restart.
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
    const message = (api.getState() as RootState).messages.list.find((existing) => existing.id === action.payload.messageId);
    if (message) messageCache.upsert([message]);
  },
});
