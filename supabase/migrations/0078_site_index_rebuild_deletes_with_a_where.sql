-- The site-index rebuild (0072/0073) deletes with a WHERE clause, so the
-- nightly advance stops failing.
--
-- Found 2026-09-09: the trend archive had stopped at 2026-09-06. The
-- 2026-09-08 nightly's refresh-variants step logged
--
--   refresh-variants: ev_price_trend_ask_daily FAILED HTTP 400 after 24.4s
--     — {"code":"21000","message":"DELETE requires a WHERE clause"}
--
-- rebuild_price_trend_site_daily() opened with `delete from
-- ev_price_trend_site_daily;`. The nightly reaches it through PostgREST
-- (refresh_vin_variants → advance_price_trend_ask_daily → rebuild), and the
-- API connection loads the safeupdate guard, which refuses an unqualified
-- DELETE even inside a security-definer function. The console this was
-- built and tested from is a superuser session with no such guard, so the
-- migration's own `select rebuild_price_trend_site_daily()` passed and the
-- one path that matters failed. Because the rebuild is the LAST statement
-- of the advance, the failure rolled back the day's rows too: two nights
-- of archive lost, restored by hand today.
--
-- The lesson for the file: a function the API role will call must be
-- exercised through the API role before it ships. `set role` in the
-- console does not load the guard; only a real PostgREST call does.

create or replace function rebuild_price_trend_site_daily()
returns bigint
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  _n bigint;
begin
  -- Qualified on purpose: the API connection refuses a bare DELETE (header).
  delete from ev_price_trend_site_daily where day is not null;
  insert into ev_price_trend_site_daily (day, cohorts, cars, idx)
  with d as (
    select cohort, model_year, day, n, price_usd
    from ev_price_trend_ask_daily
    where level = 'model' and cond = 'used' and n >= 4
  ),
  pair as (
    select a.day, a.n, ln(a.price_usd::numeric / b.price_usd) as dl
    from d a
    join d b on b.cohort = a.cohort and b.model_year = a.model_year and b.day = a.day - 1
    where abs(ln(a.price_usd::numeric / b.price_usd)) <= ln(1.20)
  ),
  step as (
    select day, count(*)::int as cohorts, sum(n)::int as cars, sum(n * dl) / sum(n) as dl
    from pair
    group by day
  ),
  chain as (
    select day, cohorts, cars, exp(sum(dl) over (order by day)) as idx
    from step
  ),
  base as (
    select day, count(*)::int as cohorts, sum(n)::int as cars, 1::numeric as idx
    from d
    where day = (select min(day) from d)
    group by day
  )
  select day, cohorts, cars, round(idx::numeric, 6) from base
  union all
  select day, cohorts, cars, round(idx::numeric, 6) from chain
  order by 1;
  get diagnostics _n = row_count;
  return _n;
end;
$$;
