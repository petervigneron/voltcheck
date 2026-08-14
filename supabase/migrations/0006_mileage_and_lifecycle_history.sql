-- Mileage observations and lifecycle events.
--
-- The archive keeps full history for exactly one attribute: price. Every
-- other observation is overwritten in place by the nightly upsert, which
-- destroys two signals with long-term value:
--
--   1. Mileage over time. A VIN whose observed odometer DECREASES between
--      listings is a rollback red flag; miles-per-month while listed (and
--      across relists) is a usage-rate signal. The recheck already fetches
--      mileage daily and throws the history away.
--   2. Listing lifecycle. Relisting sets delisted_at back to null, erasing
--      the prior delist. "Sold after 60 days, reappeared at another dealer
--      three weeks later" is exactly the market-velocity data the archive
--      exists to accumulate, and today it cannot be reconstructed.
--
-- Two append-only tables, fed by both write paths (nightly ingest and the
-- daily recheck). Like listing_price_history, rows are observations, never
-- edited. Both tables get the same public-read policy as the rest of the
-- schema for now; if read access to the archive is ever tiered, these
-- tables and listing_price_history are the ones to revisit together.
--
-- Backfill is limited to what the current tables still know: one 'listed'
-- event per VIN at first_seen_at, a 'delisted' event where delisted_at
-- survives, and the current odometer stamped at last_seen_at (the last
-- moment it was certainly true). Relist cycles and mileage changes from
-- before this migration are gone; nothing pretends otherwise.

create table if not exists listing_mileage_history (
  id bigint generated always as identity primary key,
  vin text not null references listings(vin),
  run_id bigint references ingest_runs(id),
  mileage integer not null,
  observed_at timestamptz not null default now()
);

create table if not exists listing_events (
  id bigint generated always as identity primary key,
  vin text not null references listings(vin),
  run_id bigint references ingest_runs(id),
  event text not null check (event in ('listed', 'delisted', 'relisted')),
  observed_at timestamptz not null default now()
);

create index if not exists mileage_history_vin_idx on listing_mileage_history (vin, observed_at);
create index if not exists listing_events_vin_idx on listing_events (vin, observed_at);
create index if not exists listing_events_event_idx on listing_events (event, observed_at);

alter table listing_mileage_history enable row level security;
alter table listing_events enable row level security;
create policy "public read" on listing_mileage_history for select to anon, authenticated using (true);
create policy "public read" on listing_events for select to anon, authenticated using (true);

-- Backfill (idempotent: each insert skips VINs it has already covered).

insert into listing_events (vin, run_id, event, observed_at)
select l.vin, l.created_run, 'listed', l.first_seen_at
from listings l
where not exists (
  select 1 from listing_events e where e.vin = l.vin and e.event = 'listed'
);

insert into listing_events (vin, run_id, event, observed_at)
select l.vin, null, 'delisted', l.delisted_at
from listings l
where l.delisted_at is not null
  and not exists (
    select 1 from listing_events e where e.vin = l.vin and e.event = 'delisted'
  );

insert into listing_mileage_history (vin, run_id, mileage, observed_at)
select l.vin, l.last_seen_run, l.mileage, l.last_seen_at
from listings l
where l.mileage is not null
  and not exists (select 1 from listing_mileage_history m where m.vin = l.vin);

-- ingest_listings: same signature and same counters as 0002; adds mileage
-- logging (first sighting and every change) and lifecycle events. Prior
-- state is captured in _prior before the upsert clears it.

create or replace function ingest_listings(
  _rows jsonb,
  _source text default 'nightly',
  _complete_domains jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  _run_id bigint;
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

  select count(*) into _seen from _incoming;

  select count(*) into _relisted
  from listings l
  join _incoming i using (vin)
  where l.delisted_at is not null;

  drop table if exists _prior;
  create temp table _prior on commit drop as
    select l.vin, l.price_usd, l.mileage,
           (l.delisted_at is not null) as was_delisted
    from listings l
    join _incoming i using (vin);

  insert into listings as l
    (vin, payload, price_usd, year, make, model, vehicle_trim, mileage,
     condition, state, zip, dealer_domain,
     first_seen_at, last_seen_at, created_run, last_seen_run)
  select
    vin, payload, price_usd, year, make, model, vehicle_trim, mileage,
    condition, state, zip, dealer_domain,
    now(), now(), _run_id, _run_id
  from _incoming
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
    last_seen_at  = now(),
    last_seen_run = _run_id,
    delisted_at   = null,
    updated_at    = now();

  _added := _seen - (select count(*) from _prior);

  insert into listing_price_history (vin, run_id, price_usd)
  select i.vin, _run_id, i.price_usd
  from _incoming i
  left join _prior p using (vin)
  where p.vin is null or p.price_usd is distinct from i.price_usd;

  -- Odometer readings land in the log the same way prices do: first
  -- sighting and every change. A null incoming mileage is data absence,
  -- not an observation, and is never logged.
  insert into listing_mileage_history (vin, run_id, mileage)
  select i.vin, _run_id, i.mileage
  from _incoming i
  left join _prior p using (vin)
  where i.mileage is not null
    and (p.vin is null or p.mileage is distinct from i.mileage);

  insert into listing_events (vin, run_id, event)
  select i.vin, _run_id, 'listed'
  from _incoming i
  left join _prior p using (vin)
  where p.vin is null;

  insert into listing_events (vin, run_id, event)
  select i.vin, _run_id, 'relisted'
  from _incoming i
  join _prior p using (vin)
  where p.was_delisted;

  select count(*) into _changed
  from _incoming i
  join _prior p using (vin)
  where p.price_usd is distinct from i.price_usd;

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

revoke execute on function ingest_listings(jsonb, text, jsonb) from public, anon, authenticated;

-- recheck_listings: same signature, counters, and evidence grading as 0004;
-- adds mileage logging and lifecycle events. Observations are logged before
-- the updates that overwrite the columns they compare against.

create or replace function recheck_listings(
  _alive jsonb default '[]'::jsonb,   -- [{vin, priceUsd, mileage}]
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

  update listings l set
    price_usd         = coalesce(a.price_usd, l.price_usd),
    payload           = case when a.price_usd is not null
                             then jsonb_set(l.payload, '{priceUsd}', to_jsonb(a.price_usd))
                             else l.payload end,
    mileage           = coalesce(a.mileage, l.mileage),
    last_seen_at      = now(),
    last_confirmed_at = now(),
    delisted_at       = null,
    recheck_misses    = 0,
    updated_at        = now()
  from _alive_rows a where a.vin = l.vin;
  get diagnostics _confirmed = row_count;

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
