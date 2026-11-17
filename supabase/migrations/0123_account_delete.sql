-- 0123: a signed-in person can delete their own account.
--
-- Until now deletion was "email us". The privacy page being written on
-- 2026-11-17 would have said so, and the owner's answer was that there
-- should be a control for it. This is the database half; the site half is
-- /account/delete (web/app/api/account/delete/route.ts), which asks for the
-- password again before calling this.
--
-- What an account owns, read from the live schema on 2026-11-17:
--   auth.users            the sign-in itself
--   account_shelf         saved cars and searches (FK, on delete cascade)
--   alert_subscriptions   by email, no FK
--   pro_passes            by email, no FK
--   data_keys             by email, no FK
-- Nothing else in public carries a user id or an email column, and nothing
-- references those four tables. The visit records (events) carry a random
-- browser id that is in no other table, so there is nothing of an account's
-- in them to delete.
--
-- Same shape as every 0063 function: security definer, identity read from
-- auth.uid() / auth.jwt() and never from an argument, so a caller cannot
-- name someone else's account.
--
-- THE ONE REFUSAL. A data key with status 'active' is a subscription Stripe
-- will charge again next month. Deleting the row would not stop the charge:
-- the person would be billed for a key that no longer exists and could not
-- sign in to cancel. So an active key blocks the deletion and the site says
-- to cancel it first. 'canceling' (cancelled, running out its paid month)
-- and 'ended' do not bill again and are deleted with the rest.
--
-- A pass is a one-off purchase with nothing recurring; it is deleted, and
-- the page says the pass goes with the account. Stripe keeps its own record
-- of every payment either way, which is the record a refund or a dispute is
-- settled from.

create or replace function account_delete_mine()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  _uid   uuid := auth.uid();
  _email text := auth.jwt() ->> 'email';
begin
  if _uid is null or _email is null or _email = '' then
    raise exception 'not signed in' using errcode = '42501';
  end if;

  if exists (select 1 from data_keys where lower(email) = lower(_email) and status = 'active') then
    return jsonb_build_object('deleted', false, 'reason', 'data_key_active');
  end if;

  delete from alert_subscriptions where lower(email) = lower(_email);
  delete from data_keys           where lower(email) = lower(_email);
  delete from pro_passes          where lower(email) = lower(_email);
  -- Cascades to account_shelf and to GoTrue's own rows for the user
  -- (identities, sessions, refresh tokens).
  delete from auth.users where id = _uid;

  return jsonb_build_object('deleted', true);
end;
$$;

revoke all on function account_delete_mine() from public;
revoke all on function account_delete_mine() from anon;
grant execute on function account_delete_mine() to authenticated;
