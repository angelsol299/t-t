import { WS_URL } from '@/config';
import type { ClientMsg, ServerMsg } from '@shared/protocol';

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
  hello(): Extract<ClientMsg, { t: 'hello' }>;
  onMessage(msg: ServerMsg): void;
  onBinary(data: Uint8Array): void;
  onLinkUp(): void;
  onLinkDown(): void;
  onPong(rtt: number, serverTime: number): void;
  onPingMissed(): void;
  onRetryScheduled(at: number | null): void;
}

export function createSocket(handlers: SocketHandlers) {
  let ws: WebSocket | null = null;
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
    if (ws) {
      const old = ws;
      ws = null;
      old.onopen = old.onclose = old.onerror = old.onmessage = null;
      try {
        old.close();
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
    const sock = new WebSocket(WS_URL);
    sock.binaryType = 'arraybuffer';
    ws = sock;

    sock.onopen = () => {
      if (ws !== sock) return;
      sock.send(JSON.stringify(handlers.hello()));
      pingTimer = setInterval(() => {
        if (ws !== sock) return;
        if (awaitingPong !== null) {
          missed++;
          handlers.onPingMissed();
          if (missed >= MAX_MISSED) return onDead();
        }
        awaitingPong = Date.now();
        sock.send(JSON.stringify({ t: 'ping', ts: awaitingPong } satisfies ClientMsg));
      }, PING_MS);
    };

    sock.onmessage = (ev) => {
      if (ws !== sock) return;
      if (typeof ev.data !== 'string') {
        handlers.onBinary(new Uint8Array(ev.data as ArrayBuffer));
        return;
      }
      let msg: ServerMsg;
      try {
        msg = JSON.parse(ev.data);
      } catch {
        return;
      }
      if (msg.t === 'pong') {
        if (awaitingPong === msg.ts) {
          awaitingPong = null;
          missed = 0;
        }
        handlers.onPong(Date.now() - msg.ts, msg.serverTime + (Date.now() - msg.ts) / 2);
        return;
      }
      if (msg.t === 'welcome') {
        attempt = 0;
        up = true;
        handlers.onLinkUp();
      }
      handlers.onMessage(msg);
    };

    sock.onerror = () => {
      if (ws === sock) onDead();
    };
    sock.onclose = () => {
      if (ws === sock) onDead();
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
      if (ws) onDead();
    },
    get isUp() {
      return up;
    },
    send(msg: ClientMsg): boolean {
      if (!up || !ws || ws.readyState !== WebSocket.OPEN) return false;
      ws.send(JSON.stringify(msg));
      return true;
    },
    sendBinary(data: Uint8Array): boolean {
      if (!up || !ws || ws.readyState !== WebSocket.OPEN) return false;
      ws.send(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer);
      return true;
    },
    /** Bytes queued in the socket but not yet on the wire: the backlog signal for "weak". */
    get bufferedAmount() {
      return ws?.bufferedAmount ?? 0;
    },
  };
}

export type Socket = ReturnType<typeof createSocket>;
