-- Delisting requires evidence of complete coverage.
--
-- 0001 delisted a VIN whenever its dealer domain produced ANY rows in a run
-- but that VIN wasn't among them. That is sound only when the crawl saw the
-- domain's whole inventory. On large group sites we stop at a per-site page
-- budget and see a different subset each night, so the old rule marked live
-- cars as sold and un-marked them the next night — noise in exactly the
-- signal (days-on-lot, price drops) that is supposed to be a differentiator.
--
-- New rule: a VIN is delisted only when BOTH hold for its dealer domain:
--   1. the crawler certifies it exhausted that domain's queue this run
--      (_complete_domains — crawl.mjs sets report.truncated=false), and
--   2. the domain still produced at least one row this run (a domain whose
--      fetches all failed proves nothing about the world).
-- Absent a _complete_domains list, nothing is delisted. Silence is not
-- evidence of a sale.
--
-- Self-healing: a VIN wrongly delisted by the old rule clears its
-- delisted_at automatically the next time it is seen (the upsert below
-- already resets it), so no backfill is needed.

drop function if exists ingest_listings(jsonb, text);

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
    select l.vin, l.price_usd
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

  select count(*) into _changed
  from _incoming i
  join _prior p using (vin)
  where p.price_usd is distinct from i.price_usd;

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
    and not exists (select 1 from _incoming i where i.vin = l.vin);
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
