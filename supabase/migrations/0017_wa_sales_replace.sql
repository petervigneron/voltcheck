-- BACKFILL. This SQL was applied directly to production and never committed;
-- this file is the record of it, written 2026-08-15 from the live definition.
--
-- Ledger entries it reconstructs (supabase migration history):
--   20260812195501  wa_sales_delete_where
--   20260812195545  wa_sales_chunked_load
--
-- The two are consolidated into their end state rather than replayed in
-- sequence, because only the end state is recoverable from a running database
-- and only the end state is what a rebuild needs.
--
-- Why it matters: scraper/wa-prices.mjs sends the WA archive in 4,000-row
-- chunks and sets replace=true on the FIRST chunk only, so the reload empties
-- the table once and appends thereafter. 0003 defines ingest_wa_sales with no
-- _replace parameter at all, which means a database built from the repo alone
-- would 404 that call and the monthly price refresh would silently stop.
--
-- The 1-argument form from 0003 still exists in production and is left alone:
-- dropping it is a separate decision, and PostgREST resolves the 2-argument
-- form for every caller that passes _replace.

create or replace function ingest_wa_sales(_rows jsonb, _replace boolean default false)
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

  -- Only the first chunk clears; the rest append onto it.
  if _replace then
    delete from wa_ev_sales where true;  -- Supabase requires an explicit WHERE
  end if;

  insert into wa_ev_sales
    (vin_prefix, make, model, model_raw, model_year, ev_type,
     sale_price, odometer, sale_date, county, city, zip, transaction_type)
  select
    x->>'vinPrefix', x->>'make', x->>'model', x->>'modelRaw',
    (x->>'modelYear')::smallint, x->>'evType',
    (x->>'salePrice')::int, nullif(x->>'odometer','')::int,
    (x->>'saleDate')::date, x->>'county', x->>'city', x->>'zip', x->>'transactionType'
  from jsonb_array_elements(_rows) as x
  where (x->>'salePrice') ~ '^[0-9]+$' and coalesce(x->>'make','') <> '';

  get diagnostics _n = row_count;
  return jsonb_build_object('inserted', _n);
end;
$$;

revoke execute on function ingest_wa_sales(jsonb, boolean) from public, anon, authenticated;
