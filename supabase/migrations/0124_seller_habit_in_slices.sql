-- 0124 — what a seller does with a price, worked out a slice of cars at a time.
--
-- WHAT BROKE. dealer_price_behavior (0084) is one statement that reads the
-- whole asking-price history of every live car, sorts it per car and walks it
-- twice. It cost 12.4 s the day it landed (2026-09-12). It was 44–58 s through
-- early November and on 2026-11-17 it was cancelled at service_role's 60 s
-- (57014) on both tries, the night after 0122 cleared the trend step that had
-- been failing in front of it. The listing page's "what this seller does with
-- a price" tile reads it.
--
-- WHY. Nothing is wrong with the plan; there is just more of it. Measured
-- 2026-11-17: 172,212 live cars on dealer sites hold 2,674,190 history rows
-- (15.5 a car), and joining them to their listings alone is 26.3 s before the
-- sort and the two window passes. The oem-lane scan in front (`lanes`) is
-- another 6.3 s. That history grows with every night a car stays listed, so
-- no setting gets the single statement back under the cap for long.
--
-- THE FIX is 0110's: the per-car half is written to a plain table one hash
-- slice of VINs at a time, each slice its own statement with its own 60 s,
-- and the view becomes the cheap half — a group-by over that table. Every
-- window in 0084 partitions by vin, so a slice of VINs is a complete unit of
-- work and the rows are the rows 0084 computed. The body below is 0084's
-- `lanes` .. `per_car`, verbatim, with one predicate added to `cars`.
--
-- MEASURED on production 2026-11-17, with the nightly's recheck running
-- beside it: the four slices 39.8, 37.0, 36.8 and 36.6 s (132,175 cars), the
-- view 0.6 s (4,012 dealers; 3,996 the night before). Control: 150 dealers'
-- cars recomputed with 0084's own statement and compared car by car with the
-- table — 4,272 cars both ways, none only in one, 0 of them with a different
-- first cut, 1,187 cuts both ways.
--
-- WHAT THIS DOES NOT FIX. Most of a slice's 37 s is not the slice: it is one
-- pass over listing_price_history (927 MB, on a box with less memory than
-- that) plus the `lanes` pass in front of it, and both are paid per slice.
-- So the night now does about 150 s of this work where it did 60, and more
-- slices buy little: the fixed part grows with the history, ~0.7% a day,
-- which puts a slice back near the cap in roughly two months. The durable
-- answer is to stop reading the whole history every night (a per-car state
-- folded from the night's new rows, as 0104 did for the trend). This buys
-- the time to do that properly.
--
-- When a slice nears 60 s before then, raise the slice count: the four branches in
-- refresh_vin_variants (_parts on every one of them) and the matching
-- entries in scraper/refresh-variants.mjs. A car changes slice when the
-- count changes, so truncate dealer_price_behavior_car first.
--
-- Rejected: an incremental fold like 0104's. The cut rule needs each car's
-- running minimum over its whole kept chain and the chain's last kept price,
-- which price_trend_chain_state does not carry; a second per-chain state to
-- keep in step with the first is a great deal of machinery for one tile.
-- Rejected: dropping history older than some window from the read. "A price
-- this listing has never shown before" is the claim (0084), and a window
-- turns a return to an old price into a markdown.
--
-- ON PRODUCTION this file was applied in steps, because the four fills below
-- are ~37 s each and a migration is one transaction: the table and function,
-- then each fill as its own statement, then the view and refresh_vin_variants.
-- Replayed whole on an empty database it is fine as written.

create table dealer_price_behavior_car (
  vin           text primary key,
  dom_now       text not null,
  first_seen_at timestamptz,
  first_cut_at  timestamptz
);
create index dealer_price_behavior_car_dom on dealer_price_behavior_car (dom_now);

comment on table dealer_price_behavior_car is
  'One row per live dealer-site listing whose guarded asking-price chain ends at the price on the page, with the moment of its first cut to a new low of $500 or more in the last 30 days (null if none). The per-car half of dealer_price_behavior (0084), written in hash slices by dealer_price_behavior_car_rows (0124).';

-- Working rows, not a surface: the view below is what the page reads.
revoke all on dealer_price_behavior_car from public, anon, authenticated;

create or replace function dealer_price_behavior_car_rows(_part int, _parts int)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
-- The planner has no statistics for a hash predicate and guesses a slice at
-- a few hundred cars where it is ~43,000, then fetches each car's history by
-- index: the first quarter-slice tried ran past 120 s that way, slower than
-- the whole view. One pass over the history and a hash join is the plan at
-- any slice size (0105, 0122).
set enable_nestloop to off
as $function$
declare
  _n bigint;
begin
  if _parts < 1 or _part < 0 or _part >= _parts then
    raise exception 'dealer_price_behavior_car_rows: part % of % is not a slice', _part, _parts;
  end if;

  -- The whole slice goes and comes back, so a car that delisted, moved to a
  -- lane, or no longer ends on its page price leaves with it.
  delete from dealer_price_behavior_car
  where abs(hashtext(vin)::bigint) % _parts = _part;

  insert into dealer_price_behavior_car (vin, dom_now, first_seen_at, first_cut_at)
  with lanes as (
    select distinct dealer_domain
    from listing_price_history
    where provenance like 'oem-%' and dealer_domain is not null
  ),
  cars as (
    select l.vin,
           l.dealer_domain,
           l.price_usd    as price_now,
           l.first_seen_at,
           case
             when l.condition = 'new' then 15000
             when coalesce(l.year::integer, 0) >= 2020 then 7000
             when coalesce(l.year::integer, 0) >= 2018 then 4000
             else 1000
           end as floor_usd
    from listings l
    where l.delisted_at is null
      and l.dealer_domain is not null
      and l.dealer_domain like '%.%'
      and l.dealer_domain not in (select dealer_domain from lanes)
      and abs(hashtext(l.vin)::bigint) % _parts = _part
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
  ),
  h as (
    select m.*,
           lag(m.observed_at)  over w as prev_at,
           lag(m.src)          over w as prev_src,
           lag(m.provenance)   over w as prev_prov,
           lag(m.dealer_domain) over w as prev_dom,
           lag(m.price_usd)    over w as prev_price,
           lag(m.price_usd, 2) over w as back2_price
    from mine m
    window w as (partition by m.vin order by m.observed_at)
  ),
  kept as (
    select h.vin, h.price_usd, h.observed_at, h.dom_now, h.price_now, h.first_seen_at
    from h
    where (h.prev_at is null or
           case
             when h.provenance is not null and h.prev_prov is not null then h.provenance = h.prev_prov
             else h.src = h.prev_src and not exists (select 1 from price_methodology_transitions t
                                                     where t.at > h.prev_at and t.at <= h.observed_at)
           end and
           case
             when h.dealer_domain is not null and h.prev_dom is not null then h.dealer_domain = h.prev_dom
             else not (h.back2_price is not null and h.price_usd = h.back2_price
                       and h.price_usd is distinct from h.prev_price)
           end)
      and h.price_usd >= h.floor_usd
  ),
  seq as (
    select k.vin, k.price_usd, k.observed_at, k.dom_now, k.price_now, k.first_seen_at,
           lag(k.price_usd) over w as prev_kept,
           min(k.price_usd) over (partition by k.vin order by k.observed_at
                                  rows between unbounded preceding and 1 preceding) as run_min,
           last_value(k.price_usd) over (partition by k.vin order by k.observed_at
                                         rows between unbounded preceding and unbounded following) as last_kept
    from kept k
    window w as (partition by k.vin order by k.observed_at)
  )
  select seq.vin, seq.dom_now, seq.first_seen_at,
         min(seq.observed_at) filter (where seq.prev_kept is not null
                                        and seq.price_usd < seq.prev_kept
                                        and seq.price_usd < seq.run_min
                                        and (seq.prev_kept - seq.price_usd) >= 500
                                        and seq.observed_at >= (now() - interval '30 days')) as first_cut_at
  from seq
  where seq.last_kept = seq.price_now
  group by seq.vin, seq.dom_now, seq.first_seen_at;
  get diagnostics _n = row_count;

  return jsonb_build_object('view', 'dealer_price_behavior_car', 'part', _part, 'parts', _parts, 'rows', _n);
end;
$function$;

revoke all on function dealer_price_behavior_car_rows(int, int) from public, anon, authenticated;
grant execute on function dealer_price_behavior_car_rows(int, int) to service_role;

-- The first fill. Each of these is its own statement on production.
select dealer_price_behavior_car_rows(0, 4);
select dealer_price_behavior_car_rows(1, 4);
select dealer_price_behavior_car_rows(2, 4);
select dealer_price_behavior_car_rows(3, 4);

-- The view: 0084's `per_dealer` and final select, reading the table. Same
-- name, same columns, same index, same grants, so the listing page
-- (web/lib/listings/pace.ts) reads what it read before.
drop materialized view dealer_price_behavior;

create materialized view dealer_price_behavior as
with per_dealer as (
  select c.dom_now as dealer_domain,
         count(*)::integer as listings_n,
         count(*) filter (where c.first_cut_at is not null)::integer as cut_n,
         count(*) filter (where c.first_cut_at is not null and f.vin is not null)::integer as dated_n,
         percentile_cont(0.5) within group (
           order by ((extract(epoch from c.first_cut_at - c.first_seen_at) / 86400.0)::double precision)
         ) filter (where c.first_cut_at is not null and f.vin is not null) as median_days
  from dealer_price_behavior_car c
  left join listing_freshness f using (vin)
  group by c.dom_now
)
select dealer_domain,
       listings_n,
       cut_n,
       round(cut_n::numeric / listings_n::numeric, 4) as cut_share,
       dated_n,
       case when dated_n >= 5 then round(median_days::numeric, 1) else null::numeric end as median_days_to_cut
from per_dealer
where listings_n >= 8;

create unique index dealer_price_behavior_domain on dealer_price_behavior (dealer_domain);

comment on materialized view dealer_price_behavior is
  'Per dealer site, over its live EV listings whose guarded asking-price chain (listing_price_display, 0040/0041/0048/0061) ends at the price on the page: how many came down to a new low by at least $500 in the last 30 days, and the median days from first sighting to that first cut for the cars 0028 gives a defensible listing date. OEM locator lanes excluded. ESTIMATES, both. Only sites with 8 or more readable listings have a row; median_days_to_cut is null under 5 dated cuts. Refreshed nightly by refresh_vin_variants: dealer_price_behavior_car_0..3 (the per-car rows, 0124), then dealer_price_behavior, after listing_freshness.';

grant select on dealer_price_behavior to anon, authenticated;

-- refresh_vin_variants: four branches added. Verbatim otherwise — read off
-- the live definition 2026-11-17.
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
    when 'dealer_price_behavior_car_0' then
      return dealer_price_behavior_car_rows(0, 4);
    when 'dealer_price_behavior_car_1' then
      return dealer_price_behavior_car_rows(1, 4);
    when 'dealer_price_behavior_car_2' then
      return dealer_price_behavior_car_rows(2, 4);
    when 'dealer_price_behavior_car_3' then
      return dealer_price_behavior_car_rows(3, 4);
    when 'dealer_price_behavior' then
      refresh materialized view concurrently dealer_price_behavior;
      select count(*) into n from dealer_price_behavior;
    else
      raise exception 'refresh_vin_variants: unknown target %', target
        using hint = 'one of vin_variant_observed, ev_cohort_trim_spread, listing_freshness, ev_cohort_velocity, ev_cohort_ask_weekly, ev_price_trend_sales, ev_price_trend_ask_daily, vin_listing_history_candidates, vin_listing_history_prior_0, vin_listing_history_prior_1, vin_listing_history_prior_2, vin_listing_history, dealer_price_behavior_car_0, dealer_price_behavior_car_1, dealer_price_behavior_car_2, dealer_price_behavior_car_3, dealer_price_behavior';
  end case;
  return jsonb_build_object('view', target, 'rows', n);
end;
$function$;

revoke execute on function refresh_vin_variants(text) from public, anon, authenticated;
grant  execute on function refresh_vin_variants(text) to service_role;
