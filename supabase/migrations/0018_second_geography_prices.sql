-- BACKFILL. This SQL was applied directly to production and never committed;
-- this file is the record of it, written 2026-08-15 from the live definitions.
--
-- Ledger entries it reconstructs (supabase migration history):
--   20260815205211  second_geography_prices
--   20260815205628  second_geography_delete_where
--
-- Consolidated to their end state; the _replace parameters that the second
-- entry added are folded into the function bodies below.
--
-- WHAT THIS LANE IS: Washington was the first geography with real transaction
-- prices (0003). These are the next ones — a state's EV incentive programme
-- has to record what was paid to means-test a rebate, which is the same fact
-- a DMV usually withholds:
--
--   ca_cc4a_used_ev_sales  California Clean Cars 4 All. Used-EV purchases
--                          with price, odometer, dealer and air district.
--   ct_cheapr_rebates      Connecticut CHEAPR. Rebate records; carries the
--                          rebate amount rather than a sale price, so it
--                          prices incentives, not cars.
--   ev_rebate_vins         VINs seen in any rebate programme, keyed by
--                          source. A VIN here was incentive-eligible once.
--
-- Nothing in web/ reads these yet — no view, no RPC, no component. They are
-- loaded and waiting, which is exactly why losing the schema would have been
-- easy and expensive.
--
-- POSTURE NOTE, flagged rather than changed: all three carry a plain
-- public-read policy, so anon can read them. wa_ev_sales started that way and
-- was deliberately closed in 0007 (raw ODbL rows are not ours to republish;
-- only derived statistics are). CC4A and CHEAPR are public-records releases
-- rather than ODbL, so the same reasoning may not apply — but ev_rebate_vins
-- is a VIN list, and whether that should be world-readable is an owner
-- decision, not a default. Left as found.

-- ── California Clean Cars 4 All ────────────────────────────────────────────
create table if not exists ca_cc4a_used_ev_sales (
  id           bigserial primary key,
  make         text not null,
  model        text not null,
  sub_model    text,
  model_year   smallint,
  ev_type      text,
  sale_price   integer not null,
  odometer     integer,
  sale_date    date not null,
  county       text,
  zip          text,
  dealership   text,
  air_district text
);

create index if not exists ca_cc4a_cohort_idx    on ca_cc4a_used_ev_sales (make, model, model_year);
create index if not exists ca_cc4a_sale_date_idx on ca_cc4a_used_ev_sales (sale_date);

alter table ca_cc4a_used_ev_sales enable row level security;
drop policy if exists "cc4a public read" on ca_cc4a_used_ev_sales;
create policy "cc4a public read" on ca_cc4a_used_ev_sales for select using (true);

-- ── Connecticut CHEAPR ─────────────────────────────────────────────────────
create table if not exists ct_cheapr_rebates (
  id                bigserial primary key,
  applicant_type    text,
  application_date  date,
  zip               text,
  rebate_amount     integer,
  purchase_date     date,
  model_year        smallint,
  model             text,
  new_or_used       text,
  purchase_or_lease text,
  rebate_type       text,
  dealership        text,
  dealership_zip    text
);

alter table ct_cheapr_rebates enable row level security;
drop policy if exists "cheapr public read" on ct_cheapr_rebates;
create policy "cheapr public read" on ct_cheapr_rebates for select using (true);

-- ── VINs that took an incentive, any programme ─────────────────────────────
create table if not exists ev_rebate_vins (
  vin         text not null,
  source      text not null,
  model_year  smallint,
  make        text,
  model       text,
  rebate_date date,
  primary key (source, vin)
);

create index if not exists ev_rebate_vins_vin_idx on ev_rebate_vins (vin);

alter table ev_rebate_vins enable row level security;
drop policy if exists "rebate vins read" on ev_rebate_vins;
create policy "rebate vins read" on ev_rebate_vins for select using (true);

-- ── Loaders ────────────────────────────────────────────────────────────────
-- Same shape as ingest_wa_sales: chunked, first chunk replaces. All three use
-- jsonb_populate_recordset against the table's own rowtype, so the payload
-- keys are the column names rather than a hand-written projection.

create or replace function ingest_cc4a_sales(_rows jsonb, _replace boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare _n integer;
begin
  if _replace then delete from ca_cc4a_used_ev_sales where true; end if;
  insert into ca_cc4a_used_ev_sales
    (make, model, sub_model, model_year, ev_type, sale_price, odometer,
     sale_date, county, zip, dealership, air_district)
  select r.make, r.model, r.sub_model, r.model_year, r.ev_type, r.sale_price,
         r.odometer, r.sale_date, r.county, r.zip, r.dealership, r.air_district
    from jsonb_populate_recordset(null::ca_cc4a_used_ev_sales, _rows) r;
  get diagnostics _n = row_count;
  return jsonb_build_object('inserted', _n);
end $$;

create or replace function ingest_cheapr_rebates(_rows jsonb, _replace boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare _n integer;
begin
  if _replace then delete from ct_cheapr_rebates where true; end if;
  insert into ct_cheapr_rebates
    (applicant_type, application_date, zip, rebate_amount, purchase_date,
     model_year, model, new_or_used, purchase_or_lease, rebate_type,
     dealership, dealership_zip)
  select r.applicant_type, r.application_date, r.zip, r.rebate_amount,
         r.purchase_date, r.model_year, r.model, r.new_or_used,
         r.purchase_or_lease, r.rebate_type, r.dealership, r.dealership_zip
    from jsonb_populate_recordset(null::ct_cheapr_rebates, _rows) r;
  get diagnostics _n = row_count;
  return jsonb_build_object('inserted', _n);
end $$;

-- _replace here is per-SOURCE, not global: the table holds several
-- programmes' VINs at once, so a CHEAPR reload must not wipe CC4A's rows.
-- The source is read off the first row of the batch.
create or replace function ingest_rebate_vins(_rows jsonb, _replace boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare _n integer; _src text;
begin
  if _replace then
    _src := _rows -> 0 ->> 'source';
    if _src is not null then delete from ev_rebate_vins where source = _src; end if;
  end if;
  insert into ev_rebate_vins (vin, source, model_year, make, model, rebate_date)
  select r.vin, r.source, r.model_year, r.make, r.model, r.rebate_date
    from jsonb_populate_recordset(null::ev_rebate_vins, _rows) r
   on conflict (source, vin) do nothing;
  get diagnostics _n = row_count;
  return jsonb_build_object('inserted', _n);
end $$;

revoke execute on function ingest_cc4a_sales(jsonb, boolean)     from public, anon, authenticated;
revoke execute on function ingest_cheapr_rebates(jsonb, boolean) from public, anon, authenticated;
revoke execute on function ingest_rebate_vins(jsonb, boolean)    from public, anon, authenticated;
