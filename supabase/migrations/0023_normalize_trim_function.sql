-- One trim normalizer, called twice, instead of two that drifted.
--
-- Dealer trim strings are the same fact in a dozen spellings ("Long Range",
-- "Long Range AWD", "Model 3 Long Range Dual Motor All-Wheel Drive"). Folding
-- them is what lets a VIN cohort's agreement show. Three places do it:
--
--   web/lib/listings/enrich.ts   cleanTrim()/specTrim() — the facet chips and
--                                the ask-side peer key. TypeScript, and it
--                                stays that way; it runs per listing in the
--                                browse index and has maker-specific rules
--                                (Rivian tiers, Porsche type codes) that only
--                                matter for display.
--   0016/0020 vin_variant_observed
--   0022      ev_cohort_trim_spread
--
-- The two SQL copies were written five hours apart and were already different:
-- 0022 dropped the model-name-prefix strip and the non-alphanumeric cleanup
-- that 0020 has. So "Model 3 Long Range" and "Long Range" counted as two
-- versions of the same car, and a feed's mojibake ("350 4MATICÂ®") counted as a
-- third. In ev_cohort_trim_spread that inflates trims_seen and the span, which
-- makes askVsSold quieter than the evidence warrants — the safe direction, and
-- still wrong. That is the drift this collapses, and the reason to collapse it
-- now rather than after a third copy exists.
--
-- The TypeScript/SQL split is NOT closed here and cannot be: one runs per
-- listing at index build, the other over the whole table in Postgres. What
-- this removes is the drift between the two SQL copies, which is the pair that
-- has to agree — they read the same column for the same purpose.
--
-- IMMUTABLE and no table access, so a materialized view can call it per row
-- without giving up the plan it would otherwise get.

create or replace function normalize_trim(_raw text, _model text default null)
returns text
language sql
immutable
parallel safe
set search_path = pg_catalog, pg_temp
as $$
  select nullif(btrim(regexp_replace(
    regexp_replace(
    regexp_replace(
    regexp_replace(
    regexp_replace(
    regexp_replace(lower(btrim(regexp_replace(_raw, '\s+', ' ', 'g'))),
      -- The model name restated at the front ("Model 3 Long Range"). Escaped,
      -- because model strings carry regex metacharacters ("ID. Buzz", "C-HR").
      -- Null model skips the pass rather than matching everything.
      case when _model is null or btrim(_model) = '' then '$^'
           else '^' || lower(regexp_replace(_model, '([.^$*+?()\[\]{}|\\-])', '\\\1', 'g')) || '\s*' end, '', 'g'),
      -- Packaging bolted on after a separator: wheels, roofs, "w/ Premium Pkg".
      -- The spaced dash is a separator ("GT - Rally"); the tight one is
      -- spelling ("GT-Line"), and cutting there would merge every Kia trim.
      '\s*([,|/]|\s-\s|\sw/|\swith\s).*$', '', 'g'),
      -- Drivetrain: carried by its own column, never the version's identity.
      '\y(all[- ]wheel drive|rear[- ]wheel drive|front[- ]wheel drive|awd|rwd|fwd|4wd|4x4|dual motor|single motor)\y', ' ', 'g'),
      -- Body class appended by the feed ("Performance Sport Utility 4D").
      '\y(sports? activity vehicles?|sport utility vehicles?|sport utility|hatchback|gran coupe|sedan|sdn|coupe|suv|crossover|wagon|pickup|trucks?|vehicles?|4dr|2dr|4d|2d)\y', ' ', 'g'),
      -- Entities, mojibake and punctuation the feeds leak ("350 4MATICÂ®",
      -- "EVOLVE&#x2B;"). "+" and "-" survive: they are trim identity
      -- ("EVOLVE+", "GT-Line").
      '[^a-z0-9+ -]', ' ', 'g'),
      '\s+', ' ', 'g')), '');
$$;

comment on function normalize_trim(text, text) is
  'Dealer trim string -> comparable form. Mirrors cleanTrim() in web/lib/listings/enrich.ts; the SQL callers (vin_variant_observed, ev_cohort_trim_spread) must both use THIS and never their own copy. Null/empty out means nothing survived.';

-- Whether a normalized trim is a version at all. Split from the fold because
-- both callers apply it and both got it slightly differently worded.
create or replace function is_real_trim(_norm text)
returns boolean
language sql
immutable
parallel safe
set search_path = pg_catalog, pg_temp
as $$
  select _norm is not null
     and _norm <> ''
     and length(_norm) <= 24
     -- Feed placeholders, fuel type, and free text that isn't a trim.
     and _norm !~ '^(n/?a|none|other|unknown|electric|ev|base|standard equipment|[0-9]+)$'
     and _norm !~ '^(with autopilot|full self-?driving.*|clean title.*|pano roof)$'
     -- A cab style is not a trim. Every Lightning is a SuperCrew, so letting
     -- this through would name 62% of 2023 Lightning cohorts "SuperCrew" — a
     -- confident answer to the wrong question.
     and _norm !~ '^(super ?crew( cab)?|super ?cab|crew cab|regular cab|extended cab|double cab|quad cab|king cab)$';
