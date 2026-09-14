-- The dealer's own site vouches for a marketplace car.
--
-- 2026-09-14, ~20:45 UTC: the owner found "tons of pages 404-ing". Measured
-- from the served grid: 11 of 426 sampled cards (2.6%, ~4,000 cars) opened
-- to a 404, and every one of them was a Ford Blue Advantage or Honda
-- Prologue row — served by the 13:49 publish, withheld by rule 2 at the
-- moment of the click.
--
-- What moved between the publish and the click was not the evidence for the
-- car but its label. listings.dealer_domain is whichever source saw the car
-- LAST. A Mach-E co-listed on the dealer's own site and on Blue Advantage is
-- read by the rolling crawl at 00:03 as covertford.com — a dealer-site row,
-- rule 2 does not apply, served — and by the marketplace sweep at 17:30 as
-- ford-blue-advantage — rule 2 applies, its last own-page confirmation is
-- from 09-12, withheld. Same car, same evidence, two answers, and the grid
-- (a snapshot) and the page (live) give different ones until the next
-- publish. listing_price_history for 3FMTK1R4XTMA23088 shows the flip on
-- every sweep: ford-blue-advantage 09-14 17:30, covertford.com 09-14 00:03,
-- ford-blue-advantage 09-13 15:34, covertford.com 09-12 23:52.
--
-- 0089's own rejection of applying rule 2 to every lane already states the
-- fix: "a dealer-site row was read from the dealer's own inventory page —
-- that IS the seller's statement". Rule 2 exists because a marketplace copy
-- of a dealer's feed is not the seller's statement; the dealer's own
-- inventory page is, whichever source happened to write the row last. So a
-- marketplace-labelled car is now also served when a non-marketplace source
-- observed it within the same 36 hours. Rule 1 is untouched.
--
-- The evidence is read from listing_price_history, which gets one row per
-- sighting per source (276,396 rows in the last 36 h against ~170k live
-- cars) and carries the observing dealer_domain; price_history_vin_idx
-- (vin, observed_at) makes it a PK-shaped probe, the same one the price
-- lateral above already makes per row. A sighting the ingest declined to
-- price (0039 keeps abstains out of this table) leaves no row and so does
-- not vouch; that direction only ever withholds.
--
-- Measured before apply, 20:55 UTC: 5,260 marketplace-labelled rows failed
-- rule 2; 2,212 of them had a dealer-site observation within 36 h (2,198
-- within 24 h) and are re-admitted; the other ~3,050 have no source but the
-- marketplace index and stay withheld — most are Akamai-403 rooftops that
-- the browser pass cannot read either (recheck-browser 09-13: 19,735 loaded,
-- 1,200 visited, 282 confirmed). Nothing that is served today is dropped:
-- the change only adds a disjunct.
--
-- What this does not fix: the grid is a snapshot and the page is live, so
-- any car that leaves the view between publishes 404s from its card until
-- the next publish. That gap is now the cars that genuinely age out, not
-- the cars whose label flipped.
--
-- Body below is 0091's, read against pg_get_viewdef at 20:52 UTC (WHERE
-- clause identical); only rule 2 changes.

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
  -- rule 1: seen, or confirmed on its own page, within 36 hours
  and greatest(coalesce(s.last_seen_at, l.first_seen_at),
               coalesce(s.last_confirmed_at, s.last_seen_at, l.first_seen_at)) >= now() - interval '36 hours'
  -- rule 2: a marketplace-fed car is served on its own page's word, or on
  -- the word of a dealer-site source that listed it, within 36 hours
  and (
    l.dealer_domain not in ('ford-blue-advantage', 'honda-prologue', 'hyundai-cpo', 'audi-network')
    or s.last_confirmed_at >= now() - interval '36 hours'
    or exists (
      select 1 from listing_price_history p
      where p.vin = l.vin
        and p.observed_at >= now() - interval '36 hours'
        and p.dealer_domain not in ('ford-blue-advantage', 'honda-prologue', 'hyundai-cpo', 'audi-network')
    )
  );
