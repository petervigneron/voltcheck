-- "When was this car listed?" — answered only where we can stand behind it.
--
-- first_seen_at is when OUR tracking first saw a car, which is not when the
-- car went on sale: tracking began 2026-08-11, so on the day this migration
-- was written, printing first_seen_at as a listing date would have claimed
-- every car in the country was listed within the week. Measured on prod
-- 2026-08-17 (69,407 live rows):
--
--   28,672  were present when their domain's tracking began — their true
--           listing date is unknowable to us (left-censored);
--   38,440  arrived in bulk-batch days — the Kia/Hyundai/GM locator lanes
--           landing whole inventories on 08-14/15, which is coverage growth,
--           not 38k dealers listing 38k cars at once;
--    1,664  appeared as ordinary daily flow into a domain that was already
--           tracked — the only cars whose appearance we can honestly call
--           a listing date. This set grows every night from here.
--
-- So: a car earns listed_on (= first_seen_at::date) only when
--   (1) its domain had already been tracked for 48h when the car appeared
--       (rules out the tracking-start batch and any newly added domain's
--       first crawls), and
--   (2) its arrival day at that domain was ordinary flow, not a batch:
--       that day's arrivals ≤ greatest(5, 20% of the domain's live count).
--       Thresholds from live data: healthy locator lanes add 0.6–2% of
--       their inventory per day (cadillac.com: 166 on 10,234; kia.com: 129
--       on 6,790), while a coverage change lands a whole feed at once. The
--       floor of 5 keeps a 10-car dealer's normal restock from tripping it.
--       Arrival counts are over ALL rows ever seen that day (delisted
--       included) — history doesn't decay, so a blocked batch stays blocked.
--   (3) its domain enumerates its full inventory nightly. The sampled
--       locator lanes can't date anything: they see a rotating subset, so
--       "first seen" there is when the rotation happened to surface the
--       car. These are the always-truncated synthetic domains in
--       scraper/lib/oem/ (each file's header says why): audi-network,
--       ford-blue-advantage, honda-prologue, hyundai-cpo, nissan-new,
--       nissan-cpo. Keep this list in sync when a sampled lane is added —
--       the failure mode is month-old inventory reading "just listed".
--       (Dealer-site crawls that overrun their page budget report
--       truncated for the night too, but their windows are stable pages,
--       not rotations, and first_seen_at survives regardless — a late
--       first sighting there is off by days at worst, and guard (2)
--       catches the systematic version.)
--
-- Everything else stays quiet. Matching nothing is honest.
--
-- Relists keep their original first_seen_at (ingest_listings never touches
-- it on conflict), so a delist/relist cycle cannot mint a fresh date.
--
-- REJECTED: computing this per request in the feed view — the domain stats
-- are an aggregate over all of listings, and 0020/0022 already established
-- that per-request scans of listings blow anon's statement timeout;
-- materialize and refresh nightly like the others. REJECTED: storing the
-- verdict on the wide listings row — 0025 exists because per-crawl
-- bookkeeping on wide rows OOM-killed the database.

create materialized view listing_freshness as
with domain_stats as (
  select dealer_domain,
         min(first_seen_at) as tracked_since,
         count(*) filter (where delisted_at is null) as live_n
  from listings
  where dealer_domain is not null
  group by dealer_domain
),
day_arrivals as (
  select dealer_domain, date_trunc('day', first_seen_at) as day, count(*) as n
  from listings
  where dealer_domain is not null
  group by 1, 2
)
select l.vin,
       l.first_seen_at::date as listed_on
from listings l
join domain_stats d using (dealer_domain)
join day_arrivals a
  on a.dealer_domain = l.dealer_domain
 and a.day = date_trunc('day', l.first_seen_at)
where l.delisted_at is null
  and l.dealer_domain not in
    ('audi-network', 'ford-blue-advantage', 'honda-prologue',
     'hyundai-cpo', 'nissan-new', 'nissan-cpo')
  and l.first_seen_at >= d.tracked_since + interval '48 hours'
  and a.n <= greatest(5, ceil(d.live_n * 0.2));

-- Required for refresh ... concurrently, and it's the join key besides.
create unique index listing_freshness_vin on listing_freshness (vin);

-- NO anon grant, on purpose. live_listings_feed has been an OWNER-RIGHTS
-- view since 0026 hard-closed listing_seen; the matview sits behind it the
-- same way. The first application of this migration got that wrong — it
-- recreated the view with security_invoker = true (copying 0025's stance
-- instead of 0026's), anon feed reads died on "permission denied for table
-- listing_seen", and the site fell back to the bundled snapshot until the
-- follow-up fix ~10 minutes later. Read the LIVE view's reloptions, not
-- just pg_get_viewdef, before replacing a view: the definition text doesn't
-- show them.

-- Refreshed nightly with the other two (scraper/refresh-variants.mjs runs
-- after db-sync, so tonight's arrivals get tonight's dates).
create or replace function refresh_vin_variants()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  refresh materialized view concurrently vin_variant_observed;
  refresh materialized view concurrently ev_cohort_trim_spread;
  refresh materialized view concurrently listing_freshness;
  return jsonb_build_object(
    'refreshed',   (select count(*) from vin_variant_observed),
    'trim_spread', (select count(*) from ev_cohort_trim_spread),
    'freshness',   (select count(*) from listing_freshness)
  );
end;
$$;

revoke execute on function refresh_vin_variants() from public, anon, authenticated;

-- Same view as 0026 (payload_public, one-pass price agg, owner rights) with
-- listed_on appended — create or replace allows adding columns at the end.
-- LEFT join: a car without a defensible date ships a null and the web
-- renders nothing for it.
create or replace view live_listings_feed
with (security_invoker = false) as
select l.vin,
       l.first_seen_at,
       s.last_seen_at,
       l.payload_public as payload,
       h.prev_price_usd,
       h.price_changed_at,
       l.buyback_disclosed,
       f.listed_on
from listings l
left join listing_seen s using (vin)
left join (
  select vin,
         (array_agg(price_usd order by observed_at desc))[2] as prev_price_usd,
         max(observed_at) as price_changed_at
  from listing_price_history
  group by vin
) h using (vin)
left join listing_freshness f using (vin)
where l.delisted_at is null;
