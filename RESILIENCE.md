# Resilience, UX decisions and what I'd change

The brief grades three things:
1. The app keeps working through patchy wifi and short dropouts.
2. It never quietly loses what someone said.
3. It's easy to use and feels good.

This is how the app meets each one.

## 1. The core idea: the phone's recording is the source of truth

There is **one audio pipeline**, and live streaming is an optimisation layered on top of a guaranteed upload. Nothing depends on the stream succeeding.

1. The mic is encoded as 8kHz G.711 µ-law in **250ms chunks**, keyed by `(clipId, seq)`.
2. Every chunk is **written to disk before it goes anywhere** (`clips/<id>/<seq>.ul`). A clip also gets an outbox row in SQLite the moment recording starts.
3. If the phone holds the floor and the link is good, chunks also stream over the WebSocket. The server relays them to listeners, who play them through a ~300ms jitter buffer, and stores them as it goes.
4. When the talker lets go, the **outbox** asks the server which chunks it already has. It PUTs only the missing ones (resumable, idempotent), then POSTs `complete`.
5. The server **commits a message only when every chunk `0..total-1` is present**. `clipId` is the idempotency key, so a clip commits **exactly once**, however many times the upload is retried or duplicated.

So whatever happens to the network, the outcome is either the whole message, delivered once, or a row on the sender's phone that says "Not sent yet" and keeps retrying. **Recipients never get a partial clip.** If a stream is cut mid-sentence, listeners hear what made it through live, and then the full recording arrives as a message.

### Failure matrix

| What goes wrong | What happens | Covered by |
|---|---|---|
| Wifi blips for under 3s | Absorbed: no band and no state change. The socket reconnects and the outbox fills any gap. | `netMachine.test` "absorbs a 2s dropout"; `sim patchy` |
| Offline for longer | Red band with the offline timer, saved count, retry countdown (tap to retry now) and "Call reception". Talking still works; clips queue locally. | `sim offline` / `dropout` |
| Clip recorded with no signal | Uploaded when the link returns, committed once | test "delivered exactly once after recovery" |
| Upload dies halfway | The next attempt asks the server what it has and sends only the rest | test "resumes from what the server already has" |
| Connections reset repeatedly | Backoff retries; still exactly one message | test "connections being reset mid-upload" |
| Speaker's link dies mid-transmission | The server's 3s floor **lease** expires and frees the floor. Listeners see "Anna's signal dropped — the message will arrive in full", then get the whole clip. | test "speaker cut mid-stream" |
| Socket open but dead (captive portal, zombie NAT) | 2s heartbeats; 2 missed pongs means weak, 3 means force reconnect. NetInfo can't see this case, which is why the app doesn't rely on it. | `sim zombie` |
| Weak link while talking | RTT over 800ms, missed pongs, or more than 1.5s of unacknowledged live audio means **weak**. The phone stops streaming and keeps recording, and the clip goes as record-and-send with "Sending N%". | `netMachine.test`; `sim weak` |
| App killed mid-recording or mid-upload | On relaunch the outbox restores. A half-recorded clip is sent with what's on disk and tagged "Cut short". | `outbox.restore()` |
| Two people press at once | The server decides: first arrival wins. The loser gets a double buzz and the 08 card, and nothing of theirs is recorded. If they keep holding, they go live with a tone when the speaker stops. | test "one wins, the loser records nothing"; bots `race` |
| Away for a while | The client reconnects with `lastSeq` and the server returns exactly the missed messages. They're tagged **MISSED** and auto-play oldest first, and the tag clears only once a message has played to the end. | test "returns exactly the missed messages" |
| A message arrives late | Timestamps use the **server clock** (the phone tracks its offset from pongs), so lateness is real lateness. More than 30s late gets a grey "Sent N min ago" tag. | test "flagged late" |
| Server rejects a clip, or the local audio is unreadable | Only these surface as "Not sent · Retry". Network errors always just retry. | `outbox.ts` `Permanent` |

### The network state machine (`shared/netMachine.ts`)

The state machine is a pure reducer shared by the app and the tests. Its inputs are facts: link up or down, pong RTT, a missed pong, live backlog, and a clock tick. Its output is one of `online`, `weak`, `offline` or `recovering`.
- **The link only counts as up when the server's `welcome` arrives,** not when TCP opens. Through a dead proxy a socket can open and carry nothing.
- **Absorb:** a drop doesn't change the state until it has lasted 3s. When it goes offline, `offlineSince` is backdated to the moment the link dropped, so the offline timer is honest.
- **Recovering** (the green band) lasts 5s, then settles.
- **Hysteresis:** it becomes weak above 800ms RTT and returns to online only below 500ms, so a borderline link doesn't flap.
- **Cold start with no signal** counts as "down since launch", so the app shows offline after 3s instead of hanging. The splash is held for at most 2s.
- **Reconnects** use 1, 2, 4, 8 and 15s backoff with ±50% jitter, so a ward's worth of phones don't all hit the server at once when the AP comes back.

