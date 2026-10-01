-- The market-trend line advances again: the nightly fold no longer gambles on
-- a row estimate.
--
-- 0104's price_trend_state_fold did its main work in one statement: judge the
-- night's rows (CTE k), take each chain's last row and last kept row
-- (last_row, last_keep), join them back to the chains it started from (f) and
-- upsert. It ran in 6 s when 0104 was measured and timed out (57014, the 60 s
-- service_role ceiling) on 2026-09-29 and 09-30, which left the trend stuck at
-- 2026-09-27 again.
--
-- Cause, from the plan (2026-10-01): the planner estimated last_row at ~1 row
-- (actual 19,662) and last_keep at ~1,788, chose a Nested Loop Left Join
-- between them, and put the Unique+Sort over k (45,779 rows) on the inner
-- side — re-run once per outer row. Whether it picked that plan or a hash join
-- depended on estimates over CTE scans of un-ANALYZEd temp tables, so it was a
-- coin toss that came up hash on 09-28 and nested loop after. The same
-- statement taken apart by hand ran in 0.76 s.
--
-- Fix: the filtered chains (_pt_f) and the judged rows (_pt_k) each land in a
-- temp table that is ANALYZEd before the next statement reads it, so the joins
-- see true row counts; enable_nestloop is switched off for the one upsert,
-- transaction-local, and back on straight after. Same rows in, same rows out:
-- only the plan changes. The re-derive filter also moves from
-- `not (vin = any(_rv))` to an anti-join on unnest(_rv).
--
-- Measured 2026-10-01 on a temp copy of price_trend_chain_state, folding the
-- 09-28 close (59,606 new rows, 19,662 chains, 3,926 VINs re-derived — the
-- re-derives are the low-water rescan of rows within 6 h of a fold run by hand
-- at 04:43 on 09-28): 21.6 s, of which 17 s is the re-derive. The 0104 body on
-- the same input: past 170 s, cancelled. A nightly fold, which runs ~17 h after
-- its close, re-derives almost nothing.
--
-- No reseed: the state did not move while the fold failed (each failure rolled
-- back), so the nightly's loop picks up from 2026-09-28 and catches up one day
-- per call.

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
  -- Each step below lands in an ANALYZEd temp table before the next joins it
  -- (0105). As one statement the planner guessed last_row at ~1 row (it was
  -- 19,662) and picked a nested loop that re-sorted all of k (45,779 rows)
  -- once per outer row: the fold ran past 170 s on the night it had 3,926
  -- re-derives to skip, and 60 s three nights running.
  drop table if exists _pt_f;
  create temp table _pt_f on commit drop as
  select x.* from _pt_from x
  where not exists (select 1 from unnest(_rv) as rv(vin) where rv.vin = x.vin);
  analyze _pt_f;

  drop table if exists _pt_k;
  create temp table _pt_k on commit drop as
  with f as (
    select * from _pt_f
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
  )
  select * from k;
  analyze _pt_k;

  -- Belt and braces: with true row counts the planner hashes these joins, and
  -- a nested loop over them is never right at this size. Local to this
  -- statement; switched back on straight after.
  perform set_config('enable_nestloop', 'off', true);
  with f as (
    select * from _pt_f
  ), k as (
    select * from _pt_k
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
  perform set_config('enable_nestloop', 'on', true);

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
