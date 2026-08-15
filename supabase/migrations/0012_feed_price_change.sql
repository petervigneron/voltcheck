-- Card grounds are becoming semantic (a colored card = a card-level fact):
-- cobalt = the price was cut recently. The browse feed therefore needs each
-- listing's previous price and when it changed. listing_price_history rows
-- are written only on first sighting and on change, so the two newest rows
-- per VIN carry exactly that: [1] = current price and the moment it became
-- current, [2] = the price before it. VINs with a single row (never
-- repriced) get null prev_price_usd and the web ignores them.
--
-- Egress: two scalar columns, ~30 bytes/row — noise next to the payload.
-- Anon reads pass RLS: the 0007 policy on listing_price_history admits rows
-- for live cars, and this view only has live cars.

create or replace view live_listings_feed
with (security_invoker = true) as
select l.vin,
       l.first_seen_at,
       l.last_seen_at,
       l.payload - 'description' as payload,
       h.prev_price_usd,
       h.price_changed_at
from listings l
left join lateral (
  select (array_agg(price_usd order by observed_at desc))[2] as prev_price_usd,
         max(observed_at) as price_changed_at
  from (
    select price_usd, observed_at
    from listing_price_history p
    where p.vin = l.vin
    order by observed_at desc
    limit 2
  ) last2
) h on true
where l.delisted_at is null;
