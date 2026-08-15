-- A second geography for the fair-price model, and two VIN provenance lists.
--
-- 0014 fits price on wa_ev_sales and says so plainly: "Coverage is
-- Washington-only ... treat the level as a strong prior, not gospel, outside
-- the region." Nothing has been able to test that caveat, because Washington
-- was the only place in the country publishing per-transaction sale prices.
--
-- It no longer is. A 50-state sweep (2026-08-15, docs are private) found the
-- reason WA is unusual: its price column exists because 2019 HB 2042 made
-- SALE PRICE an eligibility test for a tax exemption. Invert that and the
-- rule generalises — any programme that caps a benefit on the FINAL PURCHASE
-- PRICE has to record that price per transaction. An MSRP cap does not: MSRP
-- is a model attribute, enforced off a lookup table, and never touches the
-- deal. Neither does an annually recurring levy, which needs a value in years
-- when nothing sold and so falls back on book tables.
--
-- California's Clean Cars 4 All caps the used purchase price at $45,000, so
-- CARB records it, and publishes the result at participant level. That is the
-- second geography.
--
-- Three tables, in descending order of how much work they can do:
--
--   ca_cc4a_used_ev_sales  15,081 used-EV transactions with price AND
--                          odometer. Cross-validates 0014 out of region.
--   ev_rebate_vins         22k FULL 17-char VINs from two rebate registries.
--                          WA truncates VIN to 10 and CC4A omits it, so these
--                          are the only VINs here that join to listings.vin.
--   ct_cheapr_rebates      27.5k CT rebates. No price, no VIN — a dealer
--                          activity panel, kept for completeness, not pricing.
--
-- READ THIS BEFORE FITTING ANYTHING ON CC4A. It is not a market sample:
-- buyers are income-qualified, the programme is vehicle scrappage (you retire
-- an old car to buy the replacement), and the $45k cap truncates the top
-- outright. Median price is $23,634 against a median 37,502 miles. Use it to
-- ask whether a WA-fitted model holds up in California within the overlapping
-- band; do not pool the two and fit one curve, and do not show a CC4A-derived
-- number to a shopper as a market price.

create table if not exists ca_cc4a_used_ev_sales (
  id            bigserial primary key,
  make          text     not null,
  model         text     not null,
  sub_model     text,
  model_year    smallint,
  ev_type       text,               -- BEV | PHEV | FCEV
  sale_price    integer  not null,
  odometer      integer,
  sale_date     date     not null,
  county        text,
  zip           text,
  dealership    text,               -- ~3% populated upstream
  air_district  text
);

-- Cohort lookups mirror how 0014 reads wa_ev_sales: by variant and year.
create index if not exists ca_cc4a_cohort_idx
  on ca_cc4a_used_ev_sales (make, model, model_year);
create index if not exists ca_cc4a_sale_date_idx
  on ca_cc4a_used_ev_sales (sale_date);

-- Both source registries are published for the same structural reason: the
-- rebate is once-per-vehicle (415 ILCS 120/27(f) in Illinois; a two-per-VIN
-- cap at LADWP), so the VIN list has to be public for buyers to check
-- eligibility before purchase. That guarantee is why these keep refreshing.
--
-- No price in either. What a hit tells you is provenance: this exact car drew
-- an EV rebate in that programme's territory.
create table if not exists ev_rebate_vins (
  vin          text     not null,
  source       text     not null,   -- LADWP | IL_EPA
  model_year   smallint,
  make         text,
  model        text,
  rebate_date  date,
  primary key (source, vin)
);

create index if not exists ev_rebate_vins_vin_idx on ev_rebate_vins (vin);

create table if not exists ct_cheapr_rebates (
  id                 bigserial primary key,
  applicant_type     text,
  application_date   date,
  zip                text,
  rebate_amount      integer,
  purchase_date      date,
  model_year         smallint,
  model              text,
  new_or_used        text,
  purchase_or_lease  text,
  rebate_type        text,
  dealership         text,
  dealership_zip     text
);

-- Loaders write through the ingest edge function, never with a service key on
-- a laptop — same shape as ingest_wa_sales (0003). Chunked by the caller
-- because a single jsonb payload of this size blows the statement timeout;
-- only the first chunk replaces.

create or replace function ingest_cc4a_sales(_rows jsonb, _replace boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare _n integer;
begin
  if _replace then delete from ca_cc4a_used_ev_sales; end if;
  insert into ca_cc4a_used_ev_sales
    (make, model, sub_model, model_year, ev_type, sale_price, odometer,
     sale_date, county, zip, dealership, air_district)
  select r.make, r.model, r.sub_model, r.model_year, r.ev_type, r.sale_price,
         r.odometer, r.sale_date, r.county, r.zip, r.dealership, r.air_district
    from jsonb_populate_recordset(null::ca_cc4a_used_ev_sales, _rows) r;
  get diagnostics _n = row_count;
  return jsonb_build_object('inserted', _n);
end $$;

create or replace function ingest_rebate_vins(_rows jsonb, _replace boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare _n integer; _src text;
begin
  -- Replace only the source being loaded, so reloading Illinois cannot wipe
  -- Los Angeles.
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

create or replace function ingest_cheapr_rebates(_rows jsonb, _replace boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare _n integer;
begin
  if _replace then delete from ct_cheapr_rebates; end if;
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

revoke execute on function ingest_cc4a_sales(jsonb, boolean) from public, anon, authenticated;
revoke execute on function ingest_rebate_vins(jsonb, boolean) from public, anon, authenticated;
revoke execute on function ingest_cheapr_rebates(jsonb, boolean) from public, anon, authenticated;

-- Reference data, not user data: readable, never writable from the client.
alter table ca_cc4a_used_ev_sales enable row level security;
alter table ev_rebate_vins        enable row level security;
alter table ct_cheapr_rebates     enable row level security;

drop policy if exists "cc4a public read"   on ca_cc4a_used_ev_sales;
drop policy if exists "rebate vins read"   on ev_rebate_vins;
drop policy if exists "cheapr public read" on ct_cheapr_rebates;

create policy "cc4a public read"   on ca_cc4a_used_ev_sales for select using (true);
create policy "rebate vins read"   on ev_rebate_vins        for select using (true);
create policy "cheapr public read" on ct_cheapr_rebates     for select using (true);
