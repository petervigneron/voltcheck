-- /market gets the half of the story 0115 left out: what cars SOLD for.
--
-- 0115 shipped the site-wide ASKING index, which only starts 2026-08-15, and
-- the page led with its figure: -5.0% to 2026-11-08. The owner read it the
-- same day and said it contradicted everything in the press, where used-EV
-- prices had been rising all year on the Iran war and gas prices. Both are
-- true, and the page could not show it: Washington title sales (reloaded
-- the same day, 0033's table) put the same model and model year at +5.0% in
-- April, +3.0% in May, +2.1% in June, then -0.4% in July and -0.3% in
-- August. The asking archive begins after the peak. A number that is right
-- for its window and wrong for the year is the wrong headline.
--
-- This adds `sold` to market_index(): one row per month,
--   m        the month
--   pct      percent change from the month before
--   cohorts  how many model + model-year cohorts the change was read from
--   sales    arms-length sales in the month (the n the page prints)
--
-- How a month's change is read, and why:
--   * Original Title only, odometer 2,000-150,000, $5,000-$130,000 — the
--     arms-length bucket 0014 and 0061 already train on; Transfer Title is
--     family transfers and nominal prices.
--   * Each sale is moved to its cohort's median odometer along the cohort's
--     own fitted slope (n >= 30 and negative, floored at -$0.50/mi; else the
--     -$0.09/mi default 0061 uses), so a month of higher-mileage cars does
--     not read as a price drop.
--   * A cohort is one model in one model year. Its median this month over
--     its median last month, n >= 8 in both; the month's figure is those
--     ratios weighted by the smaller n. Chaining them is the page's job.
--   * A month is published only if its sale count is at least 70% of the
--     median of the six months before it. The state's newest month arrives
--     about a third complete (title processing lags the sale), and the
--     early third is not a random third: September 2026 read -2.3% on 565
--     sales against a usual ~1,600. It appears when it fills in.
--   * At least 15 cohorts, or no figure.
--
-- What this is NOT: an age-adjusted index. A cohort is a fixed model year,
-- so every month carries one month of ordinary ageing — the reason the
-- series drifts down 1-2% a month through late 2024 and why a +5% month is
-- a large move. The page says "same model and model year"; it does not say
-- "used EV prices rose X%" as if that were Manheim's constant-age figure.
--
-- Washington only: it is the one state that publishes sale prices. Cost:
-- the sold half measured 350 ms over ~32,600 rows (index scan on sale_date),
-- so the whole function is ~0.6 s, once a day behind the page's cached
-- fetch. The asking half is 0115's, unchanged.
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
    'sold', (select jsonb_agg(jsonb_build_object('m', s.m, 'pct', s.pct, 'cohorts', s.cohorts, 'sales', s.sales) order by s.m) from sold s)
  )
  from d;
$$;

revoke all on function market_index() from public;
grant execute on function market_index() to anon, authenticated;
