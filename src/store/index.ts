import { configureStore, createListenerMiddleware } from '@reduxjs/toolkit';
import { useDispatch, useSelector } from 'react-redux';
import { loadSavedState, startSaving } from './persistence';
import connection from './slices/connection';
import floor from './slices/floor';
import messages from './slices/messages';
import outbox from './slices/outbox';
import playback from './slices/playback';
import session from './slices/session';

const listener = createListenerMiddleware();

export const store = configureStore({
  reducer: {
    session,
    connection,
    floor,
    playback,
    outbox,
    messages,
  },
  preloadedState: loadSavedState(),
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({ serializableCheck: false, immutableCheck: false }).prepend(listener.middleware),
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
export const useAppDispatch = useDispatch.withTypes<AppDispatch>();
export const useAppSelector = useSelector.withTypes<RootState>();

/** The parts of the store the services use. */
export type AppStore = Pick<typeof store, 'dispatch' | 'getState' | 'subscribe'>;

startSaving(listener);
