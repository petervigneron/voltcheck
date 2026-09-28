-- The market-trend line and "This VIN's history" refresh again: each nightly
-- call now costs what that night added, not what the archive holds.
--
-- ── What broke (measured 2026-09-28) ────────────────────────────────────────
--
-- Two refresh_vin_variants targets have died on service_role's 60 s
-- statement_timeout (57014) every night since 2026-09-24, so the trend chart
-- has been frozen at 2026-09-21 and the Pro history block since ~09-24.
--
-- ev_price_trend_ask_daily. advance_price_trend_ask_daily(3) computes each
-- missing day with price_trend_day_rows(_day), and one day was 52-54 s on its
-- own (50 s with work_mem at 64MB — memory is not the lever on a 1 GB Micro).
-- The cost is its `s` CTE: "each car's last listing_price_display price as of
-- the close" re-derives the whole display chain (0041/0048/0061: provenance,
-- source, seller and alternation guards; lag() over every row of a VIN) over
-- ALL of listing_price_history — 5.6M rows, ~1.1 GB, +150-225k rows a day —
-- for every day it writes: 28-31 s for `s` alone. The cohort medians after it
-- are 5.7-11 s (not the ~20 s first estimated, and not touched here). Each
-- day cost more than the last whatever the night held, and three stopped
-- fitting.
--
-- vin_listing_history (0085). 101-111 s to build on 09-28, against 20 s when
-- 0085 measured it. It was suspected to be the listing_events window; that
-- half is 6.3 s. The rest is listing_prior_site: per live car (162k), a
-- backward walk of that VIN's whole price history looking for a row from
-- another site (most cars have none, so the walk reads every row), then two
-- anti-joins that hash all of history. Same shape: total history, not the
-- night.
--
-- ── What this does ──────────────────────────────────────────────────────────
--
-- 1. price_trend_chain_state. listing_price_display chains a listing's rows
--    from its CURRENT dealer_domain plus the pre-0048 rows that carry no
--    domain (none written since 2026-08-25). So each VIN has one potential
--    chain per domain it has price rows under, and one for the no-domain rows
--    alone ('' — what a listing reads when its current domain has no rows of
--    its own). The table keeps, per (vin, chain), the last display price as
--    of a close and the two inputs the rule needs to judge the NEXT row — the
--    chain's last row (time, source, provenance, domain, price) and the price
--    before it; the view's lag() and lag(, 2) look no further back.
--    history_digest_mark records the close the state is at and a low-water id
--    into listing_price_history.
--
--    price_trend_state_fold(_to) moves the state to _to using only rows past
--    the low-water: each new row is judged against its chain's stored
--    predecessors, exactly as the view's window would; a chain seen for the
--    first time continues from the no-domain chain, which is exactly what
--    precedes that domain's first row. Keeping every chain is what makes a
--    seller change (~4-5k seller_changed a day) free: the listing just reads
--    another chain. A VIN is re-derived from its whole history (an index walk
--    of that VIN) only when a new row carries no domain, or is not later than
--    its chain's last row (a late commit, or a row the low-water rescans).
--
--    price_trend_day_rows(_day) keeps its signature, its cohort math and its
--    place as "the single place a day is computed" (0080). Only `s` changes:
--    when the state sits at exactly that day's close it reads the chain of
--    each listing's current domain (else the no-domain chain); otherwise it
--    derives from listing_price_display as before, so rebuild_price_trend_
--    ask_day and any ad-hoc call for an old day still work at the old cost.
--    Two sources for one fact, proven equal below — not two trends.
--
--    advance_price_trend_ask_daily folds one close and writes one day per
--    call from refresh_vin_variants; a missed night is caught up by more
--    calls (scraper/refresh-variants.mjs loops while "behind" > 0), never by
--    fitting several days into one statement.
--
-- 2. listing_price_site_last: per (vin, dealer_domain), the last positive-
--    price row's time, the last row's time at any price, and whether any row
--    was an oem-% lane — monotone aggregates merged from a low-water, so a
--    rescan is harmless. vin_listing_history uses it only to pick CANDIDATE
--    VINs (listing_prior_site's gates read off the summary instead of a
--    history walk, minus the price comparison), then asks listing_prior_site
--    itself about those ~2.8k VINs alone. The view still decides and its
--    gates still live in one place (0085's rule): a summary that drifted could
--    only drop a car, quietly, never add one. The absence half now windows
--    only over VINs with a recheck-written delist — the only ones that can
--    reach `away` — whole partitions, so lead() sees what it always saw.
--
-- ── Measured on prod, 2026-09-28 (read-only: temp tables and EXPLAIN) ───────
--
--   Correctness, the functions below run as pg_temp copies:
--   - Seeded on 1/20 hash slices of VINs and compared, same minute, with
--     the view's own last price at the close: slice 0 (seed 09-21, one-day
--     fold with the low-water rewound 20k ids, 813 VINs re-derived) 12,339 of
--     12,339 equal; slice 7 (seed 09-21, a two-day fold with a 30k-id rewind,
--     then a one-day fold, compared at 09-24) 12,904 of 12,904 equal. An
--     earlier one-state-per-listing version matched the view on the full set:
--     248,585 and 249,814 VINs, 0 differences.
--   - vin_listing_history, new definition vs 0085's, same minute: 2,262 rows,
--     md5 of the ordered rows identical; later, per hash slice with the
--     summary built for that slice: prior-site rows 165/165 and 332/332 equal
--     (30% of live VINs), absences 684/684 equal. (Two full runs minutes
--     apart differed by 2-4 rows — events arriving between them, not the
--     definitions; the same-minute runs agree exactly.)
--   - listing_price_site_last: a slice seeded up to two days ago and then
--     advanced equals the same slice aggregated whole (22,141 of 22,141).
--   Cost, per nightly call:
--   - fold, one day: 6.3 s (151,827 new rows, 86,265 chains); two days
--     after a 30k-id rewind: 28.9 s (428k rows, 1,207 VINs re-derived —
--     re-derives cost ~3 ms a VIN, which is why seller changes must not
--     cause them). Breakdown of a day: new rows 1.1 s, low-water 0.3 s,
--     chain lookup 0.3 s, rule window 2.8 s, upsert 1.6 s.
--   - price_trend_day_rows from the state: 9.0-11.2 s (the view branch sits
--     under a one-time filter and never runs). Site index rebuild 0.5 s.
--   - vin_listing_history refresh: summary advance 0.3-0.7 s; build 8-13 s
--     warm, 23-41 s with a cold cache, against 101-111 s.
--   Seeds (one-time, by hand): chains ~17 s per 1/8 slice (8 calls); site
--   summary ~56-74 s whole, 5-7 s per 1/20 slice.
--
-- ── Rejected ───────────────────────────────────────────────────────────────
--
--   Raising work_mem: 54 → 50 s. The box is IO-throttled; the rows are the
--   problem, not the sort.
--   One state row per listing, re-derived when its seller changes: correct
--   (it is the version the full-set comparison above ran on), but a
--   re-derive walks that VIN's whole history at ~3 ms, ~5k a night came to
--   ~15 s and grows with each car's history. The chains make it zero.
--   The display rule as a SQL function called per row (one copy of it): it
--   holds a subquery, so it cannot be inlined, and the seed went from 55 s
--   to >110 s. It is written out in derive and fold instead, verbatim from
--   the view.
--   Materializing every display row incrementally: `s` would still read
--   every display row ever written, per day.
--   A per-live-VIN walk of raw history for the last kept row: the rule can
--   reject an unbounded run of rows (a site flapping between two readers
--   rejects every row, 0103), so that walk has no bound.
--   An anti-join against listings to purge retired VINs: 6.7 s of heap
--   reads; retired_listing says the same thing for free.
--   Rewriting listing_prior_site to read the summary: listing_prior_site_
--   series reads it live per VIN and would go a night stale.
--   Carrying the last price in the site summary: seed 76 s vs 56 s (ordered
--   array_agg), and the view reads the price anyway.
--
-- ── Known limits ────────────────────────────────────────────────────────────
--
--   price_methodology_transitions (two rows, hand-written) changes the
--   verdict on every row straddling a transition. The fold stores a
--   signature and RAISES if it moved: reseed.
--   A price row whose transaction stays open across the nightly refresh for
--   more than six hours can be missed by both low-waters. Ingest writes in
--   short batches; nothing today holds a transaction that long.
--   listing_price_history rows are never UPDATEd and are DELETEd only with
--   their listing (retire_misclassified_listings, which writes
--   retired_listing, which both purges read). A new path that edits or
--   prunes history rows in place must reseed both digests.
--   A price row with dealer_domain = '' would collide with the no-domain
--   chain key; there are none, and the fold raises rather than guess.
--
-- ── APPLY (order matters) ───────────────────────────────────────────────────
--
--   0. Re-read refresh_vin_variants live (0088's rule) — the body at the
--      bottom of this file is the 2026-09-28 definition with two branches
--      changed.
--   1. Apply this migration: DDL and functions, seconds. The new
--      vin_listing_history is built WITH DATA from the still-empty summary,
--      so until step 2 its prior-site half is empty (quiet, not an error);
--      the absence half is there at once.
--   2. Site summary, four slices, then the view (each call well under 60 s):
--        select listing_price_site_last_reseed(0, 4);
--        select listing_price_site_last_reseed(1, 4);
--        select listing_price_site_last_reseed(2, 4);
--        select listing_price_site_last_reseed(3, 4);
--        select refresh_vin_variants('vin_listing_history');   -- ~2.26k rows
--   3. Trend state, eight slices, at the close after max(day) of
--      ev_price_trend_ask_daily (2026-09-22 00:00Z today):
--        select price_trend_state_reseed(0, 8);   -- ~17 s each
--        ... select price_trend_state_reseed(7, 8);
--   4. select refresh_vin_variants('ev_price_trend_ask_daily');   -- one day
--      per call; repeat until "behind" is 0 (six days today), or leave it to
--      tonight's run, which loops.
--
--   Spot-check the state against the view at any time (should return 0):
--     with m as (select through from history_digest_mark where name = 'price_trend_state'),
--     v as (select vin, dealer_domain from listings order by random() limit 2000),
--     s as (select v.vin, case when c.vin is not null then c.disp_price else z.disp_price end as p
--           from v left join price_trend_chain_state c on c.vin = v.vin and c.chain = v.dealer_domain
--                  left join price_trend_chain_state z on z.vin = v.vin and z.chain = ''),
--     d as (select distinct on (p.vin) p.vin, p.price_usd from listing_price_display p, m
--           where p.vin = any (array(select vin from v)) and p.observed_at <= m.through
--           order by p.vin, p.observed_at desc)
--     select count(*) from s full join d using (vin) where s.p is distinct from d.price_usd;

-- ── Tables ─────────────────────────────────────────────────────────────────

-- One row per (listing, chain). listing_price_display runs its chain over the
-- rows of the listing's CURRENT dealer_domain plus the pre-0048 rows that
-- carry no domain. So a VIN has one potential chain per domain it has price
-- rows under (chain = that domain: its rows and the null-domain rows), and
-- one for the null-domain rows alone (chain = ''), which is what a listing
-- whose current domain has no rows of its own reads. Keeping every chain is
-- what makes a seller change (~4-5k a night) free: the listing just reads a
-- different chain, no history is re-walked.
create table price_trend_chain_state (
  vin        text not null,
  chain      text not null,  -- a dealer_domain, or '' for the null-domain rows alone
  disp_price int,            -- last listing_price_display price at or before the close
  disp_at    timestamptz,
  m1_at      timestamptz not null,  -- the chain's last row (display's input, before its guards)
  m1_src     text,
  m1_prov    text,
  m1_dom     text,
  m1_price   int,
  m2_price   int,            -- the row before it: display's lag(price_usd, 2)
  primary key (vin, chain)
);

