# Teton Talk

A push-to-talk walkie-talkie for care-home staff. Hold the button to talk live to everyone on the channel. Everything said is recorded, and nothing is quietly lost when the wifi is patchy.

- **`/` (root):** the Expo app (iOS + Android).
- **`server/`:** a Node + TypeScript backend (WebSocket + HTTP, SQLite, clips on disk).
- **`simulator/`:** network chaos scenarios (Toxiproxy), bot caregivers and automated resilience tests.
- **`shared/`:** the wire protocol, the µ-law codec and the network state machine. The app, server, bots and tests all import these.

How the pieces fit together is in **[ARCHITECTURE.md](ARCHITECTURE.md)**. How it stays resilient, and the UX decisions behind it, are in **[RESILIENCE.md](RESILIENCE.md)**.

## Prerequisites

- **Node 22.13+.** The server uses the built-in `node:sqlite`, so there's no native database build.
- **Xcode** (iOS simulator or a device) and/or **Android Studio** (emulator). The app uses a native audio module (`react-native-audio-api`), so it needs a **development build** — **Expo Go won't work** (it only bundles Expo's own native modules). Build and run it with `npx expo run:ios` / `npx expo run:android` instead; see **Run it** below.
- **For Android: JDK 21.** Android Studio's own bundled JDK is often newer (24+) than this project's Gradle/AGP toolchain fully supports — on JDK 24+, native module builds (`react-native-worklets`, `react-native-screens`) fail with `WARNING: A restricted method in java.lang.System has been called`, which Android Gradle Plugin misreports as a build error. Install a real JDK 21 and point `JAVA_HOME` at it before running Android builds:
  ```bash
  brew install openjdk@21
  export JAVA_HOME=/opt/homebrew/Cellar/openjdk@21/21.0.12.1/libexec/openjdk.jdk/Contents/Home
  ```
  (A plain JRE, e.g. one bundled with an editor extension, isn't enough — the build also needs `jlink`, which only ships with a full JDK.) See Troubleshooting below for the exact error.
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
- **Android build fails with `Execution failed for task ':react-native-worklets:configureCMakeDebug[arm64-v8a]'. > WARNING: A restricted method in java.lang.System has been called`** (also seen on `react-native-screens`): your `JAVA_HOME` is JDK 24+ (Android Studio's bundled JBR, for example). Switch to JDK 21 (see Prerequisites) and re-run.
- **Android build instead fails with `jlink executable ... does not exist`**: `JAVA_HOME` points at a JRE, not a full JDK (some editor extensions bundle a JRE-only runtime). Point it at a proper JDK 21 install instead, e.g. `brew install openjdk@21`.
- **First Android build is very slow / looks stuck after "Welcome to Gradle"**: normal the first time — Gradle is auto-downloading the NDK, platform, and build-tools versions this project needs. Let it run; subsequent builds are fast.

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

For it to mean anything, run these against a **real Android device on your wifi** (see "Physical
phone" above), not the emulator — emulator-to-host networking doesn't behave like real wifi.

## Test on older/slower devices

This app leans on the JS thread for a lot at once while talking: mic encoding, live playback,
socket/outbox handling, and a re-rendering message list. That only shows up as dropped audio or a
sluggish button on hardware that's actually slow, not in the simulator (which degrades the
*network*, not the CPU) and not in a fast dev machine's emulator.

- **Prefer a real low-end or old device** over an emulator — JS-thread contention, GC pauses, and
  audio-buffer underruns on `react-native-audio-api` don't reproduce reliably on fast hardware. If
  you don't own one, Firebase Test Lab or BrowserStack App Live rent real low-end Android devices
  by the minute.
- **Or use a resource-constrained AVD** as a cheaper proxy. It's not a perfect stand-in for an old
  chipset, but a low-RAM, software-rendered, old-API emulator surfaces JS-thread starvation that a
  modern AVD never will. There's already one set up: **`Teton_LowSpec`** — Android 8.0 (API 26), a
  Nexus 5 profile, 1.5GB RAM, 2 cores, software-rendered GPU (`swiftshader_indirect`), on
  `arm64-v8a` (use `x86_64` instead if you're on an Intel Mac). Boot it, then build and install the
  dev client onto it the same way as any other device — **Expo Go won't work here either** (see
  Prerequisites above: the native audio module needs a real development build):
  ```bash
  emulator -avd Teton_LowSpec &          # boot it first; leave it running
  npx expo run:android --device Teton_LowSpec   # builds, installs, and starts Metro
  ```
  If you already have another emulator or a physical device connected, `--device` (with no value)
  opens a picker instead of guessing which one you meant; pass the AVD name to skip straight to it.
  Once it's running, degrade the network against it with the simulator exactly as you would on a
  physical phone (see "Simulate a bad network" above) — same app, same protocol, just on
  constrained hardware.

  To recreate the AVD (or build a similarly constrained one of your own), download a system image and
  create the AVD:
  ```bash
  sdkmanager --sdk_root="$ANDROID_HOME" "system-images;android-26;google_apis;arm64-v8a"
  avdmanager create avd -n Teton_LowSpec -k "system-images;android-26;google_apis;arm64-v8a" \
    --device "Nexus 5" --sdcard 512M --force
  ```
  **If `avdmanager` fails with `Error: Package path is not valid. Valid system image paths are:
  null`** (a real bug we hit in current `cmdline-tools`, independent of the package actually being
  installed correctly): first make sure `~/.android/repositories.cfg` exists (`touch` it if not —
  its absence alone can trigger this). If it still fails, skip `avdmanager` entirely and hand-write
  the AVD's two config files, which is all `avdmanager` would have produced anyway — the `emulator`
  binary doesn't call into `avdmanager` at runtime, it only reads these:
  ```bash
  mkdir -p ~/.android/avd/Teton_LowSpec.avd
  cat > ~/.android/avd/Teton_LowSpec.ini <<EOF
  avd.ini.encoding=UTF-8
  path=$HOME/.android/avd/Teton_LowSpec.avd
  path.rel=avd/Teton_LowSpec.avd
  target=android-26
  EOF
  cat > ~/.android/avd/Teton_LowSpec.avd/config.ini <<EOF
  AvdId=Teton_LowSpec
  abi.type=arm64-v8a
  avd.ini.encoding=UTF-8
  disk.dataPartition.size=2G
  hw.cpu.arch=arm64
  hw.cpu.ncore=2
  hw.device.manufacturer=Google
  hw.device.name=Nexus 5
  hw.gpu.enabled=yes
  hw.gpu.mode=swiftshader_indirect
  hw.keyboard=yes
  hw.lcd.density=480
  hw.lcd.height=1920
  hw.lcd.width=1080
  hw.ramSize=1536
  hw.sdCard=yes
  image.sysdir.1=system-images/android-26/google_apis/arm64-v8a/
  sdcard.size=512M
  skin.name=1080x1920
  tag.id=google_apis
  target=android-26
  EOF
  ```
  Either way, once it boots, check it actually landed on the specs you asked for:
  `adb shell getprop ro.build.version.release` (`8.0.0`), `adb shell cat /proc/meminfo` (should
  show the ~1.5GB you set, not the host's RAM).
- **Test a release build, not dev.** `npx expo run:android --variant release` (or an EAS build).
  Dev mode's unminified bundle and dev-tools bridge make everything slower in a way that doesn't
  correlate with what an old device actually struggles with.
- **Watch for frame drops while actually talking**, not just idle: shake the device → "Show Perf
  Monitor" for JS/UI FPS, or attach Android Studio's CPU Profiler, while holding the PTT button,
  receiving live relayed audio, *and* scrolling the message list at the same time — that's the
  worst case, with mic encoding, audio playback, socket handling, and list re-renders all
  competing for the JS thread.
- **Combine both axes.** A weak-wifi scenario (`npm run sim -- weak`) running *against* this AVD
  is closer to a real care-home phone than either condition alone.

## Bot caregivers

```bash
cd simulator && npm run bots
```

This connects Anna, Jonas and Maria (through Toxiproxy on `:4001`). They speak with prerecorded voices from `simulator/samples/`. Use `SERVER=http://localhost:3000 npm run bots` to bypass Toxiproxy and talk to the server directly.

`<name>` is `anna`, `jonas`, or `maria`.

| Command | What it does |
|---|---|
| `<name> talk <sec>` | e.g. `anna talk 6` — that bot talks live for 6s (screen 04 on your phone), or records-and-sends if its link is bad |
| `<name> leave` | Takes that bot off the channel (changes the online count) |
| `<name> join` | Brings that bot back onto the channel |
| `race` | Countdown, then Anna presses on GO. Press at GO on your phone and you lose a real race (screen 08). It works by delaying what the phone receives by 1.5s, so the phone can't see that Anna got there first. |
| `auto on` | Random chatter: a random online bot talks every 10–20s |
| `auto off` | Stops the random chatter |
| `status` | Who is online and each bot's outbox/message counts |
| `help` | Shows this command list |
| `quit` / `exit` | Disconnects all bots and exits |

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

## App unit tests

```bash
npm test
```

These run in Node in well under a second (no simulator needed):
- **The talk flow** (`talk.ts`), with a fake mic and socket: asking for the floor, streaming once granted (including what was recorded while waiting), falling back to record-and-send after 1s without an answer, ignoring a late grant, discarding a lost race or a tap under 300ms, recording locally when offline or weak, the 60s cap, and a mic that fails to open.
- **The selectors**: what the push-to-talk button and the subtitle show in each state, and the receipt on each message row. They also check that a selector returns the same object when nothing relevant changed, which is what keeps the screen from re-rendering on every voice-level or playback-progress update.

## Checks

```bash
npx tsc --noEmit && npx expo lint && npm test     # app
npm run format:check                              # formatting (.prettierrc); npm run format to fix
(cd server && npm run typecheck)
(cd simulator && npm run typecheck && npm test)
```

## Layout

```
src/app/            routes: _layout (fonts, splash hold, controller start), join (01), channel (02–08)
src/components/     TopBar, ChannelHeader, StatusBand, MessageList/Row, PttButton, FloorDeniedCard, Splash, Logo
src/services/       controller (creates and wires the parts below), talk (record, go live, hand off to the outbox), serverEvents (one handler per server message), playback (queue, pause for live talk), socket (heartbeat, backoff), outbox (resumable upload), db, files, haptics
src/audio/          recorder (mic → µ-law chunks), streamPlayer (live, jitter buffer), clipPlayer, tone
src/store/          Redux Toolkit slices, selectors (button state, subtitle, one receipt per row), persistence (what survives a restart)
shared/             protocol.ts, mulaw.ts, netMachine.ts
server/src/         index (boot + wiring), channel (one handler per WS message), clients (presence), floor (floor + lease), messages (chunks → commit → receipts), http (route table), database, clips
simulator/          cli + scenarios, bots + REPL, tests, samples/
```
