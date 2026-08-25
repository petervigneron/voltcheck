-- The exact live-row count is the site's most load-bearing single request:
-- web/lib/listings/db.ts opens every feed walk with it (Range 0-0, Prefer
-- count=exact) so a short read can't pass as a complete one, and
-- scraper/walk-gate.mjs uses the same number as the yardstick a pre-deploy
-- walk is checked against. Both run as anon, so both get 3 seconds.
--
-- 0030 made that count an index-only scan over a partial index and measured
-- 11.3s -> 0.4s. What 0030 did NOT do was keep it that way. An index-only
-- scan only skips the heap for pages the visibility map marks all-visible,
-- and every write clears those marks. So the count's cost is not a function
-- of inventory — it is a function of how much has been written since the last
-- vacuum, which means it is slowest at exactly the moment the nightly
-- finishes writing and the revalidate POST asks for a fresh walk.
--
-- Measured 2026-08-25, ~40 minutes after that night's finalize-ingest:
--
--   before vacuum   4,284 ms   Heap Fetches: 20,727   buffers 17,484
--   after vacuum      275 ms   Heap Fetches: 0        buffers    303
--
-- and the same request over HTTP as anon went from a consistent 500 (57014,
-- statement timeout) to 206 in 0.17s. Nothing about the query changed. This
-- is why walk-gate could not clear on 2026-08-25 and, more expensively, why
-- the live feed read had been losing the same race after every nightly.
--
-- WHAT WAS REJECTED. A gateway endpoint that runs the count as service_role
-- (60s instead of 3s) was the plan until the measurement came in: it would
-- have unstuck the gate while leaving db.ts — the request that actually
-- serves shoppers — still timing out, and hidden the maintenance problem
-- behind an endpoint. A cheaper count shape is the false-gate direction
-- walk-gate.mjs's header warns about. Tuning autovacuum harder was rejected
-- because it is already tuned hard on this table (scale_factor 0.02,
-- insert_scale_factor 0.05) and still lost: its trigger is a dead-tuple
-- threshold (~3,150 rows here) but the damage is measured in pages touched
-- (20,727), and the nightly's writes clear marks far faster than they
-- accumulate dead tuples. A threshold that fires on the wrong quantity
-- cannot be tuned into firing at the right time.
--
-- Hourly, not once after the nightly: the nightly's finish time has ranged
-- 11:56-18:37 UTC over the last week, so there is no single time to pin. A
-- vacuum that finds the map current reads only the pages that changed, so
-- the steady-state cost is small; the expensive run is the one right after
-- the nightly, which is the one that has to happen. :10 past keeps it off
-- the top of the hour. cron.timezone is GMT on this instance, so this is UTC
-- like nightly.yml's own cron.
create extension if not exists pg_cron;

-- Idempotent: re-running this migration re-points the job rather than
-- stacking a second one.
select cron.unschedule(jobid) from cron.job where jobname = 'vacuum-listings-visibility-map';

select cron.schedule(
  'vacuum-listings-visibility-map',
  '10 * * * *',
  $$vacuum (analyze) listings$$
);
