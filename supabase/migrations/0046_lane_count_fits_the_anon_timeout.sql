-- Make sync-guard's per-lane live count answerable inside anon's 3s timeout.
--
-- WHAT WAS WRONG. sync-guard (scraper/sync-guard.mjs) gates the nightly's
-- revalidate on a listing-count regression check. It reads the live count
-- three ways as anon: global, and once per lane — OEM-locator domains vs
-- crawled dealer rooftops. The lane read is
--
--   GET /listings?select=vin&delisted_at=is.null
--       &dealer_domain=in.(<the 28 OEM-locator domains>)   Prefer: count=exact
--
-- and it has never once completed. Every run since the check shipped
-- (2026-08-21) ended the same way, in postgrest_logs:
--
--   {"code":"57014","message":"canceling statement due to statement timeout"}
--
-- Measured on a healthy, idle, freshly-autovacuumed instance 2026-08-23,
-- which is the kindest condition it will ever see:
--
--   Aggregate (actual time=13878.787..13878.790)
--     -> Bitmap Heap Scan on listings (actual time=164.636..13866.185 rows=53462)
--          Heap Blocks: exact=15136   Buffers: shared hit=12656 read=2642
--          -> Bitmap Index Scan on listings_domain_idx (actual time=161.259 rows=58955)
--
-- 13.9 SECONDS against anon's `statement_timeout=3s`. Not a slow night, not
-- the database being sick — 4.6x over the ceiling on its best day. The index
-- scan itself costs 161 ms; all of the rest is the 15,136-block heap visit,
-- and the heap is visited for one reason only: listings_domain_idx carries
-- dealer_domain but not delisted_at, so every candidate row must be fetched
-- to find out whether it is still live. 5,493 of them are then discarded.
--
-- THE FIX is the missing partial index, matching the three this table already
-- has on the same predicate (listings_live_vin, listings_vin_prefix,
-- listings_live_idx). With dealer_domain in an index that is already
-- restricted to live rows, the count is an index-only scan and the heap is
-- never touched. Nothing about the check's meaning changes: it is the same
-- question, asked in a shape the database can answer.
--
-- WHY NOT THE ALTERNATIVES:
--   - Give sync-guard the service_role key (60s timeout). It would paper over
--     a 13.9s query rather than fix it, and 13.9s is the IDLE number — this
--     check runs seconds after db-sync has rewritten ~100k rows, when the
--     instance's latency is bimodal (see the 2026-08-22 CPU/IO findings). A
--     query that needs 20x its budget on a quiet box is not one to hand a
--     bigger budget.
--   - Read the lane totals out of db-sync's own out/sync-totals.json. That is
--     the pipeline grading its own homework; the whole point of this check is
--     an independent read of what the database actually holds.
--   - Drop the lane split and keep only the global count. The lane split is
--     why the check exists: the 87,082 -> 58,741 incident was one lane
--     collapsing while the other held, which a global total can hide.
--
-- COST: ~2 MB, and one more index to maintain on a table whose write
-- amplification 0042 just spent effort reducing. It sits on the same partial
-- predicate as three existing indexes, so it adds no new class of maintenance.
--
-- CONCURRENTLY, and therefore outside a transaction: this table serves the
-- live site. A plain CREATE INDEX takes a SHARE lock and blocks every write
-- for its duration, and an earlier index experiment on this instance held
-- ACCESS EXCLUSIVE long enough to block a live read.

create index concurrently if not exists listings_live_domain
  on public.listings (dealer_domain)
  where delisted_at is null;

comment on index public.listings_live_domain is
  'Lets a per-lane live count (dealer_domain IN (...) AND delisted_at IS NULL) run index-only. Without it the count is a 15,136-block bitmap heap scan at ~13.9s, against anon''s 3s statement_timeout — see 0046.';
