-- A price step is only claimable between observations of the SAME dealer.
--
-- The failure this fixes (measured 2026-08-24/25 on prod): the same VIN
-- syndicated on two or more dealer sites with two different prices. listings
-- is VIN-keyed and last-writer-wins on dealer_domain, so whichever site the
-- crawl reads last owns the row that night — and the price "changes" back and
-- forth forever without any dealer touching a sticker. Both observations are
-- the same field (schema.org offer), so they carry the same provenance tag and
-- sail through 0041's matching-provenance guard; both usually land in the same
-- nightly, so 0040's same-source guard passes too. Measured: 39,758
-- same-provenance A->B->A steps across 22,355 VINs (53% of ALL A->B->A steps
-- in the table); of 5,635 live listings whose cut chip passes the current
-- guard, 3,273 (58%) sit on such an alternation.
--
-- Ground truth, from our own colisting records rather than a WAF-blocked VDP
-- fetch: KM8KMDDFXRU287948 (Santa Fe PHEV) — vin_colisting observed it live on
-- FOUR Herb Chambers rooftops at the same instant, two at $52,304 and two at
-- $36,998, and its price history alternates between exactly those two values
-- under provenance 'jsonld'. The "$15,306 cut" its chip claimed is two web
-- departments disagreeing, not a markdown. Of the alternation suspects that
-- have any vin_colisting record at all (220), 121 have BOTH alternating
-- prices coexisting across domains in one observation.
--
-- The fix records, per history row, WHICH dealer site produced the number,
-- exactly as 0041 recorded which field did: a new dealer_domain column,
-- written by both ingest paths, claimed against by both read surfaces. The
-- ingest lane already carries the observing domain on every row (_incoming
-- reads x->>'dealerDomain' since forever), so this column costs no payload
-- change and no gateway change — 0025's payload-equality invariant is not
-- touched (dealer_domain was already outside the payload comparison; only the
-- history INSERT gains a column). recheck.mjs now sends the domain of the page
-- it actually fetched (l.payload.dealerDomain at fetch time); the RPC falls
-- back to listings.dealer_domain for older callers so the deploy order
-- (migration first, scraper via the next nightly) leaves no gap.
--
-- Old rows have null dealer_domain and cannot be backfilled (the observing
-- domain was never recorded; listings.dealer_domain is whoever wrote last).
-- A pair where either side is null falls back to the A->B->A signature
-- instead: if the newest price exactly equals the third-newest and differs
-- from the one between, the "step" returns to a previously seen price — the
-- alternation fingerprint — and the claim goes quiet. That fallback is what
-- makes this migration effective TONIGHT (it suppresses the 3,273 live
-- phantom chips immediately) rather than only after two domain-tagged rows
-- accumulate per VIN. Once both sides of a pair carry a domain, the exact
-- match governs and the heuristic retires itself per VIN.
--
-- No price_methodology_transitions row is seeded: no lane changes how it
-- reads prices — every resolver emits the same numbers tonight as last night;
-- this adds metadata and tightens the claim guard (0041's precedent, and the
-- contract's letter: transitions mark changes to how prices are READ).
-- Checked while here: the table still holds its two 0040-seeded rows — an
-- earlier report that it was empty was measured wrong.
--
-- REJECTED: picking one canonical domain per VIN via vin_colisting before
-- writing history. vin_colisting knows 2,354 VINs; the suspects span ~22k
-- (only 220 of ~12k broad suspects have any record — it only sees pairs that
-- surface within one run's merge). And canonicalizing the domain changes
-- which price the site DISPLAYS, a deeper semantic change than guarding
-- claims; the displayed-price flapping on co-listed VINs is real but is its
-- own problem, not solvable by a history guard.
--
-- Accepted residuals (the house rule's safe direction — a missed cut chip
-- costs a shopper nothing, a false one costs trust):
--   * a genuine cut whose pair straddles two domains (site A cuts, but site
--     B's observation landed in between) is suppressed until A observes twice
--     in a row;
--   * while a VIN's pair is still null-domain, a genuine return to a previous
--     price (sale price ending, a tested raise reverted) matches the
--     alternation fingerprint and is suppressed;
--   * the sparkline chains stepwise off raw history, so for pre-0048 rows the
--     FIRST step of an alternation can still render (its successor rows all
--     drop); domain-tagged rows close that too.

alter table listing_price_history add column if not exists dealer_domain text;

-- ingest_listings: identical to 0041 except the history insert carries the
-- incoming row's dealer_domain. Every other line is verbatim 0041.
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
  -- names which served field produced this price (0041); dealer_domain names
  -- which dealer site served it (this migration) — a later step is only
  -- claimable against a row matching on BOTH (see live_listings_feed).
  insert into listing_price_history (vin, run_id, price_usd, provenance, dealer_domain)
  select i.vin, _run_id, i.price_usd, i.provenance, i.dealer_domain
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

-- recheck_listings: identical to 0041 except each alive row may carry the
-- domain of the page recheck actually fetched, and the history insert writes
-- it (falling back to the listing's current domain for callers that predate
-- the key — correct up to the negligible in-pipeline race, and a mislabel can
-- only suppress a claim, not invent one, once both sides carry real domains).
create or replace function recheck_listings(
  _alive jsonb default '[]'::jsonb,     -- [{vin, priceUsd, mileage, provenance, dealerDomain}]
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
           x->>'provenance' as provenance,
           x->>'dealerDomain' as dealer_domain
    from jsonb_array_elements(coalesce(_alive,'[]'::jsonb)) x
    where coalesce(x->>'vin','') <> '';

  -- Price movement observed on the car's own page is the strongest signal
  -- we get; log it before overwriting. a.price_usd <> 0 keeps abstains out
  -- (0039); provenance carries which field produced it (0041); dealer_domain
  -- carries whose page it was (see file header).
  insert into listing_price_history (vin, run_id, price_usd, provenance, dealer_domain)
  select a.vin, _run_id, a.price_usd, a.provenance,
         coalesce(a.dealer_domain, l.dealer_domain)
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

-- The feed's prev-price pair. Same output shape and reloptions as 0042
-- (security_invoker = false is load-bearing — see 0032's header), same
-- per-vin LATERAL cost shape as 0041_feed_joins (LIMIT 3 instead of 2 costs
-- one more index-ordered row per vin). Claimable now requires BOTH guards:
--   provenance (0041): matching tags, or 0040's same-source + no-transition
--     fallback when either side predates the tag;
--   dealer (this file): matching domains, or — when either side predates the
--     column — the pair must NOT return to the third-newest price (the
--     A->B->A alternation fingerprint of two sites disagreeing). The back2
--     term is null-guarded so a two-row history claims exactly as before.
create or replace view live_listings_feed
with (security_invoker = false) as
select l.vin,
       l.first_seen_at,
       s.last_seen_at,
       coalesce(l.payload_public, l.payload) as payload,
       h.prev_price_usd,
       h.price_changed_at,
       l.buyback_disclosed,
       f.listed_on
from listings l
left join lateral (
  select s2.last_seen_at
  from listing_seen s2
  where s2.vin = l.vin
  limit 1
) s on true
left join lateral (
  select case when g.claimable then g.prev end as prev_price_usd,
         case when g.claimable then g.at1  end as price_changed_at
  from (
    select g0.prev, g0.at1,
           case
             when g0.n < 2 then false
             else
               (case
                  when g0.prov_cur is not null and g0.prov_prev is not null
                    then g0.prov_cur = g0.prov_prev
                  else g0.same_src and not exists (
                         select 1 from price_methodology_transitions t
                         where t.at > g0.at2 and t.at <= g0.at1)
                end)
               and
               (case
                  when g0.dom_cur is not null and g0.dom_prev is not null
                    then g0.dom_cur = g0.dom_prev
                  else not (g0.back2 is not null
                            and g0.cur = g0.back2
                            and g0.cur is distinct from g0.prev)
                end)
           end as claimable
    from (
      select (array_agg(last3.price_usd     order by last3.observed_at desc))[1] as cur,
             (array_agg(last3.price_usd     order by last3.observed_at desc))[2] as prev,
             (array_agg(last3.price_usd     order by last3.observed_at desc))[3] as back2,
             (array_agg(last3.provenance    order by last3.observed_at desc))[1] as prov_cur,
             (array_agg(last3.provenance    order by last3.observed_at desc))[2] as prov_prev,
             (array_agg(last3.dealer_domain order by last3.observed_at desc))[1] as dom_cur,
             (array_agg(last3.dealer_domain order by last3.observed_at desc))[2] as dom_prev,
             (array_agg(last3.observed_at   order by last3.observed_at desc))[1] as at1,
             (array_agg(last3.observed_at   order by last3.observed_at desc))[2] as at2,
             ((array_agg(last3.src order by last3.observed_at desc))[1]
                is not distinct from
              (array_agg(last3.src order by last3.observed_at desc))[2]) as same_src,
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
where l.delisted_at is null;

-- The detail page's sparkline series, both guards applied stepwise. A row
-- survives if it starts the series, or extends it from a matching provenance
-- (with 0040's fallback for pre-0041 rows) AND a matching dealer domain (with
-- the alternation fingerprint standing in for pre-0048 rows: a price equal to
-- the one two observations back, differing from the one between, is two sites
-- disagreeing, not a move). lag() runs over RAW history, so dropping a row
-- also drops its successors' claim to a step: the series goes quiet rather
-- than draw a move we cannot stand behind. Zero-price abstains (0039) are
-- excluded before chaining so an abstain never breaks a genuine pair.
create or replace view listing_price_display
with (security_invoker = false) as
with h as (
  select p.vin, p.price_usd, p.observed_at,
         p.provenance as prov, p.dealer_domain as dom,
         coalesce(r.source, '?') as src,
         lag(p.observed_at) over w as prev_at,
         lag(coalesce(r.source, '?')) over w as prev_src,
         lag(p.provenance) over w as prev_prov,
         lag(p.dealer_domain) over w as prev_dom,
         lag(p.price_usd) over w as prev_price,
         lag(p.price_usd, 2) over w as back2_price
  from listing_price_history p
  left join ingest_runs r on r.id = p.run_id
  where p.price_usd > 0
  window w as (partition by p.vin order by p.observed_at)
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
