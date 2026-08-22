-- payload_public stops storing a second copy of a column it did not change.
--
-- 0026 added payload_public as `payload - 'description'` STORED, so the feed
-- could read a description-free payload without rebuilding one per scanned
-- row. That was right, and it stays right. What it did not anticipate is that
-- only a minority of listings carry a description at all: for every other row
-- the generated column is a byte-for-byte second copy of `payload`, and both
-- copies sit inline in the same heap tuple.
--
-- Measured 2026-08-22, 112,681 rows:
--
--   rows with a description                       18,205  (16.2%)
--   payload                                          755 B avg on disk
--   payload_public                                   820 B avg on disk
--   whole row                                      1,724 B avg
--
-- payload_public measures LARGER than payload for the identical content
-- because the toaster compresses one attribute at a time, largest first, and
-- stops as soon as the tuple fits: payload gets compressed 844 B -> 700 B and
-- payload_public is left raw. The duplicate is ~48% of every row.
--
-- Why that is a read cost and not just a storage cost: column projection does
-- not reduce heap I/O for inline attributes. Naming four columns in a SELECT
-- still reads the whole tuple, because the page read is the unit. At 1,724 B
-- the rows are just under the ~2032 B TOAST_TUPLE_THRESHOLD, so they stay
-- inline and the duplicate halves how many rows fit on an 8 KB page.
--
-- Confirmed on the live table before changing anything:
--
--   pg_relation_size/8192 vs reltuples          3.92 rows/page
--   ctid histogram over the first 2,000 pages   4.72 avg, median 5, max 7
--   pg_class.reltoastrelid                      37 MB against a 226 MB heap
--
-- so the payloads are inline, not TOASTed out of line, and this is costing
-- the feed walk real pages. A 3,000-row temp clone (temp: no WAL, no lock,
-- faithful for layout) separated the three possible worlds:
--
--   A  payload_public for every row (today)      704 pages   4.26 rows/page
--   B  payload_public only where needed          384 pages   7.81 rows/page
--   C  no payload_public column at all           384 pages   7.81 rows/page
--
-- B and C are the same size to the page. The 16% that still need a stripped
-- copy do not cost a single extra heap page — their second copy is what
-- pushes those tuples over the threshold, so the toaster moves it out of line
-- (B's TOAST is 208 KB against A's 384 KB: this is cheaper on TOAST too).
-- Repeated at 23,309 rows: 7.92 rows/page. Half the heap pages per feed page,
-- for every one of the ~226 pages in a full walk.
--
-- The fix therefore stores the DIFFERENCE, not the copy: NULL when there was
-- nothing to strip, and the view falls back to `payload`. 0026's intent is
-- untouched — the rows that need stripping still pay for it at write time,
-- where 0025 made writes rare, and never at read time.
--
-- REJECTED: dropping payload_public and putting `payload - 'description'`
-- back in the view. It is tempting now that 0032/0041 turned the feed into
-- keyset pages of 500 rather than deep offsets, so the minus would run 500
-- times per page instead of 41,000 times. But 0026 measured that minus at
-- ~134 us/row, which is still ~67 ms of pure CPU per feed page and ~15 s
-- added to a full walk, bought for nothing: variant B above already gives the
-- whole page saving while keeping the read free. Storing the difference
-- dominates on both axes.
--
-- The output column stays named `payload`, so web/lib/listings/db.ts's select
-- list does not change and no web deploy is coupled to this.
--
-- ORDER IS LOAD-BEARING. The view is replaced FIRST, in the same transaction.
-- Before the ALTER the coalesce is a no-op (payload_public is non-null on
-- every row, so it always wins); after the ALTER it is the fallback. Applied
-- the other way round there is a window in which the feed serves NULL payload
-- for 84% of the inventory.
--
-- Validated before applying:
--   * the expressions are equal on all 112,681 rows -- 0 rows where
--     coalesce(case when payload ? 'description' then payload - 'description'
--     end, payload) IS DISTINCT FROM (payload - 'description'), 0 rows where
--     the result still carries a 'description' key. Also 0 NULL payloads and
--     0 non-object payloads, so the `?` and `-` operators behave the same on
--     every row (a scalar payload would already be erroring today).
--   * the replacement view built as a temp view against a simulated
--     post-ALTER column and diffed column-by-column against the live one over
--     926 rows chosen to span both sides of every join: 0 vin-set difference,
--     0 column mismatches, 0 descriptions leaked. The sample deliberately
--     included 432 rows that DO carry a description, 911 with no
--     listing_freshness match and 811 with no previous price.
--   * ALTER ... SET EXPRESSION rehearsed on a temp table that had a view
--     depending on the generated column -- PG 17 allows it and the dependent
--     view picks up the new values.
--
-- SET EXPRESSION rather than DROP + ADD COLUMN: both rewrite the table, but
-- DROP would have to cascade through live_listings_feed and re-granting the
-- view is how you 403 the whole site. Headroom checked first, per 0026:
-- /data had 1.27 GB free of 2.08 GB against a peak of ~160 MB of new heap
-- plus ~26 MB of rebuilt indexes, and the table lands ~100 MB smaller than it
-- started.
--
-- A rewrite resets the visibility map, so `vacuum (analyze) listings` is run
-- immediately after this migration -- it cannot live in here, VACUUM does not
-- run inside a transaction block.
--
-- WHAT IT COST TO APPLY, and the one thing that decides it. The first
-- attempt, at 12:08 UTC on 2026-08-22, was killed by its own 900 s
-- statement_timeout and rolled back with nothing changed. The second, at
-- 13:56 UTC, ran the identical statement in 37 SECONDS. Nothing about the
-- statement changed between them; the database did. The morning attempt ran
-- during that day's incident, when the anon count was returning HTTP 500 and
-- db-sync's first chunk was timing out at the gateway's 150 s wall clock. The
-- afternoon attempt ran once a fat feed page answered in 1.1 s.
--
-- So the cost of this rewrite is not a property of its size. It is a property
-- of the instance's health at the moment you fire it, and it swings by more
-- than 25x. Gate on a real feed page before starting -- not on a status
-- endpoint, not on the cheap COUNT -- and if the answer is slow, do not fire
-- and hope. A rewrite that runs long holds ACCESS EXCLUSIVE on `listings`
-- while it does, every read of the table blocks behind it, and a shard
-- route-cache miss during that window renders against a blocked database and
-- caches the bundled fallback for a full day. That is the 2026-08-21 shape
-- (five shards serving ~9,788 rows each).
--
-- The safe window is one where no shard can re-render during the lock. The
-- nightly's final revalidate-and-warm creates it, but it is not the only way
-- to get it, and on the day this landed the nightly failed at db-sync so the
-- warm never ran. What actually matters is measurable directly: the six
-- shards and /api/index/first were 7.8 h into a 24 h route cache, so ~16 h of
-- life remained and none of them could re-render during a lock of any
-- plausible length. Verify the property, do not assume the ritual that
-- usually produces it. Also confirmed before firing: no Vercel build in
-- flight, no db-sync running, and pg_stat_activity idle.
--
-- Extrapolating the duration from a temp-table rehearsal was useless in both
-- directions -- 5,100 of the 28,954 heap pages rebuilt in 4.5 s as a temp
-- table, predicting ~26 s. A temp table writes no WAL and rebuilds no
-- indexes, and Supabase runs wal_level=logical so none of that can be
-- skipped. The prediction happened to land near the healthy figure by
-- coincidence, having been wrong by 25x four hours earlier.
--
-- Watch it from a second connection with queries that take no lock on the
-- table -- pg_stat_activity and pg_stat_progress_* are fine; pg_relation_size
-- is not, and will simply queue behind the rewrite. The management API's HTTP
-- response dies at Cloudflare's ~100 s cap regardless, but the backend keeps
-- running, so the response is not the result.
--
-- APPLIED 2026-08-22 13:56 UTC, then `vacuum (analyze) listings` (3 s -- a
-- rewrite leaves relallvisible at 0, and this table's design depends on being
-- vacuumed):
--
--   heap                    226 MB -> 113 MB      (28,954 -> 14,464 pages)
--   rows per page             3.92 -> 7.79        (predicted 7.81)
--   TOAST                    35 MB -> 6,360 kB
--   indexes                  25 MB -> 14 MB       (rebuilt by the rewrite)
--   listings, all in          300 MB -> 133 MB
--   whole database           463 MB -> 310 MB
--   relallvisible                 0 -> 100%
--
-- Correctness re-proved on the finished table, all 112,681 rows: 18,205 carry
-- a description and 94,476 have payload_public NULL (they sum), 0 rows where
-- `payload ? 'description'` disagrees with `payload_public is null`, 0 rows
-- where coalesce(payload_public, payload) differs from the old
-- `payload - 'description'`, and 0 descriptions reaching the view.
--
-- WHERE THE WIN ACTUALLY COMES FROM -- not where this migration first
-- predicted it. The premise was that halving rows-per-page halves the heap
-- pages a feed page touches. It does not, and EXPLAIN (ANALYZE, BUFFERS) on a
-- W-bucket page says so: the `listings` leg reads 411 buffers after the
-- change against 414 before it. The feed walks in vin order and the rows are
-- not clustered by vin, so a 500-row page lands on ~one heap page per row no
-- matter how many rows would fit on a page. Denser pages do not help an
-- access pattern that touches each page once.
--
-- What halving the table does do is make it fit in memory. `listings` and all
-- its indexes are now 133 MB against 224 MB of shared_buffers, where 300 MB
-- could never be resident; the same EXPLAIN reports 7,699 buffers hit and
-- ZERO read. That is the difference between a feed walk served from RAM and
-- one served from a free-tier Nano's disk, which is the resource this
-- database actually runs out of -- its lifetime iowait is 24,416 s against
-- 3,098 s of user CPU. The second-order wins are real too: 153 MB back
-- against the free tier's 500 MB (the database was at 463 MB, i.e. 93%), and
-- every row rewrite in the ingest lane now moves ~48% fewer bytes.

