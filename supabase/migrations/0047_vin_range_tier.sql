-- Which PACK did it have? — the version axis the sold list was throwing away.
--
-- ── What was wrong ─────────────────────────────────────────────────────────
--
-- 0016 resolves VIN(1-8)+year to a version name and prints "Unknown" when the
-- VIN carries none. For the F-150 Lightning it always printed Unknown, and
-- that turned out to hide the single largest price split in the truck.
--
-- Reported by the owner against a real listing on 2026-08-23:
-- 1FT6W1EV0PWG57844, a 2023 Lightning Pro, 32,206 miles, asking $39,377 —
-- rated only a fair deal elsewhere. It is an EXTENDED RANGE truck, and the
-- detail page knew that (it renders 131 kWh and 320 mi from the enrichment
-- lane) while all ten of its sold comps underneath read "2023 version
-- unknown".
--
-- The cause is one field. vPIC's BatteryKWh is 98.00 for EVERY Lightning,
-- standard-range and extended-range alike — Ford filed the standard figure
-- against both — so vpic-variants.mjs recorded spec = "98 kWh" for the ER
-- cohort 1FT6W1EV and spec = "98 kWh" for the SR cohort 1FTVW1EL, and the
-- distinction died there. Verified against the manufacturer's own filing:
--
--   1FTVW1EL  "Dual Electric Motors with Standard Range Battery"  GVWR 8001-8500
--   1FT6W1EV  "Dual Electric Motors with Extended Range Battery"  GVWR 8501-9000
--   1FTVW1EV  "Dual Electric Motors with Extended Range Battery"
--
-- VIN position 8 is the discriminator (V extended, L standard), corroborated
-- two ways: every Platinum in our inventory — an extended-range-only trim —
-- is position-8 V, and the heavier GVWR band tracks the heavier pack.
--
-- What it is worth, measured rather than assumed. WA arms-length titles,
-- 2023 Lightning, 22-45k miles, Original Title only: extended range n=34,
-- median $46,336; standard range n=23, median $38,888 — at average odometers
-- within 1,000 miles of each other. Trim-controlled on our own live asks, Pro
-- only: extended-range Pros cluster $47.5-48.6k and barely decay with
-- mileage, standard-range Pros $37-41k. So the split is roughly $7,400-8,400
-- and the sold list was silent on all of it.
--
-- ── Why the free-text field, and why so little of it ───────────────────────
--
-- BatteryInfo is the vPIC field that answers, and it has no schema. Surveyed
-- across the 300 highest-volume cohorts in the feed: 83 return something, and
-- what they return includes "120.6Ah + FR 70kW + RR 160kW", "Onboard Charger:
-- 11.5 kW", "3 Phase A/C Induction", "Cell-to-Pack, 110 cells" and "Sealed
-- Lithium-ion (Li-ion)".
--
-- None of those is a version. Printing one in the slot where a version
-- belongs is exactly the failure 0016 was written against — it is the cab
-- style all over again, a confident answer to a question nobody asked. So the
-- rule is an allowlist, not a passthrough, and it is narrower than the
-- obvious one: the tier must be an adjective on the word BATTERY.
--
-- That extra word is there because of a false positive the loader's own dry
-- run caught before any of this shipped. Matching a bare "<tier> Range"
-- labelled the 2022 Bolt EUV "Long Range", off this:
--
--   "EFZ - PROPULSION ENERGY STORAGE PACK - PROPULSION BATTERY, LI, 5-MOD,
--    LONG RANGE, UNDERBODY (Drive System & Battery)"
--
-- which is a GM parts-catalog row, not a version name. "LONG RANGE" is GM's
-- internal descriptor for the ONLY pack a Bolt EUV has; there is no
-- short-range EUV to contrast with, so "Premier Long Range" would have
-- invented a distinction that does not exist and put it under a price. Ford
-- files "Extended Range Battery" and "Standard Range Battery", so requiring
-- the noun keeps every true hit and drops this one. The loader additionally
-- refuses anything opening with an RPO code and a dash, because nothing in
-- that format is a version name whatever words it contains.
--
-- Re-surveyed across 527 cohorts (the 300 highest-volume in the feed plus
-- every trim-null cohort in wa_ev_sales): 125 carry BatteryInfo, 21 name a
-- tier, and all 21 are correct — the Lightning, and the Mach-E, where a 2023
-- Premium splits across four VIN codes and both tiers. The other 104 are
-- ignored, and that is the intended answer, not a miss.
--
-- The extraction happens in scraper/vpic-variants.mjs, which writes the tier
-- into vin_variant_vpic.spec. The pattern is repeated in the view below on
-- purpose: spec is a free-text column, and the view is what a page reads, so
-- the view refuses to surface anything that is not tier-shaped no matter what
-- the loader put there. Belt and braces on the one column that reaches a
-- shopper.
--
-- No table DDL and no change to commit_monthly_load (0034/0037): the tier
-- rides in the existing spec column, which 0016 defined as "what the VIN
-- encodes about the powertrain when it encodes no trim" and which nothing has
-- ever read. Keeping the staged-load path untouched is deliberate — it is the
-- atomic monthly swap for wa_ev_sales as well, and this change does not need
-- to go near it.

