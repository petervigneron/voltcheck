-- Voltcheck listings persistence — initial schema.
--
-- Design: one row per VIN ever seen (listings), an append-only price log
-- (listing_price_history), and one row per nightly sync (ingest_runs).
-- Rows are never deleted: a car that leaves a dealer's feed gets
-- delisted_at set, so days-on-lot = last_seen_at - first_seen_at and
-- price-drop features read straight from the history table.
--
-- The web app renders from listings.payload (the exact web/lib Listing
-- shape); the typed columns exist for SQL-side filtering as the row count
-- grows. payload is the source of truth for display.
--
-- Apply in the Supabase SQL editor (or `supabase db push`). The roles
-- anon / authenticated / service_role already exist on Supabase.

create table if not exists ingest_runs (
  id bigint generated always as identity primary key,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  source text not null default 'nightly',
  listings_seen integer,
  listings_new integer,
  listings_price_changed integer,
  listings_delisted integer,
  listings_relisted integer
);

create table if not exists listings (
  vin text primary key,                 -- uppercased; payload.id stays lowercase
  payload jsonb not null,               -- full Listing object as ingested
  price_usd integer not null,
  year smallint,
  make text,
  model text,
  vehicle_trim text,
  mileage integer,
  condition text,
  state text,
  zip text,
  dealer_domain text,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  delisted_at timestamptz,              -- null while live in the source feed
  created_run bigint references ingest_runs(id),
  last_seen_run bigint references ingest_runs(id),
  updated_at timestamptz not null default now()
);

create table if not exists listing_price_history (
  id bigint generated always as identity primary key,
  vin text not null references listings(vin),
  run_id bigint references ingest_runs(id),
  price_usd integer not null,
  observed_at timestamptz not null default now()
);

create index if not exists listings_live_idx on listings (make, model) where delisted_at is null;
create index if not exists listings_domain_idx on listings (dealer_domain);
create index if not exists price_history_vin_idx on listing_price_history (vin, observed_at);

-- Public read, service-role-only write. service_role bypasses RLS; no
-- insert/update policies exist, so anon and authenticated cannot write.
alter table listings enable row level security;
alter table listing_price_history enable row level security;
alter table ingest_runs enable row level security;
create policy "public read" on listings for select to anon, authenticated using (true);
create policy "public read" on listing_price_history for select to anon, authenticated using (true);
create policy "public read" on ingest_runs for select to anon, authenticated using (true);

-- One nightly sync = one call. Upserts by VIN, logs every price change,
-- and delists per-domain: a VIN is only marked delisted when its own
-- dealer's domain produced listings this run but this VIN wasn't among
-- them. A domain whose crawl failed outright (zero rows) therefore never
-- mass-delists its inventory — a fetch failure is not evidence about the
-- world.
create or replace function ingest_listings(_rows jsonb, _source text default 'nightly')
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  _run_id bigint;
  _seen integer := 0;
  _added integer := 0;
  _changed integer := 0;
  _delisted integer := 0;
  _relisted integer := 0;
begin
  insert into ingest_runs (source) values (coalesce(_source, 'nightly')) returning id into _run_id;

  drop table if exists _incoming;
  create temp table _incoming on commit drop as
    select distinct on (upper(x->>'vin'))
      upper(x->>'vin')                       as vin,
      round((x->>'priceUsd')::numeric)::int  as price_usd,
      (x->>'year')::smallint                 as year,
      x->>'make'                             as make,
      x->>'model'                            as model,
      x->>'trim'                             as vehicle_trim,
      (x->>'mileage')::int                   as mileage,
      x->>'condition'                        as condition,
      x->>'state'                            as state,
      x->>'zip'                              as zip,
      x->>'dealerDomain'                     as dealer_domain,
      x                                      as payload
    from jsonb_array_elements(coalesce(_rows, '[]'::jsonb)) as x
    where coalesce(x->>'vin', '') <> ''
      and (x->>'priceUsd') ~ '^[0-9]+(\.[0-9]+)?$';

  select count(*) into _seen from _incoming;

  select count(*) into _relisted
  from listings l
  join _incoming i using (vin)
  where l.delisted_at is not null;

  drop table if exists _prior;
  create temp table _prior on commit drop as
    select l.vin, l.price_usd
    from listings l
    join _incoming i using (vin);

  insert into listings as l
    (vin, payload, price_usd, year, make, model, vehicle_trim, mileage,
     condition, state, zip, dealer_domain,
     first_seen_at, last_seen_at, created_run, last_seen_run)
  select
    vin, payload, price_usd, year, make, model, vehicle_trim, mileage,
    condition, state, zip, dealer_domain,
    now(), now(), _run_id, _run_id
  from _incoming
  on conflict (vin) do update set
    payload       = excluded.payload,
    price_usd     = excluded.price_usd,
    year          = excluded.year,
    make          = excluded.make,
    model         = excluded.model,
    vehicle_trim  = excluded.vehicle_trim,
    mileage       = excluded.mileage,
    condition     = excluded.condition,
    state         = excluded.state,
    zip           = excluded.zip,
    dealer_domain = excluded.dealer_domain,
    last_seen_at  = now(),
    last_seen_run = _run_id,
    delisted_at   = null,
    updated_at    = now();

  _added := _seen - (select count(*) from _prior);

  -- First sighting and every price change land in the history log.
  insert into listing_price_history (vin, run_id, price_usd)
  select i.vin, _run_id, i.price_usd
  from _incoming i
  left join _prior p using (vin)
  where p.vin is null or p.price_usd is distinct from i.price_usd;

  select count(*) into _changed
  from _incoming i
  join _prior p using (vin)
  where p.price_usd is distinct from i.price_usd;

  update listings l
  set delisted_at = now(), updated_at = now()
  where l.delisted_at is null
    and l.dealer_domain in (select distinct dealer_domain from _incoming where dealer_domain is not null)
    and not exists (select 1 from _incoming i where i.vin = l.vin);
  get diagnostics _delisted = row_count;

  update ingest_runs
  set finished_at = now(),
      listings_seen = _seen,
      listings_new = _added,
      listings_price_changed = _changed,
      listings_delisted = _delisted,
      listings_relisted = _relisted
  where id = _run_id;

  return jsonb_build_object(
    'run_id', _run_id, 'seen', _seen, 'new', _added,
    'price_changed', _changed, 'delisted', _delisted, 'relisted', _relisted);
end;
$$;

-- Only the service key may ingest.
revoke execute on function ingest_listings(jsonb, text) from public, anon, authenticated;
