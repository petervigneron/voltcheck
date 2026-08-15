-- Stale evidence must not overwrite fresher truth. The resurrection bug
-- (2026-08-14, 124 sold cars relisted): db-sync pushes the repo's
-- scraped-listings.json snapshot, recheck delists AFTER that snapshot is
-- written, so any out-of-cycle db-sync replayed rows observed BEFORE the
-- delisting and ingest_listings — which stamps freshness with now(), the
-- moment of the call — cleared delisted_at unconditionally.
--
-- ingest_listings now takes _observed_at: when the crawler actually saw
-- these rows (db-sync derives it from the crawl report's crawledAt stamps).
-- Two symmetric guards follow:
--   (a) no stale relist — a row delisted after _observed_at is left
--       entirely untouched by the batch: presence in an old crawl is not
--       evidence the car came back;
--   (b) no stale delist — a row last seen alive (last_seen_at, or
--       recheck's last_confirmed_at) after _observed_at is never delisted
--       by the batch: absence from an old crawl is not evidence of a sale.
-- A null _observed_at means "observed now" — legacy calls behave exactly
-- as before. Same drop-then-recreate arity change as 0002.

drop function if exists ingest_listings(jsonb, text, jsonb);

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

  select count(*) into _seen from _incoming;

  drop table if exists _prior;
  create temp table _prior on commit drop as
    select l.vin, l.price_usd, l.mileage,
           (l.delisted_at is not null) as was_delisted,
           -- guard (a): the delisting is newer than this batch's observation
           (l.delisted_at is not null and l.delisted_at > _obs) as blocked
    from listings l
    join _incoming i using (vin);

  select count(*) into _relisted from _prior where was_delisted and not blocked;

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
    updated_at    = now()
  -- guard (a): a row delisted after this batch was observed stays delisted
  -- and stays exactly as it was — stale payload is no better than stale
  -- lifecycle state.
  where l.delisted_at is null or l.delisted_at <= _obs;

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
      -- (3) guard (b): no evidence of life newer than this batch's observation
      and l.last_seen_at <= _obs
      and (l.last_confirmed_at is null or l.last_confirmed_at <= _obs)
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
