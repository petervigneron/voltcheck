-- A fourth guardrail on ev_price_model: the prices this cohort has actually
-- reached.
--
-- 0015 gave every cohort an odometer band and forbade extrapolating outside
-- it, because a line fitted on 40k-mile cars says nothing about a 5,900-mile
-- one. The same argument applies on the price axis and was never made there.
--
-- Where the VIN encodes no trim — Ford stamped none on 2022-23 Lightnings, and
-- Tesla's position 8 is a motor code — a cohort is one line fitted across Pro
-- through Platinum, cars that were $30k apart new. The line lands near the
-- mixture's middle, so it reads a loaded car as overpriced and a basic one as
-- a bargain. A 2023 Lightning asking $62,025 was called $14,309 over "what
-- these sell for" by a cohort whose best sale on record was $61,798. No truck
-- in it ever reached this car's asking price, so the honest answer is that the
-- cohort cannot speak to this car at all.
--
-- This publishes the range so the caller can hold a claim to it. The bound is
-- the observed MIN and MAX rather than a trimmed percentile on purpose: it is
-- answering "has one of these ever changed hands here" — a question about
-- coverage, not about central tendency — and the widest honest reading of the
-- cohort is the one that silences the fewest real claims.
--
-- Nothing else changes; the fit, the trimming, the residuals and the 15% cap
-- are 0015's, character for character. Dropped and recreated rather than
-- altered because Postgres will not add columns mid-list in a view, and the
-- band belongs next to odo_lo/odo_hi where a reader will look for it.
--
-- ODbL (see 0003): still derived STATISTICS, a few hundred coefficient rows,
-- never the source records. sale_lo/sale_hi are two order statistics per
-- cohort, which is the same kind of figure as median_price_usd. Attribution
-- required wherever a figure derived from this renders.

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
         percentile_cont(0.90) within group (order by price) as p_hi,
         -- The new band: every arms-length sale, trimmed or not.
         min(price) as sale_lo,
         max(price) as sale_hi
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
       round(b.sale_lo::numeric, 0)       as sale_lo,
       round(b.sale_hi::numeric, 0)       as sale_hi,
       round(r.medae::numeric, 0)         as resid_medae_usd
from guarded g
join resid r using (vin8, model_year)
join bounds b using (vin8, model_year)
-- (3) a cohort that cannot predict itself to within 15% has no business
-- telling a shopper what a car is worth.
where r.medae <= 0.15 * g.median_price;

comment on view ev_price_model is
  'Fair-price coefficients per VIN(1-8) variant and model year, fitted on the middle 80% of arms-length Washington title sales. price = intercept_usd + usd_per_mile*odometer, valid ONLY for odometer between odo_lo and odo_hi. sale_lo/sale_hi are the cheapest and dearest this cohort actually sold for — an ask outside that band is one the cohort has never seen and cannot be measured against. Hold any delta against resid_medae_usd (measured against the full cohort). Derived statistics; attribute WA DOL / ODbL where rendered.';

grant select on ev_price_model to anon, authenticated;
