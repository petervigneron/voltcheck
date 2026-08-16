-- A fifth guardrail on ev_price_model: does this cohort hold one car or several?
--
-- ev_price_model fits one line per VIN(1-8) + model year. That key carries the
-- body, motor and drive, and for most cars it carries the trim too. For some it
-- does not: Ford stamped no trim on 2022-23 Lightnings (every truck is `W1E`,
-- and only the pack code in position 8 varies) and Tesla's position 8 is a
-- motor code. Those cohorts hold Pro through Platinum — cars that were $30k
-- apart new — and the fitted line lands somewhere in the middle of the mixture.
--
-- The error that produces is BIASED, not noisy, which is why no amount of
-- residual-checking caught it: the line reads a loaded car as overpriced and a
-- basic one as a bargain, every time, and the bargain direction is the one that
-- costs a shopper money. Measured 2026-08-15 against live inventory: a 2023
-- Lightning Platinum asking $56,499 was called $9,263 over, and a 2023 XLT
-- asking $42,085 was called $5,234 under, both off the same mixed line.
--
-- wa_ev_sales publishes no trim, so the sales cannot be split. What CAN be
-- measured is whether the versions in a cohort sit at different price levels,
-- and our own live inventory answers that — it is the only place trim exists
-- for these VINs. Where the versions ask far enough apart, the sold line is
-- speaking about a mixture and must not be quoted at an individual car.
--
-- Every version votes, including one listed on its own. A three-listing
-- minimum was measured first and rejected: small cohorts never reach it, so
-- they were never checked at all, and they are exactly where a handful of
-- mixed cars does the most damage — it left a 2022 Lightning XLT sitting on
-- the site as a $3,833 bargain. One listing is thin evidence, but the span
-- still has to clear the cohort's own error bar (usually $3-5k) before anything
-- is suppressed, so a single odd dealer cannot silence a cohort on its own.
-- This is the strict end on purpose: accuracy is the product.
--
-- Materialized, and refreshed by refresh_vin_variants() alongside
-- vin_variant_observed. 0020 is the reason — the same scan as a plain view ran
-- per request and pushed recent_sales() past anon's 8-second statement timeout.
-- It depends on nothing faster than the nightly sync.
--
-- Deliberately does NOT read ev_price_model: that view joins this one, and the
-- reverse reference would be a dependency cycle. So mileage is levelled with
-- the flat fallback rate rather than each cohort's fitted slope. The rate only
-- has to be good enough to stop a low-mileage Platinum and a high-mileage Pro
-- from looking alike, and -$0.09/mi is the dataset-wide used-EV figure that
-- lib/listings/comps.ts already falls back to.
--
-- ODbL (see 0003): this reads our own crawl, not wa_ev_sales. Nothing here is
-- derived from the Washington data, so the table is ours; ev_price_model's
-- attribution requirement is unchanged and still applies to the coefficients.

create materialized view ev_cohort_trim_spread as
with base as (
  select upper(substring(vin, 1, 8)) as vin8,
         year as model_year,
         price_usd::numeric as ask,
         mileage::numeric   as mi,
         -- Mirrors cleanTrim()/specTrim() in web/lib/listings/enrich.ts, and
         -- the same normalization vin_variant_observed (0016/0020) applies.
         -- Imperfect folding is safe in one direction only, and this is the
         -- opposite direction from that one: a spelling we fail to fold looks
         -- like an extra version and can only make us quieter, never wronger.
         btrim(regexp_replace(
         regexp_replace(
         regexp_replace(
         regexp_replace(lower(btrim(vehicle_trim)),
           '\s*([,|/]|\s-\s|\sw/|\swith\s).*$', '', 'g'),
           '\y(sports? activity vehicles?|sport utility vehicles?|sport utility|hatchback|gran coupe|sedan|sdn|coupe|suv|crossover|wagon|pickup|trucks?|vehicles?|4dr|2dr|4d|2d)\y', ' ', 'g'),
           '\y(all[- ]wheel drive|rear[- ]wheel drive|front[- ]wheel drive|awd|rwd|fwd|4wd|4x4|dual motor|single motor)\y', ' ', 'g'),
           '\s+', ' ', 'g')) as norm
  from listings
  where delisted_at is null
    and vin is not null and length(vin) = 17
    and vehicle_trim is not null and btrim(vehicle_trim) <> ''
    -- The same window askVsSold and askVsMarket work in, so the evidence is
    -- drawn from the cars the guardrail is actually protecting.
    and mileage between 2000 and 200000
    and price_usd between 1000 and 250000
),
kept as (
  select * from base
  where norm <> '' and length(norm) <= 24
    and norm !~ '^(n/?a|none|other|unknown|electric|ev|base|standard equipment|[0-9]+)$'
    -- A cab style is not a version. Every Lightning is a SuperCrew, so letting
    -- these through would read one cohort as two.
    and norm !~ '^(super ?crew( cab)?|super ?cab|crew cab|regular cab|extended cab|double cab|quad cab|king cab)$'
),
-- Level every ask to the cohort's own median mileage, so a cheap-looking
-- version isn't just the one that happens to be listed with more miles on it.
levelled as (
  select k.vin8, k.model_year, k.norm,
         k.ask + (-0.09) * (c.med_mi - k.mi) as ask_level
  from kept k
  join (
    select vin8, model_year,
           percentile_cont(0.5) within group (order by mi) as med_mi
    from kept group by 1, 2
  ) c using (vin8, model_year)
),
per_trim as (
  select vin8, model_year, norm,
         count(*) as n,
         percentile_cont(0.5) within group (order by ask_level) as med
  from levelled
  group by 1, 2, 3
)
select vin8,
       model_year,
       count(*)::int                          as trims_seen,
       round((max(med) - min(med))::numeric, 0) as trim_span_usd
