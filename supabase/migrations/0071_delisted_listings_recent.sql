-- A listing page for a car that is no longer listed.
--
-- Until now a VIN whose row had delisted_at set answered 404 on
-- /listing/<vin>. Google flagged those on 2026-09-07 ("Not found (404)"):
-- it indexes a car off the browse grid, the car sells a week later, and
-- the page becomes Next's stock "This page could not be found". ~1,750
-- cars a day leave the feed, so one in eight indexed listing URLs is a
-- dead end within a week. The page now says the car is no longer listed
-- and shows what it was, which needs the public role to read a delisted
-- row — and the "public read live" RLS policy on listings is
-- `delisted_at is null`, so it cannot.
--
-- This view is the one hole in that policy, and it is deliberately narrow:
--   * only rows delisted in the last 30 days. Older ones fall back to 404.
--     The cap bounds how many templated dead-car pages exist at once
--     (crawl budget, thin-content risk) — delisted rows are never purged,
--     so without it the count would grow without limit.
--   * the same payload shape the public feed already serves for a live
--     car (payload_public where 0042 produced one, else payload) minus
--     `description`, which renders nowhere on this page. 37,936 of 50,696
--     delisted rows predate payload_public, hence the coalesce.
--   * last_seen_at from listing_seen, because that is what the site
--     observed — the day the car was last on the seller's page — while
--     delisted_at is when the two-strike recheck concluded it was gone,
--     which runs two or three days behind.
--
-- NOT security_invoker, unlike live_listings_feed (0011): that view relies
-- on the table's policy, and this one exists precisely to read what the
-- policy hides. Supabase's advisor will flag a security-definer view; that
-- is the point of it, and the where clause is the guard.

create view delisted_listings_recent as
select l.vin,
       l.first_seen_at,
       s.last_seen_at,
       l.delisted_at,
       l.price_usd,
       coalesce(l.payload_public, l.payload) - 'description' as payload,
       l.buyback_disclosed,
       l.branded_title_disclosed
from listings l
left join lateral (
  select s2.last_seen_at from listing_seen s2 where s2.vin = l.vin limit 1
) s on true
where l.delisted_at is not null
  and l.delisted_at > now() - interval '30 days';

grant select on delisted_listings_recent to anon, authenticated;
