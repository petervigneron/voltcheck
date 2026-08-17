-- Make the monthly wa_ev_sales / vin_variant_vpic reloads atomic and safe to
-- retry.
--
-- The old protocol (wa-prices.mjs / vpic-variants.mjs send the first chunk
-- with _replace=true, which DELETEs the live table, then append chunks until
-- they run out) had two failure modes:
--
--   1. Half-loaded month. Any chunk failing after the first leaves the table
--      holding a fraction of the archive until the next monthly run — and
--      because the SODA feed is date-ordered, the missing fraction is the most
--      recent sales, so every median quoted from wa_ev_sales is computed over
--      a biased sample. The replace has already happened; there is nothing to
--      roll back to.
--   2. Unsafe retries. A chunk that committed but lost its response (edge
--      520, connection reset) duplicates rows if replayed — wa_ev_sales has
--      no natural key, so nothing dedupes it, and duplicated sales skew the
--      price medians the site quotes. This is why 562ce2a gave every other
--      pipeline write a retry ladder and deliberately left these two loops
--      bare: a failed month costs a refresh, a silent double-count costs a
--      wrong number.
--
-- New protocol, one generic pair of functions:
--
--   stage_monthly_load(_dataset, _batch, _chunk, _rows)
--     Parks the chunk's raw jsonb in monthly_load_stage keyed
--     (dataset, batch, chunk). A replayed chunk OVERWRITES itself instead of
--     duplicating, so the client may retry freely.
--   commit_monthly_load(_dataset, _batch, _expected_rows)
--     One transaction: verifies the staged row count matches what the client
--     says it sent, empties the live table, replays the staged chunks into it
--     through the same projection/filters the old ingest functions used, and
--     clears the staging rows. A load that dies at ANY point before commit
--     leaves last month's table fully intact and this month's chunks parked
--     in staging (swept on the next successful commit).
--
-- A commit whose response is lost is handled too: each committed batch is
-- recorded in monthly_load_commit, and replaying the commit answers from that
-- record instead of failing on the now-empty staging table.
--
-- Validation failures RAISE rather than return an {error} object: PostgREST
-- turns the raise into HTTP 400, which the scraper's retry ladder correctly
-- treats as permanent, prints, and exits on — the jsonb-error style the old
-- functions used returned HTTP 200 and relied on the caller to look inside,
-- which wa-prices.mjs never did.
--
-- The old ingest_wa_sales / ingest_vin_variants functions and their gateway
-- routes are left in place, same posture as 0017 took with the 1-argument
-- form: they are the rollback path, and dropping them is a separate decision.

create table if not exists monthly_load_stage (
  dataset     text        not null,
  batch_id    text        not null,
  chunk_index integer     not null,
  rows        jsonb       not null,
  staged_at   timestamptz not null default now(),
  primary key (dataset, batch_id, chunk_index)
);

create table if not exists monthly_load_commit (
  dataset      text        not null,
  batch_id     text        not null,
  inserted     integer     not null,
  committed_at timestamptz not null default now(),
  primary key (dataset, batch_id)
);

-- Service-role plumbing only: RLS on with no policies, and no anon grants.
alter table monthly_load_stage  enable row level security;
alter table monthly_load_commit enable row level security;
revoke all on monthly_load_stage  from public, anon, authenticated;
revoke all on monthly_load_commit from public, anon, authenticated;

create or replace function stage_monthly_load(_dataset text, _batch text, _chunk integer, _rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if _dataset is null or _dataset not in ('wa_sales', 'vin_variants') then
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
  if _dataset is null or _dataset not in ('wa_sales', 'vin_variants') then
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
  -- statement — the loop buys memory headroom, not time. The full swap
  -- (delete + ~35 chunk inserts of narrow rows) is seconds of work against
  -- the 60s service-role budget (0009).
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
  else
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
