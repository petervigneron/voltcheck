-- A pass that ended says so.
--
-- 0045's pro_check and 0063's pro_mine both answer `{"active": false}` to two
-- different facts: "this address never bought" and "this address bought, and
-- the pass has run out". The site can only print what the database will tell
-- it, so when the one pass ever sold expired on 2026-09-11 every Pro surface
-- went back to reading exactly as it does for a stranger — /account dropped
-- the pass line, /pro re-offered the passes with no mention that one had just
-- ended, and the blurred blocks put up the same "Voltcheck Pro" button they
-- show someone who has never paid. Nothing anywhere said the pass ended.
--
-- 0045's own comment on /pro/access already assumed this answer existed: the
-- cookie is deliberately given seven days past the expiry "so an expired
-- cookie still resolves to an honest 'your pass ended' rather than looking
-- like it was never bought". It never could.
--
-- So both functions keep `active` as the entitlement — it is what every
-- caller gates on, and false still means no access — and add, when a row
-- exists but its time is up, `expired: true` with the tier and the date it
-- ended. Callers that read only `active` are unaffected.
--
-- What this does NOT change: pro_check still answers only about the token it
-- was handed and still never returns the address, so the extra fields reach
-- nobody who was not already holding that pass's own token; pro_mine still
-- reads its identity from the JWT, so it answers only about the signed-in
-- address. Either way a caller learns the end date of a pass it already holds.
-- Grants are untouched (create or replace keeps them): pro_check to anon,
-- pro_mine to authenticated.

create or replace function pro_check(_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
stable
as $$
declare
  _row pro_passes%rowtype;
begin
  if _token is null then
    return jsonb_build_object('active', false);
  end if;
  select * into _row from pro_passes where access_token = _token;
  if not found then
    return jsonb_build_object('active', false);
  end if;
  if _row.expires_at <= now() then
    return jsonb_build_object(
      'active', false, 'expired', true, 'tier', _row.tier, 'expires_at', _row.expires_at);
  end if;
  return jsonb_build_object(
    'active', true, 'tier', _row.tier, 'expires_at', _row.expires_at);
end;
$$;

create or replace function pro_mine()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
stable
as $$
declare
  _email text := auth.jwt() ->> 'email';
  _row   pro_passes%rowtype;
begin
  if _email is null then
    return jsonb_build_object('active', false);
  end if;
  -- One row per address (pro_passes_email is unique on lower(email)).
  select * into _row from pro_passes where lower(email) = lower(_email);
  if not found then
    return jsonb_build_object('active', false);
  end if;
  if _row.expires_at <= now() then
    return jsonb_build_object(
      'active', false, 'expired', true, 'tier', _row.tier, 'expires_at', _row.expires_at);
  end if;
  return jsonb_build_object(
    'active', true, 'tier', _row.tier, 'expires_at', _row.expires_at);
end;
$$;
