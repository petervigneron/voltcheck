-- The listing page now shows a short list of recent same-make/model sales
-- instead of aggregate comps. The ODbL posture from 0003/0007 is unchanged:
-- anon gets a produced-work-sized excerpt — at most 10 rows, fixed ordering,
-- no pagination or free-form filters — never the derived database. Raw
-- table reads stay revoked (0007).

create or replace function recent_sales(_make text, _model text)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'modelYear', t.model_year,
    'salePrice', t.sale_price,
    'odometer', t.odometer,
    'saleDate', t.sale_date
  ) order by t.sale_date desc, t.id desc), '[]'::jsonb)
  from (
    select model_year, sale_price, odometer, sale_date, id
    from wa_ev_sales
    where lower(make) = lower(_make) and lower(model) = lower(_model)
      -- The state's figure is a declared price; under $5,000 is dominated
      -- by family transfers, not market sales.
      and sale_price >= 5000
      and odometer is not null
    order by sale_date desc, id desc
    limit 10
  ) t;
$$;

grant execute on function recent_sales(text, text) to anon, authenticated;

-- The aggregate-comps RPC has no callers now that the page lists sales
-- directly; anon-executable surface nothing uses should not stay open.
drop function if exists wa_price_comps(text, text, int, int, int);