comment on table price_trend_chain_state is
  'Per listing and per display chain (a dealer_domain''s rows plus the null-domain rows, or '''' for the null-domain rows alone): the last listing_price_display price as of history_digest_mark(price_trend_state).through, plus the last two chain inputs needed to judge the next price row. Maintained by price_trend_state_fold (0104); read by price_trend_day_rows when the close matches. Service role only.';

create table history_digest_mark (
  name            text primary key check (name in ('price_trend_state', 'listing_price_site_last')),
  through         timestamptz,       -- price_trend_state: the close the state is at
  hist_id         bigint not null,   -- low-water into listing_price_history.id
  transitions_sig text,              -- price_methodology_transitions at seed time
  seed_parts      int,               -- how many hash slices the running seed was split into
  pending_parts   int[] not null default '{}',  -- seed parts not yet written
  updated_at      timestamptz not null default now()
);

comment on table history_digest_mark is
  'Watermarks of the incremental digests of listing_price_history (0104). hist_id is a low-water: every row with id <= hist_id has been folded; rows above it may have been too, and the folds are written to tolerate seeing them again.';

create table listing_price_site_last (
  vin           text not null,
  dealer_domain text not null,
  last_pos_at   timestamptz,          -- last row with price_usd > 0
  last_any_at   timestamptz not null, -- last row at any price
  has_oem       boolean not null,     -- any row with provenance like 'oem-%'
  primary key (vin, dealer_domain)
);

comment on table listing_price_site_last is
  'Per (vin, dealer_domain) summary of listing_price_history, merged nightly from history_digest_mark(listing_price_site_last). Used only to choose which VINs vin_listing_history asks listing_prior_site about (0104).';

revoke all on price_trend_chain_state from public, anon, authenticated;
revoke all on history_digest_mark     from public, anon, authenticated;
revoke all on listing_price_site_last from public, anon, authenticated;

-- ── Deriving chains from full history ──────────────────────────────────────
--
-- One query for every use: the seed (all VINs, or one hash slice of them)
-- and the fold's re-derives (a VIN list, an index walk per VIN). The keep
-- expression is listing_price_display's WHERE clause verbatim; the fold
-- below carries the same text. (A SQL function holding it once cannot be
-- inlined — it contains a subquery — and cost the seed >2x.)

create or replace function price_trend_state_derive(
  _through timestamptz, _vins text[] default null, _part int default null, _parts int default null)
returns setof price_trend_chain_state
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
declare
  _pick text := case
    when _vins is not null then 'p.vin = any ($2) and'
    when _parts is not null then 'abs(hashtext(p.vin)::bigint) % $4 = $3 and'
    else '' end;
begin
  return query execute format($q$
    with base as (
      select p.vin, p.price_usd, p.observed_at, p.provenance as prov, p.dealer_domain as dom,
             coalesce(r.source, '?') as src
      from listing_price_history p
      left join ingest_runs r on r.id = p.run_id
      where %s p.price_usd > 0
        and p.observed_at <= $1
        and exists (select 1 from listings l where l.vin = p.vin)
    ), chains as (
      select distinct vin, coalesce(dom, '') as chain from base
    ), mine as (
      select c.chain, b.*
      from chains c
      join base b on b.vin = c.vin and (b.dom is null or b.dom = c.chain)
    ), h as (
      select mine.*,
             lag(observed_at)   over w as prev_at,
             lag(src)           over w as prev_src,
             lag(prov)          over w as prev_prov,
             lag(dom)           over w as prev_dom,
             lag(price_usd)     over w as prev_price,
             lag(price_usd, 2)  over w as back2_price
      from mine
      window w as (partition by vin, chain order by observed_at)
    ), k as (
      select h.*, (prev_at is null or (
          case when prov is not null and prev_prov is not null then prov = prev_prov
               else src = prev_src and not exists (select 1 from price_methodology_transitions t
                                                   where t.at > h.prev_at and t.at <= h.observed_at) end
          and case when dom is not null and prev_dom is not null then dom = prev_dom
               else not (back2_price is not null and price_usd = back2_price
                         and price_usd is distinct from prev_price) end)) as keep
      from h
    ), last_row as (
      select distinct on (vin, chain) vin, chain, observed_at, src, prov, dom, price_usd, prev_price
      from k order by vin, chain, observed_at desc
    ), last_keep as (
      select distinct on (vin, chain) vin, chain, price_usd, observed_at
      from k where keep order by vin, chain, observed_at desc
    )
    select r.vin, r.chain, d.price_usd, d.observed_at,
           r.observed_at, r.src, r.prov, r.dom, r.price_usd, r.prev_price
    from last_row r
    left join last_keep d on d.vin = r.vin and d.chain = r.chain
  $q$, _pick)
  using _through, _vins, _part, _parts;
end;
$fn$;

revoke all on function price_trend_state_derive(timestamptz, text[], int, int) from public, anon, authenticated;

-- ── Seed (by hand, in slices) ──────────────────────────────────────────────

create or replace function price_trend_state_reseed(
  _part int default 0, _parts int default 1, _through timestamptz default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  m   history_digest_mark%rowtype;
  _at timestamptz;
  _w  bigint;
  _n  bigint;
begin
  if _parts < 1 or _part < 0 or _part >= _parts then
    raise exception 'price_trend_state_reseed: part % of % is not a slice', _part, _parts;
  end if;

  if _part = 0 then
    _at := coalesce(_through,
                    (select ((max(day) + 1)::timestamp at time zone 'UTC') from ev_price_trend_ask_daily),
                    timestamptz '2026-08-15 00:00+00');
    -- Low-water: every row at or below it was observed at or before the close.
    select coalesce(min(id) - 1, (select coalesce(max(id), 0) from listing_price_history))
      into _w from listing_price_history where observed_at > _at;
    delete from price_trend_chain_state where true;
    insert into history_digest_mark
      (name, through, hist_id, transitions_sig, seed_parts, pending_parts, updated_at)
    values ('price_trend_state', _at, _w,
            (select md5(coalesce(string_agg(at::text, ',' order by at), '')) from price_methodology_transitions),
            _parts, array(select generate_series(0, _parts - 1)), now())
    on conflict (name) do update
      set through = excluded.through, hist_id = excluded.hist_id,
          transitions_sig = excluded.transitions_sig, seed_parts = excluded.seed_parts,
          pending_parts = excluded.pending_parts, updated_at = now();
  end if;

  select * into m from history_digest_mark where name = 'price_trend_state' for update;
  if m.seed_parts is distinct from _parts or not (_part = any (m.pending_parts)) then
    raise exception 'price_trend_state_reseed: part % of % is not pending (seed is % parts, pending %)',
      _part, _parts, m.seed_parts, m.pending_parts
      using hint = 'start again with part 0';
  end if;
  if _through is not null and _through <> m.through then
    raise exception 'price_trend_state_reseed: this seed is at %, not %', m.through, _through;
  end if;

  delete from price_trend_chain_state where abs(hashtext(vin)::bigint) % _parts = _part;
  insert into price_trend_chain_state
  select * from price_trend_state_derive(m.through, null, _part, _parts);
  get diagnostics _n = row_count;

  update history_digest_mark set pending_parts = array_remove(pending_parts, _part), updated_at = now()
  where name = 'price_trend_state';

  return jsonb_build_object('through', m.through, 'part', _part, 'parts', _parts, 'rows', _n,
                            'pending', array_remove(m.pending_parts, _part));
end;
$fn$;

revoke all on function price_trend_state_reseed(int, int, timestamptz) from public, anon, authenticated;
grant execute on function price_trend_state_reseed(int, int, timestamptz) to service_role;

comment on function price_trend_state_reseed(int, int, timestamptz) is
  'Rebuilds price_trend_chain_state from all of listing_price_history as of _through (default: the close after max(day) of ev_price_trend_ask_daily), one hash slice of VINs per call: (0, n) starts a seed and writes slice 0, then (1, n) .. (n-1, n). The fold refuses until every slice is written. By hand, never from the nightly. Needed once after 0104, and again if price_methodology_transitions changes or history rows are edited in place.';

-- ── Nightly fold ────────────────────────────────────────────────────────────

create or replace function price_trend_state_fold(_to timestamptz)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  m         history_digest_mark%rowtype;
  _sig      text;
  _w        bigint;
  _first    bigint;
  _max      bigint;
  _old      bigint;
  _rv       text[];
  _n_new    bigint;
  _n_inc    bigint;
  _n_purged bigint;
begin
  select * into m from history_digest_mark where name = 'price_trend_state' for update;
  if not found or cardinality(m.pending_parts) > 0 then
    raise exception 'price_trend_chain_state is not seeded (pending slices: %)', m.pending_parts
      using hint = 'select price_trend_state_reseed(0, 8); then (1, 8) .. (7, 8) (0104)';
  end if;
  if _to < m.through then
    raise exception 'price_trend_chain_state is at %, cannot fold back to %', m.through, _to
      using hint = 'price_trend_state_reseed(0, n, <close>) re-seeds at an earlier close';
  end if;
  if _to = m.through then
    return jsonb_build_object('through', _to, 'new_rows', 0);
  end if;

  select md5(coalesce(string_agg(at::text, ',' order by at), '')) into _sig
  from price_methodology_transitions;
  if _sig is distinct from m.transitions_sig then
    raise exception 'price_methodology_transitions changed since price_trend_chain_state was seeded'
      using hint = 'every row straddling a transition changes verdict: reseed (0104)';
  end if;

  -- The rows since the low-water that belong to this close, as the view's
  -- `mine` sees them (listing exists, positive price).
  drop table if exists _pt_new;
  create temp table _pt_new on commit drop as
  select p.vin, p.price_usd, p.observed_at, p.provenance as prov, p.dealer_domain as dom,
         coalesce(r.source, '?') as src
  from listing_price_history p
  left join ingest_runs r on r.id = p.run_id
  where p.id > m.hist_id
    and p.observed_at <= _to
    and p.price_usd > 0
    and exists (select 1 from listings l where l.vin = p.vin);
  get diagnostics _n_new = row_count;
  if exists (select 1 from _pt_new where dom = '') then
    raise exception 'a price row with dealer_domain = '''' collides with the null-domain chain key (0104)';
  end if;
  analyze _pt_new;

  -- Next low-water: below the first row past this close, and never past a
  -- row young enough to have a straggling neighbour still uncommitted.
  select min(id) filter (where observed_at > _to) - 1,
         max(id),
         max(id) filter (where observed_at < now() - interval '6 hours')
    into _first, _max, _old
  from listing_price_history where id > m.hist_id;
  _w := greatest(m.hist_id, least(coalesce(_first, _max, m.hist_id), coalesce(_old, m.hist_id)));

  -- retire_misclassified_listings deletes a VIN's history with its listing
  -- and records it in retired_listing; chains built before that are gone
  -- with the rows they came from. (An anti-join against listings would say
  -- the same thing for 6.7 s of heap reads.)
  delete from price_trend_chain_state s
  using retired_listing r
  where r.vin = s.vin and s.m1_at <= r.retired_at;
  get diagnostics _n_purged = row_count;

  -- Each (vin, chain) the night touched, and the state it continues from: its
  -- own, or — for a domain the VIN has no chain under yet — the null-domain
  -- chain, which is exactly what precedes that domain's first row.
  drop table if exists _pt_from;
  create temp table _pt_from on commit drop as
  select t.vin, t.chain,
         case when c.vin is not null then c.disp_price else z.disp_price end as disp_price,
         case when c.vin is not null then c.disp_at    else z.disp_at    end as disp_at,
         case when c.vin is not null then c.m1_at      else z.m1_at      end as m1_at,
         case when c.vin is not null then c.m1_src     else z.m1_src     end as m1_src,
         case when c.vin is not null then c.m1_prov    else z.m1_prov    end as m1_prov,
         case when c.vin is not null then c.m1_dom     else z.m1_dom     end as m1_dom,
         case when c.vin is not null then c.m1_price   else z.m1_price   end as m1_price,
         case when c.vin is not null then c.m2_price   else z.m2_price   end as m2_price
  from (select distinct vin, dom as chain from _pt_new where dom is not null) t
  left join price_trend_chain_state c on c.vin = t.vin and c.chain = t.chain
  left join price_trend_chain_state z on z.vin = t.vin and z.chain = '';

  -- Re-derived whole instead: a new row with no domain (every chain of the
  -- VIN moves; none written since 2026-08-25), or a row not later than the
  -- chain's last (a late commit, or one the low-water rescans).
  _rv := array(
    select vin from _pt_new where dom is null
    union
    select n.vin from _pt_new n
    join _pt_from f on f.vin = n.vin and f.chain = n.dom
    where n.observed_at <= f.m1_at
  );

  -- The rest: each new row judged against its chain's stored predecessors.
  -- The m2 stand-in sits at -infinity and only ever serves as lag(price_usd, 2).
  with f as (
    select * from _pt_from where not (vin = any (_rv))
  ), u as (
    select f.vin, f.chain, '-infinity'::timestamptz as observed_at, f.m2_price as price_usd,
           null::text as prov, null::text as dom, null::text as src, false as is_new
    from f where f.m1_at is not null
    union all
    select f.vin, f.chain, f.m1_at, f.m1_price, f.m1_prov, f.m1_dom, f.m1_src, false
    from f where f.m1_at is not null
    union all
    select n.vin, n.dom, n.observed_at, n.price_usd, n.prov, n.dom, n.src, true
    from _pt_new n join f on f.vin = n.vin and f.chain = n.dom
  ), h as (
    select u.*,
           lag(observed_at)  over w as prev_at,
           lag(src)          over w as prev_src,
           lag(prov)         over w as prev_prov,
           lag(dom)          over w as prev_dom,
           lag(price_usd)    over w as prev_price,
           lag(price_usd, 2) over w as back2_price
    from u window w as (partition by vin, chain order by observed_at)
  ), k as (
    select h.*, (prev_at is null or (
        -- listing_price_display's WHERE clause, verbatim — the same text as
        -- in price_trend_state_derive above.
        case when prov is not null and prev_prov is not null then prov = prev_prov
             else src = prev_src and not exists (select 1 from price_methodology_transitions t
                                                 where t.at > h.prev_at and t.at <= h.observed_at) end
        and case when dom is not null and prev_dom is not null then dom = prev_dom
             else not (back2_price is not null and price_usd = back2_price
                       and price_usd is distinct from prev_price) end)) as keep
    from h where is_new
  ), last_row as (
    select distinct on (vin, chain) vin, chain, observed_at, src, prov, dom, price_usd, prev_price
    from k order by vin, chain, observed_at desc
  ), last_keep as (
    select distinct on (vin, chain) vin, chain, price_usd, observed_at
    from k where keep order by vin, chain, observed_at desc
  )
  insert into price_trend_chain_state as s
    (vin, chain, disp_price, disp_at, m1_at, m1_src, m1_prov, m1_dom, m1_price, m2_price)
  select r.vin, r.chain,
         coalesce(d.price_usd, f.disp_price), coalesce(d.observed_at, f.disp_at),
         r.observed_at, r.src, r.prov, r.dom, r.price_usd, r.prev_price
  from last_row r
  join f on f.vin = r.vin and f.chain = r.chain
  left join last_keep d on d.vin = r.vin and d.chain = r.chain
  on conflict (vin, chain) do update
    set disp_price = excluded.disp_price, disp_at = excluded.disp_at,
        m1_at = excluded.m1_at, m1_src = excluded.m1_src, m1_prov = excluded.m1_prov,
        m1_dom = excluded.m1_dom, m1_price = excluded.m1_price, m2_price = excluded.m2_price;
  get diagnostics _n_inc = row_count;

  if cardinality(_rv) > 0 then
    delete from price_trend_chain_state where vin = any (_rv);
    insert into price_trend_chain_state select * from price_trend_state_derive(_to, _rv);
  end if;

  update history_digest_mark set through = _to, hist_id = _w, updated_at = now()
  where name = 'price_trend_state';

  return jsonb_build_object('through', _to, 'new_rows', _n_new, 'chains_folded', _n_inc,
                            'rederived_vins', cardinality(_rv), 'purged', _n_purged,
                            'hist_id', _w);
