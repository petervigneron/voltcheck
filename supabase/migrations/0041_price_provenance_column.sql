-- Provenance-guarded price claims: the durable fix 0040 deferred.
--
-- 0040 stopped the pipeline from manufacturing shopper-facing "price cut"
-- claims out of its own field flips (crawl read dealer.com internetPrice,
-- recheck read the JSON-LD offer; both numbers coexist on the page, so every
-- listing where they disagreed logged a phantom step when the observing lane
-- switched). It did so with two blunt guards on the last-two-rows pair: the
-- rows must share an ingest source, and no row of price_methodology_transitions
-- may fall between them. Those work, but they are coarse in both directions:
--   * they suppress EVERY claim for a full cycle after any extraction change,
--     genuine dealer cuts included;
--   * run-source pairing cannot tell a genuine cut first observed by a
--     different lane (recheck seeing a real markdown the crawl hadn't) from a
--     cross-lane field flip — it suppresses both.
--
-- The durable fix records, per history row, WHICH served field/method produced
-- the number, and claims a step only between matching provenances. The tag
-- names the field, not the lane, so the same reading taken by two different
-- lanes matches: the schema.org JSON-LD offer price is 'jsonld' whether the
-- nightly crawl (lib/normalize.mjs), the dealer.com resolver (when it takes the
-- offer as-is), a DealerOn row (its primary price IS the JSON-LD offer), or
-- recheck.mjs read it. dealer.com's platform-specific fields carry their own
-- tags ('ddc-internet'/'ddc-sale'/'ddc-asking'/'ddc-msrp'), so the field flip
-- that started all this — a jsonld reading paired against a ddc-internet one —
-- is exactly a provenance MISMATCH and goes quiet, while a real jsonld->jsonld
-- markdown across lanes now survives. That second half is the improvement over
-- 0040: fewer false claims AND fewer suppressed true ones.
--
-- How provenance travels without widening the payload. payload-equality IS
-- row-equality since 0025 (an unchanged car must compare equal night over
-- night, or the nightly rewrites every wide row and OOMs the Nano instance —
-- the failure 0025/0026 exist to prevent). So provenance must NOT enter the
-- payload. It rides inside each ingest row's JSON as a sibling key and is
-- stripped here (`x - 'provenance'` becomes the stored payload) before the
-- payload is ever compared or stored; the value is routed to a new column on
-- listing_price_history instead. An unchanged car whose scraper now also emits
-- provenance still has payload = (its old payload), so the churn cut holds.
-- The edge gateway forwards row fields untouched (the x-ingest-rpc stream path
-- passes the body straight to PostgREST; the parsed paths forward body.rows /
-- body.alive verbatim), so no gateway change is needed — the new key arrives
-- on its own.
--
-- Old rows have null provenance. A pair where either side is null cannot be
-- provenance-matched, so it FALLS BACK to 0040's same-source + no-transition
-- guard — kept below verbatim for exactly those pairs. As real prices move
-- after this ships, both sides of each fresh pair carry provenance and the
-- match governs; the population migrates itself without a backfill (there is
-- nothing to backfill to — the field that produced an old row was not
-- recorded). No methodology transition is seeded for this migration: it adds
-- metadata only and changes no price the resolvers emit, so nothing flips.
--
-- Accepted residual (the house rule's safe direction): a genuine cut whose
-- field also legitimately changed — a dealer.com car that had no sale price
-- last night (resolved from the sticker) and advertises one tonight
-- (ddc-sale) — pairs mismatched provenances and is suppressed. We cannot
-- cleanly attribute that delta to a dealer action versus a change in what the
-- feed is telling us, so we do not print a precise "$X cut" on it. A missed
-- cut chip costs a shopper nothing; a false one costs trust.

alter table listing_price_history add column if not exists provenance text;

-- ingest_listings: identical to 0039 except (1) _incoming reads the row's
-- provenance into its own column and stores the payload WITHOUT it, and (2) the
-- history insert carries provenance through. Every other line is verbatim 0039.
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
    select l.vin, l.price_usd, l.mileage,
           (l.delisted_at is not null) as was_delisted,
           -- guard (a): the delisting is newer than this batch's observation
           (l.delisted_at is not null and l.delisted_at > _obs) as blocked,
           -- payload-equal implies row-equal; see 0025 header
           (l.payload is distinct from i.payload) as data_changed
    from listings l
    join _incoming i using (vin);

  create index on _prior (vin);
  analyze _prior;

  select count(*) into _relisted from _prior where was_delisted and not blocked;

  insert into listings as l
    (vin, payload, price_usd, year, make, model, vehicle_trim, mileage,
     condition, state, zip, dealer_domain, first_seen_at, created_run)
  select
    i.vin, i.payload, i.price_usd, i.year, i.make, i.model, i.vehicle_trim,
    i.mileage, i.condition, i.state, i.zip, i.dealer_domain, now(), _run_id
  from _incoming i
  left join _prior p using (vin)
  -- the churn cut: unchanged live rows never enter the upsert at all
  where p.vin is null
     or (not p.blocked and (p.data_changed or p.was_delisted))
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

  _added := _seen - (select count(*) from _prior);

  -- i.price_usd <> 0 keeps abstains out of the history (0039). provenance
  -- names which served field produced this price, so a later step is only
  -- claimable against a matching one (see file header + live_listings_feed).
  insert into listing_price_history (vin, run_id, price_usd, provenance)
  select i.vin, _run_id, i.price_usd, i.provenance
  from _incoming i
  left join _prior p using (vin)
  where (p.vin is null or p.price_usd is distinct from i.price_usd)
    and i.price_usd <> 0
    and not coalesce(p.blocked, false);

  -- Odometer readings land in the log the same way prices do: first
  -- sighting and every change. A null incoming mileage is data absence,
  -- not an observation, and is never logged.
  insert into listing_mileage_history (vin, run_id, mileage)
  select i.vin, _run_id, i.mileage
  from _incoming i
  left join _prior p using (vin)
  where i.mileage is not null
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
  where p.price_usd is distinct from i.price_usd and not p.blocked;

  with gone as (
    update listings l
    set delisted_at = now(), updated_at = now()
    where l.delisted_at is null
      -- (1) crawler certified full coverage of this domain this run
      and l.dealer_domain in (
        select jsonb_array_elements_text(coalesce(_complete_domains, '[]'::jsonb))
      )
      -- (2) and the domain actually produced rows (failed fetches prove nothing)
      and l.dealer_domain in (
        select distinct dealer_domain from _incoming where dealer_domain is not null
      )
      and not exists (select 1 from _incoming i where i.vin = l.vin)
      -- (3) guard (b): no evidence of life newer than this batch's
      -- observation. listing_seen is that evidence now — both the nightly's
      -- sightings and recheck's page-level confirmations land there. A
      -- listing with no seen row at all has no evidence in its favor.
      and not exists (
        select 1 from listing_seen s
        where s.vin = l.vin
          and (s.last_seen_at > _obs or s.last_confirmed_at > _obs)
      )
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

-- recheck_listings: identical to 0039 except the alive rows carry a provenance
-- key and the history insert writes it. recheck reads the car's own page, so
-- its readings share tags with the crawl's (a JSON-LD offer is 'jsonld' either
-- way); a genuine markdown it observes now pairs with the crawl's prior reading
-- when both read the same field.
create or replace function recheck_listings(
  _alive jsonb default '[]'::jsonb,     -- [{vin, priceUsd, mileage, provenance}]
  _hard_gone jsonb default '[]'::jsonb, -- ["VIN", ...] page 404/410
  _soft_gone jsonb default '[]'::jsonb  -- ["VIN", ...] page loaded, VIN absent
)
returns jsonb
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

  drop table if exists _alive_rows;
  create temp table _alive_rows on commit drop as
    select upper(x->>'vin') as vin,
           nullif(x->>'priceUsd','')::numeric::int as price_usd,
           nullif(x->>'mileage','')::numeric::int as mileage,
           x->>'provenance' as provenance
    from jsonb_array_elements(coalesce(_alive,'[]'::jsonb)) x
    where coalesce(x->>'vin','') <> '';

  -- Price movement observed on the car's own page is the strongest signal
  -- we get; log it before overwriting. a.price_usd <> 0 keeps abstains out
  -- (0039); provenance carries which field produced it (see file header).
  insert into listing_price_history (vin, run_id, price_usd, provenance)
  select a.vin, _run_id, a.price_usd, a.provenance
  from _alive_rows a join listings l using (vin)
  where a.price_usd is not null and a.price_usd <> 0
    and a.price_usd is distinct from l.price_usd;
  get diagnostics _changed = row_count;

  insert into listing_mileage_history (vin, run_id, mileage)
  select a.vin, _run_id, a.mileage
  from _alive_rows a join listings l using (vin)
  where a.mileage is not null and a.mileage is distinct from l.mileage;

  -- A confirmed VIN that was marked delisted is back: record the relist
  -- before the update below clears delisted_at.
  insert into listing_events (vin, run_id, event)
  select a.vin, _run_id, 'relisted'
  from _alive_rows a join listings l using (vin)
  where l.delisted_at is not null;

  -- _confirmed keeps its 0006 meaning — every alive VIN we matched — even
  -- though the wide update below now touches only the rows that changed.
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

  -- The page itself said the car is for sale: strongest evidence there is.
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

  -- Struck rows are counted before the update; only the subset the update
  -- actually delists (second strike) produces an event. returning sees the
  -- post-update row, so a non-null delisted_at means it was set just now.
  select count(*) into _struck
  from listings l
  where l.delisted_at is null
    and l.vin in (select upper(value) from jsonb_array_elements_text(coalesce(_soft_gone,'[]'::jsonb)));

  with struck as (
    update listings l set
      recheck_misses = l.recheck_misses + 1,
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

revoke execute on function recheck_listings(jsonb, jsonb, jsonb) from public, anon, authenticated;

-- The feed's prev-price pair, now provenance-first. Same output shape and
-- reloptions as 0032/0040 (security_invoker = false is load-bearing — see
-- 0032's header). The pair is claimable when the two newest history rows both
-- carry provenance and it matches; a null on either side falls back to 0040's
-- same-source + no-methodology-transition guard, verbatim, for the old rows
-- that predate the column.
create or replace view live_listings_feed
with (security_invoker = false) as
select l.vin,
       l.first_seen_at,
       s.last_seen_at,
       l.payload_public as payload,
       h.prev_price_usd,
       h.price_changed_at,
       l.buyback_disclosed,
       f.listed_on
from listings l
left join listing_seen s using (vin)
left join lateral (
  select case when g.claimable then g.prev end as prev_price_usd,
         case when g.claimable then g.at1  end as price_changed_at
  from (
    select g0.prev, g0.at1, g0.at2,
           case
             when g0.n < 2 then false
             when g0.prov_cur is not null and g0.prov_prev is not null
               then g0.prov_cur = g0.prov_prev
             else g0.same_src and not exists (
                    select 1 from price_methodology_transitions t
                    where t.at > g0.at2 and t.at <= g0.at1)
           end as claimable
    from (
      select (array_agg(last2.price_usd  order by last2.observed_at desc))[2] as prev,
             (array_agg(last2.provenance order by last2.observed_at desc))[1] as prov_cur,
             (array_agg(last2.provenance order by last2.observed_at desc))[2] as prov_prev,
             max(last2.observed_at) as at1,
             min(last2.observed_at) as at2,
             (min(last2.src) is not distinct from max(last2.src)) as same_src,
             count(*) as n
      from (
        select p.price_usd, p.observed_at, p.provenance,
               coalesce(r.source, '?') as src
        from listing_price_history p
        left join ingest_runs r on r.id = p.run_id
        where p.vin = l.vin
        order by p.observed_at desc
        limit 2
      ) last2
    ) g0
  ) g
) h on true
left join listing_freshness f using (vin)
where l.delisted_at is null;

-- The detail page's sparkline series, same provenance-first guard applied
-- stepwise. A row survives if it starts the series, or extends it from a
-- matching provenance, or — for null-provenance (pre-0041) pairs — under
-- 0040's same-lane + no-transition fallback. Zero-price abstains (0039) are
-- excluded before chaining so an abstain never breaks a genuine pair.
-- Dropping a suspect row still drops its successor's claim to a step: the
-- series goes quiet rather than draw a move we cannot stand behind.
create or replace view listing_price_display
with (security_invoker = false) as
with h as (
  select p.vin, p.price_usd, p.observed_at, p.provenance as prov,
         coalesce(r.source, '?') as src,
         lag(p.observed_at) over w as prev_at,
         lag(coalesce(r.source, '?')) over w as prev_src,
         lag(p.provenance) over w as prev_prov
  from listing_price_history p
  left join ingest_runs r on r.id = p.run_id
  where p.price_usd > 0
  window w as (partition by p.vin order by p.observed_at)
)
select vin, price_usd, observed_at
from h
where prev_at is null
   or case
        when prov is not null and prev_prov is not null then prov = prev_prov
        else src = prev_src
             and not exists (select 1 from price_methodology_transitions t
                             where t.at > prev_at and t.at <= observed_at)
      end;

grant select on listing_price_display to anon, authenticated;
