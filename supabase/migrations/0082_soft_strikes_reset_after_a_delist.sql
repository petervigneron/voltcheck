-- Two strikes means two, again.
--
-- 0004's rule: a car whose own page answers 200 without its VIN takes a
-- strike; the second consecutive strike delists it. The hard-gone branch
-- (404/410) resets recheck_misses to 0 when it delists. The soft-gone branch
-- never did — it wrote delisted_at and left the counter at 2. And when the
-- crawl relisted the car (ingest_listings' upsert clears delisted_at and
-- touches nothing else), the counter stayed at 2. From then on ONE more
-- soft miss re-delisted the car, and the crawl relisted it again the next
-- morning, and so on. "Two consecutive strikes" had degraded to "one
-- strike, permanently".
--
-- Measured 2026-09-12 (docs/agents/delist-churn-2026-09-12.md, and the
-- diagnosis in this commit):
--   * 27,968 delist events Sep 7–11; 14,947 (53%) relisted within 3 days.
--   * Of recheck's 13,026, ~6,400 (49%) are this ratchet: 1,103 VINs were
--     delisted 3+ times in five nights, and 611 of them carry
--     recheck_misses >= 3 — a value unreachable under a resetting rule.
--   * live rows by counter tonight: 170,511 at 0; 1,144 at 1; 350 at 2..12
--     (every one of those 350 is one miss from a delist it should be two
--     from); delisted rows reach 20.
--
-- Two fixes, both mechanical:
--   1. recheck_listings' soft-gone branch resets the counter on the strike
--      that delists, exactly as the hard-gone branch already does.
--   2. A trigger: whenever a listings row goes from delisted to live, its
--      counter goes to 0. That covers every relist path at once —
--      ingest_listings (nightly and rolling), recheck_listings' own alive
--      branch, and any hand relist — without rewriting ingest_listings,
--      whose body is 0025's OOM-shaped upsert plus four generations of
--      guards. A trigger is not this schema's habit; it is chosen here
--      because the invariant belongs to the ROW ("a live car has no stale
--      strikes"), not to any one writer, and the last time this was left to
--      each writer to remember, one of them forgot.
-- Plus a one-time repair of the 350 live rows already sitting at >= 2.
--
-- What this does NOT change: a genuine gone car still needs two consecutive
-- misses (now really consecutive: a relist in between resets the count), and
-- the OEM-locator cross-check (recheck.mjs) still outvotes a single page.

create or replace function listings_reset_strikes_on_relist()
returns trigger
language plpgsql
as $$
begin
  if old.delisted_at is not null and new.delisted_at is null then
    new.recheck_misses := 0;
  end if;
  return new;
end;
$$;

drop trigger if exists listings_reset_strikes_on_relist on listings;
create trigger listings_reset_strikes_on_relist
  before update of delisted_at on listings
  for each row
  execute function listings_reset_strikes_on_relist();

-- recheck_listings: identical to the live definition (0004 → 0006 → 0025 →
-- 0039 → 0041 → 0048 lineage; read back from pg_get_functiondef on prod
-- 2026-09-12 before this replace) except the soft-gone update, which now
-- resets the counter on the strike that delists.
create or replace function recheck_listings(
  _alive jsonb default '[]'::jsonb,
  _hard_gone jsonb default '[]'::jsonb,
  _soft_gone jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  _run_id bigint;
  _confirmed integer := 0;
  _changed integer := 0;
  _delisted integer := 0;
  _struck integer := 0;
begin
  insert into ingest_runs (source) values ('recheck') returning id into _run_id;

  drop table if exists _alive_rows;
  create temp table _alive_rows on commit drop as
    select upper(x->>'vin') as vin,
           nullif(x->>'priceUsd','')::numeric::int as price_usd,
           nullif(x->>'mileage','')::numeric::int as mileage,
           x->>'provenance' as provenance,
           x->>'dealerDomain' as dealer_domain
    from jsonb_array_elements(coalesce(_alive,'[]'::jsonb)) x
    where coalesce(x->>'vin','') <> '';

  -- Price movement observed on the car's own page is the strongest signal
  -- we get; log it before overwriting. a.price_usd <> 0 keeps abstains out
  -- (0039); provenance carries which field produced it (0041); dealer_domain
  -- carries whose page it was (0048).
  insert into listing_price_history (vin, run_id, price_usd, provenance, dealer_domain)
  select a.vin, _run_id, a.price_usd, a.provenance,
         coalesce(a.dealer_domain, l.dealer_domain)
  from _alive_rows a join listings l using (vin)
  where a.price_usd is not null and a.price_usd <> 0
    and a.price_usd is distinct from l.price_usd;
  get diagnostics _changed = row_count;

  insert into listing_mileage_history (vin, run_id, mileage)
  select a.vin, _run_id, a.mileage
  from _alive_rows a join listings l using (vin)
  where a.mileage is not null and a.mileage is distinct from l.mileage;

  -- A confirmed VIN that was marked delisted is back: record the relist
  -- before the update below clears delisted_at.
  insert into listing_events (vin, run_id, event)
  select a.vin, _run_id, 'relisted'
  from _alive_rows a join listings l using (vin)
  where l.delisted_at is not null;

  -- _confirmed keeps its 0006 meaning — every alive VIN we matched — even
  -- though the wide update below now touches only the rows that changed.
  select count(*) into _confirmed
  from _alive_rows a join listings l using (vin);

  update listings l set
    price_usd         = coalesce(a.price_usd, l.price_usd),
    payload           = case when a.price_usd is not null
                             then jsonb_set(l.payload, '{priceUsd}', to_jsonb(a.price_usd))
                             else l.payload end,
    mileage           = coalesce(a.mileage, l.mileage),
    delisted_at       = null,
    recheck_misses    = 0,
    updated_at        = now()
  from _alive_rows a
  where a.vin = l.vin
    and (   (a.price_usd is not null and a.price_usd is distinct from l.price_usd)
         or (a.mileage  is not null and a.mileage  is distinct from l.mileage)
         or l.delisted_at is not null
         or l.recheck_misses <> 0);

  -- The page itself said the car is for sale: strongest evidence there is.
  insert into listing_seen as s (vin, last_seen_at, last_seen_run, last_confirmed_at)
  select a.vin, now(), _run_id, now()
  from _alive_rows a join listings l using (vin)
  on conflict (vin) do update set
    last_seen_at      = excluded.last_seen_at,
    last_seen_run     = excluded.last_seen_run,
    last_confirmed_at = excluded.last_confirmed_at;

  with gone as (
    update listings l set delisted_at = now(), updated_at = now(), recheck_misses = 0
    where l.delisted_at is null
      and l.vin in (select upper(value) from jsonb_array_elements_text(coalesce(_hard_gone,'[]'::jsonb)))
    returning l.vin
  )
  insert into listing_events (vin, run_id, event)
  select vin, _run_id, 'delisted' from gone;
  get diagnostics _delisted = row_count;

  -- Struck rows are counted before the update; only the subset the update
  -- actually delists (second strike) produces an event. returning sees the
  -- post-update row, so a non-null delisted_at means it was set just now.
  select count(*) into _struck
  from listings l
  where l.delisted_at is null
    and l.vin in (select upper(value) from jsonb_array_elements_text(coalesce(_soft_gone,'[]'::jsonb)));

  -- The strike that delists also clears the count (0082): a car that comes
  -- back starts from zero, the same as one the hard-gone branch retired.
  with struck as (
    update listings l set
      recheck_misses = case when l.recheck_misses + 1 >= 2 then 0 else l.recheck_misses + 1 end,
      delisted_at    = case when l.recheck_misses + 1 >= 2 then now() else l.delisted_at end,
      updated_at     = now()
    where l.delisted_at is null
      and l.vin in (select upper(value) from jsonb_array_elements_text(coalesce(_soft_gone,'[]'::jsonb)))
    returning l.vin, l.delisted_at
  )
  insert into listing_events (vin, run_id, event)
  select vin, _run_id, 'delisted' from struck where delisted_at is not null;

  update ingest_runs
  set finished_at = now(),
      listings_seen = _confirmed,
      listings_price_changed = _changed,
      listings_delisted = _delisted
  where id = _run_id;

  return jsonb_build_object(
    'run_id', _run_id, 'confirmed', _confirmed, 'price_changed', _changed,
    'delisted', _delisted, 'struck', _struck);
end;
$$;

-- One-time repair: live cars carrying the ratchet's residue. A live row at 1
-- has one honest strike and keeps it; >= 2 is impossible under the rule as
-- written and is only ever the residue.
update listings set recheck_misses = 0, updated_at = now()
where delisted_at is null and recheck_misses >= 2;