## 2. UX/UI decisions

I matched the handoff's colours, type, spacing and copy exactly (tokens in `src/theme/tokens.ts`). These are the places where the design was silent or inconsistent, and what I decided:

| # | Gap in the design | Decision |
|---|---|---|
| 1 | Microphone permission denied has no state | The button turns outlined with "MICROPHONE OFF · Allow microphone", and tapping it opens Settings |
| 2 | The splash is "held until the socket is up", which hangs forever with no signal | Hold for at most 2s, then open in the offline state. Recording works offline. |
| 3 | "Not sent" (manual retry) has no trigger | Auto-retry forever by default. Manual retry appears only for errors that retrying can't fix. |
| 4 | An accidental tap would create an empty clip | Holds under 300ms are discarded, with a gentle "Hold the button to talk" hint |
| 5 | No maximum length | 60s cap. The timer turns amber for the last 10s, then the clip stops with a buzz. |
| 6 | The speaker drops mid-transmission and listeners are stuck on blue | A 3s floor lease on the server, plus a one-line explanation under the channel name |
| 7 | The receipts table says "8s late", but 04 says delays under 30s aren't flagged | Follow the 30s rule. "Sent N min ago" appears only when a message is more than 30s late. |
| 8 | Weak-signal thresholds aren't defined | RTT over 800ms, 2 missed pongs, or more than 1.5s of unacknowledged live audio |
| 9 | App killed mid-clip | Chunks are on disk already; the clip is sent with a "Cut short" tag |
| 10 | Empty list at the start of a shift | "No messages this shift yet" |
| 11 | The join screen says "CH 02" but the channel is "Floor 1" | "Floor 1" everywhere |
| 12 | No way to change your name | Long-press the Teton Talk brand |
| 13 | Live talk arrives during catch-up playback | Live pre-empts playback, and so does talking. Playback resumes where it stopped. |
| 14 | No dark mode was designed | The app is forced to light mode |
| 15 | Ordering of late or queued clips | Committed messages are ordered by server arrival, and my unsent clips sit at the bottom, so the newest thing is always next to the button |
| 16 | 08 vs 04: which one does someone pressing during talk see? | Following the design caption: 08 (the card plus a double buzz) is **only** for losing a split-second race (`floor_denied`). Pressing while someone is already live just shows 04. In both cases, keep holding and you go live with a tone when they stop. |
| 17 | The copy "the moment **she** stops" assumes the speaker's pronouns | It's written for the example name "Anna", but real names are arbitrary, so the app says "the moment **they** stop" and "the message will arrive in full" |
| 18 | The README and HTML differ on the "Sending" row | Followed the HTML: a stacked row with "Sending 60%" and a 4px bar when weak, and a plain "Sending… · 22:45" meta otherwise |
| 19 | Talking with a bad link isn't designed | The button turns outlined: "RECORDING · Sends when complete / when back online", with "Saving message", a meter and a timer. It's deliberately **not** green, because green means people are hearing you right now. |

A few more small decisions:
- **Haptics:** a heavy buzz when the mic opens, and a double buzz when you lose the race.
- **Hit targets:** at least 44pt for play, delete and retry.
- **Drag tolerance:** the PTT button has a large press-retention area, so a drifting thumb doesn't cut you off mid-sentence.
- **Accessibility:** every icon button has an accessibility label ("Play", "Pause", "Delete"), length pills read "Length 0:12", and the bands are live regions.

## 3. Scope I deliberately left out

- **Background or locked-screen audio** (iOS `UIBackgroundModes`, Android foreground service). It's wired as a plugin option but off. Doing it properly means audio-session interruption handling and a foreground-service notification UX, and you can't test it meaningfully in a simulator.
- **Volume-key push-to-talk.** That needs a native module.

## 4. What I'd change with more time

- **Codec and transport.** µ-law is robust, cheap and needs no native codec, but it uses 64kbps. With Opus at 16–24kbps, weak links would stay live much longer. For the live path I'd look at WebRTC, or an SFU like LiveKit, while keeping this upload path as the delivery guarantee.
- **Background audio and push wake-up**, so a locked phone still plays incoming talk and a killed app gets woken for urgent calls.
- **Server persistence beyond one process:** Postgres plus object storage, with floor state in Redis so several servers can share a channel. Plus auth: device enrolment per care home.
- **Multiple channels or floors,** and a direct "call this person" option.
- **Admin-configurable retention.** It's a constant now (30 days, deleted hourly).
- **Device testing.** I verified this on simulators and with the bot simulator. A real ward has Bluetooth headsets, AP roaming and Android OEM battery killers. I'd do a pilot on a floor with real devices before trusting it.
- **Metrics:** time-to-commit, the share of clips that fall back to upload, retry counts and floor-race frequency, so the thresholds above can be tuned with data instead of guesses.
