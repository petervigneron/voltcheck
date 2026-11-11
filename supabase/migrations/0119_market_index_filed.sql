-- /market gets sold prices from outside Washington: `filed`, one row per
-- quarter, read from retail_filed_sales (0118).
--
--   q        first day of the quarter
--   pct      percent change from the quarter before
--   cohorts  model + model-year cohorts the change was read from
--   sales    sales in the quarter (the n the page prints)
--
-- QUARTERS, NOT MONTHS, and that was measured rather than chosen. The table
-- holds about 400 used plug-in sales a month across every model; at 0116's
-- bar of eight sales per cohort per month, two to thirteen cohorts survive
-- and the monthly figure swings between -7.2% and +4.1% on nothing. Pooled
-- by quarter, 15 to 33 cohorts survive.
--
-- The check that it measures something: the same quarterly calculation run
-- on Washington's title sales (a different source, every seller, one state)
-- correlates 0.85 with this one over 34 quarters, 2018-Q2 to 2026-Q3. Both
-- show the 2021 run-up (+9.4% here, +11.0% in Washington, 2021-Q2), the
-- early-2023 fall (-19.3% / -16.6%) and the spring 2026 rise (+4.3% /
-- +6.6%). They are not the same number and the page must not present them
-- as one: this is ONE retailer with fixed prices and financed buyers.
--
-- How a quarter's change is read:
--   * used cars, $5,000-$130,000;
--   * a cohort is one model in one model year; its median this quarter over
--     its median last quarter, n >= 8 in both; the quarter's figure is those
--     ratios weighted by the smaller n;
--   * at least 10 cohorts AND at least 300 matched sales behind the figure,
--     or no figure. The bar is lower than 0116's fifteen cohorts because a
--     quarter's cohorts are each three times deeper; 300 matched sales is
--     the part that carries the weight. At these bars the unbroken run
--     starts in 2020-Q4;
--   * a quarter is published only if its sale count is at least 70% of the
--     median of the four quarters before it. A sale reaches the table only
--     once its loan has been filed, so the newest quarter arrives short:
--     2026-Q3 had 739 sales against a usual ~1,100 and is withheld.
--
-- NOT mileage-adjusted: the source has no odometer. And, like 0116, not
-- age-adjusted: a cohort is a fixed model year, so every quarter carries
-- three months of ordinary ageing and the chained line trends down.
--
-- The function is security definer and returns aggregates only; the table
-- itself stays closed (RLS, no policy). Everything else in the function is
-- 0116's, character for character.
create or replace function market_index()
returns jsonb
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  with sb as (
    select lower(make) || ' ' || lower(model) as k, model_year, sale_date,
           sale_price::numeric as p, odometer::numeric as o
    from wa_ev_sales
    where transaction_type = 'Original Title'
      and odometer between 2000 and 150000
      and sale_price between 5000 and 130000
      and sale_date >= (date_trunc('month', current_date) - interval '30 months')::date
  ),
  sf as (
    select k, model_year, count(*) as n, regr_slope(p, o) as sl,
           percentile_cont(0.5) within group (order by o) as std
    from sb group by 1, 2
  ),
  sa as (
    select b.k, b.model_year, date_trunc('month', b.sale_date)::date as m,
           b.p - (case when f.n >= 30 and f.sl < 0 then greatest(f.sl, -0.5) else -0.09 end) * (b.o - f.std) as pa
    from sb b join sf f using (k, model_year)
  ),
  sm as (
    select k, model_year, m, percentile_cont(0.5) within group (order by pa) as med, count(*) as n
    from sa group by 1, 2, 3 having count(*) >= 8
  ),
  sp as (
    select a.m, a.med / b.med - 1 as chg, least(a.n, b.n) as w
    from sm a join sm b on b.k = a.k and b.model_year = a.model_year and b.m = (a.m - interval '1 month')::date
  ),
  st as (
    select date_trunc('month', sale_date)::date as m, count(*) as sales from sb group by 1
  ),
  sx as (
    select st.m, st.sales,
           percentile_cont(0.5) within group (order by st2.sales) as usual
    from st join st st2 on st2.m < st.m and st2.m >= (st.m - interval '6 months')::date
    group by 1, 2
  ),
  sold as (
    select sp.m, round((100 * sum(sp.chg * sp.w) / sum(sp.w))::numeric, 2) as pct,
           count(*) as cohorts, max(sx.sales) as sales
    from sp join sx using (m)
    where sx.sales >= 0.7 * sx.usual
    group by 1
    having count(*) >= 15
  ),
  fb as (
    select lower(make) || ' ' || lower(model) as k, model_year,
           date_trunc('quarter', sold_month)::date as q, price_usd::numeric as p
    from retail_filed_sales
    where condition = 'used' and price_usd between 5000 and 130000
      and sold_month >= date '2018-01-01'
  ),
  fm as (
    select k, model_year, q, percentile_cont(0.5) within group (order by p) as med, count(*) as n
    from fb group by 1, 2, 3 having count(*) >= 8
  ),
  fp as (
    select a.q, a.med / b.med - 1 as chg, least(a.n, b.n) as w
    from fm a join fm b on b.k = a.k and b.model_year = a.model_year and b.q = (a.q - interval '3 months')::date
  ),
  ft as (
    select q, count(*) as sales from fb group by 1
  ),
  fx as (
    select ft.q, ft.sales,
           percentile_cont(0.5) within group (order by ft2.sales) as usual
    from ft join ft ft2 on ft2.q < ft.q and ft2.q >= (ft.q - interval '12 months')::date
    group by 1, 2
  ),
  filed as (
    select fp.q, round((100 * sum(fp.chg * fp.w) / sum(fp.w))::numeric, 2) as pct,
           count(*) as cohorts, max(fx.sales) as sales
    from fp join fx using (q)
    where fx.sales >= 0.7 * fx.usual
    group by 1
    having count(*) >= 10 and sum(fp.w) >= 300
  ),
  d as (
    select max(day) as d1 from ev_price_trend_ask_daily where level = 'model' and cond = 'used'
  ),
  w as (
    select a.cohort, a.model_year,
      avg(a.price_usd) filter (where a.day > d.d1 - 7) as p_now,
      avg(a.n)         filter (where a.day > d.d1 - 7) as n_now,
      count(*)         filter (where a.day > d.d1 - 7) as k_now,
      avg(a.price_usd) filter (where a.day <= d.d1 - 30 and a.day > d.d1 - 37) as p_30,
      avg(a.n)         filter (where a.day <= d.d1 - 30 and a.day > d.d1 - 37) as n_30,
      count(*)         filter (where a.day <= d.d1 - 30 and a.day > d.d1 - 37) as k_30,
      avg(a.price_usd) filter (where a.day <= d.d1 - 60 and a.day > d.d1 - 67) as p_60,
      avg(a.n)         filter (where a.day <= d.d1 - 60 and a.day > d.d1 - 67) as n_60,
      count(*)         filter (where a.day <= d.d1 - 60 and a.day > d.d1 - 67) as k_60
    from ev_price_trend_ask_daily a, d
    where a.level = 'model' and a.cond = 'used' and a.n >= 4 and a.day > d.d1 - 67
    group by 1, 2
  ),
  y as (
    select w.*,
      (k_30 >= 4 and n_now >= 8 and n_30 >= 8 and n_now between n_30 * 0.5 and n_30 * 2) as ok30,
      (k_60 >= 4 and n_now >= 8 and n_60 >= 8 and n_now between n_60 * 0.5 and n_60 * 2) as ok60
    from w
    where k_now >= 4
  ),
  m as (
    select cohort,
      round(sum(n_now))::int as cars,
      round(sum(p_now * n_now) / sum(n_now))::int as ask,
      round((100 * sum((p_now / p_30 - 1) * n_now) filter (where ok30)
             / nullif(sum(n_now) filter (where ok30), 0))::numeric, 1) as c30,
      round((coalesce(sum(n_now) filter (where ok30), 0) / sum(n_now))::numeric, 2) as s30,
      round((100 * sum((p_now / p_60 - 1) * n_now) filter (where ok60)
             / nullif(sum(n_now) filter (where ok60), 0))::numeric, 1) as c60,
      round((coalesce(sum(n_now) filter (where ok60), 0) / sum(n_now))::numeric, 2) as s60
    from y
    group by 1
    having sum(n_now) >= 50
  )
  select jsonb_build_object(
    'asOf', d.d1,
    'site', (select jsonb_agg(jsonb_build_object('d', s.day, 'i', round(s.idx, 4), 'c', s.cars) order by s.day)
             from ev_price_trend_site_daily s),
    'models', (select jsonb_agg(to_jsonb(m) order by m.cars desc) from m),
    'sold', (select jsonb_agg(jsonb_build_object('m', s.m, 'pct', s.pct, 'cohorts', s.cohorts, 'sales', s.sales) order by s.m) from sold s),
    'filed', (select jsonb_agg(jsonb_build_object('q', f.q, 'pct', f.pct, 'cohorts', f.cohorts, 'sales', f.sales) order by f.q) from filed f)
  )
  from d;
$$;

revoke all on function market_index() from public;
grant execute on function market_index() to anon, authenticated;
