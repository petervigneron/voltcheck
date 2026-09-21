#!/bin/bash
# Weekly discovery sweep: run Overpass dealer discovery over each bbox in
# registry/bboxes.txt (format: south west north east # label), spaced out to
# respect Overpass's public rate limits. Newly found dealers land in the
# registry as "discovered"; the nightly crawl picks them up once a session
# marks them working (or a future auto-probe promotes them).
set -uo pipefail
cd "$(dirname "$0")"
# launchd provides only /usr/bin:/bin:/usr/sbin:/sbin — node lives elsewhere
# (same bug that killed the 2026-08-11 nightly run).
export PATH="/usr/local/bin:/opt/homebrew/bin:$PATH"
LOG="logs/discover-$(date +%Y%m%d).log"
mkdir -p logs

# SWEEP_DEADLINE_MIN: stop starting new bboxes this many minutes in, so the
# caller's own cap never has to cut the sweep off. Unset = no deadline (the
# laptop's launchd run). discover.mjs saves the registry after every bbox, so
# a sweep that stops early keeps everything before the stop.
START=$(date +%s)
{
  echo "=== discovery sweep $(date)"
  grep -v '^\s*#' registry/bboxes.txt | while read -r S W N E _; do
    [ -z "${S:-}" ] && continue
    if [ -n "${SWEEP_DEADLINE_MIN:-}" ] && [ $(( ($(date +%s) - START) / 60 )) -ge "$SWEEP_DEADLINE_MIN" ]; then
      echo "--- deadline: ${SWEEP_DEADLINE_MIN} minutes in, stopping before bbox $S $W $N $E; the rest are next week's"
      break
    fi
    echo "--- bbox $S $W $N $E"
    node discover.mjs "$S" "$W" "$N" "$E"
    # Spacing between Overpass queries. Generous by default on a laptop;
    # CI sets it lower since idle minutes are billed. Overpass advertises
    # 2 slots and our queries return in seconds, so 60s is still polite.
    sleep "${SWEEP_SLEEP:-300}"
  done
  echo "=== done $(date)"
} >> "$LOG" 2>&1
