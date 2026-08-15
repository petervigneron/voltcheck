-- A fair price fitted on REAL TRANSACTIONS, not asking prices.
--
-- Every price signal on the site so far is what a dealer is ASKING.
-- wa_ev_sales is what people actually PAID. This view fits, per vehicle
-- variant and model year, the line price = intercept + slope*odometer over
-- Washington's title records, so a listing can be compared against the
-- money that actually changed hands for its twins.
--
-- Two data rules earn the accuracy, both measured 2026-08-15 on a temporal
-- holdout (train < 2026-03-01, test >= 2026-03-01, 4,551 held-out sales):
--
--   (1) Arms-length only. 'Transfer Title' rows re-title a car already
--       titled in Washington and include family transfers, lien moves and
--       wholesale at nominal prices: at matched variant/year/mileage/month
--       their interquartile spread is 44.8% of median against 6.7% for
--       'Original Title', all of it a low tail. Training on them put median
--       error at 12.9%; 'Original Title' alone puts it at 7.4%.
--   (2) Variant, not model. Cohorting on VIN positions 1-8 (which encode
--       body, motor and drive) instead of make/model/year cut median error
--       from 8.6% to 7.4%, and 632 variant-years clear the n>=8 bar,
--       covering 92% of sales.
--
-- Median absolute error is $2,196 and p90 is $6,689, so the honest use of
-- this model is a WIDE band: a $4k gap is a finding, a $1k gap is noise.
-- resid_medae_usd is published per cohort precisely so a caller can hold a
-- delta to its own cohort's uncertainty rather than a global guess.
--
-- Coverage is Washington-only. It is a national market for a nationally
-- traded good, but WA-registered EVs skew toward the Northwest's mix; treat
-- the level as a strong prior, not gospel, outside the region.
--
-- ODbL (see 0003): this publishes derived STATISTICS — a few hundred
-- coefficient rows — never the source records. Attribution required
-- wherever a figure derived from it renders.

create or replace view ev_price_model as
with arms_length as (
  select substring(vin_prefix, 1, 8) as vin8,
         model_year,
         make,
         model,
         sale_price::numeric as price,
         odometer::numeric   as odo
  from wa_ev_sales
  where transaction_type = 'Original Title'   -- rule (1)
    -- A new car titled for the first time is not a used comp; 2,000 miles
    -- is the floor that separates delivery mileage from a driven car.
    and odometer between 2000 and 200000
    and sale_price between 5000 and 130000
    and sale_date >= (current_date - interval '18 months')
),
fit as (
  select vin8, model_year,
         min(make)  as make,
         min(model) as model,
         count(*)   as n,
         regr_slope(price, odo)     as slope,
         regr_intercept(price, odo) as icept,
         percentile_cont(0.5) within group (order by price) as median_price,
         percentile_cont(0.5) within group (order by odo)   as median_odo
  from arms_length
  group by 1, 2
  having count(*) >= 8
),
-- Depreciation cannot run backwards. A positive fitted slope means the
-- cohort's mileage signal is noise (thin data, or a trim mix that
-- correlates with mileage), so fall back to a flat median for it rather
-- than publish a line that pays owners to drive.
guarded as (
  select f.*,
         case when f.slope < 0 then f.slope else 0 end as slope_g,
         case when f.slope < 0 then f.icept else f.median_price end as icept_g
  from fit f
),
resid as (
  select g.vin8, g.model_year,
         percentile_cont(0.5) within group (
           order by abs(a.price - (g.icept_g + g.slope_g * a.odo))
         ) as medae
  from guarded g
  join arms_length a using (vin8, model_year)
  group by 1, 2
)
-- regr_* return double precision; round(v, scale) is numeric-only.
select g.vin8,
       g.model_year,
       g.make,
       g.model,
       g.n                                as sales_n,
       round(g.icept_g::numeric, 2)       as intercept_usd,
       round(g.slope_g::numeric, 6)       as usd_per_mile,
       round(g.median_price::numeric, 0)  as median_price_usd,
       round(g.median_odo::numeric, 0)    as median_odometer,
       round(r.medae::numeric, 0)         as resid_medae_usd
from guarded g
join resid r using (vin8, model_year);

comment on view ev_price_model is
  'Fair-price coefficients per VIN(1-8) variant and model year, fitted on arms-length Washington title sales. price = intercept_usd + usd_per_mile*odometer. Hold any delta against resid_medae_usd. Derived statistics; attribute WA DOL / ODbL where rendered.';

-- Statistics, like wa_price_comps (0003/0010) — not the ODbL-derived rows,
-- which stay closed to anon per 0007.
grant select on ev_price_model to anon, authenticated;
