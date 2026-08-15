-- Which VERSION of the car sold?
--
-- wa_ev_sales publishes VIN 1-10 and no trim. The listing page's recent-sales
-- list therefore showed ten prices for "Ford F-150 Lightning" with no way to
-- tell a Pro from a Platinum — two trucks $30k apart sitting in one column,
-- which makes the list worse than useless: it reads as a price range for the
-- car the shopper is looking at, and it isn't one.
--
-- This resolves VIN(1-8) + model year to a named version, from two sources,
-- never a guess:
--
--   vin_variant_vpic      NHTSA vPIC — the manufacturer's own VIN submission.
--                         Authoritative where it answers. Loaded monthly by
--                         scraper/vpic-variants.mjs.
--   vin_variant_observed  Our own live inventory. Where a VIN cohort's
--                         listings overwhelmingly agree on one trim, that
--                         agreement IS the decode. Measured, not assumed —
--                         and cohorts that don't agree resolve to null.
--
-- Both are keyed VIN 1-8 + model year, the key ev_price_model (0014) already
-- cohorts on: VIN 9 is a check digit and VIN 10 is the model year, so 1-8
-- plus the year carries everything the published 1-10 prefix does.
--
-- Null trim is a real, kept answer. Ford stamped no trim code on 2022-23
-- Lightning VINs and Tesla has never filed one with vPIC, so for those the
-- page says "Unknown" rather than printing the cab style ("SuperCrew") in the
-- slot where a version belongs, which is how the old list implied precision
-- it never had.
--
-- ODbL: nothing here derives from wa_ev_sales. vPIC is US government public
-- domain and the observed half is our own crawl, so this table is ours to
-- keep. recent_sales() joins it at read time and still returns a
-- produced-work-sized excerpt (0008); no derived database is published.

create table if not exists vin_variant_vpic (
  vin8       text    not null,
  model_year smallint not null,
  make       text,
  model      text,
  -- The version, when the VIN encodes one. Null means vPIC returned only a
  -- cab style, a body class, or nothing — see the script's trimFrom().
  trim       text,
  -- What the VIN encodes about the powertrain when it encodes no trim
  -- ("98 kWh", "580 hp"). Recorded because it is the split that moves the
  -- price on trimless cohorts; not currently rendered as a version name.
  spec       text,
  drive      text,
  body_class text,
  primary key (vin8, model_year)
);

alter table vin_variant_vpic enable row level security;
create policy "public read" on vin_variant_vpic for select to anon, authenticated using (true);

