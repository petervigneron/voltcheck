-- One reader, one price: a site's asking price moves only on a like-for-like
-- reading, and the chart and the headline follow the same chain.
--
-- 2026-09-25. Owner: "There is no price graph for this truck, and its price
-- flaps daily" — 1FTVW1EV5NWG04274, a 2022 Lightning Lariat at Bayside CDJR
-- Annapolis. The page prints three numbers: Internet Price $37,000,
-- Processing Fee $799, Bayside Price $37,799. Two of our readers hit that one
-- site: the nightly crawl pulls Team Velocity's `yourPrice` ($37,000,
-- tv-retail) and the recheck reads the page's schema.org offer ($37,799,
-- jsonld, the fee folded in). Each wrote the headline in turn — 6 flips a
-- day since Sep 16, 50 history rows for a truck the dealer never repriced.
-- The chart was blank for the same reason: 0041's guard keeps only the
-- tv-retail chain, and the page drops a series that does not end on the
-- headline (priceSeries.ts), which it never did on a jsonld night.
--
-- This is the 2026-08-19 mechanism (crawl reads one field, recheck reads
-- another) with the chart protected and the headline not. 0094 stopped the
-- cross-SITE flap by making the headline sticky to a seller; this stops the
-- same flap within one site by making a site's price sticky to the reader
-- that set it. Measured over the last 48 h before this migration: 4,728 live
-- cars on 518 sites flapped between two provenances on their own headline
-- site — 33,774 history rows, 14% of everything written — and on 4,301 of
-- them the chart was blank. jsonld read higher than the platform field in
-- 85% of pairs (medians: +$200 oneaudi-sale, +$413 tv-retail, +$490
-- deol-internet, +$589 dfire-advertised, +$800 tv-selling), which is a doc
-- fee, not a repricing. 14,515 of the jsonld rows came from the recheck.
--
-- THE RULE. listing_offers already holds one row per (vin, site) with the
-- provenance of the price it carries. A reading on that site whose provenance
-- differs from the row's does not move the price — not the offer, not the
-- headline, not history — unless the row's own reader has been silent for
-- 48 h (price_seen_at, bumped by every same-provenance reading whatever its
-- price; null reads as last_seen_at so the column needs no backfill). Then
-- the other reader takes over, with a history row, and 0041 keeps that step
-- off the chart. A disputed reading still counts as a sighting: liveness
-- (listing_seen, last_confirmed_at, offers.last_seen_at) is untouched.
-- Recheck now maintains listing_offers too; before this it changed headlines
-- the offers table never saw.
--
-- No preference between readers, deliberately. "Prefer the platform field"
-- would be right for Team Velocity ($37,000 is the pre-fee ask, our
-- convention) and wrong for the OEM locators (honda-prologue's
-- oem-honda-model-msrp is Honda's MSRP, $2,493 under what the dealer's page
-- asks for 3GPKHURM1TS514885 — a false bargain, the expensive direction).
-- Which reader is right is a per-lane extractor question and stays one.
--
-- SEED. Where the chart's last point (listing_price_display) is not the
-- headline and the reader that produced it was seen on the headline site in
-- the last 48 h, the headline moves to the chart's price and the offer row
-- takes that reader — 4,043 cars, median move $175, 499 landing on jsonld.
-- Both numbers were the dealer's own and the site had been alternating them
-- daily; this picks the one its chart has claimed all along. No history row
-- is written (the chart already ends there). Offer rows on a headline site
-- that disagree with the headline are then aligned to it, so the reader rule
-- has a reference on every live car.

alter table listing_offers add column if not exists price_seen_at timestamptz;

-- ── Seed 1: the headline follows the chart where the chart's reader is current

