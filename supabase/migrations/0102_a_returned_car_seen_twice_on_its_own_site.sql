-- A returned car seen twice on its own site is for sale.
--
-- 2026-09-24. Owner: "my only objective here is to make the site display
-- accurate and timely information about listings." Measured this morning:
-- 1,510 live cars held off the grid by rule 3 (0093) — back after a
-- silence, waiting for their own page's word — and the word cannot come:
-- 1,142 are Porsche rooftops whose pages answer 429 to the recheck while
-- the residential crawl sees the cars every run (1,138 of them seen again
-- within 24 h); 124 more are marketplace-fed rows waiting a median 6–9
-- days. Over a thousand cars seen daily on their dealers' own sites, hidden
-- because a different reader could not confirm them.
--
-- 0093's case was one sighting from one lane — a dealer group's Motive
-- index re-activating a sold truck for an hour. This keeps that guard and
-- adds a second way through it that the flicker cannot satisfy: a car whose
-- headline is a dealer's own site (a domain with a dot — the seller's own
-- statement, per 0089/0092) is served once that site has shown it on two
-- separate crawls at least six hours apart since it returned. Marketplace
-- copies still need the page's word.
--
-- listing_seen.sightings_since_return is kept by 0093's trigger: set to 1
-- on the sighting that marks a return (now 48 h, matching 0101), +1 on
-- every later sighting that is not a confirmation. Backfilled: 2 where the
-- car has been seen since its return, else 1. Dry run before apply:
-- 170,575 → 170,602 rows, none dropped; the Porsche rows admit themselves
-- on their next crawl, which is the intended shape rather than a defect.

alter table listing_seen add column if not exists sightings_since_return integer not null default 0;

create or replace function listing_seen_mark_return()
returns trigger
language plpgsql
as $$
begin
  if new.last_seen_at is not null
     and old.last_seen_at is not null
     and new.last_seen_at > old.last_seen_at + interval '48 hours'
     and new.last_confirmed_at is not distinct from old.last_confirmed_at
  then
    new.returned_at := new.last_seen_at;
    new.sightings_since_return := 1;
  elsif new.returned_at is not null
     and new.last_seen_at is not null and old.last_seen_at is not null
     and new.last_seen_at > old.last_seen_at
     and new.last_confirmed_at is not distinct from old.last_confirmed_at
  then
    new.sightings_since_return := coalesce(old.sightings_since_return, 0) + 1;
  end if;
  return new;
end;
$$;

update listing_seen set sightings_since_return = case when last_seen_at > returned_at then 2 else 1 end
where returned_at is not null and sightings_since_return = 0;

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
    or exists (
      select 1 from listing_offers o
      where o.vin = l.vin
        and o.last_seen_at >= now() - interval '48 hours'
        and position('.' in o.dealer_domain) > 0
    )
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
