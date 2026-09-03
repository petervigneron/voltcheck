-- Accounts: an email-and-password login, and what hangs off it.
--
-- Owner, 2026-09-03: "I don't think people will understand this, and it'll
-- be inconvenient. I think we ought to have a traditional email login."
-- "This" was the accountless design 0045 argued for — a pass that is an
-- emailed link, saved cars that live in one browser's localStorage, alerts
-- keyed to whichever address was typed into whichever form. Each piece was
-- defensible alone; together they meant a shopper with a laptop and a phone
-- had two shelves, two pass cookies and an explainer for why. The explainer
-- is the tell. 0045's cost accounting ("build an account system to stop
-- casual sharing") priced the wrong thing: the account is not for stopping
-- sharing, it is for the shopper to be one person on two devices.
--
-- ── What provides the login ────────────────────────────────────────────────
--
-- Supabase Auth (GoTrue), which the project already has and which web/ talks
-- to over plain fetch the way it talks to PostgREST, Stripe and Resend — no
-- SDK. It hashes passwords, rotates refresh tokens and mints the JWT that
-- PostgREST verifies; nothing in this schema stores a credential. Email
-- confirmation is required (mailer_autoconfirm=false, and unverified
-- sign-ins are off), so a JWT that carries an email is proof the address was
-- confirmed — every function below leans on that, and it is why none of
-- them sends a confirm mail of its own.
--
-- The mail itself does not go out through Supabase's mailer (2/hour, built
-- for development). Auth's Send Email hook POSTs to /api/auth/email on the
-- site, which sends through Resend from the same sender the alerts use.
--
-- ── What an account owns ───────────────────────────────────────────────────
--
--   account_shelf   the saved cars and saved searches — ONE row per user
--                   holding both lists as JSON, the same shape lib/saved.ts
--                   and lib/savedSearches.ts keep in localStorage. Replaced
--                   in place on every change. A row per car was considered
--                   and rejected: the shelf is a personal list of at most
--                   200 that is read and written whole, and per-car rows
--                   would buy nothing but churn (and a delete path per
--                   un-star). localStorage stays as the signed-out shelf
--                   and as the cache: on sign-in the two are merged.
--   pro_passes      unchanged — still keyed by the buyer's email. pro_mine()
--                   answers "is the signed-in address holding a pass", so a
--                   pass follows the account to every device without the
--                   access link. Checkout now requires sign-in and pins the
--                   account's address onto the Stripe session, so the pass
--                   always lands on the account that paid.
--   alert_subscriptions
--                   unchanged, still keyed by email; the *_mine functions
--                   create rows for the signed-in address already confirmed,
--                   because the address was confirmed at sign-up. The
--                   watch-list row (0060) is kept in step by account_shelf_set
--                   itself, so a star on any device updates it.
--
-- ── Posture ────────────────────────────────────────────────────────────────
--
-- account_shelf: RLS with auth.uid() = user_id, grants to `authenticated`
-- only. Every function is security definer and reads its identity from
-- auth.uid() / auth.jwt(), never from an argument — a caller cannot name
-- another user. Nothing here is granted to anon.

-- ── The shelf ──────────────────────────────────────────────────────────────

create table account_shelf (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  cars       jsonb not null default '[]'::jsonb,
  searches   jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  -- The same caps lib/saved.ts (200) and lib/savedSearches.ts (100) apply.
  constraint shelf_cars_shape     check (jsonb_typeof(cars) = 'array' and jsonb_array_length(cars) <= 200),
  constraint shelf_searches_shape check (jsonb_typeof(searches) = 'array' and jsonb_array_length(searches) <= 100),
  -- 200 entries × (17-char VIN + title + price + timestamp) is ~40 KB; this
  -- is a ceiling against a client posting something that is not a shelf.
  constraint shelf_size check (pg_column_size(cars) + pg_column_size(searches) <= 262144)
);

alter table account_shelf enable row level security;

create policy shelf_own_select on account_shelf for select to authenticated using (auth.uid() = user_id);
create policy shelf_own_insert on account_shelf for insert to authenticated with check (auth.uid() = user_id);
create policy shelf_own_update on account_shelf for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy shelf_own_delete on account_shelf for delete to authenticated using (auth.uid() = user_id);

grant select, insert, update, delete on account_shelf to authenticated;

/** The signed-in user's shelf, or empty lists when there is none yet. */
create or replace function account_shelf_get()
returns jsonb
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select coalesce(
    (select jsonb_build_object('cars', cars, 'searches', searches, 'updated_at', updated_at)
       from account_shelf where user_id = auth.uid()),
    jsonb_build_object('cars', '[]'::jsonb, 'searches', '[]'::jsonb, 'updated_at', null));
$$;

/** The "ids=…" value the free price-drop alert (0060) watches, built from a
 *  shelf: the newest fifty VIN-shaped ids, newest first, de-duplicated —
 *  the same cut lib/watchlist.ts makes on the client. */
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
       limit 50
    ) newest;
$$;

/** Replace the signed-in user's shelf. Also re-points the free price-drop
 *  alert (0060, the "ids=…" row for this address) at the newest fifty cars,
 *  when the shopper has one — so a star on the phone changes what the
 *  sender watches, without the phone knowing whether alerts are on. */
