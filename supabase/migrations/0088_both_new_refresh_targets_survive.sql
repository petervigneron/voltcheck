-- refresh_vin_variants knows about dealer_price_behavior AND vin_listing_history.
--
-- Two sessions added a materialized view to the nightly refresh on 2026-09-12
-- within three minutes of each other, and each wrote its CREATE OR REPLACE of
-- refresh_vin_variants() from the definition that was live when it started:
--
--   20:29:38  what_this_seller_does_with_a_price (0084) — adds
--             'dealer_price_behavior'
--   20:32:20  this_vins_history                        — adds
--             'vin_listing_history', from the pre-0084 body
--
-- The second one won, so 'dealer_price_behavior' raised "unknown target" and
-- the view it created would have gone stale from its first night. Caught by
-- calling the function after applying rather than trusting the apply.
--
-- Nothing is wrong with either migration; the hazard is the shape. This
-- function has been extended by CREATE OR REPLACE nine times (0020, 0022,
-- 0028, 0035, 0051, 0057, 0061, 0064, and both of today's), every one of them
-- retyping the whole body, and 0051's header already notes that none of the
-- first four re-measured what they were adding to. A whole-body rewrite is
-- also a whole-body DELETE of anything that landed while you were typing it.
-- The next person to add a target: read the LIVE definition
-- (pg_get_functiondef) immediately before applying, not at the start of your
-- work, and call the function for your target afterwards.
--
-- This file is the union, read off the live definition at 20:41 plus 0084's
-- branch. It adds nothing else and changes nothing else.

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
      refresh materialized view concurrently ev_cohort_ask_weekly;
      select count(*) into n from ev_cohort_ask_weekly;
    when 'ev_price_trend_sales' then
      refresh materialized view concurrently ev_price_trend_sales;
      select count(*) into n from ev_price_trend_sales;
    when 'ev_price_trend_ask_daily' then
      return advance_price_trend_ask_daily(3);
    when 'vin_listing_history' then
      refresh materialized view concurrently vin_listing_history;
      select count(*) into n from vin_listing_history;
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

revoke execute on function refresh_vin_variants(text) from public, anon, authenticated;
grant  execute on function refresh_vin_variants(text) to service_role;
