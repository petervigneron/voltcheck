-- Three guardrails on ev_price_model (0014). Fitting the raw cohorts made
-- confident claims about cars the data could not speak to: a 2021 Taycan
-- asking $64,080 was called $28,570 under market, and 2023 BMW iX sales in
-- one variant-year run from $13,537 to $61,996 — a 4.6x spread that is
-- salvage and damage, not a market. A false "great deal" is the most
-- expensive error this model can make, so each guardrail removes claims
-- rather than adding them.
--
--   (1) Trimmed fit. The line is fitted on the middle 80% of each cohort's
--       prices. Wrecked cars and nominal sales clear the arms-length filter
--       and otherwise drag the line down at the ends.
--   (2) Honest error bars. Residuals are still measured against ALL the
--       cohort's sales, not the trimmed core, so trimming cannot flatter
--       the published uncertainty into looking smaller than it is.
--   (3) No extrapolation, no vague cohorts. Each row publishes the
--       odometer band it was actually fitted over (callers must not predict
--       outside it), and a cohort whose own error exceeds 15% of its median
--       price is dropped: it cannot ground a dollar claim at all.
--
-- n rises 8 -> 12 so the trim leaves a real sample behind.
--
-- Dropped rather than replaced: the odometer band lands mid-list, and
-- Postgres will not rename view columns in place. Nothing depends on it
-- yet — the only reader is lib/listings/comps.ts, shipped alongside this.

drop view if exists ev_price_model;

create view ev_price_model as
with arms_length as (
  select substring(vin_prefix, 1, 8) as vin8,
         model_year,
         make,
         model,
         sale_price::numeric as price,
         odometer::numeric   as odo
  from wa_ev_sales
  where transaction_type = 'Original Title'
    and odometer between 2000 and 200000
    and sale_price between 5000 and 130000
    and sale_date >= (current_date - interval '18 months')
),
bounds as (
  select vin8, model_year,
         percentile_cont(0.10) within group (order by price) as p_lo,
         percentile_cont(0.90) within group (order by price) as p_hi
  from arms_length
  group by 1, 2
  having count(*) >= 12
),
-- (1) the trimmed core the line is fitted on
core as (
  select a.*
  from arms_length a
  join bounds b using (vin8, model_year)
  where a.price between b.p_lo and b.p_hi
),
fit as (
  select vin8, model_year,
         min(make)  as make,
         min(model) as model,
         count(*)   as n,
         regr_slope(price, odo)     as slope,
         regr_intercept(price, odo) as icept,
         percentile_cont(0.5)  within group (order by price) as median_price,
         percentile_cont(0.5)  within group (order by odo)   as median_odo,
         -- (3) the band this line is entitled to speak about
         percentile_cont(0.05) within group (order by odo)   as odo_lo,
         percentile_cont(0.95) within group (order by odo)   as odo_hi
  from core
  group by 1, 2
  having count(*) >= 8
),
-- Depreciation cannot run backwards: a positive fitted slope means the
-- cohort's mileage signal is noise, so fall back to a flat median rather
-- than publish a line that pays owners to drive.
guarded as (
  select f.*,
         case when f.slope < 0 then f.slope else 0 end as slope_g,
         case when f.slope < 0 then f.icept else f.median_price end as icept_g
  from fit f
),
-- (2) error measured against every sale in the cohort, trimmed or not
resid as (
  select g.vin8, g.model_year,
         percentile_cont(0.5) within group (
           order by abs(a.price - (g.icept_g + g.slope_g * a.odo))
         ) as medae
  from guarded g
  join arms_length a using (vin8, model_year)
  group by 1, 2
)
select g.vin8,
       g.model_year,
       g.make,
       g.model,
       g.n                                as sales_n,
       round(g.icept_g::numeric, 2)       as intercept_usd,
       round(g.slope_g::numeric, 6)       as usd_per_mile,
       round(g.median_price::numeric, 0)  as median_price_usd,
       round(g.median_odo::numeric, 0)    as median_odometer,
       round(g.odo_lo::numeric, 0)        as odo_lo,
       round(g.odo_hi::numeric, 0)        as odo_hi,
       round(r.medae::numeric, 0)         as resid_medae_usd
from guarded g
join resid r using (vin8, model_year)
-- (3) a cohort that cannot predict itself to within 15% has no business
-- telling a shopper what a car is worth.
where r.medae <= 0.15 * g.median_price;

comment on view ev_price_model is
  'Fair-price coefficients per VIN(1-8) variant and model year, fitted on the middle 80% of arms-length Washington title sales. price = intercept_usd + usd_per_mile*odometer, valid ONLY for odometer between odo_lo and odo_hi. Hold any delta against resid_medae_usd (measured against the full cohort). Derived statistics; attribute WA DOL / ODbL where rendered.';

grant select on ev_price_model to anon, authenticated;
