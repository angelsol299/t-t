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
  const showNotice = createNoticeBanner(dispatch);
  const { socket, outbox, playback, talk } = createServices(store, showNotice);
  const stopBackgroundWatchers = watchInBackground(store, socket);

  const controller = {
    async start() {
      outbox.restore();
      await requestMicAccess(dispatch);
      socket.start();
    },
    stop() {
      stopBackgroundWatchers();
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

type ShowNotice = (text: string, durationMs?: number) => void;

/** A short line under the channel name, cleared after a few seconds. */
function createNoticeBanner(dispatch: AppStore['dispatch']): ShowNotice {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return (text, durationMs = NOTICE_MS) => {
    dispatch(setNotice(text));
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => dispatch(setNotice(null)), durationMs);
  };
}

// The socket and the server-event handlers need each other, so the socket is
// built with handlers that forward to `serverEvents`, which is only created
// once everything else exists.
function createServices(store: AppStore, showNotice: ShowNotice) {
  const { dispatch, getState } = store;

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

  return { socket, outbox, playback, talk, serverEvents };
}

// Watchers that run for as long as the controller is alive, independent of
// any screen. Returns a function that stops all of them.
function watchInBackground(store: AppStore, socket: ReturnType<typeof createSocket>) {
  const { dispatch, getState } = store;

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

  return () => {
    clearInterval(networkTicker);
    stopListeningToNetInfo();
    stopWatchingNetwork();
  };
}

// Checks for mic access (asking if needed) and warns the user if it's denied.
async function requestMicAccess(dispatch: AppStore['dispatch']) {
  const granted = (await micPermission(false)) || (await micPermission(true));
  dispatch(setMicDenied(!granted));
  if (granted) return;
  Alert.alert(
    'Microphone access needed',
    'Teton Talk needs your microphone to talk on the channel. Turn it on in Settings.',
    [
      { text: 'Not now', style: 'cancel' },
      { text: 'Open Settings', onPress: () => Linking.openSettings() },
    ],
  );
}
