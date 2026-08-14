-- The archive is the asset; the anon key only gets the showroom.
--
-- Until now every table carried a blanket public-read policy, so anyone
-- holding the anon key could bulk-download the entire time series —
-- delisted cars, full price and mileage histories, lifecycle events, run
-- metadata, and the raw WA sales table — through PostgREST. The anon key
-- is not currently published anywhere (all site reads are server-side),
-- but Supabase's model treats that key as publishable by design, and the
-- accumulating archive is the one thing a competitor cannot rebuild by
-- starting a crawl today. Key secrecy is the wrong gate for it.
--
-- New posture: the anon role may read exactly what the public site
-- publishes and nothing else.
--
--   listings              -> live rows only (delisted_at is null). The
--                            delisted graveyard — days-on-market, sold
--                            inventory — is archive, not showroom.
--   listing_price_history -> rows for live cars only, so the site's
--                            embedded price-drop display keeps working
--                            with the anon key it already uses.
--   mileage / events /    -> no policy AND select revoked: hard-closed,
--   runs / wa_ev_sales       a permission error rather than silent empty
--                            rows, and closed even if RLS were ever
--                            disabled by mistake. wa_ev_sales in
--                            particular: 0003's ODbL argument is that we
--                            ship statistics (wa_price_comps, still
--                            anon-executable), never the derived database
--                            — a public REST endpoint over the raw table
--                            contradicted that.
--
-- The scraper's recheck reads only live listings; the nightly writes go
-- through service_role, which bypasses RLS. Nothing operational changes.
-- When a paid tier exists, its access returns as explicit grants/policies
-- on the archive tables — this migration is the boundary it builds on.

drop policy if exists "public read" on listings;
create policy "public read live" on listings
  for select to anon, authenticated
  using (delisted_at is null);

drop policy if exists "public read" on listing_price_history;
create policy "public read live" on listing_price_history
  for select to anon, authenticated
  using (exists (
    select 1 from listings l
    where l.vin = listing_price_history.vin and l.delisted_at is null
  ));

drop policy if exists "public read" on listing_mileage_history;
drop policy if exists "public read" on listing_events;
drop policy if exists "public read" on ingest_runs;
drop policy if exists "public read" on wa_ev_sales;

revoke select on listing_mileage_history, listing_events, ingest_runs, wa_ev_sales
  from anon, authenticated;
