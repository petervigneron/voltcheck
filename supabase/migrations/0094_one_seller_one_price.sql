-- One seller, one price.
--
-- 2026-09-23. The owner: "Prices change every time I do a new search."
-- Measured: of the 748 F-150 Lightnings for sale, 421 changed price in the
-- last seven days and 418 of those went A → B → A — not a cut, a flap. One
-- 2023 Lariat is on nine sites of one North Carolina dealer group at four
-- prices ($48,900 / $49,125 / $49,799 / $50,698) plus Ford Blue Advantage at
-- a fifth, and its headline price changed 311 times in 14 days without the
-- dealer touching it. Sitewide, 49,182 of the 70,821 cars seen in the last
-- 36 hours are on two or more sites at once (one is on twenty), and
-- listing_price_history has grown to 5.2 million rows — a gigabyte — most
-- of them this rotation.
--
-- The cause is one line of ingest_listings: on conflict, price_usd and
-- dealer_domain are set from whichever site was crawled last. The grid is a
-- snapshot of that, so two publishes a few hours apart show a shopper two
-- prices for a car nobody repriced, and the "price history" under it is
-- the crawl order of a dealer group's websites.
--
-- The rule now:
--
--   1. listing_offers holds every site that shows a car — one row per
--      (vin, site) with that site's price, page and dealer name, refreshed
--      on every sighting. A sighting is evidence the car is for sale
--      (listing_seen, rule 1 of live_listings_feed) whether or not it sets
--      the headline.
--   2. The headline — price, seller, payload — stays with the site that
--      holds it while that site keeps showing the car (its own crawl within
--      36 h, or its own page confirmed by recheck). A sibling site's price
--      does not move it.
--   3. Two upgrades do move it, because they are better evidence of who is
--      selling: the dealer's own site over a maker's marketplace copy
--      (0089/0092 already treat the own page as the seller's statement),
--      and the rooftop the marketplace NAMES as the seller over a sibling
--      site of the same group (Blue Advantage carries the certified dealer's
--      name; 424 of the 748 Lightnings appear there). That is the owner's
--      "list it where it is actually for sale", as far as the sources say.
--   4. Once the incumbent has been silent for 36 h, the next site to show
--      the car takes the headline, and listing_events records
--      'seller_changed <from> -> <to>' with the reason. A car whose
--      headline site certifies a complete crawl without it, while another
--      site showed it within 36 h, MOVES to that site instead of delisting,
--      with the same event. Wholesale moves and group transfers are in that
--      table from tonight; the owner asked to be able to see them.
--   5. Price and mileage history are written only when the headline
--      changes, so from tonight they record what a seller did, not which
--      of its sites we read.
--
-- listing_offers is backfilled from the last 36 h of price history so the
-- incumbent-liveness test has evidence from the first run; marketplace
-- dealer names fill in as the sweeps run. live_listings_feed's rule 2 reads
-- the same table instead of price history, since non-headline sightings no
-- longer write history. recheck_listings (0082) is untouched: it asks the
-- headline's own page, and its confirmation is read here as liveness.
--
-- Not done here, deliberately: choosing among a group's sibling sites when
-- no marketplace names the rooftop. The pages carry no such fact (a
-- Lightning on crossroadsnissanwf.com shows that store's name and phone),
-- so the site keeps the incumbent rather than guess by brand. A shopper
-- sees one price and one seller; the other sites are on the record.

create or replace function name_key(_name text)
returns text
language sql
immutable
as $$ select regexp_replace(lower(coalesce(_name, '')), '[^a-z0-9]', '', 'g') $$;

create table if not exists listing_offers (
  vin           text not null,
  dealer_domain text not null,
  price_usd     integer,
  provenance    text,
  dealer_name   text,
  source_url    text,
  stock_number  text,
  payload       jsonb,
  first_seen_at timestamptz not null default now(),
  last_seen_at  timestamptz not null default now(),
  last_run      bigint,
  primary key (vin, dealer_domain)
);
create index if not exists listing_offers_vin_seen_idx on listing_offers (vin, last_seen_at desc);
create index if not exists listing_offers_seen_idx on listing_offers (last_seen_at);
alter table listing_offers enable row level security;
-- No anon policy: the public site publishes what it publishes (0007 posture).

-- Backfill: every (vin, site) that showed a live car in the last 36 hours,
-- at that site's latest price; the headline site's row also carries the
-- payload the listing holds today.
insert into listing_offers (vin, dealer_domain, price_usd, provenance, dealer_name, source_url, stock_number, payload, first_seen_at, last_seen_at, last_run)
select x.vin, x.dealer_domain, x.price_usd, x.provenance,
       case when l.dealer_domain = x.dealer_domain then l.payload->>'dealerName' end,
       case when l.dealer_domain = x.dealer_domain then l.payload->>'sourceUrl' end,
       case when l.dealer_domain = x.dealer_domain then l.payload->>'stockNumber' end,
       case when l.dealer_domain = x.dealer_domain then l.payload end,
       x.first_at, x.last_at, x.run_id
from (
  select distinct on (p.vin, p.dealer_domain) p.vin, p.dealer_domain, p.price_usd, p.provenance, p.run_id,
         max(p.observed_at) over (partition by p.vin, p.dealer_domain) as last_at,
         min(p.observed_at) over (partition by p.vin, p.dealer_domain) as first_at
  from listing_price_history p
  where p.observed_at >= now() - interval '36 hours' and p.dealer_domain is not null
  order by p.vin, p.dealer_domain, p.observed_at desc
) x
join listings l on l.vin = x.vin and l.delisted_at is null
on conflict (vin, dealer_domain) do nothing;

create or replace function ingest_listings(
  _rows jsonb,
  _source text default 'nightly',
  _complete_domains jsonb default null,
  _observed_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  _run_id bigint;
  _obs timestamptz := coalesce(_observed_at, now());
  _seen integer := 0;
  _added integer := 0;
  _changed integer := 0;
  _delisted integer := 0;
  _relisted integer := 0;
begin
  insert into ingest_runs (source) values (coalesce(_source, 'nightly')) returning id into _run_id;

  drop table if exists _incoming;
  create temp table _incoming on commit drop as
    select distinct on (upper(x->>'vin'))
      upper(x->>'vin')                       as vin,
      round((x->>'priceUsd')::numeric)::int  as price_usd,
      (x->>'year')::smallint                 as year,
      x->>'make'                             as make,
      x->>'model'                            as model,
      x->>'trim'                             as vehicle_trim,
      (x->>'mileage')::int                   as mileage,
      x->>'condition'                        as condition,
      x->>'state'                            as state,
      x->>'zip'                              as zip,
      x->>'dealerDomain'                     as dealer_domain,
      x->>'provenance'                       as provenance,
      -- provenance is price metadata, not a car attribute: it must never enter
      -- the stored payload, or an unchanged car would compare non-equal the
      -- first night the scraper emits it and force a wide rewrite (0025).
      (x - 'provenance')                     as payload
    from jsonb_array_elements(coalesce(_rows, '[]'::jsonb)) as x
    where coalesce(x->>'vin', '') <> ''
      and (x->>'priceUsd') ~ '^[0-9]+(\.[0-9]+)?$';

  -- vin is unique here (distinct on above); index + stats let every downstream
  -- join and the delisting anti-join hash instead of nested-loop (0016).
  create index on _incoming (vin);
  analyze _incoming;

  select count(*) into _seen from _incoming;

  drop table if exists _prior;
  create temp table _prior on commit drop as
    select l.vin, l.price_usd, l.mileage, l.dealer_domain,
           l.payload->>'dealerName' as dealer_name,
           (l.delisted_at is not null) as was_delisted,
           -- guard (a): the delisting is newer than this batch's observation
           (l.delisted_at is not null and l.delisted_at > _obs) as blocked,
           -- payload-equal implies row-equal; see 0025 header
           (l.payload is distinct from i.payload) as data_changed
    from listings l
    join _incoming i using (vin);

  create index on _prior (vin);
  analyze _prior;

  -- One seller, one price. Which site's word sets this car's headline:
  --   * a new car, a relisted car, or a sighting from the site that already
  --     holds the headline: the incoming row, as always;
  --   * a different site while the incumbent has shown the car within 36 h
  --     (its own crawl, or its own page confirmed by recheck): the incumbent
  --     KEEPS it — the sighting is recorded in listing_offers and counts as
  --     proof the car is for sale, but rewrites nothing a shopper sees;
  --   * a dealer's own site over a maker's marketplace copy, or the rooftop
  --     the marketplace names as the seller over a sibling site in the same
  --     group: the incoming row takes the headline (an upgrade, not a move);
  --   * a different site once the incumbent has been silent for 36 h: the
  --     incoming row takes it, and listing_events records the change of
  --     seller — a wholesale move, a group transfer, or a site that dropped
  --     the car first. That record is how dealer-to-dealer sales get found.
  drop table if exists _decide;
  create temp table _decide on commit drop as
    select i.vin,
           p.dealer_domain as incumbent,
           (p.vin is not null and not p.was_delisted
              and p.dealer_domain is distinct from i.dealer_domain
              and (exists (select 1 from listing_offers o
                            where o.vin = i.vin and o.dealer_domain = p.dealer_domain
                              and o.last_seen_at >= _obs - interval '36 hours')
                   or exists (select 1 from listing_seen s
                            where s.vin = i.vin and s.last_confirmed_at >= _obs - interval '36 hours')))
             as incumbent_live,
           (position('.' in coalesce(p.dealer_domain, '')) = 0) as incumbent_marketplace,
           (position('.' in coalesce(i.dealer_domain, '')) = 0) as challenger_marketplace,
           (exists (select 1 from listing_offers o
                     where o.vin = i.vin and position('.' in o.dealer_domain) = 0
                       and o.last_seen_at >= _obs - interval '7 days'
                       and name_key(o.dealer_name) <> ''
                       and name_key(o.dealer_name) = name_key(i.payload->>'dealerName'))
            and not exists (select 1 from listing_offers o2
                     where o2.vin = i.vin and position('.' in o2.dealer_domain) = 0
                       and o2.last_seen_at >= _obs - interval '7 days'
                       and name_key(o2.dealer_name) <> ''
                       and name_key(o2.dealer_name) = name_key(p.dealer_name)))
             as challenger_is_home
    from _incoming i
    left join _prior p using (vin);

  alter table _decide add column takes_headline boolean;
  update _decide d set takes_headline =
       d.incumbent is null
    or not d.incumbent_live
    or (d.incumbent_marketplace and not d.challenger_marketplace)
    or (d.challenger_is_home and not d.challenger_marketplace);
  create index on _decide (vin);
  analyze _decide;

  select count(*) into _relisted from _prior where was_delisted and not blocked;

  insert into listings as l
    (vin, payload, price_usd, year, make, model, vehicle_trim, mileage,
     condition, state, zip, dealer_domain, first_seen_at, created_run)
  select
    i.vin, i.payload, i.price_usd, i.year, i.make, i.model, i.vehicle_trim,
    i.mileage, i.condition, i.state, i.zip, i.dealer_domain, now(), _run_id
  from _incoming i
  left join _prior p using (vin)
  join _decide d using (vin)
  -- the churn cut: unchanged live rows never enter the upsert at all
  where d.takes_headline
    and (p.vin is null
         or (not p.blocked and (p.data_changed or p.was_delisted)))
  on conflict (vin) do update set
    payload       = excluded.payload,
    price_usd     = excluded.price_usd,
    year          = excluded.year,
    make          = excluded.make,
    model         = excluded.model,
    vehicle_trim  = excluded.vehicle_trim,
    mileage       = excluded.mileage,
    condition     = excluded.condition,
    state         = excluded.state,
    zip           = excluded.zip,
    dealer_domain = excluded.dealer_domain,
    delisted_at   = null,
    updated_at    = now()
  -- guard (a): a row delisted after this batch was observed stays delisted
  -- and stays exactly as it was — stale payload is no better than stale
  -- lifecycle state.
  where l.delisted_at is null or l.delisted_at <= _obs;

  -- Every non-blocked sighting is recorded, narrow. This write is what the
  -- delisting guards read; skipping it for "unchanged" rows would reopen
  -- the 0013 stale-replay hole (see 0025 header).
  insert into listing_seen as s (vin, last_seen_at, last_seen_run)
  select i.vin, now(), _run_id
  from _incoming i
  left join _prior p using (vin)
  where not coalesce(p.blocked, false)
  on conflict (vin) do update set
    last_seen_at  = excluded.last_seen_at,
    last_seen_run = excluded.last_seen_run;

  -- Every site that shows the car, with that site's own price and page.
  -- Headline or not, a sighting lands here; this is where "also listed at"
  -- and the incumbent-liveness test above read from.
  insert into listing_offers as o
    (vin, dealer_domain, price_usd, provenance, dealer_name, source_url, stock_number, payload,
     first_seen_at, last_seen_at, last_run)
  select i.vin, i.dealer_domain, i.price_usd, i.provenance,
         i.payload->>'dealerName', i.payload->>'sourceUrl', i.payload->>'stockNumber', i.payload,
         now(), now(), _run_id
  from _incoming i
  left join _prior p using (vin)
  where i.dealer_domain is not null
    and not coalesce(p.blocked, false)
  on conflict (vin, dealer_domain) do update set
    price_usd    = excluded.price_usd,
    provenance   = excluded.provenance,
    dealer_name  = excluded.dealer_name,
    source_url   = excluded.source_url,
    stock_number = excluded.stock_number,
    payload      = excluded.payload,
    last_seen_at = excluded.last_seen_at,
    last_run     = excluded.last_run;

  _added := _seen - (select count(*) from _prior);

  -- i.price_usd <> 0 keeps abstains out of the history (0039). provenance
  -- names which served field produced this price (0041); dealer_domain names
  -- which dealer site served it (this migration) — a later step is only
  -- claimable against a row matching on BOTH (see live_listings_feed).
  insert into listing_price_history (vin, run_id, price_usd, provenance, dealer_domain)
  select i.vin, _run_id, i.price_usd, i.provenance, i.dealer_domain
  from _incoming i
  left join _prior p using (vin)
  join _decide d using (vin)
  where d.takes_headline
    and (p.vin is null or p.price_usd is distinct from i.price_usd)
    and i.price_usd <> 0
    and not coalesce(p.blocked, false);

  -- Odometer readings land in the log the same way prices do: first
  -- sighting and every change. A null incoming mileage is data absence,
  -- not an observation, and is never logged.
  insert into listing_mileage_history (vin, run_id, mileage)
  select i.vin, _run_id, i.mileage
  from _incoming i
  left join _prior p using (vin)
  join _decide d using (vin)
  where d.takes_headline
    and i.mileage is not null
    and (p.vin is null or p.mileage is distinct from i.mileage)
    and not coalesce(p.blocked, false);

  insert into listing_events (vin, run_id, event)
  select i.vin, _run_id, 'listed'
  from _incoming i
  left join _prior p using (vin)
  where p.vin is null;

  insert into listing_events (vin, run_id, event)
  select i.vin, _run_id, 'relisted'
  from _incoming i
  join _prior p using (vin)
  where p.was_delisted and not p.blocked;

  select count(*) into _changed
  from _incoming i
  join _prior p using (vin)
  join _decide d using (vin)
  where d.takes_headline and p.price_usd is distinct from i.price_usd and not p.blocked;

  -- The change of seller, on the record. Read this table for cars that moved
  -- between dealers: the previous site went silent and another took over.
  insert into listing_events (vin, run_id, event)
  select i.vin, _run_id,
         'seller_changed ' || p.dealer_domain || ' -> ' || i.dealer_domain
         || case when not d.incumbent_live then ' (previous site silent)'
                 when d.incumbent_marketplace then ' (own site over marketplace)'
                 else ' (home rooftop)' end
  from _incoming i
  join _prior p using (vin)
  join _decide d using (vin)
  where d.takes_headline and not p.was_delisted and not p.blocked
    and p.dealer_domain is distinct from i.dealer_domain;

  -- Candidates for delisting: the headline site certified a complete crawl
  -- and did not show the car, and nothing newer vouches for it.
  drop table if exists _gone;
  create temp table _gone on commit drop as
    select l.vin, l.dealer_domain
    from listings l
    where l.delisted_at is null
      and l.dealer_domain in (
        select jsonb_array_elements_text(coalesce(_complete_domains, '[]'::jsonb))
      )
      and l.dealer_domain in (
        select distinct dealer_domain from _incoming where dealer_domain is not null
      )
      and not exists (select 1 from _incoming i where i.vin = l.vin)
      and not exists (
        select 1 from listing_seen s
        where s.vin = l.vin
          and (s.last_seen_at > _obs or s.last_confirmed_at > _obs)
      );

  -- A car the headline site dropped but another site showed within 36 h is
  -- still for sale: it moves to that site (own site before marketplace,
  -- freshest first) instead of leaving. Its history records the move.
  drop table if exists _moved;
  create temp table _moved on commit drop as
    select distinct on (g.vin) g.vin, g.dealer_domain as from_domain, o.dealer_domain as to_domain,
           o.price_usd, o.provenance, o.payload
    from _gone g
    join listing_offers o on o.vin = g.vin
    where o.dealer_domain <> g.dealer_domain
      and o.last_seen_at >= _obs - interval '36 hours'
      and o.price_usd > 0
      and o.payload is not null
    order by g.vin, (position('.' in o.dealer_domain) > 0) desc, o.last_seen_at desc;

  update listings l
  set payload = m.payload, price_usd = m.price_usd, dealer_domain = m.to_domain,
      state = coalesce(m.payload->>'state', l.state), zip = coalesce(m.payload->>'zip', l.zip),
      updated_at = now()
  from _moved m where m.vin = l.vin;

  insert into listing_price_history (vin, run_id, price_usd, provenance, dealer_domain)
  select m.vin, _run_id, m.price_usd, m.provenance, m.to_domain
  from _moved m
  where m.price_usd <> 0;

  insert into listing_events (vin, run_id, event)
  select m.vin, _run_id, 'seller_changed ' || m.from_domain || ' -> ' || m.to_domain || ' (previous site dropped it)'
  from _moved m;

  delete from _gone g where exists (select 1 from _moved m where m.vin = g.vin);

  with gone as (
    update listings l
    set delisted_at = now(), updated_at = now()
    where l.delisted_at is null
      and l.vin in (select vin from _gone)
    returning l.vin
  )
  insert into listing_events (vin, run_id, event)
  select vin, _run_id, 'delisted' from gone;
  get diagnostics _delisted = row_count;

  update ingest_runs
  set finished_at = now(),
      listings_seen = _seen,
      listings_new = _added,
      listings_price_changed = _changed,
      listings_delisted = _delisted,
      listings_relisted = _relisted
  where id = _run_id;

  return jsonb_build_object(
    'run_id', _run_id, 'seen', _seen, 'new', _added,
    'price_changed', _changed, 'delisted', _delisted, 'relisted', _relisted);
end;
$$;

revoke execute on function ingest_listings(jsonb, text, jsonb, timestamptz) from public, anon, authenticated;

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
      select 1 from listing_offers o
      where o.vin = l.vin
        and o.last_seen_at >= now() - interval '36 hours'
        and position('.' in o.dealer_domain) > 0
    )
  )
  -- rule 3: a car that came back after 36 hours unseen is served once its
  -- own page has said so since the return
  and (s.returned_at is null or s.last_confirmed_at >= s.returned_at);

