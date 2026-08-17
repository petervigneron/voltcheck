-- Keep the evidence of which rooftops share inventory.
--
-- NUMBERING: this file was drafted as 0034, but 0034 was taken (and applied
-- to prod) by 0034_reference_dataset_staged_loads.sql before it landed, and
-- 0035 is spoken for by parallel work. Renumbering an applied migration is
-- forbidden, so this is 0036. The repo already carries one duplicate number
-- (two 0016s); that is a wart, not a precedent.
--
-- What is being lost today. scraper/merge-shards.mjs stitches the eight crawl
-- shards plus the OEM-locator shard into one feed with a VIN-keyed,
-- richest-record-wins dedupe. When the same VIN appears on several dealer
-- domains in one night the losing records are discarded — 8,564 VINs on the
-- night of 2026-08-17, 2,988 of them across true dealer rooftops once the OEM
-- locator lanes are set aside. What goes with them is not a duplicate listing.
-- It is the statement "these two websites are offering the same physical car",
-- which is the only free evidence we have that two rooftops belong to one
-- owner. One measured night clustered 580 rooftops into ~180 recognizable
-- ownership groups (Herb Chambers, Lithia, McGovern, Koons).
--
-- Why it has to be persisted rather than recomputed. It cannot be recomputed:
-- the merge happens before anything reaches this database, and by the time
-- listings has the night's rows there is exactly one row per VIN. Every night
-- that runs without this table is a night of the graph that is simply gone.
--
-- Three things need it:
--   1. Move detection. "This car moved from dealer A to dealer B" is a claim
--      the site would have to stand behind, and against one night's raw data
--      naive move detection false-positives at roughly 200:1 — a group listing
--      one car on twelve of its own sites is indistinguishable from eleven
--      moves. This table is the denominator that makes the claim sayable at
--      all; without it the honest answer is silence.
--   2. Honest inventory counts. The same car counted once per rooftop
--      overstates the market.
--   3. Dealer-SaaS account mapping: which domains are one customer.
--
-- SIZING. This is a free-tier Nano instance, and migration 0025's header is
-- the history: the nightly OOM-killed Postgres three nights running because
-- ingest_listings rewrote ~64k wide (~1.6KB) tuples every night. The rules
-- that came out of that are followed here deliberately:
--   * The row is narrow — two small arrays and three scalars, ~200 bytes.
--   * No jsonb payload. The arrays ARE the record; there is nothing else
--     worth keeping and a jsonb column would invite there to be.
--   * No triggers. Nothing on this table may run per-row.
--   * The write is ONE set-based INSERT ... SELECT over
--     jsonb_array_elements, never row-at-a-time.
-- At ~8.5k rows a night this is ~3.1M rows and roughly 0.6–0.9 GB a year with
-- its indexes — small next to listings' churn (this is 8.5k narrow inserts
-- against that lane's 64k), but not free forever. Pruning is a later decision
-- and deliberately not made here: the natural rule is to keep one row per
-- (vin, domain-set) transition rather than one per night, and that is a
-- semantic change ("co-listed on night N" stops being a lookup) that deserves
-- its own migration rather than being smuggled in with the table that first
-- collects the data.
--
-- What was REJECTED and why:
--   * Writing this into listings.payload, or any per-crawl field on it. Since
--     0025/0026 payload equality is what decides whether the wide row is
--     rewritten — payload-equal implies row-equal — so a field that changes
--     when co-listing changes would re-dirty rows nightly and walk straight
--     back into the OOM this schema was rebuilt to escape. This lane stays
--     entirely out of listings and its payload.
--   * A normalized edge table (vin, domain_a, domain_b). It multiplies rows
--     quadratically in the size of the domain set — one VIN on twelve rooftops
--     is 66 edges instead of 1 — for a graph the array form can produce with
--     one unnest.
--   * A foreign key from vin to listings(vin). A co-listing sighting is
--     evidence in its own right and is true whether or not the car cleared
--     ingest_listings' price filter; an FK would silently drop exactly the
--     rows whose provenance is most interesting, and cost a lookup per insert.
--   * A GIN index on domains. Nothing queries "which VINs touched this domain"
--     yet, and an unused GIN index is write cost with no reader.

