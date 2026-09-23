-- The seller-change event has a kind of its own, and its detail has a column.
--
-- 2026-09-23, minutes after 0094. Its control test on a synthetic VIN failed
-- on the first seller change: listing_events.event is CHECK-constrained to
-- 'listed' / 'delisted' / 'relisted' (0006), and 0094 wrote the change as
-- free text in that column. The whole ingest batch rolled back, which is
-- exactly what would have happened to the nightly. The test VIN caught it;
-- no production batch ran between the two migrations.
--
-- event = 'seller_changed' joins the constraint; the from -> to sites and
-- the reason go in a new `detail` column, null for every other kind.
-- ingest_listings is 0094's verbatim except the two inserts.

alter table listing_events add column if not exists detail text;
alter table listing_events drop constraint if exists listing_events_event_check;
alter table listing_events add constraint listing_events_event_check
  check (event = any (array['listed'::text, 'delisted'::text, 'relisted'::text, 'seller_changed'::text]));

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
  insert into listing_events (vin, run_id, event, detail)
  select i.vin, _run_id, 'seller_changed',
         p.dealer_domain || ' -> ' || i.dealer_domain
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

  insert into listing_events (vin, run_id, event, detail)
  select m.vin, _run_id, 'seller_changed', m.from_domain || ' -> ' || m.to_domain || ' (previous site dropped it)'
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