drop table if exists _seed;
create temp table _seed as
  with last_disp as (
    select distinct on (vin) vin, price_usd as disp_price
    from listing_price_display
    order by vin, observed_at desc
  )
  select l.vin, l.dealer_domain, d.disp_price, h.provenance, h.observed_at
  from listings l
  join last_disp d on d.vin = l.vin
  cross join lateral (
    select h.provenance, h.observed_at
    from listing_price_history h
    where h.vin = l.vin and h.dealer_domain = l.dealer_domain
      and h.price_usd = d.disp_price
      and h.observed_at > now() - interval '48 hours'
    order by h.observed_at desc
    limit 1
  ) h
  where l.delisted_at is null
    and d.disp_price > 0
    and d.disp_price <> l.price_usd;

create index on _seed (vin);

update listings l
set price_usd  = s.disp_price,
    payload    = jsonb_set(l.payload, '{priceUsd}', to_jsonb(s.disp_price)),
    updated_at = now()
from _seed s
where s.vin = l.vin;

insert into listing_offers as o (vin, dealer_domain, price_usd, provenance, first_seen_at, last_seen_at, price_seen_at)
select s.vin, s.dealer_domain, s.disp_price, s.provenance, s.observed_at, s.observed_at, s.observed_at
from _seed s
on conflict (vin, dealer_domain) do update set
  price_usd     = excluded.price_usd,
  provenance    = excluded.provenance,
  price_seen_at = excluded.price_seen_at;

-- ── Seed 2: every live headline site's offer row agrees with the headline

update listing_offers o
set price_usd     = l.price_usd,
    provenance    = coalesce(h.provenance, o.provenance),
    price_seen_at = coalesce(h.observed_at, o.price_seen_at)
from listings l
left join lateral (
  select h.provenance, h.observed_at
  from listing_price_history h
  where h.vin = l.vin and h.dealer_domain = l.dealer_domain and h.price_usd = l.price_usd
  order by h.observed_at desc
  limit 1
) h on true
where l.delisted_at is null
  and o.vin = l.vin and o.dealer_domain = l.dealer_domain
  and o.price_usd is distinct from l.price_usd;

drop table if exists _seed;

-- ── ingest_listings

