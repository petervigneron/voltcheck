-- 0125 — what a seller does with a price: the nightly now reads the night's
-- price rows, not the whole asking-price history.
--
-- ── What was wrong ─────────────────────────────────────────────────────────
--
-- 0124 got dealer_price_behavior (0084) back under service_role's 60 s by
-- writing its per-car half in four hash slices. Each slice was 37-40 s and
-- about 30 s of that was not the slice: one pass over listing_price_history
-- (8.4M rows, larger than the box's memory) and the `lanes` pass in front of
-- it, paid four times a night and growing ~0.7% a day. A slice would have
-- been back at the cap around mid-January 2027, and more slices buy little.
--
-- ── What this does ─────────────────────────────────────────────────────────
--
-- 0104's fold, for this tile. dealer_price_chain_state keeps, per listing and
-- per chain (0104's chains: a dealer_domain's rows plus the no-domain rows,
-- or '' for the no-domain rows alone), what 0084 needs to judge the NEXT
-- price row: the chain's last row and the price before it (guard 1 looks no
-- further back), the last price kept and the lowest price kept (0084's
-- prev_kept / last_kept and run_min), and the time of every step down to a
-- new low of $500 or more. The 30-day window is applied when the per-car
-- rows are written, so it slides without touching the state.
--
--   dealer_price_state_fold()   reads the price rows past the low-water in
--     history_digest_mark('dealer_price_state') and continues each chain
--     they touch. A chain seen for the first time continues from the
--     no-domain chain, as in 0104. Keeping every chain makes a seller change
--     free: the car just reads another chain.
--   dealer_price_behavior_car_write()   0084's `cars`, joined to each car's
--     chain (its current domain's, else the no-domain one), kept where the
--     chain ends on the page price. Rewrites dealer_price_behavior_car whole.
--   dealer_price_behavior   the 0124 view, unchanged: a group-by over that
--     table.
--
-- What forces a re-derive of a VIN from its whole history (an index walk):
--   * a new row carrying no domain (every chain of the VIN moves; none
--     written since 2026-08-25);
--   * a new row not later than its chain's last row (a late commit);
--   * the junk-price floor, but only where it can matter — next paragraph;
--   * retire_misclassified_listings: the VIN's chains are purged (0104).
-- A changed seller, price, first_seen_at or delisting forces nothing: those
-- are read from listings when the per-car rows are written.
--
-- THE FLOOR is the one place a chain depends on its listing (condition and
-- year pick 15000 / 7000 / 4000 / 1000). Reading listings in the fold to
-- know it would be random reads of a 933 MB table every night. Instead each
-- chain records the floor it was worked out under and low_any, the lowest
-- price guard (1) kept whatever the floor. Two floors keep exactly the same
-- rows unless some kept price sits below the higher of them, so a chain is
-- good for the car's floor when floor_usd = the car's floor, or low_any >=
-- the higher of the two. The seed and a brand-new chain use 1000; the write
-- re-derives, under the car's own floor, the live cars that fail that test.
-- 167 of 141,722 cars on the first write, none on the next two.
--
-- THE LOW-WATER never passes a row younger than six hours (0104's allowance
-- for a transaction still open). 0104 re-derives every VIN it sees twice
-- because of that, which is cheap for a fold that runs 17 h after its close
-- and would not be here, where the fold runs to the present. So the ids
-- taken past the low-water are kept in dealer_price_state_seen (1,993 of
-- them tonight) and skipped next time. Measured over the last 235,205 rows:
-- observed_at trails id order by at most 24.5 s, 47 rows sit behind an
-- earlier row of their own VIN, none tie.
--
-- `lanes` is dealer_price_lane, 38 rows, added to by the fold.
--
-- ── Measured on production, 2026-11-17 ─────────────────────────────────────
--
-- The state was seeded as of id 8,335,980 (2026-11-15 17:00Z), then folded
-- twice, a night's rows each time, so the fold is what produced the state
-- now live — not a seed taken at the present.
--
--   seed      16 slices, 14.1-15.3 s each (the first 20.1 s with the lanes);
--             795,330 chains, 176 MB.
--   fold 1    to id 8,383,668: 47,688 rows, 18,839 chains, 39 VINs
--             re-derived, 6.2 s.
--   fold 2    to the present: 52,231 rows, 27,959 chains, 6 re-derived,
--             7.8 s. Again a minute later: 0 new rows, 0.1 s.
--   write     23.3-24.5 s, three runs, 132,175 rows — the count 0124's
--             slices wrote the same evening. 17.6 s of it is reading the
--             141,722 live listings off disk (62,057 blocks, 485 MB); the
--             joins to the state are ~2.5 s.
--   view      1.0 s, 4,012 dealers.
--   Through the nightly's own path (ingest function, service_role): 3.9,
--   24.1 and 1.0 s.
--
-- So the night does ~32 s of this work where 0124 did ~150 and 0084 did 60+,
-- in statements of 8, 24 and 1 s. The fold grows with the night's rows. The
-- write grows with the number of live listings and how wide their rows are,
-- not with the history: it is the same read vin_variant_observed and
-- listing_freshness pay. Not measured: a fold over more than one night's
-- rows (0104's did 428k rows in 29 s).
--
-- CONTROL: dealer_price_behavior_check below — a random sample of dealer
-- sites recomputed with 0084's own statement and compared car by car.
--   after the seed    (both capped at id 8,335,980)  200 dealers,  1,701 cars
--   after fold 1      (both capped at id 8,383,668)  600 dealers,  5,293 cars, 1,385 cuts
--   after fold 2      (0084 verbatim, no cap)        800 dealers,  8,040 cars, 2,441 cuts
--   after fold 2 again                              2,500 dealers, 23,975 cars, 6,892 cuts
-- Every run: no car on one side only, no first cut that differs.
-- Both folds were run by hand on 11-17 over two real nights' rows. The first
-- fold the nightly runs itself is 2026-11-18's; check it with
--   select dealer_price_state_fold(); select dealer_price_behavior_car_write();
--   select dealer_price_behavior_check(150);
--
-- ── Rejected ───────────────────────────────────────────────────────────────
--
--   Taking `lanes` out of every slice and nothing else. ~6 s of a 37 s
--   slice; at 0.7% a day that moves the cap from mid-January to roughly
--   mid-February (computed, not run). It leaves the pass over the history.
--   One state row per listing, re-derived when the listing row changes.
--   0104 measured it: ~5k seller changes a night at ~3 ms each and growing
--   with every car's history. Chains make a seller change free.
--   Reading the car's floor from listings in the fold. See THE FLOOR.
--   A covering index on listings for the write's 17.6 s. listings is the
--   most-updated table here and price_usd would stop being a HOT update.
--   Extending price_trend_chain_state. It sits at the last day's close, not
--   the present, and 0084's floor is not listing_price_display's.
--   A shorter low-water guard with re-derives instead of the seen ids. A row
--   the fold misses is missed silently; 2,000 ids are cheaper than that.
--   listing_price_site_last.has_oem for the lanes. Never shown equal to
--   0084's `lanes`; 38 rows of our own are.
--
-- ── Known limits ───────────────────────────────────────────────────────────
--
--   0104's, all four: price_methodology_transitions changing (the fold
--   raises: reseed); a price row whose transaction stays open more than six
--   hours; history rows edited or pruned in place (reseed); a row with
--   dealer_domain = '' (the fold raises).
--   dealer_price_lane only grows. A domain whose only 'oem-%' rows went with
--   a retired listing stays excluded until a reseed; 0084 would let it back.
--   The write refuses if the state was not folded in the last two hours, so
--   a night whose fold failed keeps the previous night's rows rather than
--   dropping every car repriced since.
--   Two rows of one VIN with the same observed_at are in arbitrary order in
--   0084 itself. None in the last 235,205 rows.
--
-- ── Full recompute ─────────────────────────────────────────────────────────
--
--   The state:  select dealer_price_state_reseed(0, 16); then (1, 16) ..
--   (15, 16), by hand, ~15 s each; then fold and write.
--   The per-car rows without the state: 0124's dealer_price_behavior_car_rows
--   (0, 4) .. (3, 4) still exists and still reads the whole history, ~40 s
--   a call as postgres. It is no longer a nightly target.
--
-- ON PRODUCTION this file was applied in four steps (tables, derive and
-- reseed; fold; write and check; refresh_vin_variants) with the seed, the
-- two folds and the controls between the third and fourth.

-- ── Tables ─────────────────────────────────────────────────────────────────

alter table history_digest_mark drop constraint history_digest_mark_name_check;
alter table history_digest_mark add constraint history_digest_mark_name_check
  check (name in ('price_trend_state', 'listing_price_site_last', 'dealer_price_state'));

-- One row per (listing, chain), chains as 0104 defines them: a dealer_domain's
-- rows plus the rows that carry no domain, or '' for the no-domain rows alone.
create table dealer_price_chain_state (
  vin       text not null,
  chain     text not null,
  m1_at     timestamptz not null,  -- the chain's last row, before any guard
  m1_src    text,
  m1_prov   text,
  m1_dom    text,
  m1_price  int,
  m2_price  int,                   -- the row before it: lag(price_usd, 2) for the next row
  floor_usd int not null,          -- the junk-price floor the kept_* columns were worked out under
  low_any   int,                   -- lowest price guard (1) kept, whatever the floor
  kept_last int,                   -- last price kept at or above the floor: 0084's last_kept
  kept_min  int,                   -- lowest price kept at or above the floor: 0084's run_min for the next row
  cut_ats   timestamptz[],         -- every step down to a new low of $500 or more, oldest first
  primary key (vin, chain)
);

comment on table dealer_price_chain_state is
  'Per listing and per display chain: what dealer_price_behavior (0084) needs to judge the next asking-price row without re-reading the ones before it. Folded nightly from listing_price_history by dealer_price_state_fold, from history_digest_mark(dealer_price_state); rebuilt whole by dealer_price_state_reseed (0125). Service role only.';

-- Row ids past the low-water that the fold has already taken, so the rows it
-- sees twice (anything younger than six hours at the last fold) are skipped
-- rather than re-derived.
create table dealer_price_state_seen (id bigint primary key);

-- 0084's `lanes`: every dealer_domain that has ever written an 'oem-%' row.
create table dealer_price_lane (dealer_domain text primary key);

revoke all on dealer_price_chain_state from public, anon, authenticated;
revoke all on dealer_price_state_seen  from public, anon, authenticated;
revoke all on dealer_price_lane        from public, anon, authenticated;

-- ── Deriving chains from full history ──────────────────────────────────────
--
-- One query for the seed (a hash slice of VINs, floor 1000) and for
-- re-derives (a VIN list, an index walk per VIN, the listing's own floor).
-- h and k are 0084's, partitioned by chain as 0104's are; s is 0084's seq.

create or replace function dealer_price_state_derive(
  _vins text[] default null, _part int default null, _parts int default null, _upto bigint default null)
returns setof dealer_price_chain_state
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
declare
  _pick  text;
  _join  text := '';
  _floor text := '1000';
begin
  if _vins is not null then
    _pick  := 'p.vin = any ($1) and';
    _join  := 'join listings l on l.vin = p.vin';
    -- 0084's floor_usd, character for character.
    _floor := $f$case when l.condition = 'new'        then 15000
                      when coalesce(l.year, 0) >= 2020 then 7000
                      when coalesce(l.year, 0) >= 2018 then 4000
                      else 1000 end$f$;
  elsif _parts is not null then
    _pick := 'abs(hashtext(p.vin)::bigint) % $3 = $2 and';
  else
    raise exception 'dealer_price_state_derive: a VIN list or a slice';
  end if;

  return query execute format($q$
    with base as (
      select p.vin, p.price_usd, p.observed_at, p.provenance as prov, p.dealer_domain as dom,
             coalesce(r.source, '?') as src, (%3$s)::int as floor_usd
      from listing_price_history p
      left join ingest_runs r on r.id = p.run_id
      %2$s
      where %1$s p.price_usd > 0
        and ($4::bigint is null or p.id <= $4)
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
             lag(price_usd, 2)  over w as back2_price,
             lead(observed_at)  over w is null as is_last
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
    ), ka as (
      select vin, chain,
             max(observed_at)                          as m1_at,
             max(src)        filter (where is_last)    as m1_src,
             max(prov)       filter (where is_last)    as m1_prov,
             max(dom)        filter (where is_last)    as m1_dom,
             max(price_usd)  filter (where is_last)    as m1_price,
             max(prev_price) filter (where is_last)    as m2_price,
             max(floor_usd)                            as floor_usd,
             min(price_usd)  filter (where keep)       as low_any
      from k group by vin, chain
    ), s as (
      select k.vin, k.chain, k.price_usd, k.observed_at,
             lag(k.price_usd) over w as prev_kept,
             min(k.price_usd) over (partition by k.vin, k.chain order by k.observed_at
                                    rows between unbounded preceding and 1 preceding) as run_min,
             last_value(k.price_usd) over (partition by k.vin, k.chain order by k.observed_at
                                    rows between unbounded preceding and unbounded following) as last_kept
      from k
      where k.keep and k.price_usd >= k.floor_usd
      window w as (partition by k.vin, k.chain order by k.observed_at)
    ), sa as (
      select vin, chain, max(last_kept) as kept_last, min(price_usd) as kept_min,
             array_agg(observed_at order by observed_at) filter (
               where prev_kept is not null
                 and price_usd < prev_kept
                 and price_usd < run_min
                 and prev_kept - price_usd >= 500) as cut_ats
      from s group by vin, chain
    )
    select ka.vin, ka.chain, ka.m1_at, ka.m1_src, ka.m1_prov, ka.m1_dom, ka.m1_price, ka.m2_price,
           ka.floor_usd, ka.low_any, sa.kept_last, sa.kept_min, sa.cut_ats
    from ka
    left join sa on sa.vin = ka.vin and sa.chain = ka.chain
  $q$, _pick, _join, _floor)
  using _vins, _part, _parts, _upto;
end;
$fn$;

revoke all on function dealer_price_state_derive(text[], int, int, bigint) from public, anon, authenticated;

-- ── Seed (by hand, in slices) ──────────────────────────────────────────────

create or replace function dealer_price_state_reseed(
  _part int default 0, _parts int default 1, _upto bigint default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
-- A slice is a hash predicate the planner has no statistics for (0124).
set enable_nestloop to off
as $fn$
declare
  m    history_digest_mark%rowtype;
  _top bigint;
  _c   bigint;
  _n   bigint;
begin
  if _parts < 1 or _part < 0 or _part >= _parts then
    raise exception 'dealer_price_state_reseed: part % of % is not a slice', _part, _parts;
  end if;

  if _part = 0 then
    select coalesce(max(id), 0) into _top from listing_price_history;
    -- The seed stops below the first row young enough to have an uncommitted
    -- neighbour; the next fold takes it from there.
    _c := coalesce(_upto,
                   (select min(id) - 1 from listing_price_history
                    where id > _top - 500000 and observed_at >= now() - interval '6 hours'),
                   _top);
    if _upto is null and _c <= _top - 500000 then
      raise exception 'dealer_price_state_reseed: more than 500,000 price rows in six hours; pass _upto';
    end if;

    delete from dealer_price_chain_state where true;
    delete from dealer_price_state_seen where true;
    delete from dealer_price_lane where true;
    insert into dealer_price_lane
    select distinct dealer_domain from listing_price_history
    where provenance like 'oem-%' and dealer_domain is not null and id <= _c;

    insert into history_digest_mark
      (name, through, hist_id, transitions_sig, seed_parts, pending_parts, updated_at)
    values ('dealer_price_state', now(), _c,
            (select md5(coalesce(string_agg(at::text, ',' order by at), '')) from price_methodology_transitions),
            _parts, array(select generate_series(0, _parts - 1)), now())
    on conflict (name) do update
      set through = excluded.through, hist_id = excluded.hist_id,
          transitions_sig = excluded.transitions_sig, seed_parts = excluded.seed_parts,
          pending_parts = excluded.pending_parts, updated_at = now();
  end if;

  select * into m from history_digest_mark where name = 'dealer_price_state' for update;
  if not found or m.seed_parts is distinct from _parts or not (_part = any (m.pending_parts)) then
    raise exception 'dealer_price_state_reseed: part % of % is not pending (seed is % parts, pending %)',
      _part, _parts, m.seed_parts, m.pending_parts
      using hint = 'start again with part 0';
  end if;
  if _upto is not null and _upto <> m.hist_id then
    raise exception 'dealer_price_state_reseed: this seed is at id %, not %', m.hist_id, _upto;
  end if;

  delete from dealer_price_chain_state where abs(hashtext(vin)::bigint) % _parts = _part;
  insert into dealer_price_chain_state
  select * from dealer_price_state_derive(null, _part, _parts, m.hist_id);
  get diagnostics _n = row_count;

  update history_digest_mark set pending_parts = array_remove(pending_parts, _part), updated_at = now()
  where name = 'dealer_price_state';

  return jsonb_build_object('hist_id', m.hist_id, 'part', _part, 'parts', _parts, 'rows', _n,
                            'pending', array_remove(m.pending_parts, _part));
end;
$fn$;

revoke all on function dealer_price_state_reseed(int, int, bigint) from public, anon, authenticated;
grant execute on function dealer_price_state_reseed(int, int, bigint) to service_role;

comment on function dealer_price_state_reseed(int, int, bigint) is
  'Rebuilds dealer_price_chain_state (and dealer_price_lane) from all of listing_price_history, one hash slice of VINs per call: (0, n) starts a seed and writes slice 0, then (1, n) .. (n-1, n). The fold refuses until every slice is written. By hand, never from the nightly. Needed again if price_methodology_transitions changes or history rows are edited in place (0125).';

-- ── Nightly fold ────────────────────────────────────────────────────────────

create or replace function dealer_price_state_fold(_upto bigint default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  m         history_digest_mark%rowtype;
  _sig      text;
  _top      bigint;
  _young    bigint;
  _w        bigint;
  _rv       text[];
  _n_new    bigint;
  _n_inc    bigint := 0;
  _n_purged bigint;
begin
  select * into m from history_digest_mark where name = 'dealer_price_state' for update;
  if not found or cardinality(m.pending_parts) > 0 then
    raise exception 'dealer_price_chain_state is not seeded (pending slices: %)', m.pending_parts
      using hint = 'select dealer_price_state_reseed(0, 16); then (1, 16) .. (15, 16) (0125)';
  end if;

  select md5(coalesce(string_agg(at::text, ',' order by at), '')) into _sig
  from price_methodology_transitions;
  if _sig is distinct from m.transitions_sig then
    raise exception 'price_methodology_transitions changed since dealer_price_chain_state was seeded'
      using hint = 'every row straddling a transition changes verdict: reseed (0125)';
  end if;

  -- Everything past the low-water, read once: the new rows, the lanes and the
  -- next low-water all come from this one snapshot.
  drop table if exists _dp_all;
  create temp table _dp_all on commit drop as
  select p.id, p.vin, p.price_usd, p.observed_at, p.provenance as prov, p.dealer_domain as dom,
         coalesce(r.source, '?') as src
  from listing_price_history p
  left join ingest_runs r on r.id = p.run_id
  where p.id > m.hist_id
    and (_upto is null or p.id <= _upto);
  analyze _dp_all;

  select max(id), min(id) filter (where observed_at >= now() - interval '6 hours') - 1
    into _top, _young
  from _dp_all;
  if _top is null then
    update history_digest_mark set through = now(), updated_at = now() where name = 'dealer_price_state';
    return jsonb_build_object('new_rows', 0, 'hist_id', m.hist_id);
  end if;
  -- Never past a row young enough to have a straggling neighbour uncommitted.
  _w := greatest(m.hist_id, coalesce(_young, _top));

  drop table if exists _dp_new;
  create temp table _dp_new on commit drop as
  select a.vin, a.price_usd, a.observed_at, a.prov, a.dom, a.src
  from _dp_all a
  where a.price_usd > 0
    and not exists (select 1 from dealer_price_state_seen s where s.id = a.id);
  get diagnostics _n_new = row_count;
  if exists (select 1 from _dp_new where dom = '') then
    raise exception 'a price row with dealer_domain = '''' collides with the null-domain chain key (0104)';
  end if;
  analyze _dp_new;

  insert into dealer_price_lane
  select distinct dom from _dp_all where prov like 'oem-%' and dom is not null
  on conflict do nothing;

  -- 0104's purge: a retired listing's history went with it.
  delete from dealer_price_chain_state s
  using retired_listing r
  where r.vin = s.vin and s.m1_at <= r.retired_at;
  get diagnostics _n_purged = row_count;

  -- Each (vin, chain) the night touched and the state it continues from: its
  -- own, or the no-domain chain's, or nothing (floor 1000, see the header).
  drop table if exists _dp_from;
  create temp table _dp_from on commit drop as
  select t.vin, t.chain,
         case when c.vin is not null then c.m1_at     else z.m1_at     end as m1_at,
         case when c.vin is not null then c.m1_src    else z.m1_src    end as m1_src,
         case when c.vin is not null then c.m1_prov   else z.m1_prov   end as m1_prov,
         case when c.vin is not null then c.m1_dom    else z.m1_dom    end as m1_dom,
         case when c.vin is not null then c.m1_price  else z.m1_price  end as m1_price,
         case when c.vin is not null then c.m2_price  else z.m2_price  end as m2_price,
         coalesce(case when c.vin is not null then c.floor_usd else z.floor_usd end, 1000) as floor_usd,
         case when c.vin is not null then c.low_any   else z.low_any   end as low_any,
         case when c.vin is not null then c.kept_last else z.kept_last end as kept_last,
         case when c.vin is not null then c.kept_min  else z.kept_min  end as kept_min,
         case when c.vin is not null then c.cut_ats   else z.cut_ats   end as cut_ats
  from (select distinct vin, dom as chain from _dp_new where dom is not null) t
  left join dealer_price_chain_state c on c.vin = t.vin and c.chain = t.chain
  left join dealer_price_chain_state z on z.vin = t.vin and z.chain = '';

  -- Re-derived whole instead: a new row with no domain (every chain of the
  -- VIN moves; none written since 2026-08-25), or a row not later than its
  -- chain's last (a late commit).
  _rv := array(
    select vin from _dp_new where dom is null
    union
    select n.vin from _dp_new n
    join _dp_from f on f.vin = n.vin and f.chain = n.dom
    where n.observed_at <= f.m1_at
  );

  drop table if exists _dp_f;
  create temp table _dp_f on commit drop as
  select x.* from _dp_from x
  where not exists (select 1 from unnest(_rv) as rv(vin) where rv.vin = x.vin);
  analyze _dp_f;

  -- Guard (1) on the new rows, each judged against its chain's stored
  -- predecessors (0104/0105: the m2 stand-in sits at -infinity and only ever
  -- serves as lag(price_usd, 2)).
  drop table if exists _dp_k;
  create temp table _dp_k on commit drop as
  with u as (
    select f.vin, f.chain, '-infinity'::timestamptz as observed_at, f.m2_price as price_usd,
           null::text as prov, null::text as dom, null::text as src, false as is_new
    from _dp_f f where f.m1_at is not null
    union all
    select f.vin, f.chain, f.m1_at, f.m1_price, f.m1_prov, f.m1_dom, f.m1_src, false
    from _dp_f f where f.m1_at is not null
    union all
    select n.vin, n.dom, n.observed_at, n.price_usd, n.prov, n.dom, n.src, true
    from _dp_new n join _dp_f f on f.vin = n.vin and f.chain = n.dom
  ), h as (
    select u.*,
           lag(observed_at)  over w as prev_at,
           lag(src)          over w as prev_src,
           lag(prov)         over w as prev_prov,
           lag(dom)          over w as prev_dom,
           lag(price_usd)    over w as prev_price,
           lag(price_usd, 2) over w as back2_price,
           lead(observed_at) over w is null as is_last
    from u window w as (partition by vin, chain order by observed_at)
  )
  select h.*, (prev_at is null or (
      case when prov is not null and prev_prov is not null then prov = prev_prov
           else src = prev_src and not exists (select 1 from price_methodology_transitions t
                                               where t.at > h.prev_at and t.at <= h.observed_at) end
      and case when dom is not null and prev_dom is not null then dom = prev_dom
           else not (back2_price is not null and price_usd = back2_price
                     and price_usd is distinct from prev_price) end)) as keep
  from h where is_new;
  analyze _dp_k;

  -- The floor, then 0084's seq, continued from the stored last kept price and
  -- running minimum.
  drop table if exists _dp_s;
  create temp table _dp_s on commit drop as
  with s as (
    select k.vin, k.chain, k.price_usd, k.observed_at,
           coalesce(lag(k.price_usd) over w, f.kept_last) as prev_kept,
           least(min(k.price_usd) over (partition by k.vin, k.chain order by k.observed_at
                                        rows between unbounded preceding and 1 preceding),
                 f.kept_min) as run_min,
           last_value(k.price_usd) over (partition by k.vin, k.chain order by k.observed_at
                                        rows between unbounded preceding and unbounded following) as last_kept
    from _dp_k k
    join _dp_f f on f.vin = k.vin and f.chain = k.chain
    where k.keep and k.price_usd >= f.floor_usd
    window w as (partition by k.vin, k.chain order by k.observed_at)
  )
  select vin, chain, max(last_kept) as kept_last, min(price_usd) as kept_min,
         array_agg(observed_at order by observed_at) filter (
           where prev_kept is not null
             and price_usd < prev_kept
             and price_usd < run_min
             and prev_kept - price_usd >= 500) as cut_ats
  from s group by vin, chain;
  analyze _dp_s;

  perform set_config('enable_nestloop', 'off', true);
  insert into dealer_price_chain_state as st
    (vin, chain, m1_at, m1_src, m1_prov, m1_dom, m1_price, m2_price,
     floor_usd, low_any, kept_last, kept_min, cut_ats)
  select r.vin, r.chain, r.observed_at, r.src, r.prov, r.dom, r.price_usd, r.prev_price,
         f.floor_usd,
         least(f.low_any, a.low_new),
         coalesce(s.kept_last, f.kept_last),
         least(f.kept_min, s.kept_min),
         nullif(coalesce(f.cut_ats, '{}') || coalesce(s.cut_ats, '{}'), '{}')
  from (select * from _dp_k where is_last) r
  join _dp_f f on f.vin = r.vin and f.chain = r.chain
  join (select vin, chain, min(price_usd) filter (where keep) as low_new
        from _dp_k group by vin, chain) a on a.vin = r.vin and a.chain = r.chain
  left join _dp_s s on s.vin = r.vin and s.chain = r.chain
  on conflict (vin, chain) do update
    set m1_at = excluded.m1_at, m1_src = excluded.m1_src, m1_prov = excluded.m1_prov,
        m1_dom = excluded.m1_dom, m1_price = excluded.m1_price, m2_price = excluded.m2_price,
        floor_usd = excluded.floor_usd, low_any = excluded.low_any,
        kept_last = excluded.kept_last, kept_min = excluded.kept_min, cut_ats = excluded.cut_ats;
  get diagnostics _n_inc = row_count;
  perform set_config('enable_nestloop', 'on', true);

  if cardinality(_rv) > 0 then
    delete from dealer_price_chain_state where vin = any (_rv);
    insert into dealer_price_chain_state
    select * from dealer_price_state_derive(_rv, null, null, _top);
  end if;

  delete from dealer_price_state_seen where id <= _w;
  insert into dealer_price_state_seen
  select id from _dp_all where id > _w
  on conflict do nothing;

  update history_digest_mark set through = now(), hist_id = _w, updated_at = now()
  where name = 'dealer_price_state';

  return jsonb_build_object('view', 'dealer_price_state', 'new_rows', _n_new, 'chains_folded', _n_inc,
                            'rederived_vins', cardinality(_rv), 'purged', _n_purged, 'hist_id', _w);
end;
$fn$;

revoke all on function dealer_price_state_fold(bigint) from public, anon, authenticated;
grant execute on function dealer_price_state_fold(bigint) to service_role;

-- ── The per-car rows, from the state ───────────────────────────────────────

create or replace function dealer_price_behavior_car_write()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  m   history_digest_mark%rowtype;
  _rv text[];
  _n  bigint;
begin
  select * into m from history_digest_mark where name = 'dealer_price_state' for update;
  if not found or cardinality(m.pending_parts) > 0 then
    raise exception 'dealer_price_chain_state is not seeded (pending slices: %)', m.pending_parts;
  end if;
  -- A state that missed tonight's fold would drop every car repriced since:
  -- its chain no longer ends on the page price. Last night's rows are the
  -- better answer, so leave them.
  if m.updated_at < now() - interval '2 hours' then
    raise exception 'dealer_price_chain_state was last folded at %; not rewriting the per-car rows from it', m.updated_at
      using hint = 'select dealer_price_state_fold(); first (0125)';
  end if;

  -- 0084's `cars`.
  drop table if exists _dp_cars;
  create temp table _dp_cars on commit drop as
  select l.vin,
         l.dealer_domain,
         l.price_usd    as price_now,
         l.first_seen_at,
         case when l.condition = 'new'        then 15000
              when coalesce(l.year, 0) >= 2020 then 7000
              when coalesce(l.year, 0) >= 2018 then 4000
              else 1000 end as floor_usd
  from listings l
  where l.delisted_at is null
    and l.dealer_domain is not null
    and l.dealer_domain like '%.%'
    and l.dealer_domain not in (select dealer_domain from dealer_price_lane);
  analyze _dp_cars;

  perform set_config('enable_nestloop', 'off', true);

  -- A chain worked out under another floor is still this car's chain unless
  -- some kept price sits below the higher of the two floors.
  _rv := array(
    select c.vin
    from _dp_cars c
    left join dealer_price_chain_state s on s.vin = c.vin and s.chain = c.dealer_domain
    left join dealer_price_chain_state z on z.vin = c.vin and z.chain = ''
    where case when s.vin is not null
               then s.floor_usd <> c.floor_usd and s.low_any < greatest(s.floor_usd, c.floor_usd)
               else z.floor_usd <> c.floor_usd and z.low_any < greatest(z.floor_usd, c.floor_usd) end
  );
  if cardinality(_rv) > 0 then
    perform set_config('enable_nestloop', 'on', true);
    delete from dealer_price_chain_state where vin = any (_rv);
    insert into dealer_price_chain_state
    select * from dealer_price_state_derive(_rv);
    perform set_config('enable_nestloop', 'off', true);
  end if;

  delete from dealer_price_behavior_car where true;
  insert into dealer_price_behavior_car (vin, dom_now, first_seen_at, first_cut_at)
  select c.vin, c.dealer_domain, c.first_seen_at,
         (select min(t) from unnest(case when s.vin is not null then s.cut_ats else z.cut_ats end) as t
          where t >= now() - interval '30 days')
  from _dp_cars c
  left join dealer_price_chain_state s on s.vin = c.vin and s.chain = c.dealer_domain
  left join dealer_price_chain_state z on z.vin = c.vin and z.chain = ''
  where case when s.vin is not null then s.kept_last else z.kept_last end = c.price_now;
  get diagnostics _n = row_count;
  perform set_config('enable_nestloop', 'on', true);

  return jsonb_build_object('view', 'dealer_price_behavior_car', 'rows', _n,
                            'rederived_vins', cardinality(_rv));
end;
$fn$;

revoke all on function dealer_price_behavior_car_write() from public, anon, authenticated;
grant execute on function dealer_price_behavior_car_write() to service_role;

-- ── The control ────────────────────────────────────────────────────────────
--
-- 0084's own statement (`lanes` .. `per_car`, verbatim, with `cars` narrowed
-- to a random sample of dealer sites) against dealer_price_behavior_car, car
-- by car. Run it straight after a fold and a write, by hand: the table is as
-- of its last write and 0084 is as of now. _upto caps the history both read,
-- for checking a state that has been folded only that far.

create or replace function dealer_price_behavior_check(_dealers int default 150, _upto bigint default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  _sample text[];
  _out    jsonb;
begin
  _sample := array(
    select dealer_domain from (
      select distinct dealer_domain from listings
      where delisted_at is null and dealer_domain is not null and dealer_domain like '%.%'
    ) d order by random() limit _dealers);

  with lanes as (
    select distinct dealer_domain
    from listing_price_history
    where provenance like 'oem-%' and dealer_domain is not null
      and (_upto is null or id <= _upto)
  ),
  cars as (
    select l.vin,
           l.dealer_domain,
           l.price_usd    as price_now,
           l.first_seen_at,
           case when l.condition = 'new'        then 15000
                when coalesce(l.year, 0) >= 2020 then 7000
                when coalesce(l.year, 0) >= 2018 then 4000
                else 1000 end as floor_usd
    from listings l
    where l.delisted_at is null
      and l.dealer_domain is not null
      and l.dealer_domain like '%.%'
      and l.dealer_domain not in (select dealer_domain from lanes)
      and l.dealer_domain = any (_sample)
  ),
  mine as (
    select p.vin, p.price_usd, p.observed_at, p.provenance, p.dealer_domain,
           coalesce(r.source, '?') as src,
           c.dealer_domain as dom_now, c.price_now, c.first_seen_at, c.floor_usd
    from listing_price_history p
    join cars c on c.vin = p.vin
    left join ingest_runs r on r.id = p.run_id
    where p.price_usd > 0
      and (p.dealer_domain is null or p.dealer_domain = c.dealer_domain)
      and (_upto is null or p.id <= _upto)
  ),
  h as (
    select m.*,
           lag(observed_at)   over w as prev_at,
           lag(src)           over w as prev_src,
           lag(provenance)    over w as prev_prov,
           lag(dealer_domain) over w as prev_dom,
           lag(price_usd)     over w as prev_price,
           lag(price_usd, 2)  over w as back2_price
    from mine m
    window w as (partition by m.vin order by m.observed_at)
  ),
  kept as (
    select vin, price_usd, observed_at, dom_now, price_now, first_seen_at
    from h
    where (prev_at is null
       or ( (case
               when provenance is not null and prev_prov is not null
                 then provenance = prev_prov
               else src = prev_src
                    and not exists (select 1 from price_methodology_transitions t
                                    where t.at > prev_at and t.at <= observed_at)
             end)
            and
            (case
               when dealer_domain is not null and prev_dom is not null
                 then dealer_domain = prev_dom
               else not (back2_price is not null
                         and price_usd = back2_price
                         and price_usd is distinct from prev_price)
             end) ))
      and price_usd >= floor_usd
  ),
  seq as (
    select k.*,
           lag(price_usd) over w as prev_kept,
           min(price_usd) over (partition by k.vin order by k.observed_at
                                rows between unbounded preceding and 1 preceding) as run_min,
           last_value(price_usd) over (partition by k.vin order by k.observed_at
                                rows between unbounded preceding and unbounded following) as last_kept
    from kept k
    window w as (partition by k.vin order by k.observed_at)
  ),
  per_car as (
    select vin, dom_now, first_seen_at,
           min(observed_at) filter (
             where prev_kept is not null
               and price_usd < prev_kept
               and price_usd < run_min
               and prev_kept - price_usd >= 500
               and observed_at >= now() - interval '30 days'
           ) as first_cut_at
    from seq
    where last_kept = price_now
    group by vin, dom_now, first_seen_at
  ),
  mine_t as (
    select vin, dom_now, first_seen_at, first_cut_at
    from dealer_price_behavior_car where dom_now = any (_sample)
  )
  select jsonb_build_object(
    'dealers', cardinality(_sample),
    'cars_0084', count(r.vin),
    'cars_table', count(t.vin),
    'only_0084', count(*) filter (where t.vin is null),
    'only_table', count(*) filter (where r.vin is null),
    'different_first_cut', count(*) filter (where r.vin is not null and t.vin is not null
                                              and r.first_cut_at is distinct from t.first_cut_at),
    'different_dealer_or_first_seen', count(*) filter (where r.vin is not null and t.vin is not null
                                              and (r.dom_now, r.first_seen_at) is distinct from (t.dom_now, t.first_seen_at)),
    'cuts_0084', count(r.first_cut_at),
    'cuts_table', count(t.first_cut_at))
  into _out
  from per_car r
  full join mine_t t on t.vin = r.vin;

  return _out;
end;
$fn$;

revoke all on function dealer_price_behavior_check(int, bigint) from public, anon, authenticated;
grant execute on function dealer_price_behavior_check(int, bigint) to service_role;

comment on function dealer_price_behavior_check(int, bigint) is
  'Recomputes a random sample of dealer sites with 0084''s own statement and compares car by car with dealer_price_behavior_car. Every count but dealers, cars_* and cuts_* should be 0. By hand, straight after dealer_price_state_fold() and dealer_price_behavior_car_write() (0125).';

comment on materialized view dealer_price_behavior is
  'Per dealer site, over its live EV listings whose guarded asking-price chain (listing_price_display, 0040/0041/0048/0061) ends at the price on the page: how many came down to a new low by at least $500 in the last 30 days, and the median days from first sighting to that first cut for the cars 0028 gives a defensible listing date. OEM locator lanes excluded. ESTIMATES, both. Only sites with 8 or more readable listings have a row; median_days_to_cut is null under 5 dated cuts. Refreshed nightly by refresh_vin_variants: dealer_price_state (fold the night''s price rows, 0125), dealer_price_behavior_car (the per-car rows), then dealer_price_behavior, after listing_freshness.';

-- refresh_vin_variants: 0124's four slice targets become the fold and the
-- write. Verbatim otherwise — read off the live definition 2026-11-17.
create or replace function refresh_vin_variants(target text)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  n bigint;
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
      declare
        _through timestamptz;
      begin
        select through into _through from history_digest_mark
        where name = 'price_trend_state' and cardinality(pending_parts) = 0;
        if _through is null then
          raise exception 'price_trend_chain_state is not seeded; the open week cannot be snapped (0109)';
        end if;
        n := ev_cohort_ask_week_write(date_trunc('week', _through at time zone 'UTC')::date, _through);
        return jsonb_build_object('view', target, 'rows', n,
                                  'week', date_trunc('week', _through at time zone 'UTC')::date, 'snapped_at', _through);
      end;
    when 'ev_price_trend_sales' then
      refresh materialized view concurrently ev_price_trend_sales;
      select count(*) into n from ev_price_trend_sales;
    when 'ev_price_trend_ask_daily' then
      return advance_price_trend_ask_daily(1);
    when 'vin_listing_history_candidates' then
      return vin_listing_history_candidates();
    when 'vin_listing_history_prior_0' then
      return vin_listing_history_prior_rows(0, 3);
    when 'vin_listing_history_prior_1' then
      return vin_listing_history_prior_rows(1, 3);
    when 'vin_listing_history_prior_2' then
      return vin_listing_history_prior_rows(2, 3);
    when 'vin_listing_history' then
      refresh materialized view concurrently vin_listing_history;
      select count(*) into n from vin_listing_history;
    when 'dealer_price_state' then
      return dealer_price_state_fold();
    when 'dealer_price_behavior_car' then
      return dealer_price_behavior_car_write();
    when 'dealer_price_behavior' then
      refresh materialized view concurrently dealer_price_behavior;
      select count(*) into n from dealer_price_behavior;
    else
      raise exception 'refresh_vin_variants: unknown target %', target
        using hint = 'one of vin_variant_observed, ev_cohort_trim_spread, listing_freshness, ev_cohort_velocity, ev_cohort_ask_weekly, ev_price_trend_sales, ev_price_trend_ask_daily, vin_listing_history_candidates, vin_listing_history_prior_0, vin_listing_history_prior_1, vin_listing_history_prior_2, vin_listing_history, dealer_price_state, dealer_price_behavior_car, dealer_price_behavior';
  end case;
  return jsonb_build_object('view', target, 'rows', n);
end;
$function$;

revoke execute on function refresh_vin_variants(text) from public, anon, authenticated;
grant  execute on function refresh_vin_variants(text) to service_role;
