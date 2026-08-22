-- The variant catalogue: what each EV model was actually SOLD as, from the
-- EPA's own certification data — not from whatever happens to be listed today.
--
-- Why: the browse rail infers a model's versions from live inventory, which is
-- wrong in both directions. Ten of 285 EX30s are the single-motor RWD car this
-- week; the week that number hits zero, the "+ AWD" choice silently vanishes
-- although Volvo sold both. And nothing but luck stops the rail offering
-- "+ AWD" on a Chevrolet Bolt, which was never built that way — a filter whose
-- only outcome is an empty page is a claim the data can't support. The fix is
-- a catalogue of the variant space per model and model year: drivetrains, EPA
-- body class, and each rated version's range. Source: fueleconomy.gov's bulk
-- vehicles.csv (loaded by scraper/epa-variants.mjs), the manufacturer's own
-- certified figures as the EPA publishes them.
--
-- One row per EPA "vehicle" — the EPA's unit is the rated configuration
-- ("Ioniq 5 AWD (Long Range)", "EX30 Twin Performance (19 Inch Wheels)"), so
-- a model-year's rows ARE its version list. epa_id is the EPA's own stable
-- record id; a refresh replaces the table wholesale through the staged
-- protocol below, so a failed refresh leaves the previous load live.
--
-- What absence means, and this must survive every consumer: NO ROWS for a
-- model-year means UNKNOWN, never "no variants". The EPA dataset has measured
-- holes — MY2023 Ioniq 5 and MY2023 EQE are absent outright (control tests:
-- MY2022/MY2024 Ioniq 5 and MY2023 EQS are all present), and vehicles over
-- 8,500 lb GVWR are exempt from labeling entirely, so BrightDrop Zevo,
-- E-Transit, eSprinter and the Escalade IQ never appear. A consumer that
-- reads absence as "only what we have rows for" would put the exact false
-- filter on the rail that this table exists to remove.
--
-- PHEV rows (atvType "Plug-in Hybrid") ride along for drivetrain and body
-- coverage of the site's plug-in hybrids, with epa_range_mi NULL: their
-- electric range is a different kind of figure (blended, columns of its own)
-- and printing it in the EV-range column would be a false claim.

create table if not exists epa_vehicle_variants (
  epa_id       integer  primary key,  -- EPA's own record id, stable across refreshes
  make         text     not null,
  model        text     not null,     -- EPA's full model string; names the version
  base_model   text,                  -- EPA's baseModel column
  model_year   smallint not null,
  ev_type      text     not null,     -- 'BEV' | 'PHEV'
  -- AWD / RWD / FWD, normalized from the EPA's phrasing ("Part-time 4-Wheel
  -- Drive" is AWD). NULL when the EPA doesn't say which axle ("2-Wheel
  -- Drive", blank) — unknown, not "no drivetrain".
  drive        text,
  -- Combined EPA range, the label figure. NULL on every PHEV row (see above).
  epa_range_mi smallint,
  -- The EPA's VClass verbatim ("Small Sport Utility Vehicle 4WD", "Large
  -- Cars"). Kept raw because it is a regulatory class, not a showroom body
  -- style: the 2022 Ioniq 5 is filed under "Large Cars". Consumers map it
  -- conservatively or not at all; web/lib/listings/bodyType.ts stays the
  -- authority for the body filter.
  vclass       text
);

create index if not exists epa_vehicle_variants_make_year_idx
  on epa_vehicle_variants (make, model_year);

-- Read by the web tier at revalidate time with the anon key, same posture as
-- vin_variant_vpic (0016): US-government public-domain data, ours to serve.
alter table epa_vehicle_variants enable row level security;
drop policy if exists "public read" on epa_vehicle_variants;
create policy "public read" on epa_vehicle_variants for select to anon, authenticated using (true);

-- ── Staged-load protocol: add the 'epa_variants' dataset ────────────────────
-- Both functions are wholesale CREATE OR REPLACE of the 0034 bodies (verified
-- against the live definitions before this migration was written); every
-- existing branch is 0034's, character for character. The new branch follows
-- the wa_sales shape: wipe, insert per chunk, with the not-null constraints
-- enforced as filters so one junk row rejects itself instead of aborting the
-- swap.