create or replace function ingest_listings(
  _rows jsonb,
  _source text default 'nightly',
  _complete_domains jsonb default null,
  _observed_at timestamptz default null
) returns jsonb
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

  drop table if exists _raw;
  create temp table _raw on commit drop as
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
      (x - 'provenance')                     as payload
    from jsonb_array_elements(coalesce(_rows, '[]'::jsonb)) as x
    where coalesce(x->>'vin', '') <> ''
      and (x->>'priceUsd') ~ '^[0-9]+(\.[0-9]+)?$';

  create index on _raw (vin);
  analyze _raw;

  -- One reader, one price (0103): the reading's price and provenance stand
  -- only when they are like-for-like with the offer row this site already
  -- holds, or when that row's own reader has been silent 48 h. Otherwise the
  -- row keeps the offer's price and provenance, and the payload it carries
  -- says the kept price, so an unchanged car still compares equal (0025).
  drop table if exists _incoming;
  create temp table _incoming on commit drop as
    select x.vin, x.year, x.make, x.model, x.vehicle_trim, x.mileage, x.condition,
           x.state, x.zip, x.dealer_domain,
           x.provenance as read_provenance,
           case when x.reader_ok then x.price_usd  else x.kept_price      end as price_usd,
           case when x.reader_ok then x.provenance else x.kept_provenance end as provenance,
           case when x.reader_ok or x.kept_price = x.price_usd then x.payload
                else jsonb_set(x.payload, '{priceUsd}', to_jsonb(x.kept_price)) end as payload
    from (
      select r.*,
             o.price_usd  as kept_price,
             o.provenance as kept_provenance,
             (o.vin is null
               or coalesce(o.price_usd, 0) = 0
               or o.provenance is null
               or r.provenance is null
               or o.provenance = r.provenance
               or coalesce(o.price_seen_at, o.last_seen_at) < _obs - interval '48 hours') as reader_ok
      from _raw r
      left join listing_offers o on o.vin = r.vin and o.dealer_domain = r.dealer_domain
    ) x;

  create index on _incoming (vin);
  analyze _incoming;

  select count(*) into _seen from _incoming;

  drop table if exists _prior;
  create temp table _prior on commit drop as
    select l.vin, l.price_usd, l.mileage, l.dealer_domain,
           l.payload->>'dealerName' as dealer_name,
           (l.delisted_at is not null) as was_delisted,
           (l.delisted_at is not null and l.delisted_at > _obs) as blocked,
           (l.payload is distinct from i.payload) as data_changed
    from listings l
    join _incoming i using (vin);

  create index on _prior (vin);
  analyze _prior;

  drop table if exists _decide;
  create temp table _decide on commit drop as
    select d.*,
           (d.incumbent is null
             or not d.incumbent_live
             or (d.incumbent_marketplace and not d.challenger_marketplace)
             or (d.challenger_is_home and not d.challenger_marketplace)) as takes_headline
    from (
      select i.vin,
             p.dealer_domain as incumbent,
             (p.vin is not null and not p.was_delisted
                and p.dealer_domain is distinct from i.dealer_domain
                and (exists (select 1 from listing_offers o
                              where o.vin = i.vin and o.dealer_domain = p.dealer_domain
                                and o.last_seen_at >= _obs - interval '48 hours')
                     or exists (select 1 from listing_seen s
                              where s.vin = i.vin and s.last_confirmed_at >= _obs - interval '48 hours')))
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
      left join _prior p using (vin)
    ) d;

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
  where l.delisted_at is null or l.delisted_at <= _obs;

  insert into listing_seen as s (vin, last_seen_at, last_seen_run)
  select i.vin, now(), _run_id
  from _incoming i
  left join _prior p using (vin)
  where not coalesce(p.blocked, false)
  on conflict (vin) do update set
    last_seen_at  = excluded.last_seen_at,
    last_seen_run = excluded.last_seen_run;

  -- A full offers row only when the site's price moved (0097); the kept
  -- price of a disputed reading equals the row's, so it writes nothing here.
  insert into listing_offers as o
    (vin, dealer_domain, price_usd, provenance, dealer_name, source_url, stock_number, payload,
     first_seen_at, last_seen_at, price_seen_at, last_run)
  select i.vin, i.dealer_domain, i.price_usd, i.provenance,
         i.payload->>'dealerName', i.payload->>'sourceUrl', i.payload->>'stockNumber', i.payload,
         now(), now(), now(), _run_id
  from _incoming i
  left join _prior p using (vin)
  where i.dealer_domain is not null
    and not coalesce(p.blocked, false)
  on conflict (vin, dealer_domain) do update set
    price_usd     = excluded.price_usd,
    provenance    = excluded.provenance,
    dealer_name   = excluded.dealer_name,
    source_url    = excluded.source_url,
    stock_number  = excluded.stock_number,
    payload       = excluded.payload,
    last_seen_at  = excluded.last_seen_at,
    price_seen_at = excluded.price_seen_at,
    last_run      = excluded.last_run
  where o.price_usd is distinct from excluded.price_usd;

  -- Every other sighting touches the row: seen now, and — when the reading
  -- came from the row's own reader — its price seen now too.
  update listing_offers o
  set last_seen_at  = now(),
      last_run      = _run_id,
      price_seen_at = case when i.read_provenance is null or o.provenance is null
                                or i.read_provenance = o.provenance
                           then now() else o.price_seen_at end
  from _incoming i
  left join _prior p using (vin)
  where o.vin = i.vin and o.dealer_domain = i.dealer_domain
    and not coalesce(p.blocked, false)
    and o.last_run is distinct from _run_id;

  _added := _seen - (select count(*) from _prior);

  insert into listing_price_history (vin, run_id, price_usd, provenance, dealer_domain)
  select i.vin, _run_id, i.price_usd, i.provenance, i.dealer_domain
  from _incoming i
  left join _prior p using (vin)
  join _decide d using (vin)
  where d.takes_headline
    and (p.vin is null or p.price_usd is distinct from i.price_usd)
    and i.price_usd <> 0
    and not coalesce(p.blocked, false);

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

  drop table if exists _moved;
  create temp table _moved on commit drop as
    select distinct on (g.vin) g.vin, g.dealer_domain as from_domain, o.dealer_domain as to_domain,
           o.price_usd, o.provenance, o.payload
    from _gone g
    join listing_offers o on o.vin = g.vin
    where o.dealer_domain <> g.dealer_domain
      and o.last_seen_at >= _obs - interval '48 hours'
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

