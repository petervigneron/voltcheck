-- Paid access: a Voltcheck Pro pass.
--
-- This is the first table that decides whether someone has paid, and it is
-- deliberately the smallest thing that can do that job.
--
-- ── No accounts, no passwords, no auth library ─────────────────────────────
--
-- The pass IS a capability token, mailed to the address that paid — the same
-- shape as 0029's confirm and unsubscribe tokens, for the same reason: the
-- token is unguessable and scoped to exactly one row, so possessing it is the
-- whole proof. The alternative was password auth, which would mean sessions,
-- hashing, reset flows and a new dependency in web/ — a large permanent
-- surface, carrying the worst class of data we could hold, to gate four
-- features. A credential we never store cannot leak.
--
-- The cost of this choice, stated plainly: anyone holding the link holds the
-- pass, and a forwarded email is a shared pass. That is acceptable here.
-- These are $2.99 and $9 passes; building an account system to stop casual
-- sharing would cost more than the sharing does, and every honest buyer would
-- pay for it in friction.
--
-- ── Non-recurring is a schema decision, not just a pricing one ─────────────
--
-- expires_at is a fixed timestamp written once at purchase. There is no
-- subscription state machine, no renewal, no dunning, no cancellation path,
-- because there is nothing to cancel: a pass either has time left or it does
-- not. This is the pricing decision (docs/MONETIZATION.md §2) made structural
-- — the schema cannot express "quietly kept charging him," so the product
-- cannot do it by accident.
--
-- ── PII posture: identical to 0029, for identical reasons ──────────────────
--
-- This holds shopper email addresses. RLS on, ZERO policies, ZERO table
-- grants — anon has no read path to this table at all. Every public operation
-- goes through the security-definer RPCs below, and none of them can read an
-- arbitrary row back. pro_check answers only about the token it was handed,
-- and answers with the entitlement, never the address.
--
-- The grant RPC is the one that mints access, so it is gated on a shared
-- secret whose SHA-256 is pinned here the same way 0029 pins the subscribe
-- secret and the revalidate route pins its own. Plaintext lives only in
-- Vercel's env (STRIPE_GRANT_SECRET) and in the local, gitignored
-- docs/pro-grant-secret.txt. Without it the RPC refuses; with it, only our
-- Stripe webhook — which has already verified Stripe's signature — can turn a
-- payment into access.

