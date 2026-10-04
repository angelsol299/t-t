# Architecture

Teton Talk is a push-to-talk walkie-talkie for care-home staff: hold a button to talk live to
everyone on a channel; everything said is also recorded, and nothing is quietly lost when the
wifi is patchy. The system has three runtime pieces — the **Expo app** (frontend), the **Node
server** (backend), and the **simulator** (network chaos + bot caregivers for testing) — plus a
**shared** package that all of them import so the wire format can never drift between client and
server.

```
┌────────────────────────────┐
│  Expo / React Native app   │
│           (src/)           │
└────────────────────────────┘
              ▲
              │  WebSocket + HTTP
              ▼
┌────────────────────────────┐
│         Toxiproxy          │
│     app proxy  → :4000     │
│     bots proxy → :4001     │
└────────────────────────────┘
              ▲
              │  WebSocket + HTTP
              ▼
┌────────────────────────────┐
│        Node server         │
│         (server/)          │
└────────────────────────────┘
              │
              ▼
SQLite (teton.db) + µ-law chunk
files on disk (server/data/)
```

The `simulator/` package (bots, chaos scenarios, automated tests) isn't on this chain as a proxy —
it sits *alongside* the app as another client. The bots connect over the exact same WebSocket/HTTP
protocol as the phone, just through Toxiproxy's other listener, `bots proxy → :4001`, which
forwards to the same Node server upstream. The `sim` CLI doesn't touch that data path at all; it
calls Toxiproxy's own control API (`:8474`) to add or remove network chaos (latency, drops,
resets) on either proxy, which is what lets a scenario degrade what the phone or the bots
experience without either of them knowing anything changed.

Everyone — the app, the server, the bots, and the automated tests — talks the same protocol
defined once in `shared/protocol.ts`, and the app always reaches the server through a Toxiproxy
instance so the simulator can degrade the link without touching app or server code.

## `shared/` — the contract every piece imports

This is not a package published anywhere; it's plain TypeScript imported by relative path from
the app, the server, and the simulator, so there is exactly one definition of the wire format.

- **`protocol.ts`** — the WebSocket message types (`ClientMessage` / `ServerMessage`), the HTTP
  API shape, and the binary audio-chunk frame format (`[1-byte type][36-byte clipId][4-byte
  seq][µ-law payload]`). Also the shared constants that both sides must agree on: `SAMPLE_RATE`
  (8kHz), `CHUNK_MS` (250ms), `FLOOR_LEASE_MS`, `MIN_CLIP_MS`/`MAX_CLIP_MS`, `LATE_MS`,
  `RETENTION_DAYS`.
- **`mulaw.ts`** — a pure-JS G.711 µ-law codec (encode/decode) plus a resampler and RMS/level-meter
  helpers. Runs identically in the React Native JS thread, the Node server, and the bots, so audio
  math never diverges between them.
- **`netMachine.ts`** — a pure reducer (`netReducer`) implementing the network status state
  machine (`online | weak | offline | recovering`) used by the app's connection UI. It is pure and
  dependency-free so it has its own unit tests (`simulator/tests/netMachine.test.ts`) independent
  of React Native or sockets.

Audio is always **µ-law at 8kHz, one byte per sample** — chosen so a 250ms chunk is a small, fixed
number of bytes, cheap to stream live and cheap to re-send during recovery.

## Backend — `server/`

A small Node (`node:sqlite`, no native build step) + `ws` server with one process per deployment.
`server/src/index.ts` boots it and wires the modules together; every other file is a narrow
collaborator with one job:

