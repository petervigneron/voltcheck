-- Give the second-geography reference datasets (0018) a load path again, on
-- the staged protocol (0033).
--
-- The reference tables were loaded once, on 2026-08-15, through gateway
-- routes (dataset: cc4a_sales / rebate_vins / cheapr_rebates → the
-- first-chunk-replaces ingest functions in 0018). Those routes lived only on
-- an unmerged branch; the gateway rewrites that followed (streaming
-- x-ingest-rpc, v11/v12) were deployed from main and silently dropped them.
-- CC4A refreshes quarterly upstream, so without a load path the table just
-- ages in place.
--
-- Rather than resurrect the routes, the datasets join stage_monthly_load /
-- commit_monthly_load: same atomicity (a failed load leaves the live rows
-- standing), same replay safety, and the gateway already allowlists both
-- RPCs, so nothing needs deploying.
--
-- One semantic wrinkle: ev_rebate_vins holds several programmes' VINs at
-- once (source = 'LADWP', 'IL_EPA', ...), loaded as separate batches. Its
-- commit therefore deletes only the sources present in the staged batch —
-- the per-source replace that 0018's ingest_rebate_vins implemented —
-- instead of emptying the table.
--
-- Both functions are wholesale CREATE OR REPLACE of the 0033 bodies; the
-- wa_sales / vin_variants branches are 0033's, character for character. The
-- 0018 ingest functions stay in place as the rollback path, same posture
-- 0033 took with ingest_wa_sales.

create or replace function stage_monthly_load(_dataset text, _batch text, _chunk integer, _rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if _dataset is null or _dataset not in
    ('wa_sales', 'vin_variants', 'cc4a_sales', 'cheapr_rebates', 'rebate_vins') then
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
    ('wa_sales', 'vin_variants', 'cc4a_sales', 'cheapr_rebates', 'rebate_vins') then
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

  else  -- rebate_vins: per-source replace, not a table wipe (see header).
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
