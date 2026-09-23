-- recent_sales counts the car's own version once, not once per sale.
--
-- 2026-09-23, 19:05 UTC, an hour after 0098. Timed through the anon key:
-- Model Y still answered 500 (3.2 s against the 3 s cap) and Model 3 took
-- 2.7 s. EXPLAIN ANALYZE showed why: the planner estimated the band CTE at
-- one row and put the own-version count on the inner side of a nested
-- loop, so for a Model Y band of 5,718 sales it re-counted the band 5,718
-- times — 32 million row visits, 5.9 s. 0096 and 0098 carried the same
-- shape; the nightly's timeouts in the postgres log since 16:19 are this.
--
-- The count is now a window aggregate over the band, computed once. Same
-- band, same pick, same answer; Model Y in 236 ms.

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
  counted as (
    select b.*, count(*) filter (where b.same_variant) over () as own_n
    from band b
  ),
  pick as (
    select c.*
    from counted c
    where c.own_n < 3 or c.same_variant
    order by c.same_variant desc, c.sale_date desc, c.id desc
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
