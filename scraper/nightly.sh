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
# The registry now holds ~1,000 state-sourced dealers awaiting validation;
# at 300/night the backlog clears in days rather than weeks. Politeness is
# per-host, so concurrency across distinct dealers costs them nothing.
node probe.mjs --limit 300 --concurrency 12 >> "$LOG" 2>&1

DOMAINS=$(python3 -c "
import json
r = json.load(open('registry/registry.json'))
print(' '.join(s['domain'] for s in r['sites'] if s.get('status') == 'working'))")

{
  echo "=== nightly crawl $(date) — domains: $DOMAINS"
  node crawl.mjs $DOMAINS --max-pages 80 --cache-hours 20 --concurrency 6
  node vpic-enrich.mjs
  # Ask GM what each used GM car's battery warranty actually is. Bounded per
  # night: the first pass has a few thousand VINs to work through and there is
  # no reason to hold the pipeline for it, since cached VINs are never asked
  # again and the backlog drains over a few nights.
  node gm-warranty.mjs --limit 600
  # Ask Ford for each Ford EV's own window sticker, so a dealer-fed trim has
  # something to be checked against. Same shape as gm-warranty above: cached
  # per VIN forever, bounded per night, backlog drains over a few nights.
  # db-sync applies the cache (lib/ford-sticker-trim.mjs); this only fills it.
  node ford-sticker.mjs --limit 600
  node ingest.mjs
  node db-sync.mjs
  # Sanity-check every price against WA sale medians (the vanhyundai
  # accessories-total incident, 2026-08-14). Implausible prices are re-read
  # from the dealer's own page or suppressed; exit 20 means the listings
  # JSON was corrected and needs one more sync.
  node price-audit.mjs
  [ $? -eq 20 ] && node db-sync.mjs
  # Ask every live listing's own page whether it is still for sale. This is
  # the authoritative sold-signal; the crawl above only discovers.
  node recheck.mjs --concurrency 10
  # Re-derive the observed trim-per-VIN-cohort table now that tonight's
  # listings are settled (migration 0020).
  node refresh-variants.mjs
  # Washington transaction prices refresh monthly upstream; reload on the 5th.
  # --months 0 = full archive: the load replaces the table, so a windowed
  # pull would truncate the 2016-onward history.
  [ "$(date +%d)" = "05" ] && node wa-prices.mjs --months 0
  # And name the versions behind them: new sales bring new VIN cohorts, which
  # read as "Unknown" until vPIC has decoded them (migration 0016).
  [ "$(date +%d)" = "05" ] && node vpic-variants.mjs
  echo "=== done $(date)"
} >> "$LOG" 2>&1

# keep two weeks of logs
find logs -name 'nightly-*.log' -mtime +14 -delete