create table pro_passes (
  id                uuid primary key default gen_random_uuid(),
  email             text not null,
  -- The capability. Mailed to the buyer; presented back as a cookie.
  access_token      uuid not null default gen_random_uuid(),
  -- 'week' | 'quarter' — matches the two tiers in §2. Text rather than an
  -- enum so adding a tier is a code change, not a migration that locks the
  -- table while the nightly is running.
  tier              text not null,
  expires_at        timestamptz not null,
  -- Stripe's session id is the idempotency key. Stripe RETRIES webhooks —
  -- delivery is at-least-once, not exactly-once — so without a unique
  -- constraint here a retry silently grants a second pass for one payment.
  stripe_session_id text not null,
  stripe_customer_id text,
  amount_cents      int,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint pro_email_shape check (email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' and char_length(email) <= 254),
  constraint pro_tier_known  check (tier in ('week', 'quarter')),
  constraint pro_amount_sane check (amount_cents is null or amount_cents between 0 and 100000)
);

create unique index pro_passes_token   on pro_passes (access_token);
create unique index pro_passes_session on pro_passes (stripe_session_id);
-- One live pass per address: a repeat purchase EXTENDS rather than stacks
-- (see pro_grant). Lower-cased so Alice@ and alice@ are one person.
create unique index pro_passes_email   on pro_passes (lower(email));

alter table pro_passes enable row level security;
-- No policies, on purpose. Nothing reaches this table except the RPCs below.

revoke all on pro_passes from anon, authenticated;

-- ── Grant: turn a verified Stripe payment into access ──────────────────────
--
-- Returns jsonb rather than a table, matching alert_subscribe: it keeps OUT
-- parameters from colliding with column names, and lets the function answer
-- with a quiet status instead of an error a prober can read.
--
-- Extends an existing pass rather than creating a second one — buying a
-- 90-day pass while eleven days remain should leave 101 days, not two passes
-- and a question about which one counts. Extension runs from the LATER of now
-- and the current expiry, so a lapsed pass restarts today rather than
-- back-dating time the buyer could never use.
create or replace function pro_grant(
  _secret       text,
  _email        text,
  _tier         text,
  _days         int,
  _session_id   text,
  _customer_id  text default null,
  _amount_cents int default null
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  _row  pro_passes%rowtype;
  _base timestamptz;
begin
  if encode(sha256(convert_to(coalesce(_secret, ''), 'utf8')), 'hex')
     <> '19883e470f2031dd521e84c8bb8917d49e3e1f785e5f2b9cc0455ac8a04c479a' then
    return jsonb_build_object('status', 'denied');
  end if;

  if _email is null or _email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
     or char_length(_email) > 254
     or _tier not in ('week', 'quarter')
     or _days is null or _days < 1 or _days > 400
     or _session_id is null or char_length(_session_id) > 255 then
    return jsonb_build_object('status', 'rejected');
  end if;

  -- Idempotency FIRST. Stripe webhook delivery is at-least-once, so a retry
  -- must return the same token rather than mint a second pass or extend a
  -- second time. Everything below this point runs at most once per payment.
  select * into _row from pro_passes where stripe_session_id = _session_id;
  if found then
    return jsonb_build_object(
      'status', 'replay',
      'access_token', _row.access_token,
      'expires_at', _row.expires_at);
  end if;

  select * into _row from pro_passes where lower(email) = lower(_email);
  if found then
    _base := greatest(now(), _row.expires_at);
    update pro_passes
       set expires_at         = _base + make_interval(days => _days),
           tier               = _tier,
           stripe_session_id  = _session_id,
           stripe_customer_id = coalesce(_customer_id, stripe_customer_id),
           amount_cents       = _amount_cents,
           updated_at         = now()
     where id = _row.id
     returning * into _row;
    return jsonb_build_object(
      'status', 'extended',
      'access_token', _row.access_token,
      'expires_at', _row.expires_at);
  end if;

  insert into pro_passes (email, tier, expires_at, stripe_session_id,
                          stripe_customer_id, amount_cents)
  values (_email, _tier, now() + make_interval(days => _days), _session_id,
          _customer_id, _amount_cents)
  returning * into _row;

  return jsonb_build_object(
    'status', 'created',
    'access_token', _row.access_token,
    'expires_at', _row.expires_at);
end;
$$;

-- ── Check: is this token good right now? ───────────────────────────────────
--
-- No secret: the token IS the capability. Deliberately returns no email — a
-- leaked token should cost the pass, not the address behind it. An unknown
-- token and an expired one get the same answer, so the response cannot be
-- used to test whether a token ever existed.
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
  if not found or _row.expires_at <= now() then
    return jsonb_build_object('active', false);
  end if;
  return jsonb_build_object(
    'active', true, 'tier', _row.tier, 'expires_at', _row.expires_at);
end;
$$;

-- ── Recover: re-send the access link to the address that paid ──────────────
--
-- Secret-gated even though it looks harmless, for 0029's reason: ungated this
-- is an oracle telling any caller whether an address has ever bought, and a
-- way to spray mail at a victim. Our route holds the secret; the token still
-- only ever travels to the address on the row.
create or replace function pro_recover(_secret text, _email text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  _row pro_passes%rowtype;
begin
  if encode(sha256(convert_to(coalesce(_secret, ''), 'utf8')), 'hex')
     <> '19883e470f2031dd521e84c8bb8917d49e3e1f785e5f2b9cc0455ac8a04c479a' then
    return jsonb_build_object('status', 'denied');
  end if;
  select * into _row from pro_passes
   where lower(email) = lower(_email) and expires_at > now();
  if not found then
    return jsonb_build_object('status', 'none');
  end if;
  return jsonb_build_object(
    'status', 'found',
    'access_token', _row.access_token,
    'expires_at', _row.expires_at);
end;
$$;

revoke all on function pro_grant(text, text, text, int, text, text, int) from public;
revoke all on function pro_recover(text, text) from public;
grant execute on function pro_grant(text, text, text, int, text, text, int) to anon;
grant execute on function pro_recover(text, text) to anon;
grant execute on function pro_check(uuid) to anon;

comment on table pro_passes is
  'Paid Pro access. The access_token IS the credential (no accounts, no passwords) and expires_at is fixed at purchase (no recurring billing). Reachable only through pro_grant / pro_check / pro_recover; anon has no table grant. See docs/MONETIZATION.md sections 1-2.';
