-- Market trends: what a STANDARD car of each cohort fetched (Washington sales,
-- by quarter, since 2019) and what one is being asked (our own listings, by
-- week, since 2026-08-11). The Pro trend surface reads these; nothing else.
--
-- ── Why "synthetic" ────────────────────────────────────────────────────────
--
-- A raw median moves when the MIX moves: three high-mileage cars sold this
-- quarter and three low-mileage ones next quarter, and the median dropped
-- while the market did nothing (0057's header names this trap for asks). So
-- every price here is first moved to the cohort's STANDARD odometer along
-- the cohort's own mileage slope, and the period's figure is the median of
-- those adjusted prices. The standard car is the same in every period —
-- std_odometer is the cohort's median odometer over the WHOLE window, fixed,
-- not the period's — which is what makes two points comparable, and what
-- lets a 12,000-mile car and a 60,000-mile car be read off the same line.
--
-- The slope is the one ev_price_model (0014/0015) trusts: regr_slope of price
-- on odometer over the cohort's arms-length sales, used only when eight or
-- more sales fitted it and it points the right way; otherwise the dataset-
-- wide used-EV rate of -$0.09/mi that comps.ts falls back to. One slope per
-- cohort over the whole window, deliberately: a per-quarter slope on six
-- sales is noise, and the adjustment only has to be good enough that the
-- mix stops masquerading as the market. slope_from_sales says which it was.
--
-- Two views, two sources, kept apart on purpose (owner, 2026-09-03): sales
-- are what cars fetched (years of depth, Washington only, a quarter's lag);
-- asks are what dealers want right now (weekly, national, weeks of depth,
-- biased high by cars that do not sell). The gap between them is itself the
-- number a buyer negotiates with. Neither may be called the other.
--
-- ── Back-test, 2026-09-03 ─────────────────────────────────────────────────
--
-- 2017 Chevrolet Bolt, all cohorts, adjusted to its 31k-mile standard:
-- $29.2k (2019Q1) → $15.7k (2021Q1) → $24-30k through the 2022 used-car
-- spike → $18.6k (2023Q3, when Bolt prices fell) → $16-17k (2024) → $13.9-
-- 14.3k (2025H1). The hand series measured on data.wa.gov on 2026-08-26
-- (40-100k mi, raw) read $14.5k (2024) → $12-13k (2025-26); adjusted to a
-- lower standard mileage the index sits ~$1.5k above it, as it should.
--
-- ── Cohorts and pooling ────────────────────────────────────────────────────
--
-- `level` is 'vin8' (VIN positions 1-8 + model year — body, motor, drive,
-- ev_price_model's key) or, for sales only, 'model' (make + folded model
-- name + model year, the pool a thin vin8 quarter falls back to; 0057-style
-- folding: lowercase, non-alphanumerics dropped). Asks carry only the vin8
-- level: a weekly ask cohort is rarely thin (n=157 on one Lightning cohort
-- at four weeks), and doubling the snapshot rows for a pool nobody needs
-- would spend the refresh budget 0057's header warns about.
--
-- ── FORBIDDEN on any surface this feeds (inherits 0057's rules) ────────────
--
--   Quoting a point without its n. The consumer picks its floor; comps.ts
--   MIN_PEERS (4) is the house precedent, and a sales quarter under ~8 is a
--   handful of deals, not a market.
--   Calling asks anything but asking prices, or sales anything but
--   Washington sales. ODbL (0003): the sales view publishes derived
--   statistics, never source rows; attribute WA DOL wherever a figure renders.
--   Reading a move off the CURRENT week or quarter as settled: both float
--   until they close.
--
-- Ships dark: no anon grant until the surface exists. Refreshed nightly by
-- refresh_vin_variants(), LAST in scraper/refresh-variants.mjs VIEWS.

create materialized view ev_price_trend_sales as
with arms as (
  select substring(vin_prefix, 1, 8)                               as vin8,
         model_year,
         lower(make) || ' ' || regexp_replace(lower(model), '[^a-z0-9+]', '', 'g') as model_key,
         sale_price::numeric                                        as price,
         odometer::numeric                                          as odo,
         date_trunc('quarter', sale_date)::date                     as period
  from wa_ev_sales
  where transaction_type = 'Original Title'          -- arms-length, 0014 rule (1)
    and odometer between 2000 and 200000              -- driven, not delivery mileage
    and sale_price between 5000 and 130000
    and sale_date >= date '2019-01-01'
),
keyed as (
  select 'vin8'::text as level, vin8 as cohort, model_year, price, odo, period from arms
  union all
  select 'model', model_key, model_year, price, odo, period from arms
),
fit as (
  select level, cohort, model_year,
         count(*)                                             as n_fit,
         regr_slope(price, odo)                               as s,
         percentile_cont(0.5) within group (order by odo)     as std_odo
  from keyed
  group by 1, 2, 3
),
adj as (
  select k.level, k.cohort, k.model_year, k.period, k.odo, f.std_odo,
         (f.n_fit >= 8 and f.s < 0)                                          as slope_from_sales,
         case when f.n_fit >= 8 and f.s < 0 then f.s else -0.09 end          as slope,
         k.price + (case when f.n_fit >= 8 and f.s < 0 then f.s else -0.09 end) * (f.std_odo - k.odo) as adj_price
  from keyed k
  join fit f using (level, cohort, model_year)
)
select level, cohort, model_year, period,
       count(*)::int                                                          as n,
       round(percentile_cont(0.5)  within group (order by adj_price))::int    as price_usd,
       round(percentile_cont(0.25) within group (order by adj_price))::int    as p25_usd,
       round(percentile_cont(0.75) within group (order by adj_price))::int    as p75_usd,
       round(avg(std_odo))::int                                               as std_odometer,
       round(percentile_cont(0.5)  within group (order by odo))::int          as median_odometer,
       round(avg(slope)::numeric, 4)                                          as usd_per_mile,
       bool_and(slope_from_sales)                                             as slope_from_sales
from adj
group by 1, 2, 3, 4;

create unique index ev_price_trend_sales_key
  on ev_price_trend_sales (level, cohort, model_year, period);

comment on materialized view ev_price_trend_sales is
  'Quarterly WASHINGTON SALE price of a standard car per cohort since 2019: each arms-length sale moved to the cohort''s fixed standard odometer along its fitted mileage slope, then the period median. level=vin8 (VIN 1-8 + model year) or model (make + folded model + year, the pool for thin quarters). Never quote a point without n. Derived statistics; attribute WA DOL / ODbL where rendered. Ships dark.';

-- Asks: the same standard-car idea over 0057's weekly snapshots, at the
-- listing level so the adjustment can be applied per car. Used cars only
-- carry an adjustment (and only those with an odometer); a new car's ask is
-- taken as-is. std_odometer is the cohort's median odometer across the whole
-- archive, fixed. The slope comes from the SALES fit above (vin8 level) —
-- asks have no fitted slope of their own worth trusting — else -$0.09/mi.
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
  select vin8, model_year, cond,
         percentile_cont(0.5) within group (order by odo) filter (where odo is not null) as std_odo
  from snaps
  group by 1, 2, 3
),
adj as (
  select sn.vin8, sn.model_year, sn.cond, sn.period, sn.odo, st.std_odo,
         (sl.n_fit >= 8 and sl.s < 0)                                                 as slope_from_sales,
         case when sl.n_fit >= 8 and sl.s < 0 then sl.s else -0.09 end               as slope,
         case when sn.cond = 'used'
              then sn.price + (case when sl.n_fit >= 8 and sl.s < 0 then sl.s else -0.09 end) * (st.std_odo - sn.odo)
              else sn.price end                                                        as adj_price
  from snaps sn
  join std st using (vin8, model_year, cond)
  left join slope sl using (vin8, model_year)
  where sn.cond = 'new' or (sn.odo is not null and st.std_odo is not null)
)
select 'vin8'::text as level, vin8 as cohort, model_year, cond, period,
       count(*)::int                                                          as n,
       round(percentile_cont(0.5)  within group (order by adj_price))::int    as price_usd,
       round(percentile_cont(0.25) within group (order by adj_price))::int    as p25_usd,
       round(percentile_cont(0.75) within group (order by adj_price))::int    as p75_usd,
       round(avg(std_odo))::int                                               as std_odometer,
       round(percentile_cont(0.5)  within group (order by odo))::int          as median_odometer,
       round(avg(slope)::numeric, 4)                                          as usd_per_mile,
       coalesce(bool_and(slope_from_sales), false)                            as slope_from_sales
from adj
group by 2, 3, 4, 5;

create unique index ev_price_trend_asks_key
  on ev_price_trend_asks (level, cohort, model_year, cond, period);

comment on materialized view ev_price_trend_asks is
  'Weekly ASKING price of a standard car per VIN(1-8) cohort, model year and new/used, since 2026-08-11: each live listing at the week''s close (through listing_price_display) moved to the cohort''s fixed standard odometer along its sales-fitted mileage slope, then the week median. Asking prices, never sales. Never quote a point without n. The current week floats until it closes. Ships dark.';

revoke all on ev_price_trend_sales from public, anon, authenticated;
revoke all on ev_price_trend_asks  from public, anon, authenticated;

-- The whitelist grows by two (0051's shape: literal statements, no EXECUTE).
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
    when 'ev_price_trend_asks' then
      refresh materialized view concurrently ev_price_trend_asks;
      select count(*) into n from ev_price_trend_asks;
    else
      raise exception 'refresh_vin_variants: unknown target %', target
        using hint = 'one of vin_variant_observed, ev_cohort_trim_spread, listing_freshness, ev_cohort_velocity, ev_cohort_ask_weekly, ev_price_trend_sales, ev_price_trend_asks';
  end case;
  return jsonb_build_object('view', target, 'rows', n);
end;
$function$;