| Module | Responsibility |
|---|---|
| `database.ts` | SQLite: one row per committed message (`messages`), one row per "heard" receipt (`receipts`). WAL mode so reads don't block on writes. |
| `clips.ts` | Audio chunks on disk: `data/clips/<clipId>/<chunkIndex>.ul`, joined into `data/clips/<clipId>.ul` once committed. Every write is write-temp-then-atomic-rename, so a half-written chunk never counts as received. |
| `clients.ts` | Who is connected right now (one WebSocket per open connection); online count is by distinct `clientId`, not socket count, since a reconnect can briefly hold two sockets. |
| `messages.ts` | How audio becomes a message: `saveChunk` (works for both the live and HTTP paths), `commit` (idempotent — the `clipId` is the idempotency key, so retries/duplicates can never create two messages), `markHeard` (receipts), retention sweep. |
| `floor.ts` | Who may talk. One holder at a time; first `floor_request` to arrive wins. The holder keeps the floor by sending audio — if none arrives for `FLOOR_LEASE_MS` (3s), the lease expires and the floor frees itself, so a dropped phone can never jam the channel. |
| `channel.ts` | The WebSocket protocol itself: one handler per `ClientMessage` type (`hello`, `floor_request`, `floor_release`, `played`, `ping`), delegating to `clients`/`floor`/`messages`. A malformed message is caught and logged, never crashes the server. |
| `http.ts` | A tiny hand-rolled router for the resumable-upload/history API (see below). |

### Two ways audio reaches the server — one commit path

1. **Live stream** (good link): while you hold the floor, every recorded chunk is also sent as a
   binary WebSocket frame. The server relays it to everyone else immediately (`clients.relay`) so
   listeners hear it in near real time, and separately saves it to disk via `messages.saveChunk`.
2. **Resumable HTTP upload** (bad link, or filling gaps after a live session): `GET
   /clips/:id` to see which chunks the server already has, `PUT
   /clips/:id/chunks/:seq` for each missing one (idempotent — re-sending a chunk is harmless),
   then `POST /clips/:id/complete` to commit.

Both paths write chunks through the exact same `clips.ts` functions, and a clip is only ever
**committed** — inserted into SQLite and broadcast as a `message` event — once every chunk from
`0..total-1` is on disk. Because `commit()` checks for an existing row by `clipId` first, calling
it any number of times (live release + a retried HTTP complete, a restarted upload, etc.) produces
exactly one message. This is what lets the app always "just keep trying" without ever double-
posting what someone said.

### WebSocket protocol (`/ws`)

