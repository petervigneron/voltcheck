-- listing_price_history records price CLAIMS; an abstain is not one.
--
-- price_usd = 0 is the pipeline's deliberate "we cannot name this car's
-- price" sentinel (resolveDdcPrice's PRICE_ABSTAIN, price-audit's
-- suppression, and — new 2026-08-19 — the plausibility guard in
-- scraper/lib/price-floor.mjs that catches finance payments served in the
-- price slot: dealer.com JSON-LD intermittently emitted $1,493/$1,150/$1,280
-- on used 2023-24 EVs, and transient $1,996 dips reached this very table as
-- false "price cuts" that later recovered). The zero keeps the row alive
-- through ingest (price_usd is NOT NULL) while hasRealPrice hides the number
-- on every surface — but logging the zero here writes a fictional price step:
-- the car's ask did not move, our ability to read it did.
--
-- So both writers now skip zero prices in the history insert. The flanks:
--   * listings.price_usd still takes the 0 (the live row's honest state);
--     only the history log is guarded.
--   * When the price recovers (0 -> real), `p.price_usd is distinct from
--     i.price_usd` fires and the real price is logged again. If it recovered
--     to the SAME value as before the abstain, history gets a duplicate of
--     that value — harmless: the feed's prev-price lookup (0032) takes the
--     last two rows, so a duplicate yields prev = current, which priceCut
--     renders as no change.
--   * recheck's _changed counter keeps meaning "real price movements logged",
--     which is what ingest_runs.listings_price_changed always reported.
--
-- Bodies are otherwise verbatim from 0025 (the current versions of both
-- functions — nothing after 0025 redefines them).

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
           -- payload-equal implies row-equal; see 0025 header
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
  -- the 0013 stale-replay hole (see 0025 header).
  insert into listing_seen as s (vin, last_seen_at, last_seen_run)
  select i.vin, now(), _run_id
  from _incoming i
  left join _prior p using (vin)
  where not coalesce(p.blocked, false)
  on conflict (vin) do update set
    last_seen_at  = excluded.last_seen_at,
    last_seen_run = excluded.last_seen_run;

  _added := _seen - (select count(*) from _prior);

  -- i.price_usd <> 0 is this migration's change: an abstain is not a price
  -- observation, so it never becomes a history step (see file header).
  insert into listing_price_history (vin, run_id, price_usd)
  select i.vin, _run_id, i.price_usd
  from _incoming i
  left join _prior p using (vin)
  where (p.vin is null or p.price_usd is distinct from i.price_usd)
    and i.price_usd <> 0
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
  -- we get; log it before overwriting. a.price_usd <> 0 is this migration's
  -- change: an abstain is not a price observation (see file header) —
  -- recheck.mjs sends null for a reading it can't trust, but the function
  -- guards its own gate rather than relying on the caller.
  insert into listing_price_history (vin, run_id, price_usd)
  select a.vin, _run_id, a.price_usd
  from _alive_rows a join listings l using (vin)
  where a.price_usd is not null and a.price_usd <> 0
    and a.price_usd is distinct from l.price_usd;
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
