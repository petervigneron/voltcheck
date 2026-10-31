-- A signed-in shopper can see and remove their own alert subscriptions.
--
-- Until now the only view of alert_subscriptions a shopper had was the
-- emails it sent, and the only way out was the unsubscribe link at the foot
-- of one. An alert that had not sent anything could not be found at all.
-- That is how an uncapped "Ford F-150 Lightning · 300+ mi range"
-- subscription sat on the owner's own account from 2026-10-06 to 10-31 —
-- created by one click on the browse band while the grid was filtered that
-- way, a minute before the capped search he meant — and surfaced only when
-- the new-listing fix (web/scripts/send-alerts.mjs, 2026-10-30) made it mail
-- eight extended-range trucks in a morning. The owner, 2026-10-31: the site
-- gives no way to see which searches are saved and what will be emailed.
--
-- Two functions, the same posture as 0063's account-bound alert functions:
-- SECURITY DEFINER, the address taken from the JWT and nowhere else, granted
-- to authenticated only. Listing returns what the row IS — id, label,
-- params, when it was made, when it last sent — and never a token. Removal
-- is by id and address together, so an id guessed from elsewhere removes
-- nothing. Removing the 'ids=' row is the same as the free alert's own
-- switch going off (alert_watchlist_mine_set(false)); components agree.
--
-- Anonymous subscriptions (0029's confirm-by-email path) have no account to
-- list under and stay reachable only through their unsubscribe link, as
-- before.

create or replace function alert_list_mine()
returns table (id uuid, label text, params text, created_at timestamptz, last_sent_at timestamptz)
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select s.id, s.label, s.params, s.created_at, s.last_sent_at
  from alert_subscriptions s
  where lower(s.email) = lower(auth.jwt() ->> 'email')
    and s.confirmed_at is not null
  order by s.created_at desc;
$$;

revoke all on function alert_list_mine() from public;
grant execute on function alert_list_mine() to authenticated;

comment on function alert_list_mine() is
  'The signed-in address''s confirmed alert subscriptions (0112): id, label, params, created_at, last_sent_at. Never a token.';

create or replace function alert_remove_mine(_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  _email text := auth.jwt() ->> 'email';
  _n     int;
begin
  if _email is null then
    return jsonb_build_object('status', 'unauthenticated');
  end if;
  delete from alert_subscriptions
   where id = _id and lower(email) = lower(_email);
  get diagnostics _n = row_count;
  return jsonb_build_object('status', case when _n > 0 then 'removed' else 'missing' end);
end;
$$;

revoke all on function alert_remove_mine(uuid) from public;
grant execute on function alert_remove_mine(uuid) to authenticated;

comment on function alert_remove_mine(uuid) is
  'Removes one of the signed-in address''s own alert subscriptions by id (0112). An id under another address removes nothing and says ''missing''.';
