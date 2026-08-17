-- Consumer alerts: an email address plus a saved browse search. The nightly
-- sender (web/scripts/send-alerts.mjs, run from GitHub Actions with the
-- service role) matches each confirmed subscription against the card index
-- and mails new listings and price cuts.
--
-- PII posture: this is the first table holding shopper PII. No anon read
-- path exists at all — RLS on, zero policies, zero table grants; every
-- public-facing operation goes through the three security-definer RPCs
-- below, none of which can read a row back. Unsubscribe DELETES the row
-- rather than flagging it: an address we no longer have is the only kind we
-- can't leak.
--
-- Abuse posture. web/ deliberately holds no service-role key (0027), so the
-- subscribe RPC must be callable with the anon key — but double opt-in is
-- theater if any anon caller can mint a subscription AND receive its confirm
-- token (subscribe the victim, confirm it yourself, spam follows). So
-- alert_subscribe hands the confirm token only to callers presenting the
-- site's subscribe secret — the SHA-256 of which is inlined here the same
-- way the ingest gateway pins its token; the plaintext lives only in
-- Vercel's env (ALERTS_SUBSCRIBE_SECRET). Without the secret the RPC still
-- answers, but tokenlessly, and no confirm email ever goes out. Repeat
-- subscribes re-issue the token at most once per 24h (confirm_sent_at), so
-- the worst an abuser with the public site can do to a victim is one confirm
-- email a day per distinct search, and confirming is still the victim's.
-- The confirm and unsubscribe RPCs need no secret: their token IS the
-- capability, unguessable and scoped to one row.

create table alert_subscriptions (
  id                uuid primary key default gen_random_uuid(),
  email             text not null,
  -- The browse URL's query string, verbatim ("body=suv&maxPrice=30000").
  -- Matched by the same code that filters the browse grid
  -- (web/lib/listings/match.ts), so an alert can never fire on a car the
  -- shopper's own search wouldn't show.
  params            text not null,
  -- Human description built from the filters at signup ("SUVs · Under
  -- $30,000"), for the email subject. Display only, never parsed.
  label             text,
  confirm_token     uuid not null default gen_random_uuid(),
  unsubscribe_token uuid not null default gen_random_uuid(),
  confirmed_at      timestamptz,
  confirm_sent_at   timestamptz,
  created_at        timestamptz not null default now(),
  last_sent_at      timestamptz,
  constraint alert_email_shape check (email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' and char_length(email) <= 254),
  constraint alert_params_len check (char_length(params) <= 1024),
  constraint alert_label_len check (label is null or char_length(label) <= 200)
);

-- One row per (address, search); a repeat signup re-issues the confirm
-- token instead of stacking duplicates.
create unique index alert_subs_email_params on alert_subscriptions (lower(email), params);
-- The sender's read: confirmed rows only.
create index alert_subs_confirmed on alert_subscriptions (confirmed_at) where confirmed_at is not null;

alter table alert_subscriptions enable row level security;
revoke all on alert_subscriptions from public, anon, authenticated;

create or replace function alert_subscribe(_email text, _params text, _label text, _secret text)
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

  -- Same shape checks as the table constraints, but as a quiet refusal
  -- instead of an error a prober can learn from.
  if _email is null or _email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
     or char_length(_email) > 254
     or _params is null or char_length(_params) > 1024
     or (_label is not null and char_length(_label) > 200) then
    return jsonb_build_object('status', 'rejected');
  end if;

  -- A mailbox is not a filing cabinet: cap searches per address.
  if (select count(*) from alert_subscriptions where lower(email) = lower(_email)) >= 20 then
    return jsonb_build_object('status', 'rejected');
  end if;

  insert into alert_subscriptions (email, params, label)
  values (_email, _params, _label)
  on conflict (lower(email), params) do nothing;

  select * into _row from alert_subscriptions
  where lower(email) = lower(_email) and params = _params;

  if _row.confirmed_at is not null then
    return jsonb_build_object('status', 'already_confirmed');
  end if;

  if not _authed then
    return jsonb_build_object('status', 'pending');
  end if;

  -- Token goes out at most once per 24h per subscription — the re-subscribe
  -- path is also the "resend my confirmation email" path.
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

create or replace function alert_confirm(_token uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update alert_subscriptions
  set confirmed_at = coalesce(confirmed_at, now())
  where confirm_token = _token;
  return found;
end;
$$;

create or replace function alert_unsubscribe(_token uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  delete from alert_subscriptions where unsubscribe_token = _token;
  return found;
end;
$$;

revoke execute on function alert_subscribe(text, text, text, text) from public;
revoke execute on function alert_confirm(uuid) from public;
revoke execute on function alert_unsubscribe(uuid) from public;
grant execute on function alert_subscribe(text, text, text, text) to anon, authenticated;
grant execute on function alert_confirm(uuid) to anon, authenticated;
grant execute on function alert_unsubscribe(uuid) to anon, authenticated;
