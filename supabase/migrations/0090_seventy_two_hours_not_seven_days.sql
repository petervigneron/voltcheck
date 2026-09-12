-- Rule 1 of 0089 tightened from 7 days to 72 hours, the same evening.
--
-- The owner's second truck of the night: 1FT6W1EV7NWG11294, Mastria Mazda,
-- $38,693. Crawled ONCE, on 2026-09-06 at 00:40 UTC, by the browser lane —
-- which was switched off six hours later (06c0c3e) — so no crawl ever came
-- back for it; its page answers 403 to the plain fetch, so the recheck
-- never concluded; and in a real browser the page bounces to the used
-- inventory index: sold. Under 0089's 7-day window it was still served,
-- with a day to go.
--
-- 0089's header rejected 3 days because 7,977 rows failed it that evening
-- and "most of them live cars on rooftops the rolling crawl had not
-- revisited". That was the wrong way round. A car nobody has seen for three
-- days on a rooftop nobody has re-crawled for three days is a car we cannot
-- vouch for, whatever the odds it is still there; the owner's standard is
-- that the site shows what it can stand behind. Measured before apply:
-- 163,349 of 173,147 served; 8,011 withheld (5,618 of them dealer-site
-- rows, the rest the marketplace and sweep lanes); the Mastria truck is
-- withheld.
--
-- A confirmation counts as a sighting: the car's own page answering with
-- its VIN is the best evidence there is, so the window is measured from
-- the later of last_seen_at and last_confirmed_at.
--
-- What has to follow, or this costs coverage it need not: the browser pass
-- (recheck-browser.mjs) now covers dealer-site rows whose page a fetch
-- cannot read, not only the marketplace lanes, so a live car on a 403
-- rooftop is confirmed and re-admitted; and the browser crawl lanes need
-- to come back with a bounded cost, since a rooftop only they can read
-- decays out of the site in three days without them.

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
  -- rule 1: seen, or confirmed on its own page, within 72 hours
  and greatest(coalesce(s.last_seen_at, l.first_seen_at),
               coalesce(s.last_confirmed_at, s.last_seen_at, l.first_seen_at)) >= now() - interval '72 hours'
  -- rule 2: a marketplace-fed car is served only on its own page's word
  and (
    l.dealer_domain not in ('ford-blue-advantage', 'honda-prologue', 'hyundai-cpo', 'audi-network')
    or s.last_confirmed_at >= now() - interval '48 hours'
  );
