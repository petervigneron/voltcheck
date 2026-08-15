-- Egress diet for the web app's bulk read (free-plan limit exceeded
-- 2026-08-14: ~1,660 requests/day to /rest/v1/listings at ~1.5MB per
-- 1000-row page — the full-payload feed plus an unused price-history
-- join, re-fetched every 5 minutes under traffic).
--
-- `description` is ~45% of payload bytes and renders only on the listing
-- detail page, one row at a time. This view is the bulk feed the index
-- reads: everything except description, plus the lifecycle timestamps
-- (days-on-lot / price-drop display, ~2% of bytes). The detail page
-- fetches its single row — description and price history included —
-- straight from `listings` (web/lib/listings/db.ts).
--
-- security_invoker: anon reads pass through the existing "public read"
-- RLS policy on listings; the view adds no new exposure.

create view live_listings_feed
with (security_invoker = true) as
select vin,
       first_seen_at,
       last_seen_at,
       payload - 'description' as payload
from listings
where delisted_at is null;

grant select on live_listings_feed to anon, authenticated;
