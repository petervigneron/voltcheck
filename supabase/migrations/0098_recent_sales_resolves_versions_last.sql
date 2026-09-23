-- recent_sales resolves versions for the ten rows it returns, not the band.
--
-- 2026-09-23, 18:55 UTC: 32 statement timeouts in the postgres log since
-- 16:19, every one of them `SQL function "recent_sales" statement 1` under
-- PostgREST — the anon role's 3-second cap, on listing-page renders. 0096
-- (same day) wrapped the band in a CTE and counted the car's own version
-- across it, and that count forced the whole band through the vin_variant
-- join — the join 0020 and 0022 already record as the thing that pushes
-- this function past the timeout on high-volume nameplates. 0047's shape
-- let the planner resolve versions only for the rows the LIMIT kept.
--
-- Now the band and the own-version count read wa_ev_sales alone (the
-- same-version test is on the sale's VIN prefix, no join needed), the ten
-- rows are picked, and vin_variant is joined to those ten. Same answer as
-- 0096, same cost as 0047.

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
    select s.id, s.model_year, s.sale_price, s.odometer, s.sale_date, s.vin_prefix,
           (_vin8 is not null
              and variant_key(substring(s.vin_prefix, 1, 8)) = variant_key(_vin8))
             as same_variant
    from wa_ev_sales s
    where lower(s.make) = lower(_make) and lower(s.model) = lower(_model)
      and s.sale_price >= 5000
      and s.odometer is not null
      and (_year is null or abs(s.model_year - _year) <= 2)
      and (_odometer is null
           or abs(s.odometer - _odometer) <= greatest(15000, _odometer * 0.35))
  ),
  own as (select count(*) as n from band where same_variant),
  pick as (
    select b.*
    from band b, own
    where own.n < 3 or b.same_variant
    order by b.same_variant desc, b.sale_date desc, b.id desc
    limit 10
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'modelYear',    p.model_year,
    'salePrice',    p.sale_price,
    'odometer',     p.odometer,
    'saleDate',     p.sale_date,
    'variant',      case
                      when v.trim is null then v.range_tier
                      when v.range_tier is null then v.trim
                      when v.trim ~* '\y(extended|standard|long|short|extra)[[:space:]-]+range\y'
                        then v.trim
                      else v.trim || ' ' || v.range_tier
                    end,
    'sameVariant',  p.same_variant
  ) order by p.same_variant desc, p.sale_date desc, p.id desc), '[]'::jsonb)
  from pick p
  left join vin_variant v
    on v.vin8 = upper(substring(p.vin_prefix, 1, 8))
   and v.model_year = p.model_year;
$$;

grant execute on function recent_sales(text, text, text, int, numeric) to anon, authenticated;
