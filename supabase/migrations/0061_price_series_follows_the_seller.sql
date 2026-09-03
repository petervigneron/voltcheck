-- The asking-price series follows the seller who owns the listing row, and a
-- second view names the site a car was listed on before that.
--
-- Report (owner, 2026-09-03): 1FT6W3L78RWG27106, a 2024 Lightning Flash. Its
-- page said $47,500 and, under that, a chart ending at $41,581 with an
-- aria-label reading "still $41,581". Raw history had the whole story:
-- hobsongm.com / hobsoncdjr.com held it at $47,230, $43,924, $41,581; the
-- 18:17 recheck on Sep 2 found the Hobson page gone and wrote a delist;
-- recharged.com (its own JSON-LD names Recharged as seller) relisted it at
-- $47,500. Every Recharged row follows a Hobson row, so 0048's dealer guard
-- dropped all of them and the series stopped at the previous seller's last
-- price. The guard was right to refuse the STEP (a $5,919 move across two
-- sellers is not a seller raising a price); it was wrong to keep drawing the
-- old seller's series under the new seller's headline.
--
-- Measured on prod 2026-09-03 before this migration, live cars with history:
--   149,557 total; 42,036 (28%) whose chart's last point was not the headline
--   price; 17,539 of those hid a rise, 35,210 involved a dealer change (with
--   or without a provenance change). Most are ordinary co-listing, not sales:
--   the same VIN on two sites, the crawl alternating which one owns the row.
--
-- listing_price_display, redefined: the chain now runs over the rows the
-- listing's CURRENT dealer_domain produced (plus pre-0048 rows whose domain
-- was never recorded, still guarded by the alternation fingerprint), instead
-- of over every dealer's rows with cross-dealer steps dropped. Same three
-- output columns, so ev_cohort_ask_weekly (0057) keeps refreshing; its
-- snapshots for a sold-on car now come from the current seller rather than
-- the previous one, which is the price a shopper would actually see.
--
-- What this does NOT fix, and why the page also goes quiet: history rows are
-- written on price CHANGE, and listings.dealer_domain flips on any
-- observation. A co-listed car whose second site matched the first's price
-- flips owner without a row, so the current owner may have no rows at all —
-- 12,744 live cars after this change still had a latest row from another
-- domain, 3,236 had a same-dealer provenance change (0041's guard, correct),
-- 5,745 straddled a null-domain pair. Re-running the chain per dealer got the
-- count from 42,036 to 20,933; the rest is closed in web/lib/listings/db.ts,
-- which drops a series whose last point is not the price on the page.
-- Matching nothing is honest; a chart that ends at a number the page does
-- not show is not.
--
-- REJECTED: appending the listing's current price as a synthetic last point.
-- When the current price came from a dropped row (a same-dealer provenance
-- change, the 0040/0041 class), the append re-draws exactly the step the
-- guard refused. The synthetic point would need the provenance the listings
-- row does not carry.
--
-- REJECTED: writing a history row on every dealer_domain flip so each dealer
-- has a full log. It is the principled fix and would recover the 12,744
-- class over time, but it touches ingest_listings and recheck_listings
-- (0048's bodies) and 0025's payload-equality invariant; a separate change.
--
-- listing_prior_site, new: for a live listing, the most recent OTHER site
-- that produced a price row, when that site's page went away (a delist event
-- after its last row, and no row from it since) and the car is live again
-- under a different domain at a different price. This is the owner's option
-- 2: the shopper sees what the car was listed at before, as a fact about the
-- previous SITE, never as a step in this seller's series.
--
-- The candidate set before gating was 1,811 live cars, and a random sample
-- showed most were not sales: OEM locator lanes (kia.com, bmwusa.com,
-- ford-blue-advantage, audi-network — the locator drops a car while the
-- rooftop keeps it, which writes a delist), group sites vs their own rooftops
-- (schomp.com / schompbmw.com, jandsautohaus6 / jandsautohaus3), and 791
-- pairs at the SAME price. Gates, all in the safe direction:
--   * both domains contain a dot (the lane keys never do), and neither has
--     ever written an 'oem-%' provenance row for this VIN (every lane in
--     lib/oem tags its rows so; audi-network and ford-blue-advantage also
--     write 'jsonld' rows, which the dot rule catches);
--   * the prices differ (a same-price relist says nothing a shopper needs);
--   * a delist event AFTER the prior site's last row, and no row from that
--     site since (its page is gone, not co-listing).
-- Same-owner rooftop pairs (bmwofomaha.com -> miniofomaha.com) survive these
-- gates. The fact stays true at site level — the car WAS listed on that site
-- at that price until that date — so the view names a site, not a seller,
-- and the page copy must not say "another dealer". Owner writes that line.
--
-- Cost: both views are read per VIN by the detail page through
-- price_history_vin_idx and listing_events_vin_idx; nothing here scans.

create or replace view listing_price_display
with (security_invoker = false) as
with mine as (
  select p.vin, p.price_usd, p.observed_at, p.provenance, p.dealer_domain,
         coalesce(r.source, '?') as src
  from listing_price_history p
  join listings l on l.vin = p.vin
  left join ingest_runs r on r.id = p.run_id
  where p.price_usd > 0
    and (p.dealer_domain is null or p.dealer_domain = l.dealer_domain)
),
h as (
  select vin, price_usd, observed_at,
         provenance as prov, dealer_domain as dom, src,
         lag(observed_at) over w as prev_at,
         lag(src) over w as prev_src,
         lag(provenance) over w as prev_prov,
         lag(dealer_domain) over w as prev_dom,
         lag(price_usd) over w as prev_price,
         lag(price_usd, 2) over w as back2_price
  from mine
  window w as (partition by vin order by observed_at)
)
select vin, price_usd, observed_at
from h
where prev_at is null
   or ( (case
           when prov is not null and prev_prov is not null then prov = prev_prov
           else src = prev_src
                and not exists (select 1 from price_methodology_transitions t
                                where t.at > prev_at and t.at <= observed_at)
         end)
        and
        (case
           when dom is not null and prev_dom is not null then dom = prev_dom
           else not (back2_price is not null
                     and price_usd = back2_price
                     and price_usd is distinct from prev_price)
         end) );

grant select on listing_price_display to anon, authenticated;

create or replace view listing_prior_site
with (security_invoker = false) as
select l.vin,
       p.dealer_domain as prior_domain,
       p.price_usd     as prior_price_usd,
       p.observed_at   as prior_last_seen_at,
       e.delisted_at
from listings l
cross join lateral (
  select p.dealer_domain, p.price_usd, p.observed_at
  from listing_price_history p
  where p.vin = l.vin
    and p.price_usd > 0
    and p.dealer_domain is not null
    and p.dealer_domain <> l.dealer_domain
  order by p.observed_at desc
  limit 1
) p
cross join lateral (
  select min(e.observed_at) as delisted_at
  from listing_events e
  where e.vin = l.vin and e.event = 'delisted' and e.observed_at > p.observed_at
) e
where l.delisted_at is null
  and e.delisted_at is not null
  and l.price_usd > 0
  and l.price_usd <> p.price_usd
  and l.dealer_domain like '%.%'
  and p.dealer_domain like '%.%'
  and not exists (
    select 1 from listing_price_history q
    where q.vin = l.vin and q.dealer_domain = p.dealer_domain
      and q.observed_at > e.delisted_at)
  and not exists (
    select 1 from listing_price_history q
    where q.vin = l.vin
      and q.dealer_domain in (l.dealer_domain, p.dealer_domain)
      and q.provenance like 'oem-%');

grant select on listing_prior_site to anon, authenticated;