create or replace function ingest_vin_variants(_rows jsonb, _replace boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  _n integer;
begin
  if _rows is null or jsonb_array_length(_rows) = 0 then
    return jsonb_build_object('error', 'no rows');
  end if;

  if _replace then
    delete from vin_variant_vpic where true;  -- Supabase requires an explicit WHERE
  end if;

  insert into vin_variant_vpic (vin8, model_year, make, model, trim, spec, drive, body_class)
  select upper(x->>'vin8'), (x->>'modelYear')::smallint,
         x->>'make', x->>'model', x->>'trim', x->>'spec', x->>'drive', x->>'bodyClass'
  from jsonb_array_elements(_rows) as x
  where length(x->>'vin8') = 8 and (x->>'modelYear') ~ '^[0-9]{4}$'
  on conflict (vin8, model_year) do update
    set make = excluded.make, model = excluded.model, trim = excluded.trim,
        spec = excluded.spec, drive = excluded.drive, body_class = excluded.body_class;

  get diagnostics _n = row_count;
  return jsonb_build_object('inserted', _n);
end;
$$;

revoke execute on function ingest_vin_variants(jsonb, boolean) from public, anon, authenticated;

-- ── The observed half ──────────────────────────────────────────────────────
--
-- Dealer trim strings for one variant are the same fact in a dozen spellings
-- ("Long Range", "Long Range AWD", "Long Range Dual Motor All-Wheel Drive",
-- "Long Range Sport Utility 4D"). Normalizing them is what lets a cohort's
-- agreement show; the rules mirror cleanTrim() in web/lib/listings/enrich.ts.
--
-- Imperfect normalization is safe in one direction only, and this is that
-- direction: a spelling we fail to fold splits the cohort, the split drops it
-- under the dominance bar, and the answer becomes "Unknown". The failure mode
-- is silence, never a wrong version name.
create or replace view vin_variant_observed
with (security_invoker = true) as
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
normalized as (
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
      -- drivetrain: carried by its own column, and never the version's identity
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
    -- Feed placeholders, fuel type, and free text that isn't a trim at all.
    and norm !~ '^(n/?a|none|other|unknown|electric|ev|base|standard equipment|[0-9]+)$'
    and norm !~ '^(with autopilot|full self-?driving.*|clean title.*|pano roof)$'
    -- A cab style is not a trim. Every Lightning is a SuperCrew, so letting
    -- this through would name 62% of 2023 Lightning cohorts "SuperCrew" —
    -- a confident answer to the wrong question. Same list as CAB_STYLES in
    -- web/lib/listings/enrich.ts.
    and norm !~ '^(super ?crew( cab)?|super ?cab|crew cab|regular cab|extended cab|double cab|quad cab|king cab)$'
),
tally as (
  select vin8, model_year, norm, count(*) as n,
         -- The spelling to print: the most common raw form behind this
         -- normalized value, so the page shows "Long Range", not "long range".
         (array_agg(raw order by cnt desc, raw))[1] as label
  from (select vin8, model_year, norm, raw, count(*) over (partition by vin8, model_year, norm, raw) cnt from kept) k
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
  -- Six listings is the floor: below it one dealer's data entry is the whole
  -- cohort. 75% is the agreement bar — it accepts Tesla's VIN-position-8
  -- split, which runs 96-100% across model years, and rejects the 2019
  -- Model 3 (56%, four real trims share the code) and the 2022-23 Lightning
  -- (41%, four trims share the code) rather than picking their plurality.
  and n >= 6
  and n::numeric / total >= 0.75;

grant select on vin_variant_observed to anon, authenticated;

-- ── Resolved ───────────────────────────────────────────────────────────────
-- vPIC first: it is the manufacturer's own filing. Our inventory fills the
-- gaps it leaves, and where neither answers, trim is null and stays null.
create or replace view vin_variant
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
  'VIN(1-8)+model year -> version name. vpic = NHTSA manufacturer filing; observed = >=75% agreement across >=6 of our own live listings. Null trim means the VIN does not encode one; render it as Unknown, never as a cab style.';

-- ── recent_sales, version-aware ────────────────────────────────────────────
-- Same ODbL posture as 0008 and unchanged in size: at most 10 rows, fixed
-- ordering, no pagination, no free-form filters. What changes is which 10 and
-- what they say.
--
-- _vin8 is this listing's own VIN cohort. Sales of the SAME version sort
-- first, because that is the comparison the shopper is actually making; the
-- rest of the model fills the remainder so a rare variant still shows context
-- instead of an empty box. Each row carries its own version name so a mixed
-- list can never again read as one car at ten prices.
drop function if exists recent_sales(text, text);

create or replace function recent_sales(_make text, _model text, _vin8 text default null)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'modelYear',    t.model_year,
    'salePrice',    t.sale_price,
    'odometer',     t.odometer,
    'saleDate',     t.sale_date,
    'variant',      t.trim,
    'sameVariant',  t.same_variant
  ) order by t.same_variant desc, t.sale_date desc, t.id desc), '[]'::jsonb)
  from (
    select s.model_year, s.sale_price, s.odometer, s.sale_date, s.id,
           v.trim,
           (_vin8 is not null and upper(substring(s.vin_prefix, 1, 8)) = upper(_vin8))
             as same_variant
    from wa_ev_sales s
    left join vin_variant v
      on v.vin8 = upper(substring(s.vin_prefix, 1, 8))
     and v.model_year = s.model_year
    where lower(s.make) = lower(_make) and lower(s.model) = lower(_model)
      -- The state's figure is a declared price; under $5,000 is dominated
      -- by family transfers, not market sales.
      and s.sale_price >= 5000
      and s.odometer is not null
    order by (_vin8 is not null and upper(substring(s.vin_prefix, 1, 8)) = upper(_vin8)) desc,
             s.sale_date desc, s.id desc
    limit 10
  ) t;
$$;

grant execute on function recent_sales(text, text, text) to anon, authenticated;
