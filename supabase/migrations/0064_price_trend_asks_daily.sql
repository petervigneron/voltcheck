-- The asking-price trend becomes a DAILY level per cohort, frozen day by day
-- into a table, and both trend series learn to be read at one odometer.
--
-- ── What the owner could not read (2026-09-04) ─────────────────────────────
--
-- The /worth trend block drew two lines that were standardized to different
-- cars. Each 0061 view picked its standard odometer as the median of its own
-- population: five years of Washington titles, mostly young cars (2021 Model
-- 3: 31,936 mi), against what is on lots today (59,736 mi). The vertical gap
-- between the charts was a 28,000-mile difference wearing a market's
-- clothes, and it pointed the wrong way — asks drawn $5,703 UNDER sales when
-- at equal mileage they sit ~$650 over. A false bargain, the error class the
-- house rule calls the most expensive. Each chart was right alone; the pair
-- lied.
--
-- The owner's design, in his words: "an aggregate, daily price per
-- mileage/year/model, which is insensitive to any single price cut". One
-- level a day per cohort. Not change-events, not cut-vs-raise ratios (a car
-- that sits gets cut and a car that sells leaves, so cuts outrun raises in
-- any market — that ratio was measured at 63:37 and dropped for saying
-- nothing), not a chained cross-cohort index: the surface is per car, so the
-- cohort's own line IS the direction.
--
-- ── Control test, 2026-09-05, before building ──────────────────────────────
--
-- The objection to a daily slope was coverage growth: the crawl kept adding
-- dealers through August, so two snapshots might see two different markets.
-- Measured: the same 40,000-mile daily median per model+year, chained across
-- cohorts, once over every dealer and once over only the 1,600-odd dealers
-- already crawled on 2026-08-12 (new cars at old dealers stay in — arrivals
-- are the market; the dealer SET is what is held). From 08-15 (the first day
-- with real coverage, 160 cohorts) to 09-04 (493 cohorts, 51,209 cars):
--   all dealers    98.81 → 98.63   (−0.2%)
--   fixed dealers  99.59 → 99.38   (−0.2%)
-- Same move, and it is flat. The −1.2% an earlier session worried over was
-- the first two days on 12 and 70 cohorts. Coverage growth is not moving the
-- level; the daily line can be shown as a trend. The owner was right that
-- the count of cars in a snapshot does not bias its median.
--
-- ── The table ──────────────────────────────────────────────────────────────
--
-- ev_price_trend_ask_daily: one row per (level, cohort, model_year, cond,
-- day), the cohort's live listings at that day's close (00:00 UTC of the
-- next day), each valued at its last provenance-clean price on or before that
-- instant (listing_price_display, 0061 — the guard that keeps reader
-- disagreements out of the series), each USED car moved to a fixed REFERENCE
-- odometer of 40,000 miles along its own sales-fitted mileage slope (the vin8
-- fit from wa_ev_sales when eight or more sales fitted it and it points the
-- right way, else −$0.09/mi, comps.ts's fallback), then the day's median and
-- quartiles. New cars are taken as-is.
--
-- A fixed reference instead of 0061's per-cohort median odometer, for two
-- reasons. A frozen table cannot recompute its standard car as days accrue,
-- and the reference no longer matters to what is shown: price_trend() now
-- returns each series' slope, and the page re-levels both lines to the
-- SHOPPER'S odometer (the mileage typed into /worth, the car's on a listing
-- page) before drawing. Because the adjustment is linear with one slope per
-- car, the median at any odometer m is the stored median plus slope × (m −
-- 40,000) exactly at the vin8 level, and to the mixture's average slope at
-- the model level. Both charts then print the same "at 47,000 mi", and the
-- gap between them is finally the number a buyer negotiates with.
--
-- Closed days only: the current day floats until 00:00 UTC and is never
-- written, so the last point is always yesterday and never moves. Days are
-- appended by advance_price_trend_ask_daily(), which computes only the days
-- not yet present — one snapshot each, ~5s on prod at 150k live cars — up to
-- _max_days per call so a night's call stays inside the 60s budget with 3
-- days of headroom for a missed night. refresh_vin_variants('ev_price_
-- trend_ask_daily') is the door refresh-variants.mjs already knocks on. The
-- backfill from 2026-08-12 was run by hand in chunks the day this applied.
--
-- Raw price bounds $1,000–$500,000 (a $1,238,239 ask reached a cohort median
-- on 2026-09-04 — a cents field read as dollars) and adjusted price > 0 (three
-- cohorts went negative at the reference). 0061's sales view is untouched.
--
-- ── FORBIDDEN on any surface this feeds (0057/0061's rules stand) ──────────
--
--   Quoting a day without its n (price_trend() floors at 4, comps.ts
--   MIN_PEERS). Calling asks anything but asking prices. Drawing the
--   current day. Drawing sales and asks at different odometers — that is
--   the bug this migration exists to end.
--
-- ev_price_trend_asks (0061/0062, weekly) is dropped: price_trend() was its
-- only reader (grepped web/ and scraper/), and its full recompute grew with
-- the archive (0057's header). ev_cohort_ask_weekly (0057) stays.

create table ev_price_trend_ask_daily (
  level            text        not null,
  cohort           text        not null,
  model_year       int         not null,
  cond             text        not null,
  day              date        not null,
  n                int         not null,
  price_usd        int         not null,
  p25_usd          int         not null,
  p75_usd          int         not null,
  median_odometer  int,
  usd_per_mile     numeric(8,4) not null,
  slope_from_sales boolean     not null,
  primary key (level, cohort, model_year, cond, day)
);

comment on table ev_price_trend_ask_daily is
  'Daily ASKING price of a standard car per cohort (level=vin8: VIN 1-8 + model year; level=model: make + folded model + year), new/used, since 2026-08-12: each live listing at the day''s close (through listing_price_display) moved to a fixed 40,000-mile reference along its own sales-fitted mileage slope, then the day median. Closed days only, appended by advance_price_trend_ask_daily(). Asking prices, never sales. Never quote a day without n. Dark: read through price_trend(), which re-levels to the shopper''s odometer via usd_per_mile.';

revoke all on ev_price_trend_ask_daily from public, anon, authenticated;

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
begin
  select coalesce(max(day) + 1, date '2026-08-12') into _day from ev_price_trend_ask_daily;
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
  return jsonb_build_object('view', 'ev_price_trend_ask_daily', 'days', _done, 'rows', _rows,
                            'through', (select max(day) from ev_price_trend_ask_daily));
end;
$$;

revoke all on function advance_price_trend_ask_daily(int) from public, anon, authenticated;

comment on function advance_price_trend_ask_daily(int) is
  'Appends the closed days ev_price_trend_ask_daily does not have yet, oldest first, at most _max_days per call (~5s a day). Idempotent; the current day is never written. Called nightly through refresh_vin_variants(''ev_price_trend_ask_daily'').';

-- The one reader, redone: asks come from the daily table, and both series
-- now carry usdPerMile so the page can move them to the shopper's odometer.
-- Sales floor n ≥ 8 a quarter, asks n ≥ 4 a day (unchanged).
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

  return jsonb_build_object(
    'sales', case when _sales ->> 'points' is null then null else _sales end,
    'asks',  case when _asks  ->> 'points' is null then null else _asks  end);
end;
$$;

comment on function price_trend(text, text, int, text) is
  'The trend surface''s one read: {sales, asks} series for a car — WA sale price of a standard car by quarter (n ≥ 8), asking price of a standard car by DAY (n ≥ 4, used, closed days only) — at the VIN cohort when a VIN was given and it clears the floor, else the model pool. Each series carries stdOdometer and usdPerMile so the page re-levels both to the shopper''s odometer; each point carries n and median odometer. Attribute WA DOL / ODbL wherever sales render.';

drop materialized view if exists ev_price_trend_asks;

-- The whitelist swaps the weekly asks view for the daily advance (0051's
-- shape: literal statements, no EXECUTE).
create or replace function refresh_vin_variants(target text)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  n bigint;
begin
  case target
    when 'vin_variant_observed' then
      refresh materialized view concurrently vin_variant_observed;
      select count(*) into n from vin_variant_observed;
    when 'ev_cohort_trim_spread' then
      refresh materialized view concurrently ev_cohort_trim_spread;
      select count(*) into n from ev_cohort_trim_spread;
    when 'listing_freshness' then
      refresh materialized view concurrently listing_freshness;
      select count(*) into n from listing_freshness;
    when 'ev_cohort_velocity' then
      refresh materialized view concurrently ev_cohort_velocity;
      select count(*) into n from ev_cohort_velocity;
    when 'ev_cohort_ask_weekly' then
      refresh materialized view concurrently ev_cohort_ask_weekly;
      select count(*) into n from ev_cohort_ask_weekly;
    when 'ev_price_trend_sales' then
      refresh materialized view concurrently ev_price_trend_sales;
      select count(*) into n from ev_price_trend_sales;
    when 'ev_price_trend_ask_daily' then
      return advance_price_trend_ask_daily(3);
    else
      raise exception 'refresh_vin_variants: unknown target %', target
        using hint = 'one of vin_variant_observed, ev_cohort_trim_spread, listing_freshness, ev_cohort_velocity, ev_cohort_ask_weekly, ev_price_trend_sales, ev_price_trend_ask_daily';
  end case;
  return jsonb_build_object('view', target, 'rows', n);
end;
$function$;
