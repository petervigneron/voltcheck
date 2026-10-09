-- Saved-car alerts watch the whole shelf, not the newest fifty.
--
-- 2026-10-09. Owner: "It doesn't look like I'm getting price drop alerts
-- on vehicles I've saved." His shelf held 78 cars; the alert row (0060)
-- held the newest 50, because alert_subscriptions.params is capped at
-- 1024 characters (0029) and 50 VINs and commas are 899. The 2024 Lightning
-- Flash he was watching was save number 64, dropped $500 that morning, and
-- was mailed nothing. Nothing on the saved page said the oldest 28 saves
-- were not watched.
--
-- The shelf itself is capped at 200 cars (account_shelf_set, 0063), so the
-- alert row is raised to the same: 200 VINs and commas are 3,599
-- characters, under a 4096 cap. The column constraint is widened for every
-- row, but alert_subscribe (0029) keeps its own 1024-character refusal for
-- search params, which are a browse query string and never near it; only
-- the two watch-list writers accept the longer shape.
--
-- Existing watch-list rows of signed-in shoppers are re-pointed at their
-- whole shelf here, rather than waiting for the next star: the sync only
-- rewrites the row when the shelf changes, and the owner's shelf would
-- otherwise stay at 50 until he saved or removed a car.

alter table alert_subscriptions drop constraint alert_params_len;
alter table alert_subscriptions
  add constraint alert_params_len check (char_length(params) <= 4096);

-- 0060, with the list ceiling at two hundred.
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

  if not _authed
     or _email is null or _email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
     or char_length(_email) > 254
     or _params is null
     or _params !~ '^ids=([a-z0-9]{17}(,[a-z0-9]{17}){0,199})?$' then
    return jsonb_build_object('status', 'rejected');
  end if;

  select * into _row from alert_subscriptions
  where lower(email) = lower(_email) and params like 'ids=%'
  limit 1;

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

-- 0063, with the same ceiling. account_shelf_set and alert_watchlist_mine_set
-- call this and need no change.
create or replace function watchlist_ids_of(_cars jsonb)
returns text
language sql
immutable
as $$
  select 'ids=' || coalesce(string_agg(id, ',' order by saved_at desc), '')
    from (
      select id, max(saved_at) as saved_at
        from (
          select lower(e ->> 'id') as id, coalesce(e ->> 'savedAt', '') as saved_at
            from jsonb_array_elements(coalesce(_cars, '[]'::jsonb)) e
        ) raw
       where id ~ '^[a-z0-9]{17}$'
       group by id
       order by max(saved_at) desc
       limit 200
    ) newest;
$$;

update alert_subscriptions a
   set params = watchlist_ids_of(s.cars)
  from account_shelf s
  join auth.users u on u.id = s.user_id
 where lower(u.email) = lower(a.email)
   and a.params like 'ids=%'
   and a.params is distinct from watchlist_ids_of(s.cars);
