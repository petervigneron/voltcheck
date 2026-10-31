-- 0111: fire the browse-feed publish from pg_cron, not from GitHub's cron.
--
-- The alert emails ride on publish-feed.yml (its `alerts` job runs
-- send-alerts.mjs after every publish), and the owner ruled on 2026-10-30 that
-- an alert has to go out in the publish a car lands in. The publish itself
-- was then the lag, and not for anything in the workflow: GitHub does not
-- create the scheduled run on time. Measured 2026-10-16..30, every scheduled
-- workflow in the repo, cron slot vs the run's createdAt:
--
--   publish-feed.yml   0 0,4,8,20   median 3.2h late, max 7.5h, 45 of 61
--                                   slots delivered (the 00:00 slot arrives
--                                   at ~04:05 and the 04:00 one is dropped)
--   nightly.yml        30 10        median 4.9h late, 3.3h..6.5h
--   alerts.yml         30 18        median 3.3h late, 2.3h..4.4h
--   feed-audits.yml    15 */6       median 4.3h late, 55 of 61 delivered
--   recheck-returning  */30         11..14 of 48 a day delivered
--
-- and createdAt → startedAt was 0 minutes for every one of 447 runs. So the
-- repository's own concurrency groups and the account's job limit are not
-- what is late — a run that does not exist yet cannot be queued behind
-- anything — and the delay is the same whether 0 or 5 of our runs are in
-- progress at the cron minute (median 261 vs 268 min). What GitHub documents
-- is only that `schedule` "can be delayed during periods of high load", with
-- no ceiling and no guarantee; what we can measure is that for this repo the
-- floor is about two hours and the typical is four. Earlier in the repo's
-- life (rolling-crawl.yml's header, 2026-08-26) a */30 cron went from ~24
-- runs a day to ~2 without any failure being reported. Not a bug to fix on
-- our side; a service to stop depending on for anything with a deadline.
--
-- pg_cron here, by contrast, is punctual: the hourly `vacuum listings` job
-- (0049/0050) started within 0.03–0.2 s of :10:00 on all 48 of the last 48
-- hours. So the clock moves into the database and the database makes ONE
-- HTTPS call per slot — POST .../actions/workflows/publish-feed.yml/dispatches
-- — through pg_net, which is asynchronous and costs the instance nothing a
-- shopper could notice. This adds no query load: the walk still happens on a
-- GitHub runner, same as before; only the trigger moved.
--
-- The token is a fine-grained GitHub PAT with Actions read+write on
-- petervigneron/voltcheck and nothing else, stored in Supabase Vault under the
-- name `github_actions_dispatch`. It is NOT in this file and never will be;
-- the owner wrote it straight into Vault from the dashboard's SQL editor.
-- Rotation: `select vault.update_secret(id, '<new token>') from vault.secrets
-- where name = 'github_actions_dispatch'`. Its expiry date is noted in
-- docs/github-dispatch-token.md (gitignored).
--
-- Why a schema of its own: anything in `public` is a PostgREST endpoint for
-- anon. `ops` is not exposed, the function is security definer (it has to
-- read vault.decrypted_secrets) and execute is revoked from the API roles,
-- so the token never has a path to the network except the one call below.
--
-- Rejected:
--   * Vercel Cron hitting a small route that dispatches — needs the token in
--     Vercel's env, a web/ deploy to ship, and Hobby-plan crons are only
--     promised "within the hour"; pg_cron is already here and already exact.
--   * The gh CLI's OAuth token in Vault — it carries repo+workflow+gist across
--     every repository the owner has; far too broad to sit in a database that
--     several sessions read with the service role.
--   * Dropping publish-feed.yml's `schedule` entries — kept, as the backstop
--     for the day this dispatcher or its token dies; the workflow's gate now
--     makes a scheduled run yield when a dispatch fired in the last 4 h, so
--     keeping them costs no extra walk while this works (see the workflow).
--
-- Observability without the API: ops.workflow_dispatches logs every attempt
-- with the pg_net request id, and the next attempt copies the status code
-- back from net._http_response (pg_net keeps responses ~6 h; our slots are
-- ≤12 h apart, so the 08:00→20:00 reconciliation can come back null — that
-- is "unknown", not "failed"). feed-audits.yml checks the thing that matters
-- from the outside: that a workflow_dispatch run of publish-feed.yml was
-- created within 15 minutes of the last slot.

create extension if not exists pg_net with schema extensions;

create schema if not exists ops;
revoke all on schema ops from public;
revoke all on schema ops from anon, authenticated;

create table if not exists ops.workflow_dispatches (
  id           bigint generated always as identity primary key,
  workflow     text        not null,
  requested_at timestamptz not null default now(),
  request_id   bigint,       -- net.http_request_queue id; null when nothing was sent
  status_code  int,          -- copied from net._http_response on the next call
  error        text          -- why nothing was sent, or the non-204 response body
);

create or replace function ops.dispatch_workflow(p_workflow text, p_ref text default 'main')
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token text;
  v_req   bigint;
begin
  -- Settle earlier attempts first, while pg_net still holds their responses.
  update ops.workflow_dispatches d
     set status_code = r.status_code,
         error = coalesce(r.error_msg,
                          case when r.status_code <> 204 then left(r.content::text, 300) end)
    from net._http_response r
   where r.id = d.request_id
     and d.status_code is null
     and d.error is null;

  select decrypted_secret into v_token
    from vault.decrypted_secrets
   where name = 'github_actions_dispatch';

  if v_token is null then
    insert into ops.workflow_dispatches (workflow, error)
    values (p_workflow, 'no Vault secret named github_actions_dispatch');
    return null;
  end if;

  select net.http_post(
    url     := format('https://api.github.com/repos/petervigneron/voltcheck/actions/workflows/%s/dispatches', p_workflow),
    body    := jsonb_build_object('ref', p_ref),
    headers := jsonb_build_object(
      'Authorization',        'Bearer ' || v_token,
      'Accept',               'application/vnd.github+json',
      'X-GitHub-Api-Version', '2022-11-28',
      'Content-Type',         'application/json',
      'User-Agent',           'voltcheck-pg-cron'),
    timeout_milliseconds := 15000
  ) into v_req;

  insert into ops.workflow_dispatches (workflow, request_id)
  values (p_workflow, v_req);
  return v_req;
end
$$;

revoke all on function ops.dispatch_workflow(text, text) from public;
revoke all on function ops.dispatch_workflow(text, text) from anon, authenticated;

-- Same four slots publish-feed.yml asked GitHub for; GitHub now only backstops.
select cron.unschedule(jobid) from cron.job where jobname = 'dispatch-publish-feed';
select cron.schedule(
  'dispatch-publish-feed',
  '0 0,4,8,20 * * *',
  $$select ops.dispatch_workflow('publish-feed.yml')$$
);