create or replace function account_shelf_set(_cars jsonb, _searches jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  _uid   uuid := auth.uid();
  _email text := auth.jwt() ->> 'email';
begin
  if _uid is null then
    return jsonb_build_object('status', 'unauthenticated');
  end if;
  if _cars is null or jsonb_typeof(_cars) <> 'array' or jsonb_array_length(_cars) > 200
     or _searches is null or jsonb_typeof(_searches) <> 'array' or jsonb_array_length(_searches) > 100 then
    return jsonb_build_object('status', 'rejected');
  end if;

  insert into account_shelf (user_id, cars, searches, updated_at)
  values (_uid, _cars, _searches, now())
  on conflict (user_id) do update
    set cars = excluded.cars, searches = excluded.searches, updated_at = now();

  if _email is not null then
    update alert_subscriptions
       set params = watchlist_ids_of(_cars)
     where lower(email) = lower(_email) and params like 'ids=%';
  end if;

  return jsonb_build_object('status', 'ok');
end;
$$;

revoke all on function account_shelf_get() from public;
revoke all on function account_shelf_set(jsonb, jsonb) from public;
grant execute on function account_shelf_get() to authenticated;
grant execute on function account_shelf_set(jsonb, jsonb) to authenticated;

-- ── The pass, by account ───────────────────────────────────────────────────

/** Same answer shape as pro_check (0045), for the signed-in address. Still
 *  never returns the email — the caller already knows it. */
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
  select * into _row from pro_passes where lower(email) = lower(_email);
  if not found or _row.expires_at <= now() then
    return jsonb_build_object('active', false);
  end if;
  return jsonb_build_object(
    'active', true, 'tier', _row.tier, 'expires_at', _row.expires_at);
end;
$$;

revoke all on function pro_mine() from public;
grant execute on function pro_mine() to authenticated;

-- ── Alerts, by account ─────────────────────────────────────────────────────

/** Is the free price-drop alert on for the signed-in address? */
create or replace function alert_watchlist_mine()
returns boolean
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select exists (
    select 1 from alert_subscriptions
     where lower(email) = lower(auth.jwt() ->> 'email')
       and params like 'ids=%'
       and confirmed_at is not null);
$$;

/** Turn the free price-drop alert on or off for the signed-in address. On:
 *  a row built from the account's shelf, confirmed at once (the address was
 *  confirmed at sign-up). Off: the row is deleted. Idempotent both ways. */
create or replace function alert_watchlist_mine_set(_on boolean)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  _email text := auth.jwt() ->> 'email';
  _ids   text;
  _row   alert_subscriptions%rowtype;
begin
  if _email is null then
    return jsonb_build_object('status', 'unauthenticated');
  end if;

  if not coalesce(_on, false) then
    delete from alert_subscriptions
     where lower(email) = lower(_email) and params like 'ids=%';
    return jsonb_build_object('status', 'removed');
  end if;

  select watchlist_ids_of(s.cars) into _ids from account_shelf s where s.user_id = auth.uid();
  _ids := coalesce(_ids, 'ids=');

  select * into _row from alert_subscriptions
   where lower(email) = lower(_email) and params like 'ids=%'
   limit 1;

  if found then
    update alert_subscriptions
       set params = _ids, confirmed_at = coalesce(confirmed_at, now())
     where id = _row.id;
    return jsonb_build_object('status', 'updated');
  end if;

  insert into alert_subscriptions (email, params, label, confirmed_at)
  values (_email, _ids, 'your saved cars', now());
  return jsonb_build_object('status', 'created');
end;
$$;

/** The Pro standing order and saved-search alerts for a signed-in address:
 *  alert_subscribe (0029) without the secret and without the confirm round
 *  trip. Same twenty-search cap. Returns 'created', 'already_confirmed' or
 *  'rejected', and never a token — there is nothing left to confirm. */
create or replace function alert_subscribe_mine(_params text, _label text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  _email text := auth.jwt() ->> 'email';
  _row   alert_subscriptions%rowtype;
begin
  if _email is null then
    return jsonb_build_object('status', 'unauthenticated');
  end if;
  if _params is null or char_length(_params) > 1024
     or (_label is not null and char_length(_label) > 200) then
    return jsonb_build_object('status', 'rejected');
  end if;
  if (select count(*) from alert_subscriptions where lower(email) = lower(_email)) >= 20 then
    return jsonb_build_object('status', 'rejected');
  end if;

  insert into alert_subscriptions (email, params, label, confirmed_at)
  values (_email, _params, _label, now())
  on conflict (lower(email), params) do nothing
  returning * into _row;
  if found then
    return jsonb_build_object('status', 'created', 'unsubscribe_token', _row.unsubscribe_token);
  end if;

  select * into _row from alert_subscriptions
   where lower(email) = lower(_email) and params = _params;
  if _row.confirmed_at is not null then
    return jsonb_build_object('status', 'already_confirmed');
  end if;
  -- A row that existed unconfirmed (typed into a form before signing up)
  -- is confirmed now: the address has since proved itself.
  update alert_subscriptions set confirmed_at = now() where id = _row.id;
  return jsonb_build_object('status', 'created', 'unsubscribe_token', _row.unsubscribe_token);
end;
$$;

revoke all on function alert_watchlist_mine() from public;
revoke all on function alert_watchlist_mine_set(boolean) from public;
revoke all on function alert_subscribe_mine(text, text) from public;
grant execute on function alert_watchlist_mine() to authenticated;
grant execute on function alert_watchlist_mine_set(boolean) to authenticated;
grant execute on function alert_subscribe_mine(text, text) to authenticated;
