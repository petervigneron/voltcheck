-- 0049 scheduled `vacuum (analyze) listings` hourly. The vacuum half is right;
-- the analyze half is not, and the first scheduled run showed why. Measured
-- 2026-08-25 15:10 UTC:
--
--   vacuum phase    < 90s, and it is self-limiting -- VACUUM skips pages the
--                   visibility map already marks all-visible, so only the run
--                   after a big write is expensive
--   analyze phase   still going at 199s, "acquiring sample rows", with
--                   sample_blks_total = 25,620 = every page in the table
--
-- ANALYZE samples all 19 columns, and listings carries the wide jsonb payload
-- columns, so acquiring its sample reads the whole 200MB heap rather than a
-- cheap subset. While it ran, the anon count answered in 15-17s instead of
-- 0.2s -- succeeding (206, not the 500 this whole thread is about: the wait is
-- for a connection, not the statement) but slow enough to matter on a box the
-- CPU/IO findings already call constrained. Paying that every hour to refresh
-- planner statistics that change shape daily at most is a bad trade.
--
-- Only the vacuum is needed hourly: the index-only scan that makes the count
-- cheap depends on the visibility map, which VACUUM maintains and ANALYZE does
-- not touch.
--
-- ANALYZE still has to be scheduled rather than left to autovacuum. It looks
-- like it should not need to be -- the table carries
-- autovacuum_analyze_scale_factor=0.05 -- but last_autoanalyze on listings was
-- null before this migration, i.e. autoanalyze has never once fired here. Its
-- trigger is rows modified since the last analyze (n_mod_since_analyze was 53
-- against a threshold near 7,800) and the nightly's writes do not accumulate
-- there the way they accumulate page touches. Same mismatch that made
-- autovacuum unable to keep the visibility map current in 0049: the counter
-- the threshold watches is not the counter that goes up. So it is scheduled
-- explicitly, daily, at 08:40 UTC -- before nightly.yml's 10:30 start, when
-- the box is otherwise idle.
select cron.unschedule(jobid) from cron.job where jobname = 'vacuum-listings-visibility-map';

select cron.schedule(
  'vacuum-listings-visibility-map',
  '10 * * * *',
  $$vacuum listings$$
);

select cron.unschedule(jobid) from cron.job where jobname = 'analyze-listings-daily';

select cron.schedule(
  'analyze-listings-daily',
  '40 8 * * *',
  $$analyze listings$$
);
