-- Stop rewriting the ~98% of rows that didn't change.
--
-- The nightly sync was OOM-crashing the database (2026-08-16, three nights
-- running, diagnosed from postgres_logs): ingest_listings rewrote EVERY
-- incoming row's full payload every night — ~64k wide tuples, ~100MB of WAL
-- (crash recovery replayed 92MB of it) — purely to bump last_seen_at and
-- last_seen_run, because those two columns are what the 0013 delisting
-- guards read. On the Nano instance that churn walks the ingest backend
-- into the OOM killer after ~35–45k rows regardless of chunk composition;
-- Postgres dies mid-statement and takes the site down for the ~2-minute
-- crash recovery. recheck_listings has the same shape: it rewrote every
-- confirmed live row nightly to bump last_seen_at/last_confirmed_at.
--
-- Fix: move the sighting bookkeeping to a narrow side table, listing_seen
-- (vin + three timestamps, ~56 bytes vs ~1.6KB), and write the wide
-- listings row only when the listing actually changed. A full-feed sync
-- now writes ~64k narrow tuples (~10MB WAL) plus wide rows only for the
-- ~1-2% that changed. The 372 buyback_disclosed regexes per unchanged row
-- (generated column, 0024) stop re-running too.
--
-- What was REJECTED and why (do not resurrect these):
--   * Lazily bumping last_seen_at on the wide row ("only when stale by
--     >24h") — silently reopens the stale-replay delisting hole 0013
--     closed: a replayed old snapshot could delist a car seen alive today
--     because today's sighting was never recorded. The bookkeeping must be
--     written on EVERY sighting; the fix is making that write narrow, not
--     skipping it.
--   * Smaller sync chunks — measured across the three failed nights, the
--     crash tracks cumulative rows churned per backend (~35–45k), not
--     per-statement size (an 8.0MB/45-domain chunk and a 7.8MB/2-domain
--     chunk died at the same depth).
--
-- "Changed" is decided by payload equality alone: every scalar column
-- (price_usd, year, make, ... dealer_domain) is derived deterministically
-- from the payload jsonb in _incoming, so payload-equal implies row-equal.
-- The payload carries no crawl timestamp (verified against the live feed
-- 2026-08-16: id/vin/year/make/model/trim/drive/priceUsd/mileage/
-- sellerType/city/state/zip/dealerName/colors/imageUrl/stockNumber/
-- description/sourceUrl/dealerDomain/vpicBatteryKwh/images/trimSuspect),
-- so an unchanged car compares equal night over night. jsonb equality is
-- key-order-insensitive by type.
--
-- listings.last_seen_at / last_seen_run / last_confirmed_at are DROPPED,
-- not left to go stale — a column that silently stops updating is exactly
-- the kind of quiet false claim the house rules exist to prevent. The only
-- dependent object (checked in pg_depend on prod) was live_listings_feed,
-- rebuilt below with identical output shape; web/lib/listings/db.ts reads
-- the view, never the table columns.

create table listing_seen (
  vin               text primary key references listings(vin),
  last_seen_at      timestamptz not null,
  last_seen_run     bigint references ingest_runs(id),
  last_confirmed_at timestamptz
) with (fillfactor = 70); -- daily updates of every row: leave HOT headroom

insert into listing_seen (vin, last_seen_at, last_seen_run, last_confirmed_at)
select vin, last_seen_at, last_seen_run, last_confirmed_at from listings;

analyze listing_seen;

-- 0007 posture: anon reads exactly what the public site publishes. The
-- feed publishes last_seen_at for LIVE cars, so the policy mirrors
-- listing_price_history's live-rows-only shape; the delisted graveyard's
-- sighting history stays archive.
alter table listing_seen enable row level security;
create policy "public read live" on listing_seen
  for select to anon, authenticated
  using (exists (
    select 1 from listings l
    where l.vin = listing_seen.vin and l.delisted_at is null
  ));
grant select on listing_seen to anon, authenticated;

-- ingest_listings: same contract and counters as 0016, but the wide upsert
-- only touches new/changed/relisted rows, sightings go to listing_seen,
-- and the delisting guard (b) reads listing_seen. Guard (a) — a row
-- delisted after this batch's observation stays untouched — is preserved
-- unchanged, and such rows get NO sighting bump either (their sighting is
-- stale evidence, same reasoning as 0013).
create or replace function ingest_listings(
  _rows jsonb,
  _source text default 'nightly',
  _complete_domains jsonb default null,
  _observed_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  _run_id bigint;
  _obs timestamptz := coalesce(_observed_at, now());
  _seen integer := 0;
  _added integer := 0;
  _changed integer := 0;
  _delisted integer := 0;
  _relisted integer := 0;
begin
  insert into ingest_runs (source) values (coalesce(_source, 'nightly')) returning id into _run_id;

  drop table if exists _incoming;
  create temp table _incoming on commit drop as
    select distinct on (upper(x->>'vin'))
      upper(x->>'vin')                       as vin,
      round((x->>'priceUsd')::numeric)::int  as price_usd,
      (x->>'year')::smallint                 as year,
      x->>'make'                             as make,
      x->>'model'                            as model,
      x->>'trim'                             as vehicle_trim,
      (x->>'mileage')::int                   as mileage,
      x->>'condition'                        as condition,
      x->>'state'                            as state,
      x->>'zip'                              as zip,
      x->>'dealerDomain'                     as dealer_domain,
      x                                      as payload
    from jsonb_array_elements(coalesce(_rows, '[]'::jsonb)) as x
    where coalesce(x->>'vin', '') <> ''
      and (x->>'priceUsd') ~ '^[0-9]+(\.[0-9]+)?$';

  -- vin is unique here (distinct on above); index + stats let every downstream
  -- join and the delisting anti-join hash instead of nested-loop (0016).
  create index on _incoming (vin);
  analyze _incoming;

  select count(*) into _seen from _incoming;

  drop table if exists _prior;
  create temp table _prior on commit drop as
    select l.vin, l.price_usd, l.mileage,
           (l.delisted_at is not null) as was_delisted,
           -- guard (a): the delisting is newer than this batch's observation
           (l.delisted_at is not null and l.delisted_at > _obs) as blocked,
           -- payload-equal implies row-equal; see header
           (l.payload is distinct from i.payload) as data_changed
    from listings l
    join _incoming i using (vin);

  create index on _prior (vin);
  analyze _prior;

  select count(*) into _relisted from _prior where was_delisted and not blocked;

  insert into listings as l
    (vin, payload, price_usd, year, make, model, vehicle_trim, mileage,
     condition, state, zip, dealer_domain, first_seen_at, created_run)
  select
    i.vin, i.payload, i.price_usd, i.year, i.make, i.model, i.vehicle_trim,
    i.mileage, i.condition, i.state, i.zip, i.dealer_domain, now(), _run_id
  from _incoming i
  left join _prior p using (vin)
  -- the churn cut: unchanged live rows never enter the upsert at all
  where p.vin is null
     or (not p.blocked and (p.data_changed or p.was_delisted))
  on conflict (vin) do update set
    payload       = excluded.payload,
    price_usd     = excluded.price_usd,
    year          = excluded.year,
    make          = excluded.make,
    model         = excluded.model,
    vehicle_trim  = excluded.vehicle_trim,
    mileage       = excluded.mileage,
    condition     = excluded.condition,
    state         = excluded.state,
    zip           = excluded.zip,
    dealer_domain = excluded.dealer_domain,
    delisted_at   = null,
    updated_at    = now()
  -- guard (a): a row delisted after this batch was observed stays delisted
  -- and stays exactly as it was — stale payload is no better than stale
  -- lifecycle state.
  where l.delisted_at is null or l.delisted_at <= _obs;

  -- Every non-blocked sighting is recorded, narrow. This write is what the
  -- delisting guards read; skipping it for "unchanged" rows would reopen
  -- the 0013 stale-replay hole (see header).
  insert into listing_seen as s (vin, last_seen_at, last_seen_run)
  select i.vin, now(), _run_id
  from _incoming i
  left join _prior p using (vin)
  where not coalesce(p.blocked, false)
  on conflict (vin) do update set
    last_seen_at  = excluded.last_seen_at,
    last_seen_run = excluded.last_seen_run;

  _added := _seen - (select count(*) from _prior);

  insert into listing_price_history (vin, run_id, price_usd)
  select i.vin, _run_id, i.price_usd
  from _incoming i
  left join _prior p using (vin)
  where (p.vin is null or p.price_usd is distinct from i.price_usd)
    and not coalesce(p.blocked, false);

  -- Odometer readings land in the log the same way prices do: first
  -- sighting and every change. A null incoming mileage is data absence,
  -- not an observation, and is never logged.
  insert into listing_mileage_history (vin, run_id, mileage)
  select i.vin, _run_id, i.mileage
  from _incoming i
  left join _prior p using (vin)
  where i.mileage is not null
    and (p.vin is null or p.mileage is distinct from i.mileage)
    and not coalesce(p.blocked, false);

  insert into listing_events (vin, run_id, event)
  select i.vin, _run_id, 'listed'
  from _incoming i
  left join _prior p using (vin)
  where p.vin is null;

  insert into listing_events (vin, run_id, event)
  select i.vin, _run_id, 'relisted'
  from _incoming i
  join _prior p using (vin)
  where p.was_delisted and not p.blocked;

  select count(*) into _changed
  from _incoming i
  join _prior p using (vin)
  where p.price_usd is distinct from i.price_usd and not p.blocked;

  with gone as (
    update listings l
    set delisted_at = now(), updated_at = now()
    where l.delisted_at is null
      -- (1) crawler certified full coverage of this domain this run
      and l.dealer_domain in (
        select jsonb_array_elements_text(coalesce(_complete_domains, '[]'::jsonb))
      )
      -- (2) and the domain actually produced rows (failed fetches prove nothing)
      and l.dealer_domain in (
        select distinct dealer_domain from _incoming where dealer_domain is not null
      )
      and not exists (select 1 from _incoming i where i.vin = l.vin)
      -- (3) guard (b): no evidence of life newer than this batch's
      -- observation. listing_seen is that evidence now — both the nightly's
      -- sightings and recheck's page-level confirmations land there. A
      -- listing with no seen row at all has no evidence in its favor.
      and not exists (
        select 1 from listing_seen s
        where s.vin = l.vin
          and (s.last_seen_at > _obs or s.last_confirmed_at > _obs)
      )
    returning l.vin
  )
  insert into listing_events (vin, run_id, event)
  select vin, _run_id, 'delisted' from gone;
  get diagnostics _delisted = row_count;

  update ingest_runs
  set finished_at = now(),
      listings_seen = _seen,
      listings_new = _added,
      listings_price_changed = _changed,
      listings_delisted = _delisted,
      listings_relisted = _relisted
  where id = _run_id;

  return jsonb_build_object(
    'run_id', _run_id, 'seen', _seen, 'new', _added,
    'price_changed', _changed, 'delisted', _delisted, 'relisted', _relisted);
end;
$$;

revoke execute on function ingest_listings(jsonb, text, jsonb, timestamptz) from public, anon, authenticated;

-- recheck_listings: same contract and counters as 0006, but confirmations
-- land in listing_seen and the wide row is written only when something on
-- it must change. recheck_misses = 0 stays in the "must change" set — a
-- soft-struck row that comes back alive MUST reset its strike counter, or
-- the next miss would delist it on what should be strike one.
create or replace function recheck_listings(
  _alive jsonb default '[]'::jsonb,     -- [{vin, priceUsd, mileage}]
  _hard_gone jsonb default '[]'::jsonb, -- ["VIN", ...] page 404/410
  _soft_gone jsonb default '[]'::jsonb  -- ["VIN", ...] page loaded, VIN absent
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  _run_id bigint;
  _confirmed integer := 0;
  _changed integer := 0;
  _delisted integer := 0;
  _struck integer := 0;
begin
  insert into ingest_runs (source) values ('recheck') returning id into _run_id;

  drop table if exists _alive_rows;
  create temp table _alive_rows on commit drop as
    select upper(x->>'vin') as vin,
           nullif(x->>'priceUsd','')::numeric::int as price_usd,
           nullif(x->>'mileage','')::numeric::int as mileage
    from jsonb_array_elements(coalesce(_alive,'[]'::jsonb)) x
    where coalesce(x->>'vin','') <> '';

  -- Price movement observed on the car's own page is the strongest signal
  -- we get; log it before overwriting.
  insert into listing_price_history (vin, run_id, price_usd)
  select a.vin, _run_id, a.price_usd
  from _alive_rows a join listings l using (vin)
  where a.price_usd is not null and a.price_usd is distinct from l.price_usd;
  get diagnostics _changed = row_count;

  insert into listing_mileage_history (vin, run_id, mileage)
  select a.vin, _run_id, a.mileage
  from _alive_rows a join listings l using (vin)
  where a.mileage is not null and a.mileage is distinct from l.mileage;

  -- A confirmed VIN that was marked delisted is back: record the relist
  -- before the update below clears delisted_at.
  insert into listing_events (vin, run_id, event)
  select a.vin, _run_id, 'relisted'
  from _alive_rows a join listings l using (vin)
  where l.delisted_at is not null;

  -- _confirmed keeps its 0006 meaning — every alive VIN we matched — even
  -- though the wide update below now touches only the rows that changed.
  select count(*) into _confirmed
  from _alive_rows a join listings l using (vin);

  update listings l set
    price_usd         = coalesce(a.price_usd, l.price_usd),
    payload           = case when a.price_usd is not null
                             then jsonb_set(l.payload, '{priceUsd}', to_jsonb(a.price_usd))
                             else l.payload end,
    mileage           = coalesce(a.mileage, l.mileage),
    delisted_at       = null,
    recheck_misses    = 0,
    updated_at        = now()
  from _alive_rows a
  where a.vin = l.vin
    and (   (a.price_usd is not null and a.price_usd is distinct from l.price_usd)
         or (a.mileage  is not null and a.mileage  is distinct from l.mileage)
         or l.delisted_at is not null
         or l.recheck_misses <> 0);

  -- The page itself said the car is for sale: strongest evidence there is.
  insert into listing_seen as s (vin, last_seen_at, last_seen_run, last_confirmed_at)
  select a.vin, now(), _run_id, now()
  from _alive_rows a join listings l using (vin)
  on conflict (vin) do update set
    last_seen_at      = excluded.last_seen_at,
    last_seen_run     = excluded.last_seen_run,
    last_confirmed_at = excluded.last_confirmed_at;

  with gone as (
    update listings l set delisted_at = now(), updated_at = now(), recheck_misses = 0
    where l.delisted_at is null
      and l.vin in (select upper(value) from jsonb_array_elements_text(coalesce(_hard_gone,'[]'::jsonb)))
    returning l.vin
  )
  insert into listing_events (vin, run_id, event)
  select vin, _run_id, 'delisted' from gone;
  get diagnostics _delisted = row_count;

  -- Struck rows are counted before the update; only the subset the update
  -- actually delists (second strike) produces an event. returning sees the
  -- post-update row, so a non-null delisted_at means it was set just now.
  select count(*) into _struck
  from listings l
  where l.delisted_at is null
    and l.vin in (select upper(value) from jsonb_array_elements_text(coalesce(_soft_gone,'[]'::jsonb)));

  with struck as (
    update listings l set
      recheck_misses = l.recheck_misses + 1,
      delisted_at    = case when l.recheck_misses + 1 >= 2 then now() else l.delisted_at end,
      updated_at     = now()
    where l.delisted_at is null
      and l.vin in (select upper(value) from jsonb_array_elements_text(coalesce(_soft_gone,'[]'::jsonb)))
    returning l.vin, l.delisted_at
  )
  insert into listing_events (vin, run_id, event)
  select vin, _run_id, 'delisted' from struck where delisted_at is not null;

  update ingest_runs
  set finished_at = now(),
      listings_seen = _confirmed,
      listings_price_changed = _changed,
      listings_delisted = _delisted
  where id = _run_id;

  return jsonb_build_object(
    'run_id', _run_id, 'confirmed', _confirmed, 'price_changed', _changed,
    'delisted', _delisted, 'struck', _struck);
end;
$$;

revoke execute on function recheck_listings(jsonb, jsonb, jsonb) from public, anon, authenticated;

-- Same output shape as 0024 (create or replace requires it; the web reads
-- the view by column name). last_seen_at now comes from listing_seen. LEFT
-- join on purpose: a live car with a missing seen row (bookkeeping bug)
-- shows with a null timestamp rather than vanishing from the site — the
-- web renders nothing from this field today, and hiding inventory over
-- plumbing would be the worse failure.
create or replace view live_listings_feed
with (security_invoker = true) as
select l.vin,
       l.first_seen_at,
       s.last_seen_at,
       l.payload - 'description' as payload,
       h.prev_price_usd,
       h.price_changed_at,
       l.buyback_disclosed
from listings l
left join listing_seen s using (vin)
left join lateral (
  select (array_agg(price_usd order by observed_at desc))[2] as prev_price_usd,
         max(observed_at) as price_changed_at
  from (
    select price_usd, observed_at
    from listing_price_history p
    where p.vin = l.vin
    order by observed_at desc
    limit 2
  ) last2
) h on true
where l.delisted_at is null;

-- Dropped, not orphaned: a bookkeeping column that silently stops updating
-- would be a quiet false claim to any future reader. Anything still
-- selecting these breaks loudly instead. (0006's one-time backfill read
-- them, but it replays before this file by number.)
alter table listings
  drop column last_seen_at,
  drop column last_seen_run,
  drop column last_confirmed_at;
