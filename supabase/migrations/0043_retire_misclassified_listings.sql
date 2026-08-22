-- Retire listings that should never have been admitted.
--
-- WHY A FUNCTION AND NOT A ONE-OFF DELETE: audit-listings.mjs re-judges every
-- live listing against today's rules and has no way to act on what it finds —
-- it prints a VIN list and exits, because "removing production rows is a
-- deliberate act". That was right, but it left the deliberate act with no
-- honest mechanism, so the first time the audit actually ran in CI
-- (2026-08-22, after aa0abff fixed the crash that had kept it from ever
-- running) its 308 findings had nowhere to go.
--
-- WHY DELETE AND NOT delisted_at: because delisting says something false.
-- `delisted_at` means "this car was for sale here and now is not" — it feeds
-- listing_events, days-on-market and the sold-side signals. A petrol Ram 1500
-- is still sitting on that dealer's lot; it was never a car this site had any
-- business describing. Marking it sold-or-gone would replace one wrong claim
-- with another. The row and its price/mileage history come out.
--
-- WHY A RECORD IS KEPT ANYWAY: `retired_listing` remembers which VIN was
-- judged out of scope, when, and on what grounds. Deleting the row without
-- that would erase the mistake along with the evidence, and the next audit
-- would have no way to tell a VIN we deliberately removed from one it has
-- never seen.

create table if not exists retired_listing (
  vin         text primary key,
  year        smallint,
  make        text,
  model       text,
  vehicle_trim text,
  reason      text not null,
  retired_at  timestamptz not null default now()
);

create or replace function retire_misclassified_listings(
  _rows jsonb default '[]'::jsonb   -- [{vin, reason}]
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  _asked integer;
  _live integer;
  _removed integer := 0;
begin
  drop table if exists _retire_rows;
  create temp table _retire_rows on commit drop as
    select upper(x->>'vin') as vin, nullif(x->>'reason','') as reason
    from jsonb_array_elements(coalesce(_rows,'[]'::jsonb)) x
    where coalesce(x->>'vin','') <> '';
  select count(*) into _asked from _retire_rows;
  if _asked = 0 then
    return jsonb_build_object('asked', 0, 'removed', 0, 'refused', null);
  end if;

  -- Every deletion here is irreversible and this function holds the service
  -- key, so it refuses a call big enough to be a mistake rather than a
  -- judgement. 5% of the live feed is far above any audit finding to date
  -- (308 rows against ~100,700 is 0.3%) and far below "someone passed the
  -- whole feed by accident". A genuinely larger cleanup can be run in
  -- batches, which is a deliberate act too.
  select count(*) into _live from listings where delisted_at is null;
  if _asked > greatest(500, _live / 20) then
    return jsonb_build_object(
      'asked', _asked, 'removed', 0,
      'refused', format('refusing to retire %s listings at once against %s live (cap %s) — run it in batches',
                        _asked, _live, greatest(500, _live / 20)));
  end if;

  insert into retired_listing (vin, year, make, model, vehicle_trim, reason)
  select l.vin, l.year, l.make, l.model, l.vehicle_trim, coalesce(r.reason, 'unspecified')
  from _retire_rows r join listings l using (vin)
  on conflict (vin) do update set reason = excluded.reason, retired_at = now();

  delete from listing_price_history   where vin in (select vin from _retire_rows);
  delete from listing_mileage_history where vin in (select vin from _retire_rows);
  delete from listing_events          where vin in (select vin from _retire_rows);
  delete from listing_seen            where vin in (select vin from _retire_rows);
  delete from listings                where vin in (select vin from _retire_rows);
  get diagnostics _removed = row_count;

  return jsonb_build_object('asked', _asked, 'removed', _removed, 'refused', null);
end;
$$;

revoke all on function retire_misclassified_listings(jsonb) from public, anon, authenticated;