Text frames are JSON control messages; binary frames are audio chunks (see the frame format
above). On connect, a client sends `hello` with its persistent `clientId`, display name, and
`lastSeq` (the last message sequence number it has seen); the server replies with `welcome`
(current online count, who currently holds the floor, server clock, and every message committed
since `lastSeq` — or the last 12 hours' worth on a first join). From there: `floor_request` /
`floor_granted` / `floor_denied` / `floor_taken` / `floor_free` manage the single-speaker floor;
audio chunks stream as binary frames with a `chunk_ack` for each; `floor_release` with a non-zero
total triggers a commit; `played` records a receipt; `ping`/`pong` is the heartbeat used for RTT
and liveness.

### HTTP API

```
GET  /health                    -> { ok, online }
GET  /messages?since=<seq>      -> { messages }                  (poll-based catch-up fallback)
GET  /clips/:id                 -> { received: number[], committed }
PUT  /clips/:id/chunks/:seq     body: µ-law bytes  -> { ok }
POST /clips/:id/complete        body: ClipComplete -> { message } | 409 { missing }
GET  /clips/:id/audio           -> µ-law bytes of the whole clip  (playback)
```

Every request carries `x-client-id` / `x-client-name` headers for attribution. Retention runs
hourly, deleting committed messages (DB rows + clip files) older than `RETENTION_DAYS` (30).

## Frontend — Expo app (`src/`)

Expo Router app (`src/app/`) over a Redux Toolkit store, with a hand-written services layer that
holds all the real behavior — the services are plain TypeScript objects, independent of React, so
they're the unit-testable core (`src/services/talk.test.ts`, `src/store/selectors.test.ts`).

### Routes (`src/app/`)

- `_layout.tsx` — loads fonts, holds the splash screen until ready, wraps the tree in the Redux
  `Provider`, and — once a name exists in the store — calls `createController(store)` exactly
  once. This is the one place the app's "engine" is started.
- `index.tsx` — redirects to `/join` (no name yet) or `/channel`.
- `join.tsx` — name entry (also reachable with `?edit=1` to rename later).
- `channel.tsx` — the main screen: top bar, connection status band, message list, push-to-talk
  button.

### State (`src/store/`)

Redux Toolkit slices: `session` (identity, `clientId`, `lastSeq`, server clock offset),
`connection` (the `netMachine` state), `floor` (who holds it, my own talk state/mode), `playback`
(what's currently playing / queued), `outbox` (clips not yet confirmed committed), `messages`
(the channel history). `selectors.ts` derives UI-facing values (e.g. exactly what the
push-to-talk button should show) memoized so unrelated state changes (a voice-level tick, a
playback-progress tick) don't re-render screens that don't care.

`persistence.ts` is the only thing allowed to touch storage directly on the state side: it loads
saved state at launch and a Redux listener middleware writes identity, `lastSeq`, clock offset,
and the "missed" message list back out on every relevant action. The actual SQLite/KV access is in
`src/services/db.ts` (`expo-sqlite` for the message cache and outbox table, `expo-sqlite/kv-store`
for small scalars).

### Services (`src/services/`) — the app's engine

`controller.ts` builds and wires everything else, and is the only module screens/hooks call into
(via `registry.ts`, a simple singleton holder so hooks don't need prop-drilling):

```
socket.ts        one long-lived WebSocket: heartbeat (ping every 2s, 3 missed = dead),
                 exponential backoff with jitter on reconnect, "up" only after `welcome`
serverEvents.ts  one handler per ServerMessage type — translates server events into
                 dispatches and calls into talk/playback/outbox
talk.ts          pressing the button: records to disk first, requests the floor, streams
                 live if granted within 1s, otherwise falls back to "record-and-send";
                 enforces MIN_CLIP_MS/MAX_CLIP_MS
outbox.ts        uploads my own clips (resumable HTTP) until the server confirms commit;
                 retries forever on network errors, backs off, persists across app kills
playback.ts      plays committed messages one at a time from a queue, paused instantly by
                 any live talk (mine or someone else's) and resumed afterward
db.ts / files.ts local persistence: SQLite rows, and raw chunk files on disk
                 (clip chunks are written to disk before they're ever sent anywhere —
                 the phone is the source of truth until the server commits)
haptics.ts       buzz patterns (mic opened, lost a floor race, hit the 60s cap)
```

`controller.ts` also owns the few things that run continuously in the background regardless of
which screen is mounted: a 250ms ticker feeding the `netMachine`, a `NetInfo` listener that acts on
OS-level connectivity changes immediately (don't wait for a timeout if iOS/Android already knows
wifi dropped), and a store subscription that forces any live talk down to local-record-only the
moment the network degrades mid-clip.

### Audio (`src/audio/`)

- `context.ts` — one shared `AudioContext` (from `react-native-audio-api`), configured for
  simultaneous play-and-record (`playAndRecord`, routed to the speaker) since this is a two-way
  walkie-talkie, not a dictaphone.
- `recorder.ts` — mic → resampled-to-8kHz → µ-law → fixed-size chunks, emitted via callback as soon
  as each chunk is full (so the rest of the app never deals with raw PCM).
- `streamPlayer.ts` — plays another speaker's live chunks as they arrive, through a small jitter
  buffer (300ms) so minor network hiccups don't chop the audio; tracks how many chunks of a clip
  were actually heard live, which `serverEvents.ts` uses to decide whether a later "committed"
  version of that same clip needs to be queued as MISSED or was already heard in full.
- `clipPlayer.ts` — plays one fully-downloaded/recorded clip with pause/resume-from-offset.
- `tone.ts` — the short tone played when you go live.

### UI (`src/components/`)

Presentational components grouped by screen: `join/` (name entry), `channel/` (top bar, header,
connection band, message list, push-to-talk, lost-race card), `StatusBand/` (weak/offline/back-
online banners driven by `connection.net`), `PttButton/` (the button itself: face states, level
meter, hold timer), `MessageRow/` (one message: length pill, receipt count, play/retry buttons).
Components read from the store via `useAppSelector` + the memoized selectors and call `registry
.controller` methods (`pressIn`/`pressOut`/`togglePlay`/`retryClip`/…) — they hold no protocol or
networking logic themselves.

### Why the app always goes through Toxiproxy

`src/config.ts` builds `SERVER_URL` pointing at `localhost:4000` (iOS) / `10.0.2.2:4000`
(Android emulator) by default — port **4000**, Toxiproxy's "app" proxy, not the server's own port
3000. This is deliberate: it means the simulator's network-chaos scenarios (weak link, dropouts,
flapping, zombie connections, mid-upload resets) can be exercised against the real app with zero
app-code changes, by toggling toxics on the proxy in front of it. `EXPO_PUBLIC_SERVER_URL` can
override this (e.g. to point a physical phone at a LAN IP, still normally through Toxiproxy on
that machine).

## Simulator (`simulator/`)

Three tools, all speaking the exact same protocol as the real app (importing from `shared/`), used
to develop and verify resilience without needing a second phone or a flaky real network:

- **`toxiproxy.ts` + `cli.ts` + `scenarios.ts`** — a thin client for the Toxiproxy HTTP API
  (`:8474`), plus named presets (`weak`, `patchy`, `dropout`, `offline`, `flapping`, `zombie`,
  `reset`, `good`) that add/remove toxics (latency, bandwidth caps, connection resets, timeouts) on
  one or both of two proxies: `app` (`:4000`, what the phone talks to) and `bots` (`:4001`, what
  the bot caregivers talk to). `docker-compose.yml` is an alternative to a local Toxiproxy install.
- **`bot.ts`** — a headless "caregiver": connects over the same WebSocket protocol, requests the
  floor, streams live audio when granted, falls back to record-and-send when the link is down, and
  retries its outbox exactly like the real app's `outbox.ts`. Used both interactively (`bots.ts`,
  a REPL with named bots Anna/Jonas/Maria for manually triggering scenarios like "someone else is
  talking" or a floor race against your real phone) and programmatically by the test suite.
- **`tests/`** — Vitest + the real server (started on a temp data directory) + bots behind their
  own Toxiproxy links, asserting the resilience guarantees: exactly-once delivery through a black
  hole, resumable (not restarted) uploads, survival of `reset_peer` chaos, a floor that frees
  itself within its lease if the speaker vanishes mid-stream, exactly one winner in a floor race,
  correct catch-up via `lastSeq`, idempotent duplicate commits, and no status-band flicker on a
  sub-3s dropout (via `netMachine.test.ts`, which tests the pure reducer directly).

## End-to-end: a clip from press to every phone

1. **Press and hold** → `controller.pressIn()` → `talk.begin()`: starts the mic
   (`recorder.ts`), writes chunks to disk (`files.ts`) as they arrive, and — if the link looks
   good — sends `floor_request` over the socket.
2. **Server** (`floor.ts`) grants the floor if nobody else holds it, broadcasts `floor_taken` to
   everyone else, and replies `floor_granted` to the requester.
3. **Granted** → `talk.ts` flushes any chunks recorded while waiting, then streams new chunks live
   as binary frames; the server relays each one to every other connected client and separately
   persists it to disk (`clips.ts`), acking with `chunk_ack`.
4. **Other phones** receive the relayed frames → `streamPlayer.ts` plays them through a jitter
   buffer in near real time.
5. **Release** (finger lifts) → `talk.end()` sends `floor_release` with the clip's total chunk
   count and duration. The server's `messages.commit()` joins the chunks on disk, inserts one row
   in SQLite, and broadcasts a `message` event — this is the single moment a clip becomes a
   permanent, numbered (`seq`) channel message.
6. **If the link was bad** at any point, `talk.ts` falls back to local-only recording and hands the
   finished clip to `outbox.ts`, which uploads it over the resumable HTTP API and converges on the
   exact same `commit()` call — so a listener who was live for it and one who only sees the later
   upload both end up with one message, not two.
7. **Everyone's app** receives the `message` event (or picks it up via `welcome`'s catch-up list
   or `GET /messages?since=` on reconnect), stores it (`messageCache` in `db.ts`), and — if it
   wasn't heard live in full — queues it for auto-play and marks it MISSED until played.
