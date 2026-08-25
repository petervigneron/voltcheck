-- refresh_vin_variants() refreshed four materialized views in one call, so all
-- four shared one statement_timeout. On 2026-08-25 that stopped fitting:
-- nightly.yml's "Refresh observed VIN variants" step failed 500/57014 after
-- three retries, and the first attempt burned ~67s before the cancel.
--
-- Measured against prod the same day, each refresh on its own:
--
--   vin_variant_observed     29.3s
--   listing_freshness        17.7s
--   ev_cohort_trim_spread    16.4s
--   ev_cohort_velocity        5.3s
--   ---------------------------------
--   total                    68.7s   against a 60s service_role ceiling
--
-- Nothing here is individually in trouble -- the worst is under half the
-- budget. The call was. This is how it got there: 0020 created the function
-- with two views, 0028 added a third, 0035 a fourth, each by CREATE OR
-- REPLACE, and none of them re-measured the sum. Four things sharing one
-- deadline is the same shape as the recheck result write that failed the same
-- week, and it fails the same way: all-or-nothing, so one slow view leaves all
-- four stale, and the 57014 does not say which one.
--
-- So the target is a parameter and the client calls this once per view. Each
-- gets the full budget (2x headroom on the worst), a failure costs one view
-- instead of four, and the error names the view.
--
-- REJECTED: raising statement_timeout inside the function, which is one line
-- and no client change. It hides growth instead of bounding it, and -- newly
-- relevant as of 0049 -- a multi-minute transaction holds back the xmin
-- horizon, which is exactly what stops the hourly VACUUM from marking pages
-- all-visible. Buying room for this refresh by breaking the vacuum that keeps
-- the live-row count under anon's 3s would be a bad trade in the same file.
--
-- The whitelist is a CASE over literal statements, not EXECUTE over an
-- interpolated name: this is SECURITY DEFINER, and a refresh target is not
-- worth a dynamic-SQL surface.
--
-- The no-arg form is dropped rather than kept as a wrapper, so the trap cannot
-- be re-entered by calling the convenient thing. supabase/functions/ingest's
-- `dataset: "refresh_variants"` branch still calls the no-arg form; nothing
-- uses that branch after this commit (scraper/refresh-variants.mjs moves to
-- the x-ingest-rpc stream path, where refresh_vin_variants is already
-- allowlisted), and if something old does, PostgREST answers a loud PGRST202
-- rather than quietly timing out.
drop function if exists refresh_vin_variants();

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
    else
      raise exception 'refresh_vin_variants: unknown target %', target
        using hint = 'one of vin_variant_observed, ev_cohort_trim_spread, listing_freshness, ev_cohort_velocity';
  end case;
  return jsonb_build_object('view', target, 'rows', n);
end;
$function$;

revoke execute on function refresh_vin_variants(text) from public, anon, authenticated;
grant  execute on function refresh_vin_variants(text) to service_role;