create or replace function stage_monthly_load(_dataset text, _batch text, _chunk integer, _rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if _dataset is null or _dataset not in
    ('wa_sales', 'vin_variants', 'cc4a_sales', 'cheapr_rebates', 'rebate_vins', 'epa_variants') then
    raise exception 'stage_monthly_load: unknown dataset %', coalesce(_dataset, '(null)');
  end if;
  if _batch is null or _batch = '' or _chunk is null or _chunk < 0 then
    raise exception 'stage_monthly_load: bad batch/chunk (batch=%, chunk=%)', _batch, _chunk;
  end if;
  if _rows is null or jsonb_typeof(_rows) <> 'array' or jsonb_array_length(_rows) = 0 then
    raise exception 'stage_monthly_load: rows must be a non-empty array';
  end if;

  insert into monthly_load_stage (dataset, batch_id, chunk_index, rows)
  values (_dataset, _batch, _chunk, _rows)
  on conflict (dataset, batch_id, chunk_index) do update
    set rows = excluded.rows, staged_at = now();

  return jsonb_build_object('staged', jsonb_array_length(_rows));
end;
$$;

create or replace function commit_monthly_load(_dataset text, _batch text, _expected_rows integer)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  _prior     monthly_load_commit%rowtype;
  _staged    bigint;
  _c         record;
  _n         integer;
  _inserted  integer := 0;
begin
  if _dataset is null or _dataset not in
    ('wa_sales', 'vin_variants', 'cc4a_sales', 'cheapr_rebates', 'rebate_vins', 'epa_variants') then
    raise exception 'commit_monthly_load: unknown dataset %', coalesce(_dataset, '(null)');
  end if;

  -- A commit that succeeded but lost its response: answer from the record.
  select * into _prior from monthly_load_commit where dataset = _dataset and batch_id = _batch;
  if found then
    return jsonb_build_object('inserted', _prior.inserted, 'replay', true);
  end if;

  select coalesce(sum(jsonb_array_length(rows)), 0) into _staged
  from monthly_load_stage where dataset = _dataset and batch_id = _batch;

  if _staged = 0 then
    raise exception 'commit_monthly_load: nothing staged for % batch %', _dataset, _batch;
  end if;
  if _expected_rows is null or _staged <> _expected_rows then
    raise exception 'commit_monthly_load: % has % rows staged, client sent % — refusing to swap',
      _dataset, _staged, coalesce(_expected_rows::text, '(null)');
  end if;

  -- The swap. One chunk per inner statement rather than one union of all of
  -- them, purely to bound how much jsonb each statement detoasts on the Nano
  -- instance; each iteration is the same size the old per-request path was.
  -- Note statement_timeout bounds the whole RPC call, not each inner
  -- statement — the loop buys memory headroom, not time.
  if _dataset = 'wa_sales' then
    delete from wa_ev_sales where true;  -- Supabase requires an explicit WHERE
    for _c in
      select rows from monthly_load_stage
      where dataset = _dataset and batch_id = _batch
      order by chunk_index
    loop
      -- Same projection and filters as ingest_wa_sales (0017).
      insert into wa_ev_sales
        (vin_prefix, make, model, model_raw, model_year, ev_type,
         sale_price, odometer, sale_date, county, city, zip, transaction_type)
      select
        x->>'vinPrefix', x->>'make', x->>'model', x->>'modelRaw',
        (x->>'modelYear')::smallint, x->>'evType',
        (x->>'salePrice')::int, nullif(x->>'odometer','')::int,
        (x->>'saleDate')::date, x->>'county', x->>'city', x->>'zip', x->>'transactionType'
      from jsonb_array_elements(_c.rows) as x
      where (x->>'salePrice') ~ '^[0-9]+$' and coalesce(x->>'make','') <> '';
      get diagnostics _n = row_count;
      _inserted := _inserted + _n;
    end loop;

  elsif _dataset = 'vin_variants' then
    delete from vin_variant_vpic where true;
    for _c in
      select rows from monthly_load_stage
      where dataset = _dataset and batch_id = _batch
      order by chunk_index
    loop
      -- Same projection and filters as ingest_vin_variants (0016).
      insert into vin_variant_vpic (vin8, model_year, make, model, trim, spec, drive, body_class)
      select upper(x->>'vin8'), (x->>'modelYear')::smallint,
             x->>'make', x->>'model', x->>'trim', x->>'spec', x->>'drive', x->>'bodyClass'
      from jsonb_array_elements(_c.rows) as x
      where length(x->>'vin8') = 8 and (x->>'modelYear') ~ '^[0-9]{4}$'
      on conflict (vin8, model_year) do update
        set make = excluded.make, model = excluded.model, trim = excluded.trim,
            spec = excluded.spec, drive = excluded.drive, body_class = excluded.body_class;
      get diagnostics _n = row_count;
      _inserted := _inserted + _n;
    end loop;

  elsif _dataset = 'cc4a_sales' then
    delete from ca_cc4a_used_ev_sales where true;
    for _c in
      select rows from monthly_load_stage
      where dataset = _dataset and batch_id = _batch
      order by chunk_index
    loop
      -- Same projection as ingest_cc4a_sales (0018); the not-null columns
      -- (make, model, sale_price, sale_date) are enforced as filters so one
      -- junk row rejects itself instead of aborting the swap.
      insert into ca_cc4a_used_ev_sales
        (make, model, sub_model, model_year, ev_type, sale_price, odometer,
         sale_date, county, zip, dealership, air_district)
      select
        x->>'make', x->>'model', x->>'sub_model',
        nullif(x->>'model_year','')::smallint, x->>'ev_type',
        (x->>'sale_price')::int, nullif(x->>'odometer','')::int,
        (x->>'sale_date')::date, x->>'county', x->>'zip',
        x->>'dealership', x->>'air_district'
      from jsonb_array_elements(_c.rows) as x
      where coalesce(x->>'make','') <> '' and coalesce(x->>'model','') <> ''
        and (x->>'sale_price') ~ '^[0-9]+$'
        and (x->>'sale_date') ~ '^\d{4}-\d{2}-\d{2}$';
      get diagnostics _n = row_count;
      _inserted := _inserted + _n;
    end loop;

  elsif _dataset = 'cheapr_rebates' then
    delete from ct_cheapr_rebates where true;
    for _c in
      select rows from monthly_load_stage
      where dataset = _dataset and batch_id = _batch
      order by chunk_index
    loop
      insert into ct_cheapr_rebates
        (applicant_type, application_date, zip, rebate_amount, purchase_date,
         model_year, model, new_or_used, purchase_or_lease, rebate_type,
         dealership, dealership_zip)
      select
        x->>'applicant_type', nullif(x->>'application_date','')::date, x->>'zip',
        nullif(x->>'rebate_amount','')::int, nullif(x->>'purchase_date','')::date,
        nullif(x->>'model_year','')::smallint, x->>'model', x->>'new_or_used',
        x->>'purchase_or_lease', x->>'rebate_type', x->>'dealership', x->>'dealership_zip'
      from jsonb_array_elements(_c.rows) as x;
      get diagnostics _n = row_count;
      _inserted := _inserted + _n;
    end loop;

  elsif _dataset = 'epa_variants' then
    delete from epa_vehicle_variants where true;
    for _c in
      select rows from monthly_load_stage
      where dataset = _dataset and batch_id = _batch
      order by chunk_index
    loop
      -- The not-null columns enforced as filters, wa_sales-style. epa_id is
      -- unique in the source; on conflict do update keeps a duplicated id
      -- from aborting the swap.
      insert into epa_vehicle_variants
        (epa_id, make, model, base_model, model_year, ev_type, drive, epa_range_mi, vclass)
      select
        (x->>'epaId')::int, x->>'make', x->>'model', x->>'baseModel',
        (x->>'modelYear')::smallint, x->>'evType',
        nullif(x->>'drive',''), nullif(x->>'epaRangeMi','')::smallint, nullif(x->>'vclass','')
      from jsonb_array_elements(_c.rows) as x
      where (x->>'epaId') ~ '^[0-9]+$' and (x->>'modelYear') ~ '^[0-9]{4}$'
        and coalesce(x->>'make','') <> '' and coalesce(x->>'model','') <> ''
        and x->>'evType' in ('BEV', 'PHEV')
      on conflict (epa_id) do update
        set make = excluded.make, model = excluded.model, base_model = excluded.base_model,
            model_year = excluded.model_year, ev_type = excluded.ev_type,
            drive = excluded.drive, epa_range_mi = excluded.epa_range_mi, vclass = excluded.vclass;
      get diagnostics _n = row_count;
      _inserted := _inserted + _n;
    end loop;

  else  -- rebate_vins: per-source replace, not a table wipe (see 0034 header).
    delete from ev_rebate_vins
    where source in (
      select distinct x->>'source'
      from monthly_load_stage s, jsonb_array_elements(s.rows) as x
      where s.dataset = _dataset and s.batch_id = _batch
        and coalesce(x->>'source','') <> ''
    );
    for _c in
      select rows from monthly_load_stage
      where dataset = _dataset and batch_id = _batch
      order by chunk_index
    loop
      insert into ev_rebate_vins (vin, source, model_year, make, model, rebate_date)
      select
        x->>'vin', x->>'source', nullif(x->>'model_year','')::smallint,
        x->>'make', x->>'model', nullif(x->>'rebate_date','')::date
      from jsonb_array_elements(_c.rows) as x
      where coalesce(x->>'vin','') <> '' and coalesce(x->>'source','') <> ''
      on conflict (source, vin) do nothing;
      get diagnostics _n = row_count;
      _inserted := _inserted + _n;
    end loop;
  end if;

  insert into monthly_load_commit (dataset, batch_id, inserted)
  values (_dataset, _batch, _inserted);

  -- This batch is live; also sweep any earlier aborted batch of this dataset.
  delete from monthly_load_stage where dataset = _dataset;

  return jsonb_build_object('inserted', _inserted);
end;
$$;

revoke execute on function stage_monthly_load(text, text, integer, jsonb) from public, anon, authenticated;
revoke execute on function commit_monthly_load(text, text, integer)       from public, anon, authenticated;