create or replace view live_listings_feed
with (security_invoker = false) as
 SELECT l.vin,
    l.first_seen_at,
    s.last_seen_at,
    COALESCE(l.payload_public, l.payload) AS payload,
    h.prev_price_usd,
    h.price_changed_at,
    l.buyback_disclosed,
    f.listed_on
   FROM listings l
     LEFT JOIN LATERAL ( SELECT s2.last_seen_at
                           FROM listing_seen s2
                          WHERE s2.vin = l.vin
                          LIMIT 1) s ON true
     LEFT JOIN LATERAL ( SELECT
                CASE WHEN g.claimable THEN g.prev ELSE NULL::integer END AS prev_price_usd,
                CASE WHEN g.claimable THEN g.at1 ELSE NULL::timestamp with time zone END AS price_changed_at
           FROM ( SELECT g0.prev, g0.at1, g0.at2,
                        CASE
                            WHEN g0.n < 2 THEN false
                            WHEN g0.prov_cur IS NOT NULL AND g0.prov_prev IS NOT NULL THEN g0.prov_cur = g0.prov_prev
                            ELSE g0.same_src AND NOT (EXISTS ( SELECT 1
                               FROM price_methodology_transitions t
                              WHERE t.at > g0.at2 AND t.at <= g0.at1))
                        END AS claimable
                   FROM ( SELECT (array_agg(last2.price_usd ORDER BY last2.observed_at DESC))[2] AS prev,
                            (array_agg(last2.provenance ORDER BY last2.observed_at DESC))[1] AS prov_cur,
                            (array_agg(last2.provenance ORDER BY last2.observed_at DESC))[2] AS prov_prev,
                            max(last2.observed_at) AS at1,
                            min(last2.observed_at) AS at2,
                            NOT min(last2.src) IS DISTINCT FROM max(last2.src) AS same_src,
                            count(*) AS n
                           FROM ( SELECT p.price_usd,
                                    p.observed_at,
                                    p.provenance,
                                    COALESCE(r.source, '?'::text) AS src
                                   FROM listing_price_history p
                                     LEFT JOIN ingest_runs r ON r.id = p.run_id
                                  WHERE p.vin = l.vin
                                  ORDER BY p.observed_at DESC
                                 LIMIT 2) last2) g0) g) h ON true
     LEFT JOIN LATERAL ( SELECT f2.listed_on
                           FROM listing_freshness f2
                          WHERE f2.vin = l.vin
                          LIMIT 1) f ON true
  WHERE l.delisted_at IS NULL;

alter table listings
  alter column payload_public
  set expression as (case when payload ? 'description' then payload - 'description' end);

analyze listings;
