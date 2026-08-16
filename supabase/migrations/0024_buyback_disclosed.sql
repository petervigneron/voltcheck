-- Manufacturer buybacks (lemon-law and goodwill repurchases) put branded or
-- brand-adjacent history on YOUNG, low-mileage cars — the profile of most of
-- our used inventory, not the old-cheap-high-mileage segment where salvage
-- concentrates. A buyback priced 15% under its clean-title cohort looks like
-- a bargain to the price model, and "$4,000 under sold price" on a buyback is
-- the exact false claim the comps guardrails exist to prevent.
--
-- No title data is purchasable that would fix this browse-wide (see the
-- 2026-08-15 NMVTIS findings), but dealers who resell buybacks disclose them
-- in the listing description, and that is the seller's own statement about
-- their own car — a claim we can surface and stand behind. This column reads
-- the disclosure at write time so the browse feed (which strips description
-- for egress, 0011) can carry the fact and the web can gate price claims on it.
--
-- The patterns are the audited disclosure templates from the live corpus on
-- 2026-08-16 (95 rows, all three template families verified genuine by
-- reading every match; the two known false-positive shapes — warranty fine
-- print reading "does not apply to as-is, tax tow, salvage, or lemon law
-- vehicles", and marketing copy promising a dealer does NOT sell buybacks —
-- were confirmed unmatched as controls). Absence of a match asserts nothing:
-- sellers who stay silent stay invisible, and the site stays silent about
-- them in turn. Extending the patterns is a new migration; keep the controls.
alter table listings
  add column buyback_disclosed boolean not null
  generated always as (
    lower(coalesce(payload->>'description','')) ~ 'agreeing to repurchase the vehicle'
    or lower(coalesce(payload->>'description','')) ~ 'lemon.law buyback'
    or lower(coalesce(payload->>'description','')) ~ 'this vehicle (is|was) a (manufacturer )?(buyback|repurchase)'
    or (lower(coalesce(payload->>'description','')) ~ 'manufacturer buyback'
        and lower(coalesce(payload->>'description','')) !~ '(not|never|no) (a |an )?manufacturer buyback')
  ) stored;

-- Same view as 0012 with the flag appended (create or replace view may only
-- add columns at the end). The web reads it by name, so order is cosmetic.
create or replace view live_listings_feed
with (security_invoker = true) as
select l.vin,
       l.first_seen_at,
       l.last_seen_at,
       l.payload - 'description' as payload,
       h.prev_price_usd,
       h.price_changed_at,
       l.buyback_disclosed
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
