-- Copy GitHub's answer into ops.workflow_dispatches before pg_net forgets it.
--
-- 0111 logs each publish-feed dispatch with its pg_net request id and copies
-- the HTTP status back from net._http_response on the NEXT dispatch. pg_net
-- keeps responses for 6 hours (pg_net.ttl, checked 2026-11-01) and the slots
-- are 00/04/08/20 UTC, so the 08:00 row's answer is gone by the time the
-- 20:00 dispatch looks for it. Observed on 2026-11-01: the 08:00 request got
-- a 204 at 08:00:00.056 (seen in net._http_response while it still existed),
-- yet ops.workflow_dispatches row 6 sat at status_code null, which reads as
-- "failed" to anyone chasing feed-audits' "publish dispatcher on time" check.
-- That check sends people to this table to tell "our dispatcher did not fire"
-- apart from "GitHub created the run late" — exactly the two cases the 08:00
-- slot produced that day — so the 08:00 row must not be blank every day.
--
-- Fix: a reconcile function, and a pg_cron job that runs it ten minutes after
-- each slot while the response is fresh. One UPDATE joining two tiny tables,
-- four times a day: no listings load. The reconcile inside dispatch_workflow
-- stays as a second chance for the 00/04/20 slots.
--
-- Rejected: raising pg_net.ttl to 13 h — it is a server setting
-- (ALTER SYSTEM / dashboard), keeps every other pg_net response twice as long
-- for no reason, and still fails the day pg_cron misses a slot. Rejected:
-- a 5-min interval job — 288 runs a day for an answer that arrives in under a
-- second and only matters four times.

create or replace function ops.reconcile_workflow_dispatches()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_n integer;
begin
  update ops.workflow_dispatches d
     set status_code = r.status_code,
         error = coalesce(r.error_msg,
                          case when r.status_code <> 204 then left(r.content::text, 300) end)
    from net._http_response r
   where r.id = d.request_id
     and d.status_code is null
     and d.error is null;
  get diagnostics v_n = row_count;
  return v_n;
end
$$;

revoke all on function ops.reconcile_workflow_dispatches() from public;
revoke all on function ops.reconcile_workflow_dispatches() from anon, authenticated;

select cron.unschedule(jobid) from cron.job where jobname = 'reconcile-workflow-dispatches';
select cron.schedule(
  'reconcile-workflow-dispatches',
  '10 0,4,8,20 * * *',
  $$select ops.reconcile_workflow_dispatches()$$
);
