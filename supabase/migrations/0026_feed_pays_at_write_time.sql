-- The feed view's read cost moves to write time, where 0025 made writes rare.
--
-- Found while verifying 0025 (2026-08-16): live_listings_feed's deep-offset
-- pages were failing anon's statement timeout — the site's hourly full-feed
-- revalidate (web/lib/listings/db.ts fetches ~65 parallel 1000-row pages by
-- offset) breaks for every page past ~20k, which would have silently frozen
-- the browse index at its last good copy. Not 0025's regression: the old
-- view already measured 4.7s at offset 40k (~59.8k rows was already
-- marginal; today's sync healing the feed to 65.4k live rows crossed the
-- line). 0025's seen-join added ~20% buffer traffic but the walls are older:
--
--   1. `payload - 'description'` (0011's egress fix) rebuilds every scanned
--      row's jsonb BELOW the offset/limit — measured 5.5s of pure CPU at
--      offset 40k vs 463ms for the identical query without the minus.
--      A read-time cost paid per page scan, ~65 times an hour.
--   2. The 0012 lateral runs a per-row backward index scan over price
--      history — 41k loops / 205k buffer touches per deep page.
--   3. Under security_invoker, anon pays a per-row EXISTS policy probe on
--      every underlying table the view touches.
--
-- Fixes, in the same order:
--
--   1. payload_public: a STORED generated column computing payload minus
--      description once per row WRITE. 0025 is what makes this affordable —
--      only the ~1-2% of rows that change each night recompute it. ~50MB of
--      heap (742B avg × 67k rows), bought back by this ALTER's table
--      rewrite compacting today's churn bloat (149MB → ~101MB before the
--      new column). Free-tier headroom measured first: 249MB of 500MB.
--   2. One GroupAggregate pass over listing_price_history (72k rows,
--      incremental sort on the existing vin index) replaces 41k laterals.
--      Same semantics as 0012: array_agg desc [2] = second-newest price,
--      max(observed_at) = when the newest was observed.
--   3. security_invoker = false: the view reads as its owner (postgres) and
--      RLS is not evaluated. The view's own WHERE (delisted_at is null) is
--      the gate, and it publishes exactly what 0007 allows anon: live rows,
--      their price stats, their sighting stamp. 0011 chose invoker=true so
--      the view could not widen anon's rights by accident; that argument
--      inverts now that the view is the narrower surface — anon's direct
--      table policies on listings/listing_price_history stay exactly as
--      0007 wrote them, and listing_seen's direct reads close below.
--
-- listing_seen: the 0025 policy allowed anon to read live rows' sightings
-- directly. With the view no longer needing invoker rights, direct reads
-- close hard (no policy AND revoke, the 0007 mileage/events pattern) — the
-- sighting history of delisted cars is archive, and the live cars' stamps
-- are already served by the feed.

alter table listings
  add column payload_public jsonb
  generated always as (payload - 'description') stored;

analyze listings;

-- Same output shape as 0024/0025 (create or replace requires it; the web
-- reads columns by name).
create or replace view live_listings_feed
with (security_invoker = false) as
select l.vin,
       l.first_seen_at,
       s.last_seen_at,
       l.payload_public as payload,
       h.prev_price_usd,
       h.price_changed_at,
       l.buyback_disclosed
from listings l
left join listing_seen s using (vin)
left join (
  select vin,
         (array_agg(price_usd order by observed_at desc))[2] as prev_price_usd,
         max(observed_at) as price_changed_at
  from listing_price_history
  group by vin
) h using (vin)
where l.delisted_at is null;

drop policy "public read live" on listing_seen;
revoke select on listing_seen from anon, authenticated;
