-- A second source of what plug-in cars actually sold for, and the first one
-- that is national.
--
-- Until now the only sold prices the site held were Washington's title
-- records (wa_ev_sales): one state, every seller. This table holds retail
-- sale prices taken from public financial filings made by one national
-- used-car retailer: one seller, every state. Each row is one car sold on
-- finance — the month, the car, the price before taxes and fees, and the
-- buyer's state.
--
-- What it is and is not, because every number the site prints is a claim:
--   * ONE retailer, fixed no-haggle pricing, financed purchases only, and
--     only the loans that were later filed. It is not "the market" and must
--     never be pooled with wa_ev_sales into one median. Measured on
--     2026-11-10 against Washington for the same model, year and month, this
--     retailer's prices ran about 7% above the state median (n=164, not
--     mileage-controlled).
--   * No VIN, no trim, no odometer. The filings give a model name and a
--     model year. A row is admitted only when the name says the car plugs in
--     (or the nameplate never came any other way), so plain "Niro", "Kona",
--     "XC40" and the like are absent by design.
--   * The month is the month the loan began. The most recent months are
--     always thin: a sale appears only once its loan has been filed.
--   * The retailer charges the same price in every state (state median /
--     national median = 1.000 for the same car and quarter), so `state` says
--     where the buyer lives and nothing about regional price.
--
-- Checked against Washington before loading: of 872 rows with a Washington
-- buyer, 849 have a state title record in the same month for the same make
-- and model year at the identical price. Controls: price + $137 matched 0,
-- price + $1,000 matched 137 (another sticker price), the month moved by
-- seven matched 91.
--
-- Nothing reads this table yet. RLS is on with no policy, so anon and
-- authenticated see nothing; it is loaded through the staged protocol (0033)
-- as dataset 'filed_sales', replaced whole on each load. `id` is an opaque
-- row key.
--
-- Both functions below are wholesale CREATE OR REPLACE of the 0037 bodies,
-- character for character apart from the dataset list and the new branch.

create table if not exists retail_filed_sales (
  id          text primary key,
  sold_month  date     not null,
  make        text     not null,
  model       text     not null,   -- wa_ev_sales' name where it has the nameplate
  powertrain  text     not null check (powertrain in ('bev', 'phev')),
  model_year  smallint not null,
  model_raw   text,                -- the name as filed, truncated at source
  price_usd   integer  not null,
  state       text,
  condition   text     not null check (condition in ('used', 'new'))
);

create index if not exists retail_filed_sales_car_idx
  on retail_filed_sales (make, model, model_year, sold_month);

alter table retail_filed_sales enable row level security;

create or replace function stage_monthly_load(_dataset text, _batch text, _chunk integer, _rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if _dataset is null or _dataset not in
    ('wa_sales', 'vin_variants', 'cc4a_sales', 'cheapr_rebates', 'rebate_vins', 'epa_variants',
     'filed_sales') then
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
    ('wa_sales', 'vin_variants', 'cc4a_sales', 'cheapr_rebates', 'rebate_vins', 'epa_variants',
     'filed_sales') then
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

  elsif _dataset = 'filed_sales' then
    delete from retail_filed_sales where true;
    for _c in
      select rows from monthly_load_stage
      where dataset = _dataset and batch_id = _batch
      order by chunk_index
    loop
      -- The not-null columns enforced as filters, wa_sales-style, so one junk
      -- row rejects itself instead of aborting the swap.
      insert into retail_filed_sales
        (id, sold_month, make, model, powertrain, model_year, model_raw,
         price_usd, state, condition)
      select
        x->>'id', (x->>'soldMonth')::date, x->>'make', x->>'model', x->>'powertrain',
        (x->>'modelYear')::smallint, nullif(x->>'modelRaw',''),
        (x->>'price')::int, nullif(x->>'state',''), x->>'condition'
      from jsonb_array_elements(_c.rows) as x
      where coalesce(x->>'id','') <> ''
        and (x->>'soldMonth') ~ '^\d{4}-\d{2}-01$'
        and (x->>'price') ~ '^[0-9]+$' and (x->>'modelYear') ~ '^[0-9]{4}$'
        and coalesce(x->>'make','') <> '' and coalesce(x->>'model','') <> ''
        and x->>'powertrain' in ('bev', 'phev')
        and x->>'condition' in ('used', 'new')
      on conflict (id) do nothing;
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