-- ── The view ───────────────────────────────────────────────────────────────
-- range_tier is appended LAST. create or replace view may only add columns at
-- the end; inserting it beside spec would need a drop, and dropping this view
-- takes recent_sales with it.
create or replace view vin_variant
with (security_invoker = true) as
select coalesce(v.vin8, o.vin8)             as vin8,
       coalesce(v.model_year, o.model_year) as model_year,
       coalesce(v.trim, o.trim)             as trim,
       case when v.trim is not null then 'vpic'
            when o.trim is not null then 'observed'
            else null end                   as trim_source,
       v.spec,
       v.drive,
       -- Only a bare tier. spec also holds "98 kWh" and "580 hp", and those
       -- describe a version without naming one.
       case when v.spec ~* '^(extended|standard|long|short|extra)[[:space:]-]+range$'
            then v.spec end                 as range_tier
from vin_variant_vpic v
full outer join vin_variant_observed o
  on o.vin8 = v.vin8 and o.model_year = v.model_year;

grant select on vin_variant to anon, authenticated;

comment on view vin_variant is
  'VIN(1-8)+model year -> version name. vpic = NHTSA manufacturer filing; observed = >=75% agreement across >=6 of our own live listings. Null trim means the VIN does not encode one; render it as Unknown, never as a cab style. range_tier is the battery pack the manufacturer filed for the cohort ("Extended Range"), null unless vPIC named one — it is a SEPARATE axis from trim, not a fallback for it: a Mach-E Premium can be either tier and a Lightning names a tier with no trim at all.';

-- ── recent_sales, pack-aware ───────────────────────────────────────────────
-- Unchanged from 0038 except the variant expression: same band, same limit of
-- 10, same fixed ordering, same ODbL posture. Nothing here widens what the
-- anon key can extract.
--
-- The two axes combine rather than compete, because on the Mach-E they are
-- genuinely different questions — "Premium" does not say which pack, and
-- "Extended Range" does not say which trim. A cohort that knows both now
-- reads "Premium Extended Range".
--
-- The guard against a doubled label is narrow on purpose. It matches a tier
-- phrase, not the bare word "range", because Range Rover is a nameplate in
-- this dataset and suppressing the tier on every Land Rover would be a silent
-- hole.
create or replace function recent_sales(
  _make text,
  _model text,
  _vin8 text default null,
  _year int default null,
  _odometer numeric default null
)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'modelYear',    t.model_year,
    'salePrice',    t.sale_price,
    'odometer',     t.odometer,
    'saleDate',     t.sale_date,
    'variant',      t.variant,
    'sameVariant',  t.same_variant
  ) order by t.same_variant desc, t.sale_date desc, t.id desc), '[]'::jsonb)
  from (
    select s.model_year, s.sale_price, s.odometer, s.sale_date, s.id,
           case
             when v.trim is null then v.range_tier
             when v.range_tier is null then v.trim
             -- A dealer-sourced trim can already carry the pack ("XLT
             -- Extended Range"); appending ours would stutter.
             when v.trim ~* '\y(extended|standard|long|short|extra)[[:space:]-]+range\y'
               then v.trim
             else v.trim || ' ' || v.range_tier
           end as variant,
           (_vin8 is not null and upper(substring(s.vin_prefix, 1, 8)) = upper(_vin8))
             as same_variant
    from wa_ev_sales s
    left join vin_variant v
      on v.vin8 = upper(substring(s.vin_prefix, 1, 8))
     and v.model_year = s.model_year
    where lower(s.make) = lower(_make) and lower(s.model) = lower(_model)
      -- The state's figure is a declared price; under $5,000 is dominated
      -- by family transfers, not market sales.
      and s.sale_price >= 5000
      and s.odometer is not null
      and (_year is null or abs(s.model_year - _year) <= 2)
      and (_odometer is null
           or abs(s.odometer - _odometer) <= greatest(15000, _odometer * 0.35))
    order by (_vin8 is not null and upper(substring(s.vin_prefix, 1, 8)) = upper(_vin8)) desc,
             s.sale_date desc, s.id desc
    limit 10
  ) t;
$$;

grant execute on function recent_sales(text, text, text, int, numeric) to anon, authenticated;
