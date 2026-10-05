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

// Everything that belongs to one connection attempt. Bundling these together
// (instead of loose closure variables) means a stale callback from a socket
// that's since been torn down can be recognized with a single identity check
// — `connection !== conn` — rather than separately guarding each field.
interface Connection {
  socket: WebSocket;
  pingTimer: ReturnType<typeof setInterval> | null;
  awaitingPong: number | null;
  missed: number;
}

export function createSocket(handlers: SocketHandlers) {
  let connection: Connection | null = null;
  let up = false; // true once the server's `welcome` has arrived
  let attempt = 0; // consecutive failed attempts; drives backoff
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false; // true after stop(); suppresses reconnects

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
    handlers.onRetryScheduled(Date.now() + delay);
    retryTimer = setTimeout(connect, delay);
  }

  function teardown() {
    if (retryTimer) {
      clearTimeout(retryTimer);
      retryTimer = null;
    }
    if (connection) {
      const { socket, pingTimer } = connection;
      if (pingTimer) clearInterval(pingTimer);
      socket.onopen = socket.onclose = socket.onerror = socket.onmessage = null;
      try {
        socket.close();
      } catch {}
      connection = null;
    }
  }

  function onDead() {
    teardown();
    markDown();
    scheduleRetry();
  }

  function startHeartbeat(conn: Connection) {
    conn.pingTimer = setInterval(() => {
      if (connection !== conn) return;
      if (conn.awaitingPong !== null) {
        conn.missed++;
        handlers.onPingMissed();
        if (conn.missed >= MAX_MISSED) {
          onDead();
          return;
        }
      }
      conn.awaitingPong = Date.now();
      conn.socket.send(JSON.stringify({ type: 'ping', sentAt: conn.awaitingPong } satisfies ClientMessage));
    }, PING_MS);
  }

  function handlePong(conn: Connection, sentAt: number, serverTime: number) {
    if (conn.awaitingPong === sentAt) {
      conn.awaitingPong = null;
      conn.missed = 0;
    }
    const roundTripMs = Date.now() - sentAt;
    handlers.onPong(roundTripMs, serverTime + roundTripMs / 2);
  }

  function handleMessage(conn: Connection, event: MessageEvent) {
    if (connection !== conn) return;

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
      handlePong(conn, message.sentAt, message.serverTime);
      return;
    }

    if (message.type === 'welcome') {
      attempt = 0;
      up = true;
      handlers.onLinkUp();
    }
    handlers.onMessage(message);
  }

  function connect() {
    teardown();
    if (stopped) return;
    handlers.onRetryScheduled(null);

    const socket = new WebSocket(WS_URL);
    socket.binaryType = 'arraybuffer';
    const conn: Connection = { socket, pingTimer: null, awaitingPong: null, missed: 0 };
    connection = conn;

    socket.onopen = () => {
      if (connection !== conn) return;
      socket.send(JSON.stringify(handlers.hello()));
      startHeartbeat(conn);
    };
    socket.onmessage = (event) => handleMessage(conn, event);
    socket.onerror = () => {
      if (connection === conn) onDead();
    };
    socket.onclose = () => {
      if (connection === conn) onDead();
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
      if (connection) onDead();
    },
    get isUp() {
      return up;
    },
    send(message: ClientMessage): boolean {
      if (!up || !connection || connection.socket.readyState !== WebSocket.OPEN) return false;
      connection.socket.send(JSON.stringify(message));
      return true;
    },
    sendBinary(data: Uint8Array): boolean {
      if (!up || !connection || connection.socket.readyState !== WebSocket.OPEN) return false;
      connection.socket.send(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer);
      return true;
    },
  };
}

export type Socket = ReturnType<typeof createSocket>;
