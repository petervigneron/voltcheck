-- The site-wide index (0072) stops counting a cohort's day whose median
-- moved more than 20% overnight: that is a cohort key changing spelling,
-- not a price.
--
-- Found 2026-09-08, stressing the index for the owner. The 2025 "jeep
-- wrangler" cohort read −63% over the archive and the 2025 "jeep
-- wrangler4xe" cohort +255%: three days (08-18 +86%, 08-20 +273%, 09-05
-- −44% on the 4xe; 08-24 −34% and 08-26 −27% on the bare Wrangler) where a
-- crawl's spelling moved cars from one key to the other, so each key's
-- median jumped to a different car. The pair nearly cancelled (net +0.07%
-- on the index) — which is luck, not a property. A used cohort's median
-- does not move 20% in a day: the 18 pair-days over 25% and the 59 over 15%
-- are these key splits and n=7–11 cohorts where one arrival IS the median.
--
-- Measured before choosing the line, index on 09-06 under each cap:
--   none  −1.22%    25%  −1.25%    20%  −1.45%    15%  −1.45%    10%  −1.47%
-- Between 10% and 20% the answer does not move, which is what says the cut
-- is separating artefacts from the market and not trimming the market. 20%
-- is the loosest cap inside that flat stretch, so it excludes the least.
-- Both the day's move AND the day's weight are dropped for that cohort; the
-- rest of the day chains as before. Stored `cohorts`/`cars` count what the
-- step was read from, so a guarded day shows fewer.
--
-- The chart's own guard is unchanged: the per-cohort line still draws the
-- cohort's true medians, key splits included — a shopper looking at a 4xe
-- deserves to see that its line is broken, and the nameplate fold
-- (scraper/lib/tesla-nameplate.mjs's family) is the fix for that, not this.

create or replace function rebuild_price_trend_site_daily()
returns bigint
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  _n bigint;
begin
  delete from ev_price_trend_site_daily;
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
    -- A median that moved more than 20% overnight is a key split or a
    -- one-car cohort, not the market (header).
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

comment on function rebuild_price_trend_site_daily() is
  'Recomputes ev_price_trend_site_daily in full from ev_price_trend_ask_daily (~260 ms at 15k cohort-days), skipping any cohort-day whose median moved more than 20% overnight (0073: key splits, not prices). Called at the end of advance_price_trend_ask_daily(); safe to call by hand.';

select rebuild_price_trend_site_daily();
