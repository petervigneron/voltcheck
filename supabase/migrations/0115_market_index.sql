-- The public market page (/market): one read that says where used-EV asking
-- prices stand and how they have moved, for the whole site and per model.
--
-- Why it exists. The owner (2026-11-10) wants traffic that does not depend
-- on him posting links. The pages that earn search impressions today sit at
-- positions 20-85 because nothing outside the site links to it; a page of
-- citable numbers is the thing other people link on their own. Everything it
-- prints was already being computed nightly for the Pro trend block — this
-- is the aggregate of that, not a new model.
--
-- What it returns (jsonb):
--   asOf    the last CLOSED day in ev_price_trend_ask_daily
--   site    ev_price_trend_site_daily as [{d, i, c}] — the chained site-wide
--           index (0072/0073), 1.0 on 2026-08-15
--   models  one row per model-level used cohort with >= 50 cars:
--             cohort  lower(make) || ' ' || folded model — the 0061 key
--             cars    cars behind the last week's daily medians (avg n)
--             ask     n-weighted mean of the model years' standard-car
--                     asking prices (each already moved to 40,000 mi)
--             c30/c60 percent change against the week ending 30 / 60 days
--                     before asOf, n-weighted across model years
--             s30/s60 the share of the model's cars that change was read
--                     from; the page prints a change only at >= 0.5
--
-- The three guards on a change, each for a failure already seen on this
-- site (0057's header, and the Polestar 2 read on 2026-11-10):
--   * week against week, not day against day — one dealer repricing a lot
--     overnight moves a daily median;
--   * a model year counts only with >= 8 cars at BOTH ends and >= 4 days of
--     data in each week;
--   * and only if its car count stayed within half-to-double. The 2024
--     Polestar 2 went from 263 to 569 listed cars in 60 days as lease
--     returns reached the lanes we crawl; a median over a cohort that
--     doubled is a statement about which cars arrived, not about what a
--     given car is asked. Coverage growth must never read as a market move.
-- A model whose surviving years hold under half its cars gets no figure.
--
-- ASKING prices, never sold or "worth". Model years are pooled by weight,
-- so `ask` drifts when the year mix does — it is a level for the table, and
-- the CHANGE columns are computed within model year for exactly that reason.
--
-- Cost: ~270 ms measured (index scan of level='model', ~67k rows), once a
-- day behind a cached fetch. Security definer because the trend tables are
-- readable by no public role (0064/0072); this function is their only
-- aggregate door, as price_trend() is their only per-car door.
create or replace function market_index()
returns jsonb
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  with d as (
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
    'models', (select jsonb_agg(to_jsonb(m) order by m.cars desc) from m)
  )
  from d;
$$;

revoke all on function market_index() from public;
grant execute on function market_index() to anon, authenticated;
