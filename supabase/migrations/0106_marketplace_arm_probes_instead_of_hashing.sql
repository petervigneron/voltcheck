-- The feed walk stops dying on the page after a stale marketplace car.
--
-- Since ~2026-09-28 most feed publishes and the browser/rolling crawls'
-- publish jobs failed: one page of live_listings_feed ran past anon's 3 s
-- statement timeout, every retry hit the same wall, and the walk fell back to
-- the bundled snapshot (which the publisher rightly refuses to publish). The
-- failing page was always just past a Jeep Wrangler 4xe (3C4RJNAK...), a Grand
-- Cherokee 4xe (1C4RJYE...) or a Mach-E (3FMTK1R4...), wherever the walk was —
-- the same neighbourhood every walk, not database load (edge_logs, 10-01/02).
--
-- Cause (EXPLAIN ANALYZE, 2026-10-02): rule 2's marketplace arm was
-- `exists (select 1 from listing_offers o where o.vin = l.vin ...)` under an
-- OR. The planner may run such an EXISTS as a hashed subplan, and on those
-- pages it did: it seq-scanned ALL of listing_offers (324,791 qualifying of
-- 426k rows, 7.4 s cold) to build the hash, the first time any row on the
-- page reached that arm. A row reaches it only when it is a marketplace car
-- (ford-blue-advantage lists used Jeeps and Mach-Es, hence the
-- neighbourhoods) that its own lane has not confirmed in 48 h. listing_offers
-- has grown since 0094/0103 made every reader maintain it, which is why a
-- plan that once fitted stopped fitting.
--
-- Fix: the same predicate as a correlated scalar subquery with LIMIT 1. That
-- cannot be hashed; it is one probe of listing_offers_pkey (vin, ...) per row
-- that gets as far as this arm. Nothing else in the view changes; the body is
-- 0102's, copied, with that one arm rewritten.
--
-- Dry-run as a temp view against the live one, 2026-10-02: identical VIN sets
-- (0 only-new, 0 only-old, over the whole feed); the failing page
-- (vin > 3C4RJNAK5ST596651 in bucket 3) 0.017 s against 0.82 s warm / 7.4 s
-- cold.

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
  select s2.last_seen_at, s2.last_confirmed_at, s2.returned_at, s2.sightings_since_return
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
  -- rule 1: seen, or confirmed on its own page, within 48 hours
  and greatest(coalesce(s.last_seen_at, l.first_seen_at),
               coalesce(s.last_confirmed_at, s.last_seen_at, l.first_seen_at)) >= now() - interval '48 hours'
  -- rule 2: a marketplace-fed car is served on its own page's word, or on
  -- the word of a dealer-site source that listed it, within 48 hours
  and (
    l.dealer_domain not in ('ford-blue-advantage', 'honda-prologue', 'hyundai-cpo', 'audi-network')
    or s.last_confirmed_at >= now() - interval '48 hours'
    -- A scalar subquery, not EXISTS (0106): the planner may turn an EXISTS
    -- under OR into a hashed subplan that seq-scans all of listing_offers
    -- (324k rows, 7.4 s) the first time any row on the page reaches this
    -- arm, which is past anon's 3 s, so every walk died on the page after a
    -- stale marketplace car. A correlated scalar subquery cannot be hashed:
    -- it is one primary-key probe on (vin, ...) per row that gets this far.
    or (select true from listing_offers o
        where o.vin = l.vin
          and o.last_seen_at >= now() - interval '48 hours'
          and position('.' in o.dealer_domain) > 0
        limit 1) is not null
  )
  -- rule 3: a car that came back after 48 hours unseen is served once its
  -- own page has said so since the return — or, for a car whose headline is
  -- a dealer's own site, once that site has shown it on two separate
  -- crawls at least six hours apart since the return. One sighting from
  -- one lane is the Motive-index flicker 0093 was written for; the same
  -- site showing the car again a crawl later is the seller saying it twice.
  and (
    s.returned_at is null
    or s.last_confirmed_at >= s.returned_at
    or (position('.' in l.dealer_domain) > 0
        and s.sightings_since_return >= 2
        and s.last_seen_at >= s.returned_at + interval '6 hours')
  );