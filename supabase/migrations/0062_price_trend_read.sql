-- The trend surface's read path, and a model-level pool for asks.
--
-- 0061 shipped ev_price_trend_asks at the vin8 level only, reasoning that a
-- weekly ask cohort is rarely thin. True, but the /worth page — the first
-- home of the two charts (owner, 2026-09-03) — is picker-first: most
-- visitors give year/make/model and no VIN, so there is no vin8 to look up.
-- The asks view is recreated here with the same two levels the sales view
-- has, keyed the same way (lower(make) || ' ' || folded model), at the cost
-- of doubling its snapshot rows (11s → ~20s at four weeks of archive; the
-- freeze-closed-weeks remedy in 0057's header applies to both).
--
-- price_trend() is the ONE reader. Security definer so the views can stay
-- dark: it hands back two small series and nothing a caller could walk.
-- It chooses the level for the caller — the VIN-cohort series when a VIN
-- was given and that cohort has at least one quarter (sales) or week (asks)
-- clearing the floor, else the model pool — and it applies the floors,
-- n ≥ 8 per sales quarter (0014's fitting bar: fewer is a handful of deals)
-- and n ≥ 4 per ask week (comps.ts MIN_PEERS). Points below the floor are
-- not returned at all, so no surface can draw one by accident. Every point
-- still carries its n and the period's median odometer, and the series
-- carries the standard odometer it was moved to, because those are the
-- words the chart must print beside the line (0057/0061 rule).

drop materialized view if exists ev_price_trend_asks;

create materialized view ev_price_trend_asks as
with s as (
  select vin, price_usd, observed_at,
         lead(observed_at) over (partition by vin order by observed_at) as next_at
  from listing_price_display
),
weeks as (
  select w::date as week, least(w + interval '7 days', now()) as snap_at
  from generate_series(date_trunc('week', timestamptz '2026-08-10 00:00+00'),
                       date_trunc('week', now()), interval '7 days') w
),
snaps as (
  select upper(substring(l.vin, 1, 8))                              as vin8,
         lower(l.make) || ' ' || regexp_replace(lower(l.model), '[^a-z0-9+]', '', 'g') as model_key,
         l.year                                                      as model_year,
         case when l.condition = 'new' then 'new' else 'used' end    as cond,
         wk.week                                                     as period,
         s.price_usd::numeric                                        as price,
         nullif(l.mileage, 0)::numeric                               as odo
  from s
  join listings l using (vin)
  join weeks wk
    on s.observed_at <= wk.snap_at
   and (s.next_at is null or s.next_at > wk.snap_at)
  where l.year is not null
    and l.first_seen_at <= wk.snap_at
    and (l.delisted_at is null or l.delisted_at > wk.snap_at)
),
keyed as (
  select 'vin8'::text as level, vin8 as cohort, vin8, model_year, cond, period, price, odo from snaps
  union all
  select 'model', model_key, vin8, model_year, cond, period, price, odo from snaps
),
slope as (
  select substring(vin_prefix, 1, 8) as vin8, model_year,
         count(*) as n_fit, regr_slope(sale_price::numeric, odometer::numeric) as s
  from wa_ev_sales
  where transaction_type = 'Original Title'
    and odometer between 2000 and 200000
    and sale_price between 5000 and 130000
    and sale_date >= date '2019-01-01'
  group by 1, 2
),
std as (
  select level, cohort, model_year, cond,
         percentile_cont(0.5) within group (order by odo) filter (where odo is not null) as std_odo
  from keyed
  group by 1, 2, 3, 4
),
adj as (
  select k.level, k.cohort, k.model_year, k.cond, k.period, k.odo, st.std_odo,
         (sl.n_fit >= 8 and sl.s < 0)                                                 as slope_from_sales,
         case when sl.n_fit >= 8 and sl.s < 0 then sl.s else -0.09 end               as slope,
         case when k.cond = 'used'
              then k.price + (case when sl.n_fit >= 8 and sl.s < 0 then sl.s else -0.09 end) * (st.std_odo - k.odo)
              else k.price end                                                         as adj_price
  from keyed k
  join std st using (level, cohort, model_year, cond)
  -- The slope is the car's own vin8 fit even inside the model pool: a pool
  -- is a mixture of versions, and each car is levelled along its own line.
  left join slope sl on sl.vin8 = k.vin8 and sl.model_year = k.model_year
  where k.cond = 'new' or (k.odo is not null and st.std_odo is not null)
)
select level, cohort, model_year, cond, period,
       count(*)::int                                                          as n,
       round(percentile_cont(0.5)  within group (order by adj_price))::int    as price_usd,
       round(percentile_cont(0.25) within group (order by adj_price))::int    as p25_usd,
       round(percentile_cont(0.75) within group (order by adj_price))::int    as p75_usd,
       round(avg(std_odo))::int                                               as std_odometer,
       round(percentile_cont(0.5)  within group (order by odo))::int          as median_odometer,
       round(avg(slope)::numeric, 4)                                          as usd_per_mile,
       coalesce(bool_and(slope_from_sales), false)                            as slope_from_sales
from adj
group by 1, 2, 3, 4, 5;

create unique index ev_price_trend_asks_key
  on ev_price_trend_asks (level, cohort, model_year, cond, period);

comment on materialized view ev_price_trend_asks is
  'Weekly ASKING price of a standard car per cohort (level=vin8: VIN 1-8 + model year; level=model: make + folded model + year), new/used, since 2026-08-11: each live listing at the week''s close (through listing_price_display) moved to the cohort''s fixed standard odometer along its own sales-fitted mileage slope, then the week median. Asking prices, never sales. Never quote a point without n. The current week floats until it closes. Dark: read through price_trend().';

revoke all on ev_price_trend_asks from public, anon, authenticated;

create or replace function price_trend(_make text, _model text, _model_year int, _vin8 text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
stable
as $$
declare
  _mkey    text := lower(coalesce(_make, '')) || ' ' || regexp_replace(lower(coalesce(_model, '')), '[^a-z0-9+]', '', 'g');
  _v8      text := upper(nullif(btrim(coalesce(_vin8, '')), ''));
  _slevel  text; _scohort text;
  _alevel  text; _acohort text;
  _sales   jsonb; _asks jsonb;
begin
  if _model_year is null then
    return jsonb_build_object('sales', null, 'asks', null);
  end if;

  if _v8 is not null and exists (
       select 1 from ev_price_trend_sales
       where level = 'vin8' and cohort = _v8 and model_year = _model_year and n >= 8) then
    _slevel := 'vin8'; _scohort := _v8;
  else
    _slevel := 'model'; _scohort := _mkey;
  end if;
  select jsonb_build_object(
           'level', _slevel,
           'stdOdometer', max(std_odometer),
           'slopeFromSales', bool_and(slope_from_sales),
           'points', jsonb_agg(jsonb_build_object(
              'period', period, 'n', n, 'price', price_usd, 'p25', p25_usd, 'p75', p75_usd,
              'odometer', median_odometer) order by period))
    into _sales
  from ev_price_trend_sales
  where level = _slevel and cohort = _scohort and model_year = _model_year and n >= 8;

  if _v8 is not null and exists (
       select 1 from ev_price_trend_asks
       where level = 'vin8' and cohort = _v8 and model_year = _model_year and cond = 'used' and n >= 4) then
    _alevel := 'vin8'; _acohort := _v8;
  else
    _alevel := 'model'; _acohort := _mkey;
  end if;
  select jsonb_build_object(
           'level', _alevel,
           'stdOdometer', max(std_odometer),
           'slopeFromSales', bool_and(slope_from_sales),
           'points', jsonb_agg(jsonb_build_object(
              'period', period, 'n', n, 'price', price_usd, 'p25', p25_usd, 'p75', p75_usd,
              'odometer', median_odometer) order by period))
    into _asks
  from ev_price_trend_asks
  where level = _alevel and cohort = _acohort and model_year = _model_year and cond = 'used' and n >= 4;

  return jsonb_build_object(
    'sales', case when _sales ->> 'points' is null then null else _sales end,
    'asks',  case when _asks  ->> 'points' is null then null else _asks  end);
end;
$$;

revoke all on function price_trend(text, text, int, text) from public;
grant execute on function price_trend(text, text, int, text) to anon, authenticated;

comment on function price_trend(text, text, int, text) is
  'The trend surface''s one read: {sales, asks} series for a car — WA sale price of a standard car by quarter (n ≥ 8), asking price of a standard car by week (n ≥ 4, used) — at the VIN cohort when a VIN was given and it clears the floor, else the model pool. Each point carries n and median odometer; each series its standard odometer. Attribute WA DOL / ODbL wherever sales render.';
