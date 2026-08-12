-- Washington transaction-price comparables.
--
-- WA's Department of Licensing publishes per-transaction EV title records
-- including the price actually paid and the odometer at sale
-- (data.wa.gov dataset rpr4-cgyd). It appears to be the only such public
-- dataset in the US: every other state either collects the price and
-- doesn't publish it, or publishes registrations without price. It exists
-- because HB 2042's sales-tax exemption is capped on sale price, so DOL
-- has to record what was paid.
--
-- This is ASKING price's counterpart: our listings table holds what dealers
-- want; this holds what people paid.
--
-- LICENSING: the source is ODbL, which is share-alike on derived
-- DATABASES but only attribution on "Produced Works" (a page or statistic
-- generated from the data). That is why this lives in its own table and is
-- never joined into `listings` — the site renders statistics computed from
-- it, with attribution, and ships no derived database.

create table if not exists wa_ev_sales (
  id bigint generated always as identity primary key,
  vin_prefix text,               -- VIN chars 1-10: identifies trim, not the car
  make text not null,            -- normalized to our canonical spelling
  model text not null,           -- normalized (Niro -> Niro EV, etc.)
  model_raw text,                -- exactly as WA published it
  model_year smallint,
  ev_type text,                  -- BEV / PHEV
  sale_price integer not null,
  odometer integer,
  sale_date date not null,
  county text,
  city text,
  zip text,
  transaction_type text
);

create index if not exists wa_ev_sales_lookup_idx on wa_ev_sales (make, model, model_year);
create index if not exists wa_ev_sales_date_idx on wa_ev_sales (sale_date);

alter table wa_ev_sales enable row level security;
create policy "public read" on wa_ev_sales for select to anon, authenticated using (true);

-- Monthly refresh: the loader sends the whole current window and replaces.
create or replace function ingest_wa_sales(_rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  _n integer;
begin
  if _rows is null or jsonb_array_length(_rows) = 0 then
    return jsonb_build_object('error', 'no rows');
  end if;

  delete from wa_ev_sales where true;  -- Supabase requires an explicit WHERE

  insert into wa_ev_sales
    (vin_prefix, make, model, model_raw, model_year, ev_type,
     sale_price, odometer, sale_date, county, city, zip, transaction_type)
  select
    x->>'vinPrefix', x->>'make', x->>'model', x->>'modelRaw',
    (x->>'modelYear')::smallint, x->>'evType',
    (x->>'salePrice')::int, nullif(x->>'odometer','')::int,
    (x->>'saleDate')::date, x->>'county', x->>'city', x->>'zip', x->>'transactionType'
  from jsonb_array_elements(_rows) as x
  where (x->>'salePrice') ~ '^[0-9]+$' and coalesce(x->>'make','') <> '';

  get diagnostics _n = row_count;
  return jsonb_build_object('inserted', _n);
end;
$$;

revoke execute on function ingest_wa_sales(jsonb) from public, anon, authenticated;

-- What did people actually pay for this car? Widens the comparison only as
-- far as it must to reach a usable sample, and reports which basis it used
-- so the page can say so plainly rather than implying false precision.
create or replace function wa_price_comps(
  _make text,
  _model text,
  _year int,
  _mileage int default null,
  _months int default 24
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  _since date := (now() - make_interval(months => _months))::date;
  _r jsonb;
begin
  -- Tier 1: same model year AND comparable mileage (within 25%).
  if _mileage is not null and _mileage > 0 then
    select stats into _r from (
      select jsonb_build_object(
        'n', count(*),
        'median', percentile_cont(0.5) within group (order by sale_price)::int,
        'p25', percentile_cont(0.25) within group (order by sale_price)::int,
        'p75', percentile_cont(0.75) within group (order by sale_price)::int,
        'medianOdometer', percentile_cont(0.5) within group (order by odometer)::int,
        'basis', 'year_and_mileage', 'yearLow', _year, 'yearHigh', _year, 'months', _months
      ) as stats, count(*) as c
      from wa_ev_sales
      where lower(make) = lower(_make) and lower(model) = lower(_model)
        and model_year = _year and sale_date >= _since
        and odometer between (_mileage * 0.75) and (_mileage * 1.25)
    ) t where c >= 5;
    if _r is not null then return _r; end if;
  end if;

  -- Tier 2: same model year, any mileage.
  select stats into _r from (
    select jsonb_build_object(
      'n', count(*),
      'median', percentile_cont(0.5) within group (order by sale_price)::int,
      'p25', percentile_cont(0.25) within group (order by sale_price)::int,
      'p75', percentile_cont(0.75) within group (order by sale_price)::int,
      'medianOdometer', percentile_cont(0.5) within group (order by odometer)::int,
      'basis', 'year', 'yearLow', _year, 'yearHigh', _year, 'months', _months
    ) as stats, count(*) as c
    from wa_ev_sales
    where lower(make) = lower(_make) and lower(model) = lower(_model)
      and model_year = _year and sale_date >= _since
  ) t where c >= 5;
  if _r is not null then return _r; end if;

  -- Tier 3: model year within one, any mileage.
  select stats into _r from (
    select jsonb_build_object(
      'n', count(*),
      'median', percentile_cont(0.5) within group (order by sale_price)::int,
      'p25', percentile_cont(0.25) within group (order by sale_price)::int,
      'p75', percentile_cont(0.75) within group (order by sale_price)::int,
      'medianOdometer', percentile_cont(0.5) within group (order by odometer)::int,
      'basis', 'year_range', 'yearLow', _year - 1, 'yearHigh', _year + 1, 'months', _months
    ) as stats, count(*) as c
    from wa_ev_sales
    where lower(make) = lower(_make) and lower(model) = lower(_model)
      and model_year between _year - 1 and _year + 1 and sale_date >= _since
  ) t where c >= 5;

  -- Too few comparable sales is a real answer; the page says nothing rather
  -- than showing a median built on two cars.
  return _r;
end;
$$;

grant execute on function wa_price_comps(text, text, int, int, int) to anon, authenticated;
