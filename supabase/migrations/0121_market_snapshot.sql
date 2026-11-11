-- /market reads a stored copy of market_index() instead of calling it.
--
-- 2026-11-11: a deploy of an unrelated change (the model spec pages) failed
-- with "market: market_index answered 500". /market is a static route, so
-- every build prerenders it; market_index() takes about 1 s on a quiet
-- database (0.6 s before 0119 added the national series); the nightly crawl
-- was running; and anon's 3 s statement limit did the rest. One slow query
-- on one page stopped the whole site from deploying.
--
-- The function is unchanged. pg_cron runs it four times a day, off the
-- publish slots, and stores the result in a one-row table that the page
-- reads by primary key in about 0.2 s. A run whose answer is not a market
-- (no date, no site series, no models) leaves the previous row standing,
-- which is the same rule the page applies to its own render.
--
-- Readable by anon: it is exactly what market_index() already returns to
-- anon.

create table if not exists market_snapshot (
  id          boolean primary key default true check (id),
  payload     jsonb not null,
  computed_at timestamptz not null default now()
);

alter table market_snapshot enable row level security;
drop policy if exists market_snapshot_read on market_snapshot;
create policy market_snapshot_read on market_snapshot for select to anon, authenticated using (true);
grant select on market_snapshot to anon, authenticated;

create or replace function refresh_market_snapshot()
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  _p jsonb;
begin
  _p := market_index();
  if _p is null or _p->>'asOf' is null
     or jsonb_typeof(_p->'site') <> 'array' or jsonb_array_length(_p->'site') < 2
     or jsonb_typeof(_p->'models') <> 'array' or jsonb_array_length(_p->'models') = 0 then
    return false;
  end if;
  insert into market_snapshot (id, payload, computed_at) values (true, _p, now())
  on conflict (id) do update set payload = excluded.payload, computed_at = excluded.computed_at;
  return true;
end;
$$;

revoke all on function refresh_market_snapshot() from public, anon, authenticated;

select cron.unschedule(jobid) from cron.job where jobname = 'refresh-market-snapshot';
select cron.schedule('refresh-market-snapshot', '35 1,7,13,19 * * *', $$select refresh_market_snapshot()$$);

select refresh_market_snapshot();
