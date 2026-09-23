-- The "Recently sold" list under a car is sales of that car's own version.
--
-- 2026-09-23. Owner, on a 2022 F-150 Lightning Extended Range at 92,332 mi
-- (1FT6W1EV4NWG06358): the list under it held five Standard Range sales,
-- labelled, next to five Extended Range ones. Labelled or not, a Standard
-- Range truck is not a comp for an Extended Range one — the pack is $8,000
-- of the price — and ten mixed rows read as the truck's market.
--
-- Two things were wrong in recent_sales (0047):
--
--   1. "Same version" was VIN(1-8) equality. Ford's position 4 is a GVWR
--      class, not identity: 1FT6W1EV and 1FTVW1EV are the same Extended
--      Range truck, and lib/listings/comps.ts askCohortFetchPattern already
--      masks that digit for the asking-price cohort (and position 8 for
--      Rivian's A/L pairs). The sold list used the narrower key, so half of
--      a Lightning's own-pack sales counted as "other versions".
--   2. The list was always the ten most recent sales in the band, same
--      version first. A nameplate sells more of its cheaper pack, so the
--      ten filled with the other pack whenever the car's own pack had
--      fewer than ten in the window.
--
-- Now: variant_key() applies the same masking as the ask cohort, and when
-- the car's own version has at least three sales in the year/odometer band
-- the list is those sales only (ten at most). With fewer than three, the
-- mixed list stays, as before — the component labels the two groups and
-- the chart draws the other pack's sales hollow, which is the honest shape
-- when there is not enough of the car's own version to stand on.
--
-- Control (run after apply, anon key, through the RPC the page calls):
--   1FT6W1EV4NWG06358 (2022 ER, 92k) — before: 5 same + 5 Standard Range;
--   after: same-pack rows only, "Extended Range" in every variant.

create or replace function variant_key(_vin8 text)
returns text
language sql
immutable
as $$
  select case
    when upper(_vin8) like '1FT%' then substr(upper(_vin8), 1, 3) || '_' || substr(upper(_vin8), 5, 4)
    when (upper(_vin8) like '7FC%' or upper(_vin8) like '7PD%') and substr(upper(_vin8), 8, 1) in ('A', 'L')
      then substr(upper(_vin8), 1, 7) || '_'
    else upper(_vin8)
  end
$$;

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
  with band as (
    select s.model_year, s.sale_price, s.odometer, s.sale_date, s.id,
           case
             when v.trim is null then v.range_tier
             when v.range_tier is null then v.trim
             when v.trim ~* '\y(extended|standard|long|short|extra)[[:space:]-]+range\y'
               then v.trim
             else v.trim || ' ' || v.range_tier
           end as variant,
           (_vin8 is not null
              and variant_key(substring(s.vin_prefix, 1, 8)) = variant_key(_vin8))
             as same_variant
    from wa_ev_sales s
    left join vin_variant v
      on v.vin8 = upper(substring(s.vin_prefix, 1, 8))
     and v.model_year = s.model_year
    where lower(s.make) = lower(_make) and lower(s.model) = lower(_model)
      and s.sale_price >= 5000
      and s.odometer is not null
      and (_year is null or abs(s.model_year - _year) <= 2)
      and (_odometer is null
           or abs(s.odometer - _odometer) <= greatest(15000, _odometer * 0.35))
  ),
  own as (select count(*) as n from band where same_variant)
  select coalesce(jsonb_agg(jsonb_build_object(
    'modelYear',    t.model_year,
    'salePrice',    t.sale_price,
    'odometer',     t.odometer,
    'saleDate',     t.sale_date,
    'variant',      t.variant,
    'sameVariant',  t.same_variant
  ) order by t.same_variant desc, t.sale_date desc, t.id desc), '[]'::jsonb)
  from (
    select b.*
    from band b, own
    where own.n < 3 or b.same_variant
    order by b.same_variant desc, b.sale_date desc, b.id desc
    limit 10
  ) t;
$$;

grant execute on function recent_sales(text, text, text, int, numeric) to anon, authenticated;
