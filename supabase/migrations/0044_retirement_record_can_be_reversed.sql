-- Make a retirement reversible, and finish the delete.
--
-- 0043 recorded vin/year/make/model/trim and the reason. That is enough to see
-- THAT a car was removed and not enough to undo it: once the row is gone,
-- intake will refuse to re-admit it (that is the point of the same day's
-- ingest change), so the crawl re-finding the car is not a way back. Of the 37
-- nameplate groups in the 2026-08-22 adjudication, 26 rows were KEPT on
-- judgement — the same judgement can be wrong in the other direction, and a
-- record you cannot reverse from is not a record, it is a receipt.
--
-- So the whole payload goes into the retirement row, plus the vPIC decode the
-- verdict was made on. Restoring a mistake becomes an insert from a row we
-- still hold, not a re-crawl we have disabled.
--
-- Also finishes two things 0043 left:
--   * vin_colisting is keyed by vin with NO foreign key, so a delete leaves a
--     dangling "these rooftops offered this VIN" row behind. The four real FK
--     children (listing_price_history, listing_mileage_history, listing_events,
--     listing_seen) are all ON DELETE NO ACTION — verified on prod in
--     pg_constraint, not assumed — which means the parent delete would have
--     ERRORED rather than cascaded or orphaned. Deleting children explicitly,
--     in order, is deliberate: the history of a car this site should never
--     have described is not evidence worth keeping once the payload that
--     described it is preserved above.
--   * listing_freshness is a MATERIALIZED view, not a table, so it needs
--     nothing here; it rebuilds.

alter table retired_listing add column if not exists payload jsonb;
alter table retired_listing add column if not exists vpic jsonb;

create or replace function retire_misclassified_listings(
  _rows jsonb default '[]'::jsonb   -- [{vin, reason, vpic}]
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
    select upper(x->>'vin') as vin, nullif(x->>'reason','') as reason, x->'vpic' as vpic
    from jsonb_array_elements(coalesce(_rows,'[]'::jsonb)) x
    where coalesce(x->>'vin','') <> '';
  select count(*) into _asked from _retire_rows;
  if _asked = 0 then
    return jsonb_build_object('asked', 0, 'removed', 0, 'refused', null);
  end if;

  -- Every deletion here is irreversible in the feed and this function holds
  -- the service key, so it refuses a call big enough to be a mistake rather
  -- than a judgement. 5% of the live feed is far above any audit finding to
  -- date (308 rows against ~100,700 is 0.3%) and far below "someone passed
  -- the whole feed by accident". A genuinely larger cleanup runs in batches,
  -- which is a deliberate act too.
  select count(*) into _live from listings where delisted_at is null;
  if _asked > greatest(500, _live / 20) then
    return jsonb_build_object(
      'asked', _asked, 'removed', 0,
      'refused', format('refusing to retire %s listings at once against %s live (cap %s) — run it in batches',
                        _asked, _live, greatest(500, _live / 20)));
  end if;

  insert into retired_listing (vin, year, make, model, vehicle_trim, reason, payload, vpic)
  select l.vin, l.year, l.make, l.model, l.vehicle_trim, coalesce(r.reason, 'unspecified'), l.payload, r.vpic
  from _retire_rows r join listings l using (vin)
  on conflict (vin) do update
    set reason = excluded.reason, payload = excluded.payload, vpic = excluded.vpic, retired_at = now();

  delete from listing_price_history   where vin in (select vin from _retire_rows);
  delete from listing_mileage_history where vin in (select vin from _retire_rows);
  delete from listing_events          where vin in (select vin from _retire_rows);
  delete from listing_seen            where vin in (select vin from _retire_rows);
  delete from vin_colisting           where vin in (select vin from _retire_rows);
  delete from listings                where vin in (select vin from _retire_rows);
  get diagnostics _removed = row_count;

  return jsonb_build_object('asked', _asked, 'removed', _removed, 'refused', null);
end;
$$;

revoke all on function retire_misclassified_listings(jsonb) from public, anon, authenticated;
