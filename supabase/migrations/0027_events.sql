-- Minimal client-event sink: listing_saved / listing_unsaved (the browser-side
-- saved-cars shelf) and dealer_click (the outbound click to the dealer's own
-- page — the one conversion-shaped signal the site has). The shape is
-- deliberately generic — name + anonymous client id + optional listing ref +
-- free jsonb props — so a fourth event is one allowlist entry here, in
-- web/lib/events.ts, and in web/app/api/events/route.ts, not a schema change.
--
-- client_id is a random UUID the browser mints once and keeps in
-- localStorage: no PII, nothing derived from the visitor. `listing` is the
-- listing id (lowercase VIN). Distinct from listing_events (0006), which logs
-- ingest lifecycle, not shoppers.
--
-- Fully outside every read path: nothing joins this table, no view or
-- function touches it, the feed / browse index / detail reads never see it,
-- and no nightly job maintains it.
--
-- Abuse posture. The writer is the site's /api/events route, which validates
-- name, id, and prop sizes before inserting with the anon key — the only
-- Supabase credential web/ has (web/lib/listings/db.ts; there is no
-- service-role key on Vercel, and this migration adds no secret). Anon insert
-- is therefore open by design, and these CHECKs are the backstop for anyone
-- driving PostgREST with the anon key directly: the worst case is junk rows,
-- each bounded in size (allowlisted name, capped ids, capped props), never
-- readable back by anon (no select policy AND revoked — the 0007
-- mileage/events pattern), and truncatable at will since nothing a shopper
-- sees is built from them.

create table if not exists events (
  id bigint generated always as identity primary key,
  client_id text not null,
  name text not null,
  listing text,          -- listing id = lowercase VIN, when the event is about one car
  props jsonb,
  created_at timestamptz not null default now(),
  constraint events_name_allowed check (name in ('listing_saved', 'listing_unsaved', 'dealer_click')),
  constraint events_client_id_len check (char_length(client_id) between 1 and 64),
  constraint events_listing_len check (listing is null or char_length(listing) between 1 and 32),
  constraint events_props_size check (props is null or pg_column_size(props) <= 4096)
);

alter table events enable row level security;

-- Insert-only for the public roles: the write path exists, nothing else does.
create policy "public insert" on events for insert to anon, authenticated with check (true);
grant insert on events to anon, authenticated;
revoke select, update, delete on events from anon, authenticated;

-- The identity column's sequence: nextval runs as the inserting role, so the
-- grant is part of making insert actually work.
do $$
begin
  execute format('grant usage on sequence %s to anon, authenticated', pg_get_serial_sequence('events', 'id'));
end $$;
