-- A car that comes back after a silence needs its own page's word before it
-- is served again.
--
-- Owner, 2026-09-15: a Lightning that "sold at least a week ago" was back on
-- the site with a price. It had been unseen since 09-09 and so withheld by
-- rule 1; at 00:45 UTC its dealer group's Motive index answered a pull with
-- the truck active at a new price, and by 02:00 the same pull no longer had
-- it. One sighting from one lane put a sold car in front of shoppers for as
-- long as rule 1's window allows, and the dealer's own page — which bounced
-- the truck's URL to the inventory index the whole time — was never asked.
--
-- The owner's two goals are comprehensive AND reliable, and the lever that
-- serves both is faster evidence, not a wider or narrower gate. So:
--
--   1. listing_seen.returned_at marks the sighting that brought a car back
--      after more than 36 hours unseen — the same window as rule 1, so a
--      "return" is exactly a car that had left the site. A BEFORE UPDATE
--      trigger sets it on every ingest path at once (ingest_listings' upsert,
--      the rolling crawl, hand relists); a sighting that is itself a
--      confirmation (recheck_listings writes last_seen_at and
--      last_confirmed_at together) is not a return, it is the proof.
--   2. Rule 3 in live_listings_feed: a returned car is served once its own
--      page has confirmed it since the return (last_confirmed_at >=
--      returned_at). Until then it is withheld like any car we cannot vouch
--      for. Nothing is delisted by this; delisted_at stays evidence about
--      the world.
--   3. The waiting is minutes, not a day: recheck-returning.yml runs
--      scraper/recheck.mjs --returning every 30 minutes over exactly these
--      rows, and the browser pass (recheck-browser.mjs) visits them first.
--      Rows the recheck cannot ask — OEM-locator lanes whose sweep is the
--      liveness check, and rows whose source URL is a homepage — have their
--      return waived by that job, so no lane is withheld for lack of a page
--      to read.
--
-- Measured before apply (listing_price_history gaps, a proxy): 3,900–7,400
-- cars a day come back after a >36 h silence. At the fetch recheck's pace
-- (~15 pages/s) that is minutes of work per half hour. Nothing changes at
-- apply time: returned_at is null on every row, so the view's row set is
-- identical (dry-run as a temp view before apply); the rule bites on the
-- next return.
--
-- Body of the view below is 0092's; only rule 3 is added.

alter table listing_seen add column if not exists returned_at timestamptz;

create or replace function listing_seen_mark_return()
returns trigger
language plpgsql
as $$
begin
  if new.last_seen_at is not null
     and old.last_seen_at is not null
     and new.last_seen_at > old.last_seen_at + interval '36 hours'
     and new.last_confirmed_at is not distinct from old.last_confirmed_at
  then
    new.returned_at := new.last_seen_at;
  end if;
  return new;
end;
$$;

drop trigger if exists listing_seen_mark_return on listing_seen;
create trigger listing_seen_mark_return
  before update of last_seen_at on listing_seen
  for each row execute function listing_seen_mark_return();

-- The returning queue is tiny against the table; the partial index keeps
-- recheck --returning's read a lookup rather than a scan.
create index if not exists listing_seen_returned_idx
  on listing_seen (returned_at)
  where returned_at is not null;

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
  select s2.last_seen_at, s2.last_confirmed_at, s2.returned_at
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
  )
  -- rule 3: a car that came back after 36 hours unseen is served once its
  -- own page has said so since the return
  and (s.returned_at is null or s.last_confirmed_at >= s.returned_at);