from per_trim
group by 1, 2;

-- Unique key so the nightly refresh can run CONCURRENTLY and never blocks a
-- reader, same as vin_variant_observed.
create unique index ev_cohort_trim_spread_key on ev_cohort_trim_spread (vin8, model_year);

grant select on ev_cohort_trim_spread to anon, authenticated;

comment on materialized view ev_cohort_trim_spread is
  'Per VIN(1-8)+model year: how many distinct versions our live inventory shows, and how far apart the cheapest and dearest of them ask once levelled to the cohort median mileage. Evidence about whether ev_price_model''s line describes one car or a mixture. Refreshed nightly by refresh_vin_variants().';

-- ── ev_price_model publishes the span ──────────────────────────────────────
-- The measurement lives here; the POLICY (how wide is too wide) stays in
-- lib/listings/comps.ts next to the other guardrails, held against each
-- cohort's own resid_medae_usd rather than a global number.
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
         min(price) as sale_lo,
         max(price) as sale_hi
  from arms_length
  group by 1, 2
  having count(*) >= 12
),
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
         percentile_cont(0.05) within group (order by odo)   as odo_lo,
         percentile_cont(0.95) within group (order by odo)   as odo_hi
  from core
  group by 1, 2
  having count(*) >= 8
),
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
       -- No live listings for this cohort means no evidence of a mixture, not
       -- evidence of none. Zero is the permissive reading and the honest one:
       -- the guardrail can only speak from what inventory shows.
       coalesce(s.trims_seen, 0)          as trims_seen,
       coalesce(s.trim_span_usd, 0)       as trim_span_usd,
       round(r.medae::numeric, 0)         as resid_medae_usd
from guarded g
join resid r using (vin8, model_year)
join bounds b using (vin8, model_year)
left join ev_cohort_trim_spread s using (vin8, model_year)
where r.medae <= 0.15 * g.median_price;

comment on view ev_price_model is
  'Fair-price coefficients per VIN(1-8) variant and model year, fitted on the middle 80% of arms-length Washington title sales. price = intercept_usd + usd_per_mile*odometer, valid ONLY for odometer between odo_lo and odo_hi. sale_lo/sale_hi are the cheapest and dearest this cohort actually sold for. trim_span_usd is how far apart the versions in this cohort ASK in live inventory — when it clears resid_medae_usd the line describes a mixture, not a car, and must not be quoted. Hold any delta against resid_medae_usd. Derived statistics; attribute WA DOL / ODbL where rendered.';

grant select on ev_price_model to anon, authenticated;

-- ── Refresh ────────────────────────────────────────────────────────────────
-- Extends 0020's nightly call rather than adding a second one, so the two
-- inventory-derived tables can never drift a day apart from each other.
create or replace function refresh_vin_variants()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  refresh materialized view concurrently vin_variant_observed;
  refresh materialized view concurrently ev_cohort_trim_spread;
  return jsonb_build_object(
    'refreshed',   (select count(*) from vin_variant_observed),
    'trim_spread', (select count(*) from ev_cohort_trim_spread)
  );
end;
$$;

revoke execute on function refresh_vin_variants() from public, anon, authenticated;
