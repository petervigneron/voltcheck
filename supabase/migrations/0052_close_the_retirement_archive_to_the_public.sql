-- Supabase's advisor (and its 23 Aug security email) flagged retired_listing
-- as the one public table with row-level security disabled: anyone holding
-- the anon key could read, edit, or delete the retirement archive directly.
-- Nothing legitimate reaches this table that way — 0043's retire function is
-- SECURITY DEFINER and the ingest edge function reads it as service_role,
-- and both bypass RLS entirely — so enabling RLS with no policies closes the
-- public path without changing any working lane. No policies on purpose:
-- like the 0007 archive posture, the retirement record is operational
-- history, not something the site publishes.

alter table public.retired_listing enable row level security;