-- ── recheck_listings

create or replace function recheck_listings(
  _alive jsonb default '[]'::jsonb,
  _hard_gone jsonb default '[]'::jsonb,
  _soft_gone jsonb default '[]'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  _run_id bigint;
  _confirmed integer := 0;
  _changed integer := 0;
  _delisted integer := 0;
  _struck integer := 0;
begin
  insert into ingest_runs (source) values ('recheck') returning id into _run_id;

  -- One reader, one price (0103): a reading the site's own reader disputes
  -- says nothing about price — price_usd is null for it — but the car was
  -- seen, and the row below still confirms it.
  drop table if exists _alive_rows;
  create temp table _alive_rows on commit drop as
    select x.vin, x.mileage, x.dealer_domain,
           x.read_provenance,
           case when x.reader_ok then x.read_price      else null end as price_usd,
           case when x.reader_ok then x.read_provenance else null end as provenance
    from (
      select a.vin, a.read_price, a.mileage, a.read_provenance,
             coalesce(a.dealer_domain, l.dealer_domain) as dealer_domain,
             (o.vin is null
               or coalesce(o.price_usd, 0) = 0
               or o.provenance is null
               or a.read_provenance is null
               or o.provenance = a.read_provenance
               or coalesce(o.price_seen_at, o.last_seen_at) < now() - interval '48 hours') as reader_ok
      from (
        select upper(x->>'vin') as vin,
               nullif(x->>'priceUsd','')::numeric::int as read_price,
               nullif(x->>'mileage','')::numeric::int as mileage,
               x->>'provenance' as read_provenance,
               x->>'dealerDomain' as dealer_domain
        from jsonb_array_elements(coalesce(_alive,'[]'::jsonb)) x
        where coalesce(x->>'vin','') <> ''
      ) a
      left join listings l on l.vin = a.vin
      left join listing_offers o on o.vin = a.vin
                                and o.dealer_domain = coalesce(a.dealer_domain, l.dealer_domain)
    ) x;

  insert into listing_price_history (vin, run_id, price_usd, provenance, dealer_domain)
  select a.vin, _run_id, a.price_usd, a.provenance, a.dealer_domain
  from _alive_rows a join listings l using (vin)
  where a.price_usd is not null and a.price_usd <> 0
    and a.price_usd is distinct from l.price_usd;
  get diagnostics _changed = row_count;

  insert into listing_mileage_history (vin, run_id, mileage)
  select a.vin, _run_id, a.mileage
  from _alive_rows a join listings l using (vin)
  where a.mileage is not null and a.mileage is distinct from l.mileage;

  insert into listing_events (vin, run_id, event)
  select a.vin, _run_id, 'relisted'
  from _alive_rows a join listings l using (vin)
  where l.delisted_at is not null;

  select count(*) into _confirmed
  from _alive_rows a join listings l using (vin);

  update listings l set
    price_usd         = coalesce(a.price_usd, l.price_usd),
    payload           = case when a.price_usd is not null
                             then jsonb_set(l.payload, '{priceUsd}', to_jsonb(a.price_usd))
                             else l.payload end,
    mileage           = coalesce(a.mileage, l.mileage),
    delisted_at       = null,
    recheck_misses    = 0,
    updated_at        = now()
  from _alive_rows a
  where a.vin = l.vin
    and (   (a.price_usd is not null and a.price_usd is distinct from l.price_usd)
         or (a.mileage  is not null and a.mileage  is distinct from l.mileage)
         or l.delisted_at is not null
         or l.recheck_misses <> 0);

  -- The offer row follows the same reading (0103). A price the row's own
  -- reader confirms bumps price_seen_at; a disputed one only marks the
  -- sighting. Rows created here carry no payload, so they never become a
  -- move target for _moved in ingest_listings.
  insert into listing_offers as o
    (vin, dealer_domain, price_usd, provenance, first_seen_at, last_seen_at, price_seen_at, last_run)
  select a.vin, a.dealer_domain, a.price_usd, a.provenance, now(), now(), now(), _run_id
  from _alive_rows a join listings l using (vin)
  where a.dealer_domain is not null and a.price_usd is not null and a.price_usd <> 0
  on conflict (vin, dealer_domain) do update set
    price_usd     = excluded.price_usd,
    provenance    = excluded.provenance,
    last_seen_at  = excluded.last_seen_at,
    price_seen_at = excluded.price_seen_at,
    last_run      = excluded.last_run
  where o.price_usd is distinct from excluded.price_usd;

  update listing_offers o
  set last_seen_at  = now(),
      last_run      = _run_id,
      price_seen_at = case when a.read_provenance is null or o.provenance is null
                                or a.read_provenance = o.provenance
                           then now() else o.price_seen_at end
  from _alive_rows a
  where o.vin = a.vin and o.dealer_domain = a.dealer_domain
    and o.last_run is distinct from _run_id;

  insert into listing_seen as s (vin, last_seen_at, last_seen_run, last_confirmed_at)
  select a.vin, now(), _run_id, now()
  from _alive_rows a join listings l using (vin)
  on conflict (vin) do update set
    last_seen_at      = excluded.last_seen_at,
    last_seen_run     = excluded.last_seen_run,
    last_confirmed_at = excluded.last_confirmed_at;

  with gone as (
    update listings l set delisted_at = now(), updated_at = now(), recheck_misses = 0
    where l.delisted_at is null
      and l.vin in (select upper(value) from jsonb_array_elements_text(coalesce(_hard_gone,'[]'::jsonb)))
    returning l.vin
  )
  insert into listing_events (vin, run_id, event)
  select vin, _run_id, 'delisted' from gone;
  get diagnostics _delisted = row_count;

  select count(*) into _struck
  from listings l
  where l.delisted_at is null
    and l.vin in (select upper(value) from jsonb_array_elements_text(coalesce(_soft_gone,'[]'::jsonb)));

  -- The strike that delists also clears the count (0082).
  with struck as (
    update listings l set
      recheck_misses = case when l.recheck_misses + 1 >= 2 then 0 else l.recheck_misses + 1 end,
      delisted_at    = case when l.recheck_misses + 1 >= 2 then now() else l.delisted_at end,
      updated_at     = now()
    where l.delisted_at is null
      and l.vin in (select upper(value) from jsonb_array_elements_text(coalesce(_soft_gone,'[]'::jsonb)))
    returning l.vin, l.delisted_at
  )
  insert into listing_events (vin, run_id, event)
  select vin, _run_id, 'delisted' from struck where delisted_at is not null;

  update ingest_runs
  set finished_at = now(),
      listings_seen = _confirmed,
      listings_price_changed = _changed,
      listings_delisted = _delisted
  where id = _run_id;

  return jsonb_build_object(
    'run_id', _run_id, 'confirmed', _confirmed, 'price_changed', _changed,
    'delisted', _delisted, 'struck', _struck);
end;
$$;
