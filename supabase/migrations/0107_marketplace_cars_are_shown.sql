-- Marketplace cars are shown.
--
-- 2026-10-05. Owner, on finding that two used F-150 Lightnings he was
-- shopping (Pennyrile Ford and Cosmo Motors, both read only through the
-- Ford Blue Advantage feed) were in the database but 404 on the site:
-- "Make them all visible now."
--
-- Rule 2 (0089, widened by 0092 and 0106) served a marketplace-labelled car
-- only on its own page's word, or a dealer-site source's, within 48 hours.
-- Measured this afternoon, the cars it held back were not stale: they are
-- seen by their marketplace feed on every sweep. What they lack is a
-- readable dealer site. Pennyrile answers Akamai 403 and Cosmo serves a
-- Cloudflare challenge, so the confirmation rule 2 waits for cannot arrive,
-- and the cars stayed hidden for as long as they were for sale.
--
-- Rule 2 goes. A marketplace sighting now counts as a sighting, the same
-- as a dealer-site one, and rule 1's 48-hour freshness still governs every
-- row. Rule 3's marketplace exclusion goes with it: a car back after 48
-- hours unseen is served on two sightings at least six hours apart,
-- whichever source makes them. 0093's guard against a single flickering
-- sighting is untouched.
--
-- Dry run against the live tables before apply (temp view, rolled back):
-- 164,514 -> 165,814 rows (+1,300), 0 dropped. Rule 2's own count
-- was 681 when a NULL last_confirmed_at was read as "fails"; the other ~620
-- were rows whose rule-2 test came out NULL. The view drops those too, so
-- both groups were withheld. 153 returned cars still wait on rule 3's
-- second sighting.
--
-- Body is 0106's, read against pg_get_viewdef at apply time. Only the WHERE
-- clause changes.

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
  -- rule 2 (0089-0106, marketplace cars need a dealer-site word) removed
  -- by 0107: see the header.
  -- rule 3: a car that came back after 48 hours unseen is served once its
  -- own page has said so since the return, or once it has been seen on two
  -- separate crawls at least six hours apart since the return. One sighting
  -- from one lane is the Motive-index flicker 0093 was written for.
  and (
    s.returned_at is null
    or s.last_confirmed_at >= s.returned_at
    or (s.sightings_since_return >= 2
        and s.last_seen_at >= s.returned_at + interval '6 hours')
  );
