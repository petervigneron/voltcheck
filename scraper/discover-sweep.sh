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

{
  echo "=== discovery sweep $(date)"
  grep -v '^\s*#' registry/bboxes.txt | while read -r S W N E _; do
    [ -z "${S:-}" ] && continue
    echo "--- bbox $S $W $N $E"
    node discover.mjs "$S" "$W" "$N" "$E"
    sleep 300
  done
  echo "=== done $(date)"
} >> "$LOG" 2>&1
