-- The weekly asking-price snapshots (0057) and "This VIN's history" (0085,
-- 0104) refresh again: a closed week is computed once, at its close, from
-- the chain state 0104 already keeps; the VIN-history build stops walking
-- the live listings heap.
--
-- ── What broke (measured 2026-10-25 .. 10-30) ───────────────────────────────
--
-- refresh_vin_variants('ev_cohort_ask_weekly') and ('vin_listing_history')
-- died on service_role's 60 s statement_timeout (57014) every night from
-- 2026-10-14. scraper/refresh-variants.mjs then re-ran each timed-out call on
-- fetchWithRetry's 30/120/240 s schedule and once more after 600 s, so the
-- two views cost nightly's finalize-audits ~54 minutes a night against its
-- 60-minute cap, and the whole run read "cancelled" (some nights "failure")
-- for an error nothing downstream depends on. The weekly view was last
-- refreshed 2026-10-13 (its open-week row says so); vin_listing_history the
-- same day (4,386 rows, the 10-13 log's count). The retry is fixed in
-- scraper/lib/retry.mjs; this makes the two targets fit.
--
-- ev_cohort_ask_weekly. 0057's header predicted this to the week: "work
-- grows roughly linearly with weeks (every closed week recomputes), so
-- around ~20 weeks this will crowd its 60s refresh budget. The fix then is
-- incremental: freeze closed weeks into a plain table and recompute only the
-- open one." 18.4 s at 4 weeks (09-01); 149.7 s at 9 weeks on the last night
-- it succeeded (10-13, a call that happened to outlive its budget); 57014
-- every night since. Every refresh re-derived every car's last display price
-- at every week's close from the whole archive (7.0M rows, 1.4 GB) — the
-- same `s` CTE 0104 took out of the daily trend.
--
-- vin_listing_history. 0104 cut it from 101 s to 8-41 s on 09-28; 68.5 s on
-- 10-25 (EXPLAIN ANALYZE, postgres role). 43 s of that is the `other_site`
-- step, and 37 s of THAT is one node: "Index Scan using listings_live_vin on
-- listings" — the live listings walked in VIN order for the merge join,
-- 164,810 rows, 174,057 buffers, 82,226 of them read from disk: a heap page
-- per car, in index order, on an IO-throttled Micro. The join only needs
-- (vin, dealer_domain) for live cars; nothing about it needs them in VIN
-- order. The absence half is 8.2 s; listing_prior_site over the 5,961
-- candidates ~17 s.
--
-- ── What this does ──────────────────────────────────────────────────────────
--
-- 1. ev_cohort_ask_weekly becomes a plain table. Closed weeks are written
--    ONCE, at their close, by advance_price_trend_ask_daily: the fold passes
--    through every day's close in order, and when a close is a Monday
--    00:00Z (date_trunc('week') boundaries) the chain state sits at exactly
--    that instant, which is the snapshot 0057 defined — each live car's last
--    display price at or before the close. ev_cohort_ask_week_rows(_snap_at)
--    is 0057's aggregation over 0104's `s`: the state when it is at that
--    close, else listing_price_display (the old cost; seeds and ad-hoc only).
--    The nightly target 'ev_cohort_ask_weekly' rewrites only the OPEN week,
--    from the state at its current close. The open week therefore snapshots
--    at the last closed day, not at now() as the view did: a day staler, and
--    the row says when (snapped_at). ~10 s measured for one snapshot from
--    the state (price_trend_day_rows's `s` branch, 0104).
--
--    A closed week never recomputes. 0057 noted that closed weeks "do
--    recompute each refresh ... to the same numbers" and that the view
--    "inherits" a change to listing_price_display's guards on the next
--    refresh. Frozen rows do not. That is the trade 0057 named, taken.
--    rebuild_ev_cohort_ask_week(_week) recomputes one week from the archive
--    for the day a guard change is worth re-deriving history over.
--
-- 2. vin_listing_history refreshes in two statements, each with its own
--    60 s (0051's shape): 'vin_listing_history_candidates' merges the site
--    summary and writes the candidate VINs to a table; 'vin_listing_history'
--    rebuilds the view from that table. The candidate query also materializes
--    `live` first — one pass over the live rows, hashed — instead of walking
--    them through the index for a merge: 21 s against 43 s, same rows.
--    Measured whole on 10-30: candidates 21-23 s, view ~25 s (listing_prior_
--    site over the candidates ~17 s, the absence half 8 s). Same gates, same
--    view as the authority (0104's rule). Rejected: pre-filtering to VINs
--    with rows under two or more sites in the summary — 12 s, but it loses a
--    car whose new site has no price row yet (4,520 candidates against
--    5,961), and the summary may drop a car only when the view would too.
--
-- ── Seed (by hand, after applying) ─────────────────────────────────────────
--
--   The matview's rows for weeks that had closed by its last refresh are
--   copied as-is (they were final). Its last row (week 2026-10-12) was an
--   open-week snapshot taken 10-13 and is recomputed at its close, as are the
--   weeks since; each is one call of the view branch (~30-60 s, postgres
--   role, not service_role):
--     select rebuild_ev_cohort_ask_week(date '2026-10-12');
--     select rebuild_ev_cohort_ask_week(date '2026-10-19');
--   then  select refresh_vin_variants('ev_cohort_ask_weekly');  -- the open
--   week (2026-10-26, closes 11-02) from the state at its current close.
--
--   vin_listing_history needs nothing by hand: the migration computes the
--   candidates and builds the view with data.

-- ── 1. Closed weeks are frozen ─────────────────────────────────────────────

create table ev_cohort_ask_weekly_t (
  vin8            text not null,
  model_year      int  not null,
  cond            text not null check (cond in ('new', 'used')),
  week            date not null,
  n               int  not null,
  median_ask_usd  int  not null,
  p25_ask_usd     int  not null,
  p75_ask_usd     int  not null,
  median_odometer int,
  snapped_at      timestamptz not null,  -- the instant the row's prices are as of
  primary key (vin8, model_year, cond, week)
);

-- Weeks that had closed by the matview's last refresh were final in it.
insert into ev_cohort_ask_weekly_t
  (vin8, model_year, cond, week, n, median_ask_usd, p25_ask_usd, p75_ask_usd, median_odometer, snapped_at)
select vin8, model_year, cond, week, n, median_ask_usd, p25_ask_usd, p75_ask_usd, median_odometer,
       (week + 7)::timestamp at time zone 'UTC'
from ev_cohort_ask_weekly
where week + 7 <= date '2026-10-13';

drop materialized view ev_cohort_ask_weekly;
alter table ev_cohort_ask_weekly_t rename to ev_cohort_ask_weekly;
alter index ev_cohort_ask_weekly_t_pkey rename to ev_cohort_ask_weekly_pkey;

-- Dark means dark (0057).
revoke all on ev_cohort_ask_weekly from public, anon, authenticated;

comment on table ev_cohort_ask_weekly is
  'Weekly asking-price snapshots per VIN(1-8) variant, model year and new/used (0057), through the provenance-guarded price series. A closed week is written once at its close from price_trend_chain_state (0109) and never recomputed; the open week is rewritten nightly at the state''s current close (snapped_at). ASKING prices, never sales. A median move means nothing until n and median_odometer say the mix held still. Ships dark; no surface reads it yet.';

-- One week's rows as of an instant. 0057's aggregation over 0104's `s`.
create or replace function ev_cohort_ask_week_rows(_week date, _snap_at timestamptz)
returns table (
  vin8 text, model_year int, cond text, week date, n int,
  median_ask_usd int, p25_ask_usd int, p75_ask_usd int, median_odometer int, snapped_at timestamptz
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
                     and through = _snap_at) as ok
  ),
  -- Each car's last display price at the instant: from the chains when they
  -- sit at exactly this close (the listing reads the chain of its current
  -- domain, else the null-domain chain — price_trend_day_rows's `s`, 0104),
  -- otherwise from the view, which walks all history.
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
          where p.observed_at <= _snap_at
          order by p.vin, p.observed_at desc) d
    where not (select ok from at_close)
  ),
  snaps as (
    select upper(substring(l.vin, 1, 8)) as vin8,
           l.year as model_year,
           case when l.condition = 'new' then 'new' else 'used' end as cond,
           s.price_usd,
           l.mileage
    from s
    join listings l using (vin)
    where l.year is not null
      and l.first_seen_at <= _snap_at
      and (l.delisted_at is null or l.delisted_at > _snap_at)
  )
  select vin8, model_year, cond, _week,
         count(*)::int,
         round(percentile_cont(0.5)  within group (order by price_usd))::int,
         round(percentile_cont(0.25) within group (order by price_usd))::int,
         round(percentile_cont(0.75) within group (order by price_usd))::int,
         round(percentile_cont(0.5)  within group (order by mileage) filter (where mileage > 0))::int,
         _snap_at
  from snaps
  group by 1, 2, 3
$$;

revoke all on function ev_cohort_ask_week_rows(date, timestamptz) from public, anon, authenticated;

comment on function ev_cohort_ask_week_rows(date, timestamptz) is
  'One week of ev_cohort_ask_weekly as of _snap_at: each live car''s last listing_price_display price at that instant, from price_trend_chain_state when it sits at exactly that close (0104), else from the view (all history, slow). 0057''s cohort math, unchanged.';

-- Rewrite one week's rows from a snapshot. Returns the row count.
create or replace function ev_cohort_ask_week_write(_week date, _snap_at timestamptz)
returns bigint
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  _n bigint;
begin
  delete from ev_cohort_ask_weekly where week = _week;
  insert into ev_cohort_ask_weekly
    (vin8, model_year, cond, week, n, median_ask_usd, p25_ask_usd, p75_ask_usd, median_odometer, snapped_at)
  select vin8, model_year, cond, week, n, median_ask_usd, p25_ask_usd, p75_ask_usd, median_odometer, snapped_at
  from ev_cohort_ask_week_rows(_week, _snap_at);
  get diagnostics _n = row_count;
  return _n;
end;
$fn$;

revoke all on function ev_cohort_ask_week_write(date, timestamptz) from public, anon, authenticated;

-- A closed week from the archive, by hand: the seed after this migration,
-- and the day a change to listing_price_display's guards is worth
-- re-deriving a week over. Walks all history (0057's cost); run as postgres.
create or replace function rebuild_ev_cohort_ask_week(_week date)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  _close timestamptz := (_week + 7)::timestamp at time zone 'UTC';
  _n bigint;
begin
  if _week <> date_trunc('week', _week)::date then
    raise exception 'rebuild_ev_cohort_ask_week: % is not a Monday', _week;
  end if;
  if _close > now() then
    raise exception 'rebuild_ev_cohort_ask_week: week % has not closed', _week
      using hint = 'the open week is refresh_vin_variants(''ev_cohort_ask_weekly'')';
  end if;
  _n := ev_cohort_ask_week_write(_week, _close);
  return jsonb_build_object('week', _week, 'close', _close, 'rows', _n);
end;
$fn$;

revoke all on function rebuild_ev_cohort_ask_week(date) from public, anon, authenticated;

-- The nightly door writes the week that closed at the fold's close, when the
-- close is a Monday. Body is 0104's with that one addition; a weekly write
-- that fails must not take the trend with it, so its error is returned, not
-- raised, and the next Monday's close writes the next week regardless.
create or replace function advance_price_trend_ask_daily(_max_days int default 1)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  _day    date;
  _today  date := (now() at time zone 'UTC')::date;
  _done   int    := 0;
  _rows   bigint := 0;
  _n      bigint;
  _fold   jsonb;
  _site   bigint;
  _close  timestamptz;
  _weeks  jsonb := '[]'::jsonb;
begin
  select coalesce(max(day) + 1, date '2026-08-15') into _day from ev_price_trend_ask_daily;
  while _day < _today and _done < _max_days loop
    _close := ((_day + 1)::timestamp at time zone 'UTC');
    _fold := price_trend_state_fold(_close);
    insert into ev_price_trend_ask_daily
      (level, cohort, model_year, cond, day, n, price_usd, p25_usd, p75_usd,
       median_odometer, usd_per_mile, slope_from_sales)
    select level, cohort, model_year, cond, day, n, price_usd, p25_usd, p75_usd,
           median_odometer, usd_per_mile, slope_from_sales
    from price_trend_day_rows(_day);
    get diagnostics _n = row_count;
    _rows := _rows + _n;
    -- A Monday close is a week close (date_trunc('week') is ISO, Monday
    -- 00:00): the state sits at exactly it, so the week that just closed is
    -- written now, once (0109).
    if extract(isodow from (_close at time zone 'UTC')) = 1 then
      begin
        _weeks := _weeks || jsonb_build_object(
          'week', ((_close at time zone 'UTC')::date - 7),
          'rows', ev_cohort_ask_week_write((_close at time zone 'UTC')::date - 7, _close));
      exception when others then
        _weeks := _weeks || jsonb_build_object('week', ((_close at time zone 'UTC')::date - 7), 'error', sqlerrm);
      end;
    end if;
    _done := _done + 1;
    _day  := _day + 1;
  end loop;
  _site := rebuild_price_trend_site_daily();
  return jsonb_build_object('view', 'ev_price_trend_ask_daily', 'days', _done, 'rows', _rows,
                            'through', (select max(day) from ev_price_trend_ask_daily),
                            'behind', greatest(0, _today - _day),
                            'fold', _fold,
                            'site_days', _site,
                            'weeks_closed', _weeks);
end;
$fn$;

revoke all on function advance_price_trend_ask_daily(int) from public, anon, authenticated;

-- ── 2. vin_listing_history: candidates in their own statement ──────────────

create table vin_listing_history_candidate (
  vin text primary key
);

revoke all on vin_listing_history_candidate from public, anon, authenticated;

comment on table vin_listing_history_candidate is
  'The VINs vin_listing_history asks listing_prior_site about: 0104''s `cand` gates over listing_price_site_last, written by vin_listing_history_candidates() right before the view refreshes (0109). A working table, not a fact; service role only.';

-- The summary merge (0104) and then the candidate gates, as one statement.
create or replace function vin_listing_history_candidates()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  _site jsonb;
  _n    bigint;
begin
  _site := listing_price_site_last_advance();
  delete from vin_listing_history_candidate where true;
  insert into vin_listing_history_candidate (vin)
  with live as materialized (
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
  )
  select g.vin from gated g join gone x using (vin) where g.last_any_at <= x.gone_at;
  get diagnostics _n = row_count;
  return jsonb_build_object('view', 'vin_listing_history_candidates', 'rows', _n, 'site_summary', _site);
end;
$fn$;

revoke all on function vin_listing_history_candidates() from public, anon, authenticated;

-- The view reads the table instead of computing `cand`; nothing else changes
-- (0104's definition, verified same rows then).
drop materialized view vin_listing_history;

-- Populated before the view is built WITH DATA, so the prior-site half is
-- there from the first minute (a REFRESH ... CONCURRENTLY needs a populated
-- view, so NO DATA was not an option).
select vin_listing_history_candidates();

create materialized view vin_listing_history as
with prior as (
  select s.* from listing_prior_site s
  where s.vin = any (array(select vin from vin_listing_history_candidate))
),
rechecked as (
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
  and (s.vin is not null or g.vin is not null);

create unique index vin_listing_history_vin_idx on vin_listing_history (vin);

grant select on vin_listing_history to anon, authenticated;

-- ── refresh_vin_variants: one branch added, one changed ────────────────────
--
-- 0088's rule: the body below is the LIVE definition read immediately before
-- writing (pg_get_functiondef, 2026-10-30). 'vin_listing_history_candidates'
-- is new; 'vin_listing_history' no longer merges the summary (the candidates
-- call does, first). scraper/refresh-variants.mjs calls them in that order.

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
      -- The open week only, from the chain state at its current close (0109).
      -- Closed weeks are written by advance_price_trend_ask_daily.
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
    when 'vin_listing_history' then
      refresh materialized view concurrently vin_listing_history;
      select count(*) into n from vin_listing_history;
    when 'dealer_price_behavior' then
      refresh materialized view concurrently dealer_price_behavior;
      select count(*) into n from dealer_price_behavior;
    else
      raise exception 'refresh_vin_variants: unknown target %', target
        using hint = 'one of vin_variant_observed, ev_cohort_trim_spread, listing_freshness, ev_cohort_velocity, ev_cohort_ask_weekly, ev_price_trend_sales, ev_price_trend_ask_daily, vin_listing_history_candidates, vin_listing_history, dealer_price_behavior';
  end case;
  return jsonb_build_object('view', target, 'rows', n);
end;
$function$;

revoke execute on function refresh_vin_variants(text) from public, anon, authenticated;
grant  execute on function refresh_vin_variants(text) to service_role;
