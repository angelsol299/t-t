#!/bin/sh
# Regenerates the bots' voice samples (macOS: uses `say` and `afconvert`).
# Output: samples/<name>.ul — 8kHz G.711 µ-law, the wire format.
set -e
cd "$(dirname "$0")/.."
TMP=$(mktemp -d)
gen() {
  say -v "$2" -o "$TMP/$1.aiff" "$3"
  afconvert -f WAVE -d LEI16@8000 -c 1 "$TMP/$1.aiff" "$TMP/$1.wav"
  npx tsx scripts/wav-to-ulaw.ts "$TMP/$1.wav" "samples/$1.ul"
}
gen anna Samantha "Hi team, this is Anna. Room twelve needs a hand with a transfer, can someone come over?"
gen jonas Daniel "Jonas here. I am at the nurses station, on my way to room twelve now."
gen maria Karen "Maria speaking. Medication round on the second floor is done, all good."
rm -rf "$TMP"
echo "samples written to simulator/samples/"
