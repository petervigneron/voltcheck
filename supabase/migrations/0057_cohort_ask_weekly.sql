-- "What has this model been asking, week by week?" — measured, not yet spoken.
--
-- SHIPS DARK, same as 0035: no anon grant, nothing in web/ reads it. It
-- exists to START THE CLOCK. The price archive only begins 2026-08-11, and a
-- trend surface ("steady for six weeks, now rising") needs the weeks to exist
-- before it can say anything — building the view the day the surface is
-- wanted would mean the surface waits two months anyway. Refreshed nightly by
-- refresh_vin_variants('ev_cohort_ask_weekly') below; by the time a Pro
-- surface wants it, the series is already deep enough to stand behind.
--
-- ── What a row is ──────────────────────────────────────────────────────────
--
-- One (vin8, model_year, cond, week): the asking-price distribution of that
-- cohort's listings live at the week's close, each listing valued at its
-- last provenance-clean observation on or before that instant.
--
--   Weekly SNAPSHOTS at date_trunc('week') boundaries, not averages over the
--   week: a listing delisted mid-week is out of that week's row, exactly as
--   it would have been out of the grid. The CURRENT week snapshots at now()
--   and moves with every refresh until the week closes; closed weeks never
--   change (they do recompute each refresh — the archive is append-only, so
--   they recompute to the same numbers).
--
--   Prices come THROUGH listing_price_display, never the raw history. The
--   guarded series exists because cross-lane extraction differences fake
--   price moves (0040's 7,734 phantom changes in one run; 0056's DealerOn
--   bugs), and a trend line drawn over fakes is the exact false claim this
--   site exists to not make. The dependency is deliberate: when the guard
--   learns a new trick, this view inherits it on next refresh.
--
--   cond is 'new' or 'used', where 'used' = used + certified + unknown —
--   the same fold the browse grid's condition filter applies (match.ts).
--   New and used are different markets asking different questions; a cohort
--   spanning both would move its median every time the mix moved.
--
-- ── FORBIDDEN on any surface this feeds ────────────────────────────────────
--
--   Calling these prices anything but ASKING prices. This is what dealers
--   want, not what cars fetch; ev_price_model holds what they fetch (WA).
--
--   Quoting a median move as a trend without checking n and median_odometer
--   in the same rows. A cohort whose median ask fell $900 while its median
--   odometer rose 8,000 miles repriced NOTHING — the mix moved. The columns
--   are side by side so no reader has an excuse.
--
--   Quoting a cohort-week with small n at all. The consumer picks its floor;
--   comps.ts MIN_PEERS (4) is the house precedent.
--
-- ── Cost, and the day it stops fitting ─────────────────────────────────────
--
-- Dry-run 2026-09-01 on prod: 18.4s at 4 weeks of archive, 10,340 rows out.
-- Work grows roughly linearly with weeks (every closed week recomputes), so
-- around ~20 weeks this will crowd its 60s refresh budget. The fix then is
-- incremental: freeze closed weeks into a plain table and recompute only the
-- open one — an ordinary migration, not a redesign. Noted here so the 57014
-- that day reads as "0057's comment said so", not as a mystery.

create materialized view ev_cohort_ask_weekly as
with s as (
  select vin, price_usd, observed_at,
         lead(observed_at) over (partition by vin order by observed_at) as next_at
  from listing_price_display
),
weeks as (
  select w::date as week, least(w + interval '7 days', now()) as snap_at
  from generate_series(date_trunc('week', timestamptz '2026-08-10 00:00+00'),
                       date_trunc('week', now()), interval '7 days') w
),
snaps as (
  select upper(substring(l.vin, 1, 8)) as vin8,
         l.year as model_year,
         case when l.condition = 'new' then 'new' else 'used' end as cond,
         wk.week,
         s.price_usd,
         l.mileage
  from s
  join listings l using (vin)
  join weeks wk
    on s.observed_at <= wk.snap_at
   and (s.next_at is null or s.next_at > wk.snap_at)
  where l.year is not null
    and l.first_seen_at <= wk.snap_at
    and (l.delisted_at is null or l.delisted_at > wk.snap_at)
)
select vin8, model_year, cond, week,
       count(*)::int as n,
       round(percentile_cont(0.5) within group (order by price_usd))::int as median_ask_usd,
       round(percentile_cont(0.25) within group (order by price_usd))::int as p25_ask_usd,
       round(percentile_cont(0.75) within group (order by price_usd))::int as p75_ask_usd,
       round(percentile_cont(0.5) within group (order by mileage)
             filter (where mileage > 0))::int as median_odometer
from snaps
group by 1, 2, 3, 4;

-- CONCURRENTLY needs it, and (vin8, model_year, cond, week) is the read key.
create unique index ev_cohort_ask_weekly_key
  on ev_cohort_ask_weekly (vin8, model_year, cond, week);

-- Dark means dark.
revoke all on ev_cohort_ask_weekly from public, anon, authenticated;

comment on materialized view ev_cohort_ask_weekly is
  'Weekly asking-price snapshots per VIN(1-8) variant, model year and new/used, at week-close instants, through the provenance-guarded price series (listing_price_display). ASKING prices, never sales. A median move means nothing until n and median_odometer say the mix held still. Current week floats until closed. Ships dark; no surface reads it yet.';

-- The whitelist grows by one (0051's shape: literal statements, no EXECUTE).
create or replace function refresh_vin_variants(target text)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  n bigint;
begin
  case target
    when 'vin_variant_observed' then
      refresh materialized view concurrently vin_variant_observed;
      select count(*) into n from vin_variant_observed;
    when 'ev_cohort_trim_spread' then
      refresh materialized view concurrently ev_cohort_trim_spread;
      select count(*) into n from ev_cohort_trim_spread;
    when 'listing_freshness' then
      refresh materialized view concurrently listing_freshness;
      select count(*) into n from listing_freshness;
    when 'ev_cohort_velocity' then
      refresh materialized view concurrently ev_cohort_velocity;
      select count(*) into n from ev_cohort_velocity;
    when 'ev_cohort_ask_weekly' then
      refresh materialized view concurrently ev_cohort_ask_weekly;
      select count(*) into n from ev_cohort_ask_weekly;
    else
      raise exception 'refresh_vin_variants: unknown target %', target
        using hint = 'one of vin_variant_observed, ev_cohort_trim_spread, listing_freshness, ev_cohort_velocity, ev_cohort_ask_weekly';
  end case;
  return jsonb_build_object('view', target, 'rows', n);
end;
$function$;
