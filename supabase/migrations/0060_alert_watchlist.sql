-- Price-drop alerts on SAVED CARS — the free tier (owner, 2026-09-02).
--
-- The free search-based alert is gone: "email me when a car matching this
-- search is cut in price" asked a stranger to understand a search before
-- they understood the site. What a shopper does understand is the ☆ on a car.
-- So the free alert is: star cars, give us an address, and hear when one of
-- them drops in price. Search-based alerts — new cars that fit a description,
-- the standing order — are the Pro half (send-alerts.mjs).
--
-- One row per address, not one per car. The shelf (lib/saved.ts) changes
-- every time the shopper stars or un-stars something, and a row per car
-- would mean a confirm email per star and a delete path per un-star. Instead
-- the row's params are the whole shelf, "ids=<vin>,<vin>,…", and this
-- function REPLACES them in place: same row, same confirm state, same
-- unsubscribe token. A shopper confirms once; the list under it follows the
-- stars. Fifty cars is the ceiling (0029's params column holds 1024 chars;
-- 50 lowercase VINs and commas are 899), newest first — the client trims.
--
-- Not counted against alert_subscribe's twenty-search cap: it is one row,
-- and the cap is about searches. Sending "ids=" (an empty list) deletes the
-- row — that is the shopper's "turn off", and it needs no token because the
-- caller is our route holding the subscribe secret, on behalf of an address
-- that already proved itself by confirming.
--
-- Matching is the sender's job (scripts/send-alerts.mjs): a subscription
-- whose params begin "ids=" is matched by listing id and gets the price-cut
-- section only. lib/listings/match.ts never sees the key.
create or replace function alert_watchlist_set(_email text, _params text, _secret text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  _authed boolean;
  _row alert_subscriptions%rowtype;
begin
  _authed := encode(sha256(convert_to(coalesce(_secret, ''), 'utf8')), 'hex')
             = '688f1eeca79196f1863c825df386a6f4f6cd6c086dad61e4d4c3ebde5e8e8699';

  -- Same quiet refusals as alert_subscribe, plus the shape of the list:
  -- lowercase 17-character VINs, comma-separated, at most fifty.
  if not _authed
     or _email is null or _email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
     or char_length(_email) > 254
     or _params is null
     or _params !~ '^ids=([a-z0-9]{17}(,[a-z0-9]{17}){0,49})?$' then
    return jsonb_build_object('status', 'rejected');
  end if;

  select * into _row from alert_subscriptions
  where lower(email) = lower(_email) and params like 'ids=%'
  limit 1;

  -- An empty list is the off switch.
  if _params = 'ids=' then
    if found then
      delete from alert_subscriptions where id = _row.id;
    end if;
    return jsonb_build_object('status', 'removed');
  end if;

  if found then
    update alert_subscriptions set params = _params where id = _row.id;
    if _row.confirmed_at is not null then
      return jsonb_build_object('status', 'updated');
    end if;
  else
    insert into alert_subscriptions (email, params, label)
    values (_email, _params, 'your saved cars')
    returning * into _row;
  end if;

  -- Unconfirmed: same 24h throttle on the confirm mail as alert_subscribe.
  if _row.confirm_sent_at is not null and _row.confirm_sent_at > now() - interval '24 hours' then
    return jsonb_build_object('status', 'pending');
  end if;

  update alert_subscriptions set confirm_sent_at = now() where id = _row.id;
  return jsonb_build_object(
    'status', 'created',
    'confirm_token', _row.confirm_token,
    'unsubscribe_token', _row.unsubscribe_token
  );
end;
$$;

revoke all on function alert_watchlist_set(text, text, text) from public;
grant execute on function alert_watchlist_set(text, text, text) to anon, authenticated;
