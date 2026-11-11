-- The paid data tier: an API key that renews monthly.
--
-- Owner, 2026-11-10/11: "I'm happy to have a paid data tier", "$29/month
-- sounds good", and — asked whether the key should renew — "Yes, auto-renew".
-- The site had earned $3 in its life and had ~10 browsers in 90 days; a
-- shopper pass cannot pay the bills without an audience, and a data buyer
-- does not need one.
--
-- This is deliberately NOT pro_passes with a longer expiry. 0045's header
-- says its schema "cannot express 'quietly kept charging him'", and that is
-- still right for shoppers: a pass has one expires_at fixed at purchase.
-- A renewing key needs the state a pass was built to lack, so it gets its
-- own table and the pass table stays incapable of recurring.
--
-- THE SOURCE OF TRUTH IS STRIPE, AND THIS TABLE IS A CACHE OF IT. The only
-- webhook event the endpoint is subscribed to is checkout.session.completed,
-- so renewals and cancellations are not pushed to us. Instead the row holds
-- the period the last check saw, and when a key is presented after that
-- period has ended the server asks Stripe for the subscription and writes
-- the answer back with data_key_sync (web/lib/dataKey.ts). A renewal is
-- therefore discovered on the first request after it happens, a lapse the
-- same way, and nothing depends on a webhook arriving. If the endpoint is
-- later subscribed to customer.subscription.* the handler syncs on those
-- too, and this path simply finds nothing to do.
--
-- status:
--   active     paid up; renews at current_period_end
--   canceling  the holder cancelled; the key works until current_period_end
--              and then is not renewed
--   ended      the subscription is over (cancelled and run out, or unpaid)
--
-- The key is stored in the clear, like pro_passes.access_token: it has to be
-- shown again on /account, and the table is readable by no public role —
-- every door is a security-definer function below. Two uuids of randomness
-- (244 bits) rather than gen_random_bytes, so nothing depends on pgcrypto's
-- schema being on the search path.
--
-- One row per address. Buying again after a subscription ended revives the
-- same row and KEEPS the key, so a customer who lapses and returns does not
-- have to redeploy a credential.
create table data_keys (
  id                      uuid primary key default gen_random_uuid(),
  email                   text not null,
  api_key                 text not null default (
    'cev_' || replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')),
  status                  text not null default 'active',
  current_period_end      timestamptz not null,
  stripe_subscription_id  text not null,
  stripe_customer_id      text,
  -- The checkout session that created or revived the row: the idempotency
  -- key for the webhook, which Stripe delivers at least once.
  stripe_session_id       text not null,
  -- When Stripe was last asked. The server will not ask again within a few
  -- minutes, so a lapsed key hammering the API costs one Stripe call, not one
  -- per request.
  checked_at              timestamptz not null default now(),
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  constraint data_key_email_shape check (email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' and char_length(email) <= 254),
  constraint data_key_status_known check (status in ('active', 'canceling', 'ended')),
  constraint data_key_shape check (api_key ~ '^cev_[0-9a-f]{64}$')
);

create unique index data_keys_key     on data_keys (api_key);
create unique index data_keys_email   on data_keys (lower(email));
create unique index data_keys_session on data_keys (stripe_session_id);
create index        data_keys_sub     on data_keys (stripe_subscription_id);

alter table data_keys enable row level security;
revoke all on data_keys from public, anon, authenticated;

-- What a caller is told about a row. The subscription id travels only to
-- callers holding the grant secret (the web server), never to a browser.
create or replace function data_key_public(_row data_keys)
returns jsonb
language sql
immutable
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'found', true,
    'api_key', _row.api_key,
    'status', _row.status,
    'current_period_end', _row.current_period_end);
$$;
revoke all on function data_key_public(data_keys) from public, anon, authenticated;

-- Mint or revive a key for a paid checkout. The web server calls this from
-- the verified webhook with the same secret pro_grant takes (0045: the
-- function pins the secret's sha256; the secret itself is STRIPE_GRANT_SECRET
-- on Vercel and never in the repo).
create or replace function data_key_grant(
  _secret          text,
  _email           text,
  _session_id      text,
  _subscription_id text,
  _customer_id     text,
  _period_end      timestamptz
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  _row data_keys%rowtype;
begin
  if encode(sha256(convert_to(coalesce(_secret, ''), 'utf8')), 'hex')
     <> '19883e470f2031dd521e84c8bb8917d49e3e1f785e5f2b9cc0455ac8a04c479a' then
    return jsonb_build_object('status', 'denied');
  end if;

  if _email is null or _email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
     or char_length(_email) > 254
     or _session_id is null or char_length(_session_id) > 255
     or _subscription_id is null or _subscription_id !~ '^sub_[A-Za-z0-9]{1,250}$'
     or _period_end is null or _period_end < now() - interval '1 day'
     or _period_end > now() + interval '400 days' then
    return jsonb_build_object('status', 'rejected');
  end if;

  -- Idempotency first: a webhook retry returns the row it already made.
  select * into _row from data_keys where stripe_session_id = _session_id;
  if found then
    return data_key_public(_row) || jsonb_build_object('status', 'replay');
  end if;

  select * into _row from data_keys where lower(email) = lower(_email);
  if found then
    update data_keys
       set status                 = 'active',
           current_period_end     = _period_end,
           stripe_subscription_id = _subscription_id,
           stripe_customer_id     = coalesce(_customer_id, stripe_customer_id),
           stripe_session_id      = _session_id,
           checked_at             = now(),
           updated_at             = now()
     where id = _row.id
     returning * into _row;
    return data_key_public(_row) || jsonb_build_object('status', 'revived');
  end if;

  insert into data_keys (email, current_period_end, stripe_subscription_id, stripe_customer_id, stripe_session_id)
  values (_email, _period_end, _subscription_id, _customer_id, _session_id)
  returning * into _row;
  return data_key_public(_row) || jsonb_build_object('status', 'created');
end;
$$;

-- Find a row by key or by address, for the server: includes the subscription
-- id it needs to ask Stripe. Secret-guarded for that reason.
create or replace function data_key_lookup(_secret text, _key text default null, _email text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
stable
as $$
declare
  _row data_keys%rowtype;
begin
  if encode(sha256(convert_to(coalesce(_secret, ''), 'utf8')), 'hex')
     <> '19883e470f2031dd521e84c8bb8917d49e3e1f785e5f2b9cc0455ac8a04c479a' then
    return jsonb_build_object('found', false, 'denied', true);
  end if;
  if _key is not null and _key ~ '^cev_[0-9a-f]{64}$' then
    select * into _row from data_keys where api_key = _key;
  elsif _email is not null then
    select * into _row from data_keys where lower(email) = lower(_email);
  else
    return jsonb_build_object('found', false);
  end if;
  if not found then
    return jsonb_build_object('found', false);
  end if;
  return data_key_public(_row) || jsonb_build_object(
    'email', _row.email,
    'stripe_subscription_id', _row.stripe_subscription_id,
    'checked_at', _row.checked_at);
end;
$$;

-- Write back what Stripe said about a subscription. Called after the server
-- has asked Stripe (a lapsed period, a cancel, a resume) and, if the webhook
-- endpoint is ever subscribed to them, on customer.subscription.* events.
-- A null _period_end leaves the stored one alone: an ended subscription's
-- last period is still the right "ended on" date.
create or replace function data_key_sync(
  _secret          text,
  _subscription_id text,
  _status          text,
  _period_end      timestamptz default null
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  _row data_keys%rowtype;
begin
  if encode(sha256(convert_to(coalesce(_secret, ''), 'utf8')), 'hex')
     <> '19883e470f2031dd521e84c8bb8917d49e3e1f785e5f2b9cc0455ac8a04c479a' then
    return jsonb_build_object('found', false, 'denied', true);
  end if;
  if _status not in ('active', 'canceling', 'ended')
     or (_period_end is not null and _period_end > now() + interval '400 days') then
    return jsonb_build_object('found', false, 'rejected', true);
  end if;
  update data_keys
     set status             = _status,
         current_period_end = coalesce(_period_end, current_period_end),
         checked_at         = now(),
         updated_at         = now()
   where stripe_subscription_id = _subscription_id
   returning * into _row;
  if not found then
    return jsonb_build_object('found', false);
  end if;
  return data_key_public(_row) || jsonb_build_object(
    'email', _row.email,
    'stripe_subscription_id', _row.stripe_subscription_id,
    'checked_at', _row.checked_at);
end;
$$;

-- The signed-in account's own key, for /account. The address comes from the
-- verified JWT, as in pro_mine (0063).
create or replace function data_key_mine()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
stable
as $$
declare
  _email text := auth.jwt() ->> 'email';
  _row   data_keys%rowtype;
begin
  if _email is null then
    return jsonb_build_object('found', false);
  end if;
  select * into _row from data_keys where lower(email) = lower(_email);
  if not found then
    return jsonb_build_object('found', false);
  end if;
  return data_key_public(_row);
end;
$$;

revoke all on function data_key_grant(text, text, text, text, text, timestamptz) from public;
revoke all on function data_key_lookup(text, text, text) from public;
revoke all on function data_key_sync(text, text, text, timestamptz) from public;
revoke all on function data_key_mine() from public;
-- The three secret-guarded functions are callable with the anon key because
-- that is the only Supabase credential web/ holds (0045's posture); the
-- secret is what authorises them.
grant execute on function data_key_grant(text, text, text, text, text, timestamptz) to anon, authenticated;
grant execute on function data_key_lookup(text, text, text) to anon, authenticated;
grant execute on function data_key_sync(text, text, text, timestamptz) to anon, authenticated;
grant execute on function data_key_mine() to authenticated;