end;
$fn$;

revoke all on function price_trend_state_fold(timestamptz) from public, anon, authenticated;
grant execute on function price_trend_state_fold(timestamptz) to service_role;

comment on function price_trend_state_fold(timestamptz) is
  'Moves price_trend_chain_state from its close to _to: new price rows (id past the low-water, observed at or before _to) are judged by listing_price_display''s rule against their chain''s stored predecessors; a VIN with a no-domain row or a row not later than its chain''s last is re-derived from full history. Cost scales with the rows since the last fold, not with the archive (0104).';

-- ── One day of the trend: state when it is at that close, else the view ────

create or replace function price_trend_day_rows(_day date)
returns table (
  level text, cohort text, model_year int, cond text, day date, n int,
  price_usd int, p25_usd int, p75_usd int, median_odometer int,
  usd_per_mile numeric, slope_from_sales boolean
)
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  with at_close as (
    select exists (select 1 from history_digest_mark
                   where name = 'price_trend_state'
                     and cardinality(pending_parts) = 0
                     and through = ((_day + 1)::timestamp at time zone 'UTC')) as ok
  ),
  -- Each car's last display price at the close. From the incremental chains
  -- when they sit at exactly this close (0104; the listing reads the chain of
  -- its current domain, or the null-domain chain when that domain has no rows
  -- — the view's `mine`, proven equal to the branch below); otherwise derived
  -- from the view, which walks all history (~30 s on 2026-09-28).
  s as (
    select v.vin, v.price_usd
    from (select l.vin,
                 case when c.vin is not null then c.disp_price else z.disp_price end as price_usd
          from listings l
          left join price_trend_chain_state c on c.vin = l.vin and c.chain = l.dealer_domain
          left join price_trend_chain_state z on z.vin = l.vin and z.chain = ''
          where (select ok from at_close)) v
    where v.price_usd is not null
    union all
    select d.vin, d.price_usd
    from (select distinct on (p.vin) p.vin, p.price_usd
          from listing_price_display p
          where p.observed_at <= ((_day + 1)::timestamp at time zone 'UTC')
          order by p.vin, p.observed_at desc) d
    where not (select ok from at_close)
  ),
  -- THE rate: ev_price_model's, the one the valuation and the cards use.
  slope as (
    select vin8, model_year, usd_per_mile::numeric as s
    from ev_price_model
  ),
  cars as (
    select upper(substring(l.vin, 1, 8))                                                 as vin8,
           lower(l.make) || ' ' || regexp_replace(lower(l.model), '[^a-z0-9+]', '', 'g') as model_key,
           l.year                                                                          as model_year,
           case when l.condition = 'new' then 'new' else 'used' end                        as cond,
           s.price_usd::numeric                                                            as price,
           nullif(l.mileage, 0)::numeric                                                   as odo,
           coalesce(sl.s < 0, false)                                                       as slope_from_sales,
           case when sl.s < 0 then sl.s else -0.09 end                                     as slope,
           tk.trim_key,
           tk.identity
    from s
    join listings l using (vin)
    left join slope sl on sl.vin8 = upper(substring(l.vin, 1, 8)) and sl.model_year = l.year
    left join vin_trend_key tk on tk.vin = upper(l.vin)
    where l.year is not null
      and s.price_usd between 1000 and 500000
      and l.first_seen_at <= ((_day + 1)::timestamp at time zone 'UTC')
      and (l.delisted_at is null or l.delisted_at > ((_day + 1)::timestamp at time zone 'UTC'))
  ),
  keyed as (
    select 'vin8'::text as level, vin8 as cohort, model_year, cond, odo, slope, slope_from_sales,
           case when cond = 'used' then price + slope * (40000 - odo) else price end as adj
    from cars
    union all
    select 'model', model_key, model_year, cond, odo, slope, slope_from_sales,
           case when cond = 'used' then price + slope * (40000 - odo) else price end as adj
    from cars
    union all
    select 'trim', vin8 || '|' || trim_key || '|' || identity, model_year, cond, odo, slope, slope_from_sales,
           case when cond = 'used' then price + slope * (40000 - odo) else price end as adj
    from cars
    where trim_key is not null and identity is not null
  )
  select level, cohort, model_year, cond, _day,
         count(*)::int,
         round(percentile_cont(0.5)  within group (order by adj))::int,
         round(percentile_cont(0.25) within group (order by adj))::int,
         round(percentile_cont(0.75) within group (order by adj))::int,
         round(percentile_cont(0.5)  within group (order by odo))::int,
         round(avg(slope)::numeric, 4),
         bool_and(slope_from_sales)
  from keyed
  where adj > 0 and (cond = 'new' or odo is not null)
  group by 1, 2, 3, 4
$$;

revoke all on function price_trend_day_rows(date) from public, anon, authenticated;

comment on function price_trend_day_rows(date) is
  'One closed day of ev_price_trend_ask_daily at every level (vin8, model, trim), from each car''s last listing_price_display price as of that day''s close and listings, each car moved to 40,000 miles on ev_price_model''s usd_per_mile (0080). The single place a day is computed. The prices come from price_trend_chain_state when it sits at that close (0104), else from the view directly (slow: all history).';

-- ── The nightly door: one day per call ─────────────────────────────────────

create or replace function advance_price_trend_ask_daily(_max_days int default 1)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  _day   date;
  _today date := (now() at time zone 'UTC')::date;
  _done  int    := 0;
  _rows  bigint := 0;
  _n     bigint;
  _fold  jsonb;
  _site  bigint;
begin
  select coalesce(max(day) + 1, date '2026-08-15') into _day from ev_price_trend_ask_daily;
  while _day < _today and _done < _max_days loop
    _fold := price_trend_state_fold(((_day + 1)::timestamp at time zone 'UTC'));
    insert into ev_price_trend_ask_daily
      (level, cohort, model_year, cond, day, n, price_usd, p25_usd, p75_usd,
       median_odometer, usd_per_mile, slope_from_sales)
    select level, cohort, model_year, cond, day, n, price_usd, p25_usd, p75_usd,
           median_odometer, usd_per_mile, slope_from_sales
    from price_trend_day_rows(_day);
    get diagnostics _n = row_count;
    _rows := _rows + _n;
    _done := _done + 1;
    _day  := _day + 1;
  end loop;
  _site := rebuild_price_trend_site_daily();
  return jsonb_build_object('view', 'ev_price_trend_ask_daily', 'days', _done, 'rows', _rows,
                            'through', (select max(day) from ev_price_trend_ask_daily),
                            'behind', greatest(0, _today - _day),
                            'fold', _fold,
                            'site_days', _site);
end;
$fn$;

revoke all on function advance_price_trend_ask_daily(int) from public, anon, authenticated;

-- ── Site summary for vin_listing_history ───────────────────────────────────

create or replace function listing_price_site_last_reseed(_part int default 0, _parts int default 1)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  m  history_digest_mark%rowtype;
  _w bigint;
  _n bigint;
begin
  if _parts < 1 or _part < 0 or _part >= _parts then
    raise exception 'listing_price_site_last_reseed: part % of % is not a slice', _part, _parts;
  end if;

  if _part = 0 then
    -- Rows younger than six hours are merged again by the first advance (the
    -- merge is idempotent), so a straggling transaction is not lost.
    select coalesce(max(id) filter (where observed_at < now() - interval '6 hours'), 0)
      into _w from listing_price_history;
    delete from listing_price_site_last where true;
    insert into history_digest_mark (name, through, hist_id, seed_parts, pending_parts, updated_at)
    values ('listing_price_site_last', null, _w, _parts, array(select generate_series(0, _parts - 1)), now())
    on conflict (name) do update
      set hist_id = excluded.hist_id, seed_parts = excluded.seed_parts,
          pending_parts = excluded.pending_parts, updated_at = now();
  end if;

  select * into m from history_digest_mark where name = 'listing_price_site_last' for update;
  if m.seed_parts is distinct from _parts or not (_part = any (m.pending_parts)) then
    raise exception 'listing_price_site_last_reseed: part % of % is not pending (seed is % parts, pending %)',
      _part, _parts, m.seed_parts, m.pending_parts
      using hint = 'start again with part 0';
  end if;

  insert into listing_price_site_last as t (vin, dealer_domain, last_pos_at, last_any_at, has_oem)
  select vin, dealer_domain,
         max(observed_at) filter (where price_usd > 0),
         max(observed_at),
         coalesce(bool_or(provenance like 'oem-%'), false)
  from listing_price_history
  where dealer_domain is not null
    and abs(hashtext(vin)::bigint) % _parts = _part
  group by vin, dealer_domain
  on conflict (vin, dealer_domain) do update
    set last_pos_at = greatest(t.last_pos_at, excluded.last_pos_at),
        last_any_at = greatest(t.last_any_at, excluded.last_any_at),
        has_oem     = t.has_oem or excluded.has_oem;
  get diagnostics _n = row_count;

  update history_digest_mark set pending_parts = array_remove(pending_parts, _part), updated_at = now()
  where name = 'listing_price_site_last';

  return jsonb_build_object('part', _part, 'parts', _parts, 'rows', _n, 'hist_id', m.hist_id,
                            'pending', array_remove(m.pending_parts, _part));
end;
$fn$;

revoke all on function listing_price_site_last_reseed(int, int) from public, anon, authenticated;
grant execute on function listing_price_site_last_reseed(int, int) to service_role;

comment on function listing_price_site_last_reseed(int, int) is
  'Rebuilds listing_price_site_last from all of listing_price_history, one hash slice of VINs per call: (0, n) starts and writes slice 0, then (1, n) .. (n-1, n). ~56 s in one slice on 2026-09-28. By hand, once after 0104.';

create or replace function listing_price_site_last_advance()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  m  history_digest_mark%rowtype;
  _w bigint;
  _n bigint;
  _p bigint;
begin
  select * into m from history_digest_mark where name = 'listing_price_site_last' for update;
  if not found or cardinality(m.pending_parts) > 0 then
    raise exception 'listing_price_site_last is not seeded (pending slices: %)', m.pending_parts
      using hint = 'select listing_price_site_last_reseed(0, 4); then (1, 4) .. (3, 4) (0104)';
  end if;

  select greatest(m.hist_id, coalesce(max(id) filter (where observed_at < now() - interval '6 hours'), m.hist_id))
    into _w from listing_price_history where id > m.hist_id;

  insert into listing_price_site_last as t (vin, dealer_domain, last_pos_at, last_any_at, has_oem)
  select vin, dealer_domain,
         max(observed_at) filter (where price_usd > 0),
         max(observed_at),
         coalesce(bool_or(provenance like 'oem-%'), false)
  from listing_price_history
  where id > m.hist_id and dealer_domain is not null
  group by vin, dealer_domain
  on conflict (vin, dealer_domain) do update
    set last_pos_at = greatest(t.last_pos_at, excluded.last_pos_at),
        last_any_at = greatest(t.last_any_at, excluded.last_any_at),
        has_oem     = t.has_oem or excluded.has_oem;
  get diagnostics _n = row_count;

  -- retire_misclassified_listings deletes a VIN's history with its listing
  -- and records it in retired_listing: what was summarized before is gone.
  delete from listing_price_site_last t
  using retired_listing r
  where r.vin = t.vin and t.last_any_at <= r.retired_at;
  get diagnostics _p = row_count;

  update history_digest_mark set hist_id = _w, updated_at = now()
  where name = 'listing_price_site_last';

  return jsonb_build_object('merged', _n, 'purged', _p, 'hist_id', _w);
end;
$fn$;

revoke all on function listing_price_site_last_advance() from public, anon, authenticated;

-- ── vin_listing_history, same rows, candidate VINs first ───────────────────
--
-- Output identical to 0085's (verified: md5 of the ordered rows, 2026-09-28).
-- `cand` restates listing_prior_site's gates over the summary — p is the
-- latest positive-price row from another site, dotted domains, a delist
-- after it, nothing from that site since, no oem-% rows on either site —
-- minus the price comparison, which the view makes. The view then runs for
-- those VINs only (~2.8k of 162k) and remains the authority.

drop materialized view vin_listing_history;

create materialized view vin_listing_history as
with live as (
  select vin, dealer_domain from listings
  where delisted_at is null and price_usd > 0 and dealer_domain like '%.%'
),
other_site as (
  select distinct on (s.vin) s.vin, l.dealer_domain as ldom, s.dealer_domain as pdom,
         s.last_pos_at, s.last_any_at, s.has_oem
  from listing_price_site_last s
  join live l on l.vin = s.vin
  where s.dealer_domain <> l.dealer_domain and s.last_pos_at is not null
  order by s.vin, s.last_pos_at desc
),
gated as (
  select o.* from other_site o
  left join listing_price_site_last c on c.vin = o.vin and c.dealer_domain = o.ldom
  where o.pdom like '%.%' and not o.has_oem and not coalesce(c.has_oem, false)
),
gone as (
  select g.vin, min(e.observed_at) as gone_at
  from gated g
  join listing_events e on e.vin = g.vin and e.event = 'delisted' and e.observed_at > g.last_pos_at
  group by g.vin
),
cand as (
  select g.vin from gated g join gone x using (vin) where g.last_any_at <= x.gone_at
),
prior as (
  select s.* from listing_prior_site s where s.vin = any (array(select vin from cand))
),
rechecked as (
  -- Only a VIN with a recheck-written delist can produce an `away` row; its
  -- whole event history is windowed, so lead() sees what it always saw.
  select distinct e.vin
  from listing_events e
  join ingest_runs r on r.id = e.run_id and r.source = 'recheck'
  where e.event = 'delisted'
),
step as (
  select vin, event, observed_at as gone_at, run_id as gone_run,
         lead(event)       over w as nxt_event,
         lead(observed_at) over w as back_at,
         lead(run_id)      over w as back_run
  from listing_events
  where vin = any (array(select vin from rechecked))
  window w as (partition by vin order by observed_at, id)
),
away as (
  -- A delist this car's own page produced, with a relist a week or more
  -- later. distinct because a run that wrote the same event twice is one
  -- absence, not two.
  select distinct s.vin, s.gone_at, s.back_at, s.gone_run, s.back_run, l.dealer_domain
  from step s
  join ingest_runs r on r.id = s.gone_run and r.source = 'recheck'
  join listings l on l.vin = s.vin and l.delisted_at is null
  where s.event = 'delisted'
    and s.nxt_event in ('relisted', 'listed')
    and s.back_at is not null
    and s.back_at - s.gone_at >= interval '7 days'
),
counted as (
  select a.*,
         count(*) over (partition by gone_run, back_run)      as n_pair,
         count(*) over (partition by gone_run, dealer_domain) as n_lot
  from away a
),
gaps as (
  select vin,
         jsonb_agg(jsonb_build_object('goneAt', gone_at, 'backAt', back_at) order by gone_at) as absences
  from counted
  where n_pair = 1 and n_lot = 1
  group by vin
)
select l.vin,
       l.first_seen_at,
       s.prior_domain,
       s.prior_price_usd,
       s.prior_last_seen_at,
       g.absences
from listings l
left join prior s on s.vin = l.vin
left join gaps g on g.vin = l.vin
where l.delisted_at is null
  and l.vin = any (array(select vin from prior union select vin from gaps))
  -- Only rows that clear a bar. A car with nothing to say is not in here, so
  -- the page's gate is "did the lookup return a row", not "does the row have
  -- anything in it".
  and (s.vin is not null or g.vin is not null);

create unique index vin_listing_history_vin_idx on vin_listing_history (vin);

grant select on vin_listing_history to anon, authenticated;

-- ── refresh_vin_variants: the two branches change, nothing else ────────────
--
-- 0088's rule: this body is the LIVE definition read immediately before
-- writing (pg_get_functiondef, 2026-09-28), with two branches edited:
-- ev_price_trend_ask_daily advances one day per call; vin_listing_history
-- merges the site summary first. Re-read the live body before applying; if it
-- has gained a target since, carry it over.

create or replace function refresh_vin_variants(target text)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  n bigint;
  s jsonb;
begin
  case target
    when 'vin_variant_observed' then
      refresh materialized view concurrently vin_variant_observed;
      select count(*) into n from vin_variant_observed;
    when 'ev_cohort_trim_spread' then
      refresh materialized view concurrently ev_cohort_trim_spread;
      select count(*) into n from ev_cohort_trim_spread;
    when 'listing_freshness' then
      refresh materialized view concurrently listing_freshness;
      select count(*) into n from listing_freshness;
    when 'ev_cohort_velocity' then
      refresh materialized view concurrently ev_cohort_velocity;
      select count(*) into n from ev_cohort_velocity;
    when 'ev_cohort_ask_weekly' then
      refresh materialized view concurrently ev_cohort_ask_weekly;
      select count(*) into n from ev_cohort_ask_weekly;
    when 'ev_price_trend_sales' then
      refresh materialized view concurrently ev_price_trend_sales;
      select count(*) into n from ev_price_trend_sales;
    when 'ev_price_trend_ask_daily' then
      return advance_price_trend_ask_daily(1);
    when 'vin_listing_history' then
      s := listing_price_site_last_advance();
      refresh materialized view concurrently vin_listing_history;
      select count(*) into n from vin_listing_history;
      return jsonb_build_object('view', target, 'rows', n, 'site_summary', s);
    when 'dealer_price_behavior' then
      refresh materialized view concurrently dealer_price_behavior;
      select count(*) into n from dealer_price_behavior;
    else
      raise exception 'refresh_vin_variants: unknown target %', target
        using hint = 'one of vin_variant_observed, ev_cohort_trim_spread, listing_freshness, ev_cohort_velocity, ev_cohort_ask_weekly, ev_price_trend_sales, ev_price_trend_ask_daily, vin_listing_history, dealer_price_behavior';
  end case;
  return jsonb_build_object('view', target, 'rows', n);
end;
$function$;
