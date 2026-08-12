-- Direct per-listing confirmation.
--
-- 0002 made delisting conservative: a car only disappears when a crawl saw
-- its whole domain. That killed false delistings but left the opposite
-- problem — cars we haven't disproven linger indefinitely, so shoppers can
-- see vehicles that sold weeks ago.
--
-- The fix is to stop inferring. Every listing stores its own sourceUrl, so
-- the crawler can visit each car's page daily and ask directly: is this VIN
-- still on the dealer's own page? That is a per-car fact, not an inference
-- from crawl coverage.
--
-- Confidence is graded, because "the page didn't mention the VIN" is weaker
-- evidence than "the page is gone":
--   hard gone  (404/410)                    -> delist immediately
--   soft gone  (200 but VIN absent)         -> strike; delist on the 2nd
--   alive      (200 and VIN present)        -> confirm, clear strikes
--   error/403/timeout                       -> no conclusion, untouched
-- A fetch failure is never evidence about the world.

alter table listings add column if not exists recheck_misses smallint not null default 0;
alter table listings add column if not exists last_confirmed_at timestamptz;

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

  update listings l set delisted_at = now(), updated_at = now(), recheck_misses = 0
  where l.delisted_at is null
    and l.vin in (select upper(value) from jsonb_array_elements_text(coalesce(_hard_gone,'[]'::jsonb)));
  get diagnostics _delisted = row_count;

  update listings l set
    recheck_misses = l.recheck_misses + 1,
    delisted_at    = case when l.recheck_misses + 1 >= 2 then now() else l.delisted_at end,
    updated_at     = now()
  where l.delisted_at is null
    and l.vin in (select upper(value) from jsonb_array_elements_text(coalesce(_soft_gone,'[]'::jsonb)));
  get diagnostics _struck = row_count;

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
