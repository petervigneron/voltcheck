#!/bin/bash
# Nightly pipeline: crawl every working registry site → VIN-enrich → ingest.
# Plain shell + Node — no AI involved, costs nothing to run.
set -uo pipefail
cd "$(dirname "$0")"
# launchd provides only /usr/bin:/bin:/usr/sbin:/sbin — node lives elsewhere
# (this exact omission silently killed the 2026-08-11 run).
export PATH="/usr/local/bin:/opt/homebrew/bin:$PATH"
LOG="logs/nightly-$(date +%Y%m%d).log"
mkdir -p logs

# Validate any newly discovered domains first, so tonight's crawl already
# includes the ones that pass (probe promotes discovered → working).
node probe.mjs >> "$LOG" 2>&1

DOMAINS=$(python3 -c "
import json
r = json.load(open('registry/registry.json'))
print(' '.join(s['domain'] for s in r['sites'] if s.get('status') == 'working'))")

{
  echo "=== nightly crawl $(date) — domains: $DOMAINS"
  node crawl.mjs $DOMAINS --max-pages 80 --cache-hours 20 --concurrency 6
  node vpic-enrich.mjs
  node ingest.mjs
  node db-sync.mjs
  echo "=== done $(date)"
} >> "$LOG" 2>&1

# keep two weeks of logs
find logs -name 'nightly-*.log' -mtime +14 -delete
