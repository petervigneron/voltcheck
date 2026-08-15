-- vin_variant_observed produces 446 rows by scanning every live listing, and
-- 0016 made it a plain view — so it did that on every page render.
--
-- It was fast enough to miss at ~16,000 listings. The OEM-locator lanes took
-- the feed to 50,888 the same day, and it went to 3.8 seconds on service_role
-- with two parallel workers. anon runs on the authenticator's 8-second
-- statement timeout, so recent_sales() — which joins vin_variant, and is
-- called by every listing page — started returning 57014. The web lane
-- catches that and renders no sales box at all, which is the worst kind of
-- regression: silent, and it looks like missing data rather than a failure.
--
-- Two compounding causes, both mine:
--
--  1. A view meant the 446-row aggregate was recomputed per request. It
--     depends on nothing that changes faster than the nightly sync.
--  2. Postgres inlined the `normalized` CTE, so the six-regex chain was
--     re-evaluated FIVE times per row — once for each predicate in `kept`
--     that mentions it. `as materialized` pins it to one pass.
--
-- Fix: materialize it and refresh it nightly. The cost moves from every
-- reader to one writer, and vin_variant now joins a 446-row table.
--
-- THE TRADE-OFF, stated plainly because 0016 chose the other side of it:
-- this view is no longer self-updating. A cohort whose trim only becomes
-- unambiguous after tonight's crawl stays "Unknown" until the refresh. That
-- is the right side to be on — the underlying signal is an agreement rate
-- across at least six listings, which does not move hour to hour, and the
-- alternative is paying a full scan on every page view to find that out.

drop view if exists vin_variant;
drop view if exists vin_variant_observed;

create materialized view vin_variant_observed as
with base as (
  select upper(substring(vin, 1, 8)) as vin8,
         year as model_year,
         btrim(regexp_replace(vehicle_trim, '\s+', ' ', 'g')) as raw,
         model
  from listings
  where vin is not null and length(vin) = 17
    and delisted_at is null
    and vehicle_trim is not null and btrim(vehicle_trim) <> ''
),
-- `as materialized` is load-bearing: without it the regex chain below is
-- inlined into every predicate in `kept` and runs five times per row.
normalized as materialized (
  select vin8, model_year, raw,
    btrim(regexp_replace(
    regexp_replace(
    regexp_replace(
    regexp_replace(
    regexp_replace(
    regexp_replace(lower(raw),
      -- the model name restated at the front ("Model 3 Long Range")
      '^' || lower(regexp_replace(model, '([.^$*+?()\[\]{}|\\-])', '\\\1', 'g')) || '\s*', '', 'g'),
      -- packaging bolted on after a separator: wheels, roofs, "w/ Premium Pkg"
      '\s*([,|/]|\s-\s|\sw/|\swith\s).*$', '', 'g'),
      -- drivetrain: carried by its own column, never the version's identity
      '\y(all[- ]wheel drive|rear[- ]wheel drive|front[- ]wheel drive|awd|rwd|fwd|4wd|4x4|dual motor|single motor)\y', ' ', 'g'),
      -- body class appended by the feed ("Performance Sport Utility 4D")
      '\y(sports? activity vehicles?|sport utility vehicles?|sport utility|hatchback|gran coupe|sedan|sdn|coupe|suv|crossover|wagon|pickup|trucks?|vehicles?|4dr|2dr|4d|2d)\y', ' ', 'g'),
      '[^a-z0-9+ -]', ' ', 'g'),
      '\s+', ' ', 'g')) as norm
  from base
),
kept as (
  select * from normalized
  where norm <> ''
    and length(norm) <= 24
    and norm !~ '^(n/?a|none|other|unknown|electric|ev|base|standard equipment|[0-9]+)$'
    and norm !~ '^(with autopilot|full self-?driving.*|clean title.*|pano roof)$'
    -- A cab style is not a trim. Every Lightning is a SuperCrew.
    and norm !~ '^(super ?crew( cab)?|super ?cab|crew cab|regular cab|extended cab|double cab|quad cab|king cab)$'
),
tally as (
  select vin8, model_year, norm, count(*) as n,
         (array_agg(raw order by cnt desc, raw))[1] as label
  from (select vin8, model_year, norm, raw,
               count(*) over (partition by vin8, model_year, norm, raw) cnt
        from kept) k
  group by vin8, model_year, norm
),
ranked as (
  select *, sum(n) over (partition by vin8, model_year) as total,
         row_number() over (partition by vin8, model_year order by n desc, norm) as rk
  from tally
)
select vin8, model_year, label as trim, n as agree_n, total as observed_n,
       round(n::numeric / total, 3) as agree_share
from ranked
where rk = 1
  -- Six listings is the floor; 75% is the agreement bar. Both are calibrated
  -- in 0016 against the cohorts they must accept and reject.
  and n >= 6
  and n::numeric / total >= 0.75;

-- Unique key, so the nightly refresh can run CONCURRENTLY and never blocks
-- a reader mid-render.
create unique index vin_variant_observed_key on vin_variant_observed (vin8, model_year);

grant select on vin_variant_observed to anon, authenticated;

create view vin_variant
with (security_invoker = true) as
select coalesce(v.vin8, o.vin8)             as vin8,
       coalesce(v.model_year, o.model_year) as model_year,
       coalesce(v.trim, o.trim)             as trim,
       case when v.trim is not null then 'vpic'
            when o.trim is not null then 'observed'
            else null end                   as trim_source,
       v.spec,
       v.drive
from vin_variant_vpic v
full outer join vin_variant_observed o
  on o.vin8 = v.vin8 and o.model_year = v.model_year;

grant select on vin_variant to anon, authenticated;

comment on view vin_variant is
  'VIN(1-8)+model year -> version name. vpic = NHTSA manufacturer filing; observed = >=75% agreement across >=6 live listings, refreshed nightly. Null trim means the VIN does not encode one; render it as Unknown, never as a cab style.';

-- Called by the nightly after db-sync, through the ingest gateway. Security
-- definer because the matview is owned by postgres and the caller is not.
create or replace function refresh_vin_variants()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  refresh materialized view concurrently vin_variant_observed;
  return jsonb_build_object('refreshed', (select count(*) from vin_variant_observed));
end;
$$;

revoke execute on function refresh_vin_variants() from public, anon, authenticated;
