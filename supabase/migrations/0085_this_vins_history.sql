-- This VIN's history: the two things the archive can actually prove about a
-- car's past listings, per VIN, materialized.
--
--   1. It was listed on another SITE, at a price, on a date.
--   2. It went away and came back, and the absence was real.
--
-- Everything else the archive looks like it could say, it cannot. What was
-- measured on prod 2026-09-12, against 172,003 live listings, and what each
-- number decided:
--
-- THE ABSENCE. 24,462 live cars have at least one delist followed by a
-- relist. That number is almost entirely noise: 40,276 of the 44,707 pairs
-- close inside three days. The cause is named in 0083 -- one rooftop
-- certified complete on a walk that saw half its lot -- and it was only
-- fixed today (0082/0083, f67f250/a8815d7), so the whole archive behind this
-- view is made of it. Three gates, each measured:
--
--   * the gap is >= 7 days. 0083's own census (14,942 crawl delists Sep 7-11,
--     48% relisted within 3 days) is what sets the floor: a flicker closes in
--     days, a real absence does not. 24,462 live cars -> 1,229.
--   * the delist was written by a RECHECK run, not a crawl. recheck.mjs asks
--     the car's OWN page (404/410, or twice 200-without-the-VIN); a crawl
--     delist is an inference from a lot walk that may have been short. This
--     is the difference between "this listing went away" and "its source went
--     quiet", and only the first is a fact about the car. 1,229 -> 407.
--   * the delist is alone -- no other live car shares both its run pair, and
--     none shares its delist run and its rooftop. Without this the view's
--     first sample was four Wrangler 4xes leaving hyundaiofakron.com at the
--     identical instant and returning at the identical instant seven days
--     later; the biggest such block was 40 cars. A rooftop changing its VDP
--     URL scheme 404s every car it has, which recheck cannot tell from 40
--     cars selling. 407 -> 255.
--
-- 255 live cars. That is the honest count, and the 7-day floor alone (1,229)
-- would have printed a crawl outage as a car's life story on roughly a
-- thousand pages.
--
-- THE OTHER SITE. listing_prior_site (0061) already is this fact, with gates
-- that were argued out there: both domains dotted, no oem-% lane rows, the
-- prices differ, a delist after the prior site's last row and nothing from it
-- since. 76,818 live cars have a price row under some other domain; 646
-- survive those gates, and the other 76,172 are co-listing. This view reuses
-- it rather than re-deriving it, so there is one place those gates live.
--
-- Read 0061's last paragraph before writing any copy for this: the survivors
-- are mostly same-owner rooftop pairs (machens.com -> machensfordcapitalcity.net,
-- almcars.com -> almnissannewnan.com, holidayfordusa.com -> holidaycadillac.com
-- in this view's own sample). The fact is true of the SITE and not of a
-- seller. The page says "listed on <domain>"; it must never say "another
-- dealer", and it must never say "sold" -- the site's phrase for a listing
-- that ended is "no longer listed" (app/listing/[id]/Delisted.tsx).
--
-- REJECTED: the odometer. listing_mileage_history has 5,435 live cars whose
-- reading went DOWN, 473 by more than 1,000 miles, and a rollback flag is the
-- single most valuable thing on this list -- which is why it gets the
-- strictest test and fails it. The table carries no dealer_domain, so a
-- reading cannot be attributed to the page it came from: of those 473, 313
-- are co-listed across several domains, only 178 have both readings
-- attributable to any domain at all (indirectly, through a price row written
-- in the same run), and only 30 have both attributable to the SAME domain.
-- Reading the 30 settles it -- they are typing, not tampering: a 2025 i4 at
-- 130,298 then 15,332 miles; 42,224 -> 4,224 (a lost leading digit);
-- 61,150 -> 31,150; an EV9 at 18,079 then 3. Not one of them is a rollback
-- and every one of them would have been an accusation against a named
-- business. Nothing here reaches the page. If the mileage log ever carries
-- the domain that published each reading, this is worth measuring again.
--
-- REJECTED: printing first_seen_at. It is in the view because it is the
-- anchor every other date hangs off and it costs nothing to carry, but the
-- page does not draw it: 0028 already built the guarded listing date
-- (Listing.listedOn, "the domain was already under tracking when the car
-- appeared"), the summary card already prints it, and first_seen_at without
-- those guards is the start of OUR tracking wearing a listing date's clothes
-- -- the exact claim Delisted.tsx refuses for the same reason.
--
-- Cost: 20.1s to build on prod (measured, rolled back, 2026-09-12), against
-- service_role's 60s. listing_prior_site's four subqueries over 3M price rows
-- are essentially all of it; the absence half runs over 453,878 events and is
-- free by comparison. Refreshed nightly by refresh_vin_variants (0051), which
-- gains a branch below. Read per VIN through the unique index -- one keyed
-- lookup, nowhere near anon's 3s.

create materialized view vin_listing_history as
with step as (
  select vin, event, observed_at as gone_at, run_id as gone_run,
         lead(event)       over w as nxt_event,
         lead(observed_at) over w as back_at,
         lead(run_id)      over w as back_run
  from listing_events
  window w as (partition by vin order by observed_at, id)
),
away as (
  -- A delist this car's own page produced, with a relist a week or more
  -- later. distinct because a run that wrote the same event twice is one
  -- absence, not two.
  select distinct s.vin, s.gone_at, s.back_at, s.gone_run, s.back_run, l.dealer_domain
  from step s
  join ingest_runs r on r.id = s.gone_run and r.source = 'recheck'
  join listings l on l.vin = s.vin and l.delisted_at is null
  where s.event = 'delisted'
    and s.nxt_event in ('relisted', 'listed')
    and s.back_at is not null
    and s.back_at - s.gone_at >= interval '7 days'
),
counted as (
  select a.*,
         count(*) over (partition by gone_run, back_run)      as n_pair,
         count(*) over (partition by gone_run, dealer_domain) as n_lot
  from away a
),
gaps as (
  select vin,
         jsonb_agg(jsonb_build_object('goneAt', gone_at, 'backAt', back_at) order by gone_at) as absences
  from counted
  where n_pair = 1 and n_lot = 1
  group by vin
)
select l.vin,
       l.first_seen_at,
       s.prior_domain,
       s.prior_price_usd,
       s.prior_last_seen_at,
       g.absences
from listings l
left join listing_prior_site s on s.vin = l.vin
left join gaps g on g.vin = l.vin
where l.delisted_at is null
  -- Only rows that clear a bar. A car with nothing to say is not in here, so
  -- the page's gate is "did the lookup return a row", not "does the row have
  -- anything in it".
  and (s.vin is not null or g.vin is not null);

-- Unique on vin: what the per-VIN read keys on, and what REFRESH ...
-- CONCURRENTLY requires.
create unique index vin_listing_history_vin_idx on vin_listing_history (vin);

grant select on vin_listing_history to anon, authenticated;

-- The nightly refresh (0051). One target per call, whitelisted CASE rather
-- than dynamic SQL -- this is SECURITY DEFINER. Appended, nothing else
-- touched; scraper/refresh-variants.mjs gains the matching entry.
--
-- Placed LAST in that list on purpose: this view is Pro-only decoration on
-- 881 of 172,003 listing pages, so if a night runs out of road it is the one
-- to leave stale. Nothing else reads it.
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
    when 'ev_price_trend_sales' then
      refresh materialized view concurrently ev_price_trend_sales;
      select count(*) into n from ev_price_trend_sales;
    when 'ev_price_trend_ask_daily' then
      return advance_price_trend_ask_daily(3);
    when 'vin_listing_history' then
      refresh materialized view concurrently vin_listing_history;
      select count(*) into n from vin_listing_history;
    else
      raise exception 'refresh_vin_variants: unknown target %', target
        using hint = 'one of vin_variant_observed, ev_cohort_trim_spread, listing_freshness, ev_cohort_velocity, ev_cohort_ask_weekly, ev_price_trend_sales, ev_price_trend_ask_daily, vin_listing_history';
  end case;
  return jsonb_build_object('view', target, 'rows', n);
end;
$function$;

revoke execute on function refresh_vin_variants(text) from public, anon, authenticated;
grant  execute on function refresh_vin_variants(text) to service_role;