$$;

comment on function is_real_trim(text) is
  'Does a normalize_trim() output name a version of the car? Mirrors TRIM_JUNK/CAB_STYLES in web/lib/listings/enrich.ts.';

-- ── Both callers, rebuilt on the shared pair ───────────────────────────────
-- vin_variant_observed keeps its logic exactly: same folding as 0020, same
-- n>=6 floor and 75% agreement bar. Only the duplication goes.
drop materialized view if exists vin_variant_observed cascade;

create materialized view vin_variant_observed as
with base as (
  select upper(substring(vin, 1, 8)) as vin8,
         year as model_year,
         btrim(regexp_replace(vehicle_trim, '\s+', ' ', 'g')) as raw,
         normalize_trim(vehicle_trim, model) as norm
  from listings
  where vin is not null and length(vin) = 17
    and delisted_at is null
    and vehicle_trim is not null and btrim(vehicle_trim) <> ''
),
kept as (select * from base where is_real_trim(norm)),
tally as (
  select vin8, model_year, norm, count(*) as n,
         (array_agg(raw order by cnt desc, raw))[1] as label
  from (select vin8, model_year, norm, raw,
               count(*) over (partition by vin8, model_year, norm, raw) cnt from kept) k
  group by vin8, model_year, norm
),
ranked as (
  select *, sum(n) over (partition by vin8, model_year) as total,
         row_number() over (partition by vin8, model_year order by n desc, norm) as rk
  from tally
)
select vin8, model_year, label as trim, n as agree_n, total as observed_n,
       round(n::numeric / total, 3) as agree_share
from ranked
where rk = 1
  -- Six listings is the floor: below it one dealer's data entry is the whole
  -- cohort. 75% accepts Tesla's VIN-position-8 split (96-100% across years)
  -- and rejects the 2019 Model 3 (56%) and the 2022-23 Lightning (41%).
  and n >= 6
  and n::numeric / total >= 0.75;

create unique index vin_variant_observed_key on vin_variant_observed (vin8, model_year);
grant select on vin_variant_observed to anon, authenticated;

comment on materialized view vin_variant_observed is
  'VIN(1-8)+model year -> the version our own live listings agree on: >=75% agreement across >=6 listings, refreshed nightly. Null means the VIN does not encode one; render it as Unknown, never as a cab style.';

-- vin_variant was dropped by the cascade above; same definition as 0016/0020.
create or replace view vin_variant
with (security_invoker = true) as
select coalesce(v.vin8, o.vin8)             as vin8,
       coalesce(v.model_year, o.model_year) as model_year,
       coalesce(v.trim, o.trim)             as trim,
       case when v.trim is not null then 'vpic'
            when o.trim is not null then 'observed'
            else null end                   as trim_source,
       v.spec,
       v.drive
from vin_variant_vpic v
full outer join vin_variant_observed o
  on o.vin8 = v.vin8 and o.model_year = v.model_year;

grant select on vin_variant to anon, authenticated;

comment on view vin_variant is
  'VIN(1-8)+model year -> version name. vpic = NHTSA manufacturer filing; observed = >=75% agreement across >=6 live listings. Null trim means the VIN does not encode one; render it as Unknown, never as a cab style.';

-- ev_cohort_trim_spread gains what 0022 was missing: the model-prefix strip and
-- the punctuation cleanup. It will see FEWER versions per cohort, which makes
-- askVsSold speak on cohorts it was silencing over spelling.
--
-- ev_price_model reads it, so that view comes down first and goes back up
-- unchanged below — 0022's definition, character for character.
drop view if exists ev_price_model;
drop materialized view if exists ev_cohort_trim_spread;

create materialized view ev_cohort_trim_spread as
with base as (
  select upper(substring(vin, 1, 8)) as vin8,
         year as model_year,
         price_usd::numeric as ask,
         mileage::numeric   as mi,
         normalize_trim(vehicle_trim, model) as norm
  from listings
  where delisted_at is null
    and vin is not null and length(vin) = 17
    and vehicle_trim is not null and btrim(vehicle_trim) <> ''
    and mileage between 2000 and 200000
    and price_usd between 1000 and 250000
),
kept as (select * from base where is_real_trim(norm)),
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
       count(*)::int                            as trims_seen,
       round((max(med) - min(med))::numeric, 0)  as trim_span_usd
from per_trim
group by 1, 2;

create unique index ev_cohort_trim_spread_key on ev_cohort_trim_spread (vin8, model_year);
grant select on ev_cohort_trim_spread to anon, authenticated;

comment on materialized view ev_cohort_trim_spread is
  'Per VIN(1-8)+model year: how many distinct versions our live inventory shows, and how far apart the cheapest and dearest of them ask once levelled to the cohort median mileage. Evidence about whether ev_price_model''s line describes one car or a mixture. Refreshed nightly by refresh_vin_variants().';

-- ── ev_price_model, restored ───────────────────────────────────────────────
-- Identical to 0022's definition. It is restated only because its dependency
-- was rebuilt above; no coefficient, guardrail or column changes here.
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
