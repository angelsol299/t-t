import { WS_URL } from '@/config';
import type { ClientMessage, ServerMessage } from '@shared/protocol';

// One long-lived WebSocket with heartbeat and backoff reconnects.
//
// The link only counts as "up" once the server's `welcome` arrives, not when
// TCP opens: through a dead proxy (or a captive wifi) a socket can open and
// then carry nothing. Pings every 2s detect zombie links; three missed pongs
// force a reconnect.

const PING_MS = 2000;
const MAX_MISSED = 3;
const BACKOFF = [1000, 2000, 4000, 8000, 15000];

export interface SocketHandlers {
  hello(): Extract<ClientMessage, { type: 'hello' }>;
  onMessage(message: ServerMessage): void;
  onBinary(data: Uint8Array): void;
  onLinkUp(): void;
  onLinkDown(): void;
  onPong(roundTripMs: number, serverTime: number): void;
  onPingMissed(): void;
  onRetryScheduled(at: number | null): void;
}

export function createSocket(handlers: SocketHandlers) {
  let socket: WebSocket | null = null;
  let up = false;
  let attempt = 0;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let pingTimer: ReturnType<typeof setInterval> | null = null;
  let awaitingPong: number | null = null;
  let missed = 0;
  let stopped = false;

  function clearTimers() {
    if (pingTimer) clearInterval(pingTimer);
    pingTimer = null;
    if (retryTimer) clearTimeout(retryTimer);
    retryTimer = null;
  }

  function markDown() {
    if (up) {
      up = false;
      handlers.onLinkDown();
    }
  }

  function scheduleRetry() {
    if (stopped) return;
    const base = BACKOFF[Math.min(attempt, BACKOFF.length - 1)];
    const delay = base / 2 + Math.random() * (base / 2); // jitter so a ward's phones don't stampede
    attempt++;
    const at = Date.now() + delay;
    handlers.onRetryScheduled(at);
    retryTimer = setTimeout(connect, delay);
  }

  function teardown() {
    clearTimers();
    if (socket) {
      const previousSocket = socket;
      socket = null;
      previousSocket.onopen = previousSocket.onclose = previousSocket.onerror = previousSocket.onmessage = null;
      try {
        previousSocket.close();
      } catch {}
    }
    awaitingPong = null;
    missed = 0;
  }

  function onDead() {
    teardown();
    markDown();
    scheduleRetry();
  }

  function connect() {
    teardown();
    if (stopped) return;
    handlers.onRetryScheduled(null);
    const newSocket = new WebSocket(WS_URL);
    newSocket.binaryType = 'arraybuffer';
    socket = newSocket;

    newSocket.onopen = () => {
      if (socket !== newSocket) return;
      newSocket.send(JSON.stringify(handlers.hello()));
      pingTimer = setInterval(() => {
        if (socket !== newSocket) return;
        if (awaitingPong !== null) {
          missed++;
          handlers.onPingMissed();
          if (missed >= MAX_MISSED) return onDead();
        }
        awaitingPong = Date.now();
        newSocket.send(JSON.stringify({ type: 'ping', sentAt: awaitingPong } satisfies ClientMessage));
      }, PING_MS);
    };

    newSocket.onmessage = (event) => {
      if (socket !== newSocket) return;
      if (typeof event.data !== 'string') {
        handlers.onBinary(new Uint8Array(event.data as ArrayBuffer));
        return;
      }
      let message: ServerMessage;
      try {
        message = JSON.parse(event.data);
      } catch {
        return;
      }
      if (message.type === 'pong') {
        if (awaitingPong === message.sentAt) {
          awaitingPong = null;
          missed = 0;
        }
        handlers.onPong(Date.now() - message.sentAt, message.serverTime + (Date.now() - message.sentAt) / 2);
        return;
      }
      if (message.type === 'welcome') {
        attempt = 0;
        up = true;
        handlers.onLinkUp();
      }
      handlers.onMessage(message);
    };

    newSocket.onerror = () => {
      if (socket === newSocket) onDead();
    };
    newSocket.onclose = () => {
      if (socket === newSocket) onDead();
    };
  }

  return {
    start() {
      stopped = false;
      connect();
    },
    stop() {
      stopped = true;
      teardown();
      markDown();
    },
    /** Tap on the countdown, or the OS reports the network is back. */
    retryNow() {
      if (up) return;
      attempt = 0;
      connect();
    },
    /** The OS reports no network: don't wait for timeouts to notice. */
    dropNow() {
      if (socket) onDead();
    },
    get isUp() {
      return up;
    },
    send(message: ClientMessage): boolean {
      if (!up || !socket || socket.readyState !== WebSocket.OPEN) return false;
      socket.send(JSON.stringify(message));
      return true;
    },
    sendBinary(data: Uint8Array): boolean {
      if (!up || !socket || socket.readyState !== WebSocket.OPEN) return false;
      socket.send(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer);
      return true;
    },
    /** Bytes queued in the socket but not yet on the wire: the backlog signal for "weak". */
    get bufferedAmount() {
      return socket?.bufferedAmount ?? 0;
    },
  };
}

export type Socket = ReturnType<typeof createSocket>;
