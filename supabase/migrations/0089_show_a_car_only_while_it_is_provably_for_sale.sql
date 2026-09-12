-- A car is shown only while the site can prove it is for sale.
--
-- 2026-09-12. The owner, shopping for a Lightning in real life, found one
-- on the site at $4,000 under the truck he was about to make an offer on.
-- He called the dealer: it had sold days earlier. The row
-- (1FT6W1EV2PWG58901) had arrived that morning from the Ford Blue Advantage
-- marketplace — an Autotrader white-label fed by the dealer's inventory
-- export, which lags a sale by days — and the dealer's own page answers 403
-- to the crawler, so nothing we run had ever confirmed the car existed.
-- The site showed it anyway, because until now a listing was innocent
-- until proven gone: live_listings_feed served every row whose delisted_at
-- was null, whatever the evidence for it.
--
-- That is the wrong default for a site whose only product is trust, and
-- this migration inverts it. A row is served only if BOTH hold:
--
--   1. Some source saw the car within the last 7 days. A car no crawl,
--      sweep or page check has seen in a week is not on sale as far as we
--      can tell, whatever its delisted_at says. Measured tonight: 3,808 of
--      172,773 live rows fail this — ~900 of them Porsche rooftops whose
--      browser lane was switched off on 09-06, the rest lanes that stopped
--      seeing a car and could not certify its absence.
--
--   2. For the four marketplace-fed lanes (ford-blue-advantage,
--      honda-prologue, hyundai-cpo, audi-network — the same set as
--      scraper/lib/recheck-oem-crosscheck.mjs RECHECK_CROSSCHECK_DOMAINS;
--      keep the two lists in step), the car's OWN seller page confirmed it
--      within the last 48 hours (listing_seen.last_confirmed_at, written
--      only by recheck's alive verdict — a page that answered 200 with the
--      VIN — and, since 1f90299, by the browser pass for pages a plain
--      fetch cannot read). A marketplace index is where we learn a car
--      exists; it is never proof that it still does. Measured tonight:
--      2,037 rows fail this (23% of the lanes' 12,117; 83 of 529 FBA
--      Lightnings), and a sample of the never-confirmed ones opened in a
--      real browser on 09-12 found 18 of 24 gone from the dealer's site.
--
-- Net: 166,928 of 172,773 shown; 5,845 withheld (3.4%). The withheld rows
-- are NOT delisted — delisted_at is evidence about the world and this is
-- not that; they are simply not served, and they return the moment a
-- source sees them (rule 1) or their page confirms them (rule 2). A new
-- marketplace car therefore appears one night late, after its page has
-- said yes, instead of the morning the index said so. That is the trade
-- the owner asked for, in his words: "I need to be sure that this never
-- ever happens to anyone else, including me."
--
-- Every surface reads this view — the publisher's walk (the grid, /api/v1,
-- the MCP), the listing page's per-VIN read, the sitemap — so nothing has
-- to remember the rule. A withheld car's page 404s (findListing misses and
-- it is not delisted, so Delisted.tsx does not fire); that is honest: we
-- do not know it is gone, we know we cannot vouch for it.
--
-- Cost of the predicate: the lateral on listing_seen already existed for
-- last_seen_at; it now also returns last_confirmed_at. now() is evaluated
-- once per statement. Verified in a rolled-back transaction before apply:
-- the replaced view returns 166,928 rows; the walk's keyset page plans
-- unchanged (index scan on listings_pkey, PK lookups on listing_seen).
--
-- REJECTED: a shorter window than 7 days for rule 1. The rolling crawl
-- returns to a rooftop every ~2–3 days, so a 3-day rule would withhold
-- 7,977 rows tonight, most of them live cars whose rooftop simply had not
-- been revisited; 7 days is past any normal revisit gap and still inside
-- the lag a sold car can sit unseen. REJECTED: applying rule 2 to every
-- lane. A dealer-site row was read from the dealer's own inventory page —
-- that IS the seller's statement, and it certifies completeness through
-- 0002/0083; an OEM locator (chevrolet.com, kia.com) is the manufacturer's
-- own inventory system and its sweep is complete nightly. Rule 2 is for
-- the lanes whose source is a marketplace copy of the dealer's feed.
--
-- The view keeps security_invoker = false (0026: anon cannot read
-- listing_seen or listing_freshness directly; the view is the door).

create or replace view live_listings_feed
with (security_invoker = false) as
select l.vin,
       l.first_seen_at,
       s.last_seen_at,
       coalesce(l.payload_public, l.payload) as payload,
       h.prev_price_usd,
       h.price_changed_at,
       l.buyback_disclosed,
       f.listed_on,
       l.branded_title_disclosed
from listings l
left join lateral (
  select s2.last_seen_at, s2.last_confirmed_at
  from listing_seen s2
  where s2.vin = l.vin
  limit 1
) s on true
left join lateral (
  select case when g.claimable then g.prev end as prev_price_usd,
         case when g.claimable then g.at1 end as price_changed_at
  from (
    select g0.prev, g0.at1,
           case when g0.n < 2 then false
                else
                  case when g0.prov_cur is not null and g0.prov_prev is not null
                       then g0.prov_cur = g0.prov_prev
                       else g0.same_src
                            and not exists (select 1 from price_methodology_transitions t
                                            where t.at > g0.at2 and t.at <= g0.at1)
                  end
                  and
                  case when g0.dom_cur is not null and g0.dom_prev is not null
                       then g0.dom_cur = g0.dom_prev
                       else not (g0.back2 is not null and g0.cur = g0.back2 and g0.cur is distinct from g0.prev)
                  end
           end as claimable
    from (
      select (array_agg(last3.price_usd   order by last3.observed_at desc))[1] as cur,
             (array_agg(last3.price_usd   order by last3.observed_at desc))[2] as prev,
             (array_agg(last3.price_usd   order by last3.observed_at desc))[3] as back2,
             (array_agg(last3.provenance  order by last3.observed_at desc))[1] as prov_cur,
             (array_agg(last3.provenance  order by last3.observed_at desc))[2] as prov_prev,
             (array_agg(last3.dealer_domain order by last3.observed_at desc))[1] as dom_cur,
             (array_agg(last3.dealer_domain order by last3.observed_at desc))[2] as dom_prev,
             (array_agg(last3.observed_at order by last3.observed_at desc))[1] as at1,
             (array_agg(last3.observed_at order by last3.observed_at desc))[2] as at2,
             not ((array_agg(last3.src order by last3.observed_at desc))[1]
                  is distinct from (array_agg(last3.src order by last3.observed_at desc))[2]) as same_src,
             count(*) as n
      from (
        select p.price_usd, p.observed_at, p.provenance, p.dealer_domain,
               coalesce(r.source, '?') as src
        from listing_price_history p
        left join ingest_runs r on r.id = p.run_id
        where p.vin = l.vin
        order by p.observed_at desc
        limit 3
      ) last3
    ) g0
  ) g
) h on true
left join lateral (
  select f2.listed_on
  from listing_freshness f2
  where f2.vin = l.vin
  limit 1
) f on true
where l.delisted_at is null
  -- rule 1: seen by some source within 7 days
  and coalesce(s.last_seen_at, l.first_seen_at) >= now() - interval '7 days'
  -- rule 2: a marketplace-fed car is served only on its own page's word
  and (
    l.dealer_domain not in ('ford-blue-advantage', 'honda-prologue', 'hyundai-cpo', 'audi-network')
    or s.last_confirmed_at >= now() - interval '48 hours'
  );
