-- vin_listing_history's prior-site half gets its own table, filled in three
-- hash slices of the candidates, so no statement of the refresh is near 60 s.
--
-- ── Measured right after 0109 (2026-10-30, service_role path) ──────────────
--
--   vin_listing_history_candidates   21.1 s
--   vin_listing_history (refresh)    55.5 s cold, 48.8 s warm
--
-- 0109 estimated the view at ~25 s from an EXPLAIN whose listing_prior_site
-- leg had read ~17 s. Timed on its own against the 6,546 candidates the
-- same evening, that leg is 45 s; the absence half is 8 s. listing_prior_site
-- is four per-VIN subqueries over listing_price_history (the latest other-
-- site row, the oem-% anti-join over the VIN's whole history, the delist
-- after it, nothing from that site since) — ~7 ms a candidate, and the
-- candidate count grows with the archive. A refresh that fits by 5 s fits
-- by nothing.
--
-- ── What this does ──────────────────────────────────────────────────────────
--
-- vin_listing_history_prior holds listing_prior_site's rows for the
-- candidates, written by vin_listing_history_prior_rows(_part, _parts): one
-- hash slice of the candidates per call, each its own statement. The view
-- reads that table instead of calling listing_prior_site at refresh time.
-- The gates still live in the view that is their one place (0085, 0104) —
-- they are evaluated a statement earlier, for the same VINs, by the same
-- view. Targets, in scraper/refresh-variants.mjs's order:
--
--   vin_listing_history_candidates   ~21 s   summary merge + gates → table
--   vin_listing_history_prior_0      ~15 s   listing_prior_site, slice 0 of 3
--   vin_listing_history_prior_1      ~15 s   slice 1 of 3
--   vin_listing_history_prior_2      ~15 s   slice 2 of 3
--   vin_listing_history              ~10 s   absence half + join + CONCURRENTLY
--
-- Half the candidates timed at 30 s (3,335 VINs, 2,522 rows) the same
-- evening, so two slices would have left the margin 0109 just lost; three
-- is the smallest count with 2x headroom.
--
-- Rejected: a partial index on listing_price_history for the oem-% anti-join
-- (the heaviest subquery: it reads each candidate's whole history). It would
-- make listing_prior_site cheaper everywhere, but CONCURRENTLY cannot run in
-- the migration transaction and a plain build takes a write lock on the
-- archive for minutes while the rolling crawl is writing — a change for a
-- quiet window and its own migration, not this one. Restating the prior-site
-- gates set-wise over the candidates' history (one pass instead of four per
-- VIN): faster, and a second copy of the gates, which 0085 forbids.
--
-- When a slice crowds its budget: add a branch (vin_listing_history_prior_3,
-- _parts = 4 on every branch) and the matching entry in refresh-variants.mjs.

create table vin_listing_history_prior (
  vin                 text primary key,
  prior_domain        text not null,
  prior_price_usd     int  not null,
  prior_last_seen_at  timestamptz not null,
  computed_at         timestamptz not null default now()
);

revoke all on vin_listing_history_prior from public, anon, authenticated;

comment on table vin_listing_history_prior is
  'listing_prior_site''s rows for vin_listing_history_candidate, written one hash slice per statement by vin_listing_history_prior_rows (0110) right before vin_listing_history refreshes. A working table; the view is the fact. Service role only.';

create or replace function vin_listing_history_prior_rows(_part int, _parts int)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  _n bigint;
begin
  if _parts < 1 or _part < 0 or _part >= _parts then
    raise exception 'vin_listing_history_prior_rows: part % of % is not a slice', _part, _parts;
  end if;
  delete from vin_listing_history_prior
  where abs(hashtext(vin)::bigint) % _parts = _part
     or vin not in (select vin from vin_listing_history_candidate);
  insert into vin_listing_history_prior (vin, prior_domain, prior_price_usd, prior_last_seen_at)
  select s.vin, s.prior_domain, s.prior_price_usd, s.prior_last_seen_at
  from listing_prior_site s
  where s.vin = any (array(select vin from vin_listing_history_candidate
                           where abs(hashtext(vin)::bigint) % _parts = _part));
  get diagnostics _n = row_count;
  return jsonb_build_object('view', 'vin_listing_history_prior', 'part', _part, 'parts', _parts, 'rows', _n);
end;
$fn$;

revoke all on function vin_listing_history_prior_rows(int, int) from public, anon, authenticated;

-- Filled before the view is built WITH DATA (as 0109 did for the
-- candidates), so the prior-site half is there from the first minute.
select vin_listing_history_prior_rows(0, 3);
select vin_listing_history_prior_rows(1, 3);
select vin_listing_history_prior_rows(2, 3);

drop materialized view vin_listing_history;

create materialized view vin_listing_history as
with prior as (
  select vin, prior_domain, prior_price_usd, prior_last_seen_at
  from vin_listing_history_prior
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

-- ── refresh_vin_variants: three branches added ───────────────────────────────
--
-- 0088's rule: the body below is 0109's, read live (pg_get_functiondef,
-- 2026-10-30) immediately before writing, with the three prior-rows branches
-- added and nothing else touched.

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
    when 'vin_listing_history_prior_0' then
      return vin_listing_history_prior_rows(0, 3);
    when 'vin_listing_history_prior_1' then
      return vin_listing_history_prior_rows(1, 3);
    when 'vin_listing_history_prior_2' then
      return vin_listing_history_prior_rows(2, 3);
    when 'vin_listing_history' then
      refresh materialized view concurrently vin_listing_history;
      select count(*) into n from vin_listing_history;
    when 'dealer_price_behavior' then
      refresh materialized view concurrently dealer_price_behavior;
      select count(*) into n from dealer_price_behavior;
    else
      raise exception 'refresh_vin_variants: unknown target %', target
        using hint = 'one of vin_variant_observed, ev_cohort_trim_spread, listing_freshness, ev_cohort_velocity, ev_cohort_ask_weekly, ev_price_trend_sales, ev_price_trend_ask_daily, vin_listing_history_candidates, vin_listing_history_prior_0, vin_listing_history_prior_1, vin_listing_history_prior_2, vin_listing_history, dealer_price_behavior';
  end case;
  return jsonb_build_object('view', target, 'rows', n);
end;
$function$;

revoke execute on function refresh_vin_variants(text) from public, anon, authenticated;
grant  execute on function refresh_vin_variants(text) to service_role;
