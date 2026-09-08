-- The site-wide asking-price line: one row per day, the whole site's used
-- inventory as an index, kept beside the per-cohort daily table (0064) so a
-- car's own trend can be drawn against "all cars on the site".
--
-- ── Why (owner, 2026-09-07) ─────────────────────────────────────────────────
--
-- "Our market trends feature is still confusing. We shouldn't say how many
-- cars were listed that week, and we need to tell people what they're
-- seeing, which is a mileage adjusted trend. We should also show people how
-- much the car they're looking at costs in comparison to the trend, as well
-- as the trend for all cars on the site."
--
-- The first three are the page's job (components/PriceTrend.tsx). The fourth
-- needs a series this database did not hold: a level for every used EV and
-- PHEV on the site, day by day, that does not move when the mix of cars
-- does. 0064 rejected a chained cross-cohort index AS THE SURFACE (the
-- surface is per car) and it stays that way; here the index is the
-- BACKDROP the surface is drawn on, and the owner asked for it by name.
--
-- ── What the index is ───────────────────────────────────────────────────────
--
-- For each pair of consecutive days, every used model-level cohort (0064's
-- level = 'model', cond = 'used', n ≥ 4 on both days) contributes the log of
-- its own day-over-day move, weighted by its cars; the day's step is the
-- weighted mean, and the index is the chain of steps from 1.0 on the first
-- day of the archive. A cohort that appears or disappears contributes
-- nothing on the day it does, which is what keeps coverage growth — the
-- crawl added ~700 cohorts between 08-15 and 09-06 — out of the line. A raw
-- site-wide median would have moved on every new dealer instead. The
-- per-cohort levels are already at one odometer (40,000 mi), so the index
-- is mileage-adjusted by construction.
--
-- Measured before building, 2026-09-07, over 14,711 cohort-days: 0.9982 on
-- 08-16 to 0.9878 on 09-06 (−1.2% in three weeks; 292 → 777 cohorts, 17k →
-- 59k cars a day). The same check 0064 ran on a fixed dealer set (−0.2%
-- either way to 09-04) says growth is not what is moving it.
--
-- ── Materialized, not computed per read ─────────────────────────────────────
--
-- The whole thing is ~260 ms over today's 14.7k rows and grows ~750 rows a
-- day; price_trend() is called once per car page per hour, and a listing
-- page is not the place to spend a quarter second of a burstable CPU on 22
-- numbers that change once a night. So: a table of one row per day,
-- rebuilt in full at the end of advance_price_trend_ask_daily() (the days
-- are few, and a full rebuild is what keeps a missed night from leaving a
-- hole). price_trend() reads it as `site`.
--
-- ── FORBIDDEN (0057/0061/0064's rules stand) ────────────────────────────────
--
--   Drawing the index as a price: it is dimensionless, and the page scales
--   it to the cohort's own first day. Quoting a day without the cohorts and
--   cars behind it (both stored, both returned). Drawing the current day.

create table ev_price_trend_site_daily (
  day      date          primary key,
  cohorts  int           not null,
  cars     int           not null,
  idx      numeric(12,6) not null
);

comment on table ev_price_trend_site_daily is
  'The site''s used-car asking-price INDEX, one row per closed day: every model-level cohort''s day-over-day move (0064 levels, at 40,000 mi, n ≥ 4 both days) weighted by its cars and chained from 1.0 on the archive''s first day. Dimensionless — the page scales it to the cohort it is drawn beside. Rebuilt nightly by rebuild_price_trend_site_daily() at the end of advance_price_trend_ask_daily(). Read through price_trend() as `site`.';

revoke all on ev_price_trend_site_daily from public, anon, authenticated;

create or replace function rebuild_price_trend_site_daily()
returns bigint
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  _n bigint;
begin
  delete from ev_price_trend_site_daily;
  insert into ev_price_trend_site_daily (day, cohorts, cars, idx)
  with d as (
    select cohort, model_year, day, n, price_usd
    from ev_price_trend_ask_daily
    where level = 'model' and cond = 'used' and n >= 4
  ),
  pair as (
    select a.day, a.n, ln(a.price_usd::numeric / b.price_usd) as dl
    from d a
    join d b on b.cohort = a.cohort and b.model_year = a.model_year and b.day = a.day - 1
  ),
  step as (
    select day, count(*)::int as cohorts, sum(n)::int as cars, sum(n * dl) / sum(n) as dl
    from pair
    group by day
  ),
  chain as (
    select day, cohorts, cars, exp(sum(dl) over (order by day)) as idx
    from step
  ),
  base as (
    -- The archive's first day is the index's 1.0, with its own day's counts.
    select day, count(*)::int as cohorts, sum(n)::int as cars, 1::numeric as idx
    from d
    where day = (select min(day) from d)
    group by day
  )
  select day, cohorts, cars, round(idx::numeric, 6) from base
  union all
  select day, cohorts, cars, round(idx::numeric, 6) from chain
  order by 1;
  get diagnostics _n = row_count;
  return _n;
end;
$$;

revoke all on function rebuild_price_trend_site_daily() from public, anon, authenticated;

comment on function rebuild_price_trend_site_daily() is
  'Recomputes ev_price_trend_site_daily in full from ev_price_trend_ask_daily (~260 ms at 15k cohort-days). Called at the end of advance_price_trend_ask_daily(); safe to call by hand.';

-- The nightly advance (0065's body, unchanged) now ends by rebuilding the
-- site index, so the two tables can never disagree about which days exist.
create or replace function advance_price_trend_ask_daily(_max_days int default 3)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  _day   date;
  _at    timestamptz;
  _done  int    := 0;
  _rows  bigint := 0;
  _n     bigint;
  _site  bigint;
begin
  select coalesce(max(day) + 1, date '2026-08-15') into _day from ev_price_trend_ask_daily;
  while _day < (now() at time zone 'UTC')::date and _done < _max_days loop
    _at := ((_day + 1)::timestamp at time zone 'UTC');
    insert into ev_price_trend_ask_daily
      (level, cohort, model_year, cond, day, n, price_usd, p25_usd, p75_usd,
       median_odometer, usd_per_mile, slope_from_sales)
    with s as (
      select distinct on (p.vin) p.vin, p.price_usd
      from listing_price_display p
      where p.observed_at <= _at
      order by p.vin, p.observed_at desc
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
    cars as (
      select upper(substring(l.vin, 1, 8))                                                 as vin8,
             lower(l.make) || ' ' || regexp_replace(lower(l.model), '[^a-z0-9+]', '', 'g') as model_key,
             l.year                                                                          as model_year,
             case when l.condition = 'new' then 'new' else 'used' end                        as cond,
             s.price_usd::numeric                                                            as price,
             nullif(l.mileage, 0)::numeric                                                   as odo,
             coalesce(sl.n_fit >= 8 and sl.s < 0, false)                                     as slope_from_sales,
             case when sl.n_fit >= 8 and sl.s < 0 then sl.s else -0.09 end                   as slope
      from s
      join listings l using (vin)
      left join slope sl on sl.vin8 = upper(substring(l.vin, 1, 8)) and sl.model_year = l.year
      where l.year is not null
        and s.price_usd between 1000 and 500000
        and l.first_seen_at <= _at
        and (l.delisted_at is null or l.delisted_at > _at)
    ),
    keyed as (
      select 'vin8'::text as level, vin8 as cohort, model_year, cond, odo, slope, slope_from_sales,
             case when cond = 'used' then price + slope * (40000 - odo) else price end as adj
      from cars
      union all
      select 'model', model_key, model_year, cond, odo, slope, slope_from_sales,
             case when cond = 'used' then price + slope * (40000 - odo) else price end as adj
      from cars
    )
    select level, cohort, model_year, cond, _day,
           count(*)::int,
           round(percentile_cont(0.5)  within group (order by adj))::int,
           round(percentile_cont(0.25) within group (order by adj))::int,
           round(percentile_cont(0.75) within group (order by adj))::int,
           round(percentile_cont(0.5)  within group (order by odo))::int,
           round(avg(slope)::numeric, 4),
           bool_and(slope_from_sales)
    from keyed
    where adj > 0 and (cond = 'new' or odo is not null)
    group by 1, 2, 3, 4;
    get diagnostics _n = row_count;
    _rows := _rows + _n;
    _done := _done + 1;
    _day  := _day + 1;
  end loop;
  _site := rebuild_price_trend_site_daily();
  return jsonb_build_object('view', 'ev_price_trend_ask_daily', 'days', _done, 'rows', _rows,
                            'through', (select max(day) from ev_price_trend_ask_daily),
                            'site_days', _site);
end;
$$;

-- The one reader gains `site`. Sales and asks are 0064's, unchanged.
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
  _sales   jsonb; _asks jsonb; _site jsonb;
begin
  if _model_year is null then
    return jsonb_build_object('sales', null, 'asks', null, 'site', null);
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
           'usdPerMile', round(avg(usd_per_mile), 4),
           'slopeFromSales', bool_and(slope_from_sales),
           'points', jsonb_agg(jsonb_build_object(
              'period', period, 'n', n, 'price', price_usd, 'p25', p25_usd, 'p75', p75_usd,
              'odometer', median_odometer) order by period))
    into _sales
  from ev_price_trend_sales
  where level = _slevel and cohort = _scohort and model_year = _model_year and n >= 8;

  if _v8 is not null and exists (
       select 1 from ev_price_trend_ask_daily
       where level = 'vin8' and cohort = _v8 and model_year = _model_year and cond = 'used' and n >= 4) then
    _alevel := 'vin8'; _acohort := _v8;
  else
    _alevel := 'model'; _acohort := _mkey;
  end if;
  select jsonb_build_object(
           'level', _alevel,
           'stdOdometer', 40000,
           'usdPerMile', round(avg(usd_per_mile), 4),
           'slopeFromSales', bool_and(slope_from_sales),
           'points', jsonb_agg(jsonb_build_object(
              'period', day, 'n', n, 'price', price_usd, 'p25', p25_usd, 'p75', p75_usd,
              'odometer', median_odometer) order by day))
    into _asks
  from ev_price_trend_ask_daily
  where level = _alevel and cohort = _acohort and model_year = _model_year and cond = 'used' and n >= 4;

  select jsonb_build_object(
           'points', jsonb_agg(jsonb_build_object(
              'period', day, 'idx', idx, 'cohorts', cohorts, 'cars', cars) order by day))
    into _site
  from ev_price_trend_site_daily;

  return jsonb_build_object(
    'sales', case when _sales ->> 'points' is null then null else _sales end,
    'asks',  case when _asks  ->> 'points' is null then null else _asks  end,
    'site',  case when _site  ->> 'points' is null then null else _site  end);
end;
$$;

comment on function price_trend(text, text, int, text) is
  'The trend surface''s one read: {sales, asks, site} — WA sale price of a standard car by quarter (n ≥ 8), asking price of a standard car by DAY (n ≥ 4, used, closed days only) at the VIN cohort when a VIN was given and it clears the floor, else the model pool, and the site-wide used-car index by day (0072). Each series carries stdOdometer and usdPerMile so the page re-levels to the shopper''s odometer; each point carries n and median odometer; each site point carries its cohorts and cars. Attribute WA DOL / ODbL wherever sales render.';

-- Fill it now, so the first read after this applies is not empty.
select rebuild_price_trend_site_daily();