create table if not exists vin_colisting (
  id          bigint generated always as identity primary key,
  vin         text        not null,
  -- Parallel arrays, ordered together: domains[i] offered the car at
  -- prices[i]. prices is nullable, and individual elements may be null — a
  -- rooftop that shows "call for price" is a real sighting with no price, and
  -- inventing one would be the kind of quiet false number the house rules
  -- exist to prevent.
  domains     text[]      not null,
  prices      integer[],
  observed_at timestamptz not null default now(),
  -- Reserved: the ingest run this graph belongs to. The nightly's colisting
  -- write does not open an ingest_runs row (it is not a listings write and
  -- must not inflate that lane's counters), so this is null today. The FK
  -- costs nothing while it is null and keeps the column honest if a future
  -- writer does have a run.
  run_id      bigint references ingest_runs(id)
);

-- UNIQUE, and that is what makes a replayed chunk harmless. The ingest RPC
-- stamps every row of a call with one client-supplied observed_at (the same
-- earliest-crawledAt the listings sync uses as its night key), so re-sending
-- a chunk whose response was lost conflicts exactly and inserts nothing —
-- the failure mode 0033's header describes for the monthly loads, headed off
-- here by the index the per-VIN history query wanted anyway.
create unique index if not exists vin_colisting_vin_observed_idx
  on vin_colisting (vin, observed_at);

-- "Tonight's graph" is the other access path, and the unique index above is
-- vin-leading so it cannot serve it.
create index if not exists vin_colisting_observed_idx
  on vin_colisting (observed_at);

-- 0007 posture: the anon role reads exactly what the public site publishes
-- and nothing else. Nothing publishes this — there is no surface on
-- voltcheck.net that shows dealer-group structure today — so there is no
-- policy and no grant, and select is revoked so a mistake reads as a
-- permission error rather than silently empty rows. This is also the single
-- most competitively valuable thing in the schema: the group graph is built
-- from nights nobody else crawled, and cannot be rebuilt by starting today.
-- When something does publish a derived form of it, publish the STATISTIC
-- (as wa_price_comps does for wa_ev_sales), not this table.
alter table vin_colisting enable row level security;
revoke all on vin_colisting from public, anon, authenticated;

-- ingest_colisting: one row per multi-domain VIN, in one statement.
--
-- _observed_at is optional but the nightly always passes it, and passing it
-- is what makes a night addressable: without it each chunk of a large body
-- would land under its own now() and "one night's graph" would become a fuzzy
-- time-window query instead of an equality — and the replay guard above would
-- stop working, since a retried chunk would no longer conflict.
--
-- Validation RAISEs rather than returning an {error} object, the choice 0033
-- made and for the same reason: PostgREST turns a raise into HTTP 400, which
-- the scraper's retry ladder correctly treats as permanent and exits on,
-- whereas an error object rides back inside an HTTP 200 nobody inspects.
create or replace function ingest_colisting(
  _rows jsonb,
  _observed_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  _obs timestamptz := coalesce(_observed_at, now());
  _n   integer := 0;
begin
  if _rows is null or jsonb_typeof(_rows) <> 'array' then
    raise exception 'ingest_colisting: _rows must be an array';
  end if;

  -- One statement, set-based, no loop. The ordinality on the outer array keys
  -- the grouping by INPUT ROW rather than by VIN: the scraper emits one row
  -- per VIN, but if it ever emitted two, grouping on the VIN alone would fuse
  -- their sightings into a single edge set that was never observed on any one
  -- night. Fusing invents a claim; the unique index below then drops the
  -- second row as the duplicate observation it is, which is merely losing one.
  with rows_in as (
    select ord as row_ord,
           upper(x->>'vin') as vin,
           x->'sightings'   as sightings
    from jsonb_array_elements(_rows) with ordinality as t(x, ord)
    where coalesce(x->>'vin', '') <> ''
      -- CASE, not `typeof = 'array' and array_length > 1`. AND does not
      -- short-circuit in SQL — the planner is free to order quals by
      -- estimated cost — so the length call could run first and raise
      -- "cannot get array length of a scalar" on one malformed element,
      -- losing the whole night. CASE has defined evaluation order.
      and case when jsonb_typeof(x->'sightings') = 'array'
               then jsonb_array_length(x->'sightings') > 1
               else false end
  ),
  agg as (
    select r.row_ord,
           r.vin,
           array_agg(s.el->>'domain' order by s.sord) as domains,
           -- A price that is not a plain number is absence, not a value. The
           -- regex guard (same shape as ingest_listings') matters more here
           -- than a cast would: one malformed price in a 8k-row batch would
           -- abort the whole night's graph.
           array_agg(
             case when (s.el->>'priceUsd') ~ '^[0-9]+(\.[0-9]+)?$'
                  then round((s.el->>'priceUsd')::numeric)::int end
             order by s.sord
           ) as prices,
           -- DISTINCT domains, not sightings. Two sightings on one domain are
           -- one rooftop offering one car (an SRP tile and its own VDP), and
           -- recording that as co-listing would assert a dealer-group edge
           -- from a website to itself. merge-shards already collapses per
           -- domain, so this only fires on a caller that didn't — but the
           -- claim this table exists to support is too easy to poison to take
           -- the writer's word for it.
           count(distinct s.el->>'domain') as n_domains
    from rows_in r
    cross join lateral jsonb_array_elements(r.sightings) with ordinality as s(el, sord)
    where coalesce(s.el->>'domain', '') <> ''
    group by r.row_ord, r.vin
  )
  insert into vin_colisting (vin, domains, prices, observed_at)
  select vin, domains, prices, _obs
  from agg
  -- Re-checked after the filters above: a row whose second sighting had no
  -- domain, or repeated the first one, is a one-rooftop car.
  where n_domains > 1
  -- A replayed chunk lands here and inserts nothing; row_count then reports 0,
  -- which is the caller's signal that it was a replay rather than a no-op run.
  on conflict (vin, observed_at) do nothing;

  get diagnostics _n = row_count;

  return jsonb_build_object('inserted', _n, 'observed_at', _obs);
end;
$$;

revoke execute on function ingest_colisting(jsonb, timestamptz) from public, anon, authenticated;
