import { configureStore, createListenerMiddleware, isAnyOf } from '@reduxjs/toolkit';
import { useDispatch, useSelector } from 'react-redux';
import { kv } from '@/services/db';
import { channelApi } from './api/channelApi';
import connection from './slices/connection';
import floor from './slices/floor';
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
    [channelApi.reducerPath]: channelApi.reducer,
  },
  middleware: (gDM) =>
    gDM({ serializableCheck: false, immutableCheck: false }).prepend(listener.middleware).concat(channelApi.middleware),
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
export const useAppDispatch = useDispatch.withTypes<AppDispatch>();
export const useAppSelector = useSelector.withTypes<RootState>();

// Persist the small bits of state that must survive a restart.
listener.startListening({
  matcher: isAnyOf(setName, advanceSeq, setServerOffset),
  effect: (_, api) => {
    const s = (api.getState() as RootState).session;
    kv.set('name', s.name);
    kv.set('lastSeq', s.lastSeq);
    kv.set('serverOffset', s.serverOffset);
  },
});

listener.startListening({
  matcher: isAnyOf(markMissed, finished),
  effect: (_, api) => kv.set('missed', (api.getState() as RootState).playback.missed),
});
