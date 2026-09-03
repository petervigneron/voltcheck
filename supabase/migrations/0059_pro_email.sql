-- Which address holds this pass?
--
-- For the Pro standing order on /pro (2026-09-02, owner: "Describe your ideal
-- car and at your ideal price, and be notified when it becomes available").
-- The order is stored as an ordinary alert subscription (0029) and the sender
-- decides whether a subscription is Pro by whether its ADDRESS holds a live
-- pass. So the form has to subscribe the address that paid — a pass-holder
-- typing a different address would get the free tier's emails and never know
-- why. Pre-filling it needs a way from the cookie's token to the row's email.
--
-- pro_check deliberately answers with the entitlement and never the address,
-- and that contract is left untouched: this is a separate function so nothing
-- that calls pro_check learns anything new. What it reveals is the buyer's own
-- address to the holder of the buyer's own unguessable token, which is the
-- same trust the access link itself extends. It answers null — not an error —
-- for an unknown or expired token, so it is no more of an oracle than
-- pro_check is.
create or replace function pro_email(_token uuid)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
stable
as $$
declare
  _row pro_passes%rowtype;
begin
  if _token is null then
    return null;
  end if;
  select * into _row from pro_passes where access_token = _token;
  if not found or _row.expires_at <= now() then
    return null;
  end if;
  return _row.email;
end;
$$;

revoke all on function pro_email(uuid) from public;
grant execute on function pro_email(uuid) to anon, authenticated, service_role;
