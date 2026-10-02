# Teton Talk

A push-to-talk walkie-talkie for care-home staff. Hold the button to talk live to everyone on the channel. Everything said is recorded, and nothing is quietly lost when the wifi is patchy.

- **`/` (root):** the Expo app (iOS + Android).
- **`server/`:** a Node + TypeScript backend (WebSocket + HTTP, SQLite, clips on disk).
- **`simulator/`:** network chaos scenarios (Toxiproxy), bot caregivers and automated resilience tests.
- **`shared/`:** the wire protocol, the µ-law codec and the network state machine. The app, server, bots and tests all import these.

How it stays resilient, and the UX decisions behind it, are in **[RESILIENCE.md](RESILIENCE.md)**.

## Prerequisites

- **Node 22.13+.** The server uses the built-in `node:sqlite`, so there's no native database build.
- **Xcode** (iOS simulator or a device) and/or **Android Studio** (emulator). The app uses a native audio module (`react-native-audio-api`), so it needs a **development build**. Expo Go won't work.
- **Toxiproxy**, for the simulator: `brew install toxiproxy`, or use Docker (see below).

## Run it

Install the dependencies for all three packages:

```bash
npm install
(cd server && npm install)
(cd simulator && npm install)
```

Then use four terminals:

```bash
# 1. Backend on :3000
cd server && npm run dev

# 2. Toxiproxy (the app always talks to the server through it)
toxiproxy-server

# 3. Create the proxies: app → :4000, bots → :4001, both forwarding to :3000
cd simulator && npm run sim -- setup

# 4. The app (first run builds the native app; later runs just start Metro)
npx expo run:ios          # iOS simulator
npx expo run:android      # Android emulator
```

The app finds the server automatically: `localhost:4000` on the iOS simulator and `10.0.2.2:4000` on the Android emulator.

**Physical phone:** put the phone on the same wifi as your Mac, then:

```bash
echo "EXPO_PUBLIC_SERVER_URL=http://<your-mac-LAN-IP>:4000" > .env.local
npx expo run:ios --device
```

**Docker instead of brew:** run `cd simulator && docker compose up -d`, then set `UPSTREAM=host.docker.internal:3000` when you run `npm run sim -- setup`.

### Troubleshooting

- **"No development build (com.teton.talk) is installed"**: the build is installed per simulator. Install it on the one you picked with `npx expo run:ios --device "<simulator name>"`.
- **Port 8081 is busy** (another project's Metro): use another port, e.g. `npx expo run:ios --port 8082`, or `npx expo start --dev-client --port 8082`.
- **iOS 27 crash at launch** (`…NoSceneLifecycleAdoption`): iOS 27 requires the UIScene life cycle. `plugins/withSceneLifecycle.js` adopts it during prebuild. If your `ios/` folder predates that plugin, regenerate it with `npx expo prebuild --platform ios --clean`.

## Simulate a bad network

```bash
cd simulator
npm run sim -- weak        # amber "Weak signal" band; your clip shows "Sending N%" and arrives whole
npm run sim -- offline     # red band, offline timer, retry countdown, "Not sent yet" rows
npm run sim -- good        # back online: green band, queued clips send, missed clips auto-play
npm run sim -- patchy      # a 2s cut every 10s; the band must never flicker
npm run sim -- dropout     # one 8s cut
npm run sim -- flapping    # random 1–6s cuts
npm run sim -- zombie      # socket stays open but nothing flows; the heartbeat notices
npm run sim -- reset       # connections reset mid-upload; uploads resume
npm run sim -- status      # what is active right now
```

Each scenario resets the link first. Add `--target bots` or `--target all` to degrade the bots instead of, or as well as, the phone. Ctrl-C on a running scenario restores a clean link.

## Bot caregivers

```bash
cd simulator && npm run bots
```

This connects Anna, Jonas and Maria (through Toxiproxy on `:4001`). They speak with prerecorded voices from `simulator/samples/`.

| Command | What it does |
|---|---|
| `anna talk 6` | Anna talks live for 6s (screen 04 on your phone) |
| `race` | Countdown, then Anna presses on GO. Press at GO on your phone and you lose a real race (screen 08). It works by delaying what the phone receives by 1.5s, so the phone can't see that Anna got there first. |
| `jonas leave` / `jonas join` | Changes the online count |
| `auto on` | Random chatter |
| `status` | Who is online and each bot's outbox |

## Automated resilience tests

```bash
cd simulator && npm test
```

These start the real server on a temp directory, put each bot behind its own Toxiproxy link, and check:
- A clip recorded during a black hole is delivered **exactly once**.
- Interrupted uploads **resume** rather than restart.
- `reset_peer` chaos still delivers once.
- A speaker cut mid-stream frees the floor within the lease, and the **full** clip arrives later, never a partial one.
- A floor race has one winner, and nothing is recorded for the loser.
- Reconnecting with `lastSeq` returns exactly the missed messages.
- Duplicate uploads and duplicate commits are idempotent.
- The late flag is set correctly.
- The network state machine never flickers on a dropout under 3s.

The harness starts `toxiproxy-server` itself if one isn't already running.

## Checks

```bash
npx tsc --noEmit && npx expo lint      # app
(cd server && npm run typecheck)
(cd simulator && npm run typecheck && npm test)
```

## Layout

```
src/app/            routes: _layout (fonts, splash hold, controller start), join (01), channel (02–08)
src/components/     TopBar, ChannelHeader, StatusBand, MessageList/Row, PttButton, FloorDeniedCard, Splash, Logo
src/services/       controller (PTT, floor, playback), socket (heartbeat, backoff), outbox (resumable upload), db, files
src/audio/          recorder (mic → µ-law chunks), streamPlayer (live, jitter buffer), clipPlayer, tone
src/store/          Redux Toolkit slices (incl. the message list), selectors (one receipt per row)
shared/             protocol.ts, mulaw.ts, netMachine.ts
server/src/         index (http + ws), channel (presence, floor + lease, relay, commit), http (upload API), db, clips
simulator/          cli + scenarios, bots + REPL, tests, samples/
```
