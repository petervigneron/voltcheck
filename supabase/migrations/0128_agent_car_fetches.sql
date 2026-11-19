-- Which cars AI assistants look up for the people asking them.
--
-- 0127 counts assistant fetches by assistant and page kind and keeps nothing
-- else. On 2026-11-19 ChatGPT fetched 69 listing pages for its users against
-- one dealer click by a person on the site: interest in a particular car
-- arrives through assistants far more often than through the site's own
-- buttons, and which car it was went uncounted. The owner asked for it.
--
-- One row per (UTC day, assistant, VIN), bumped in place. Only the "-user"
-- assistants (web/lib/aiAgents.ts onBehalfOfPerson): a fetch made because a
-- person asked about that car in that moment. Crawlers are not counted here
-- at all; Meta's walks 28,000 listings a day and says nothing about demand.
--
-- Still nothing about the person or the request: no IP, user-agent string,
-- ZIP, query string or conversation. A VIN names a car that is publicly for
-- sale, not a person.
--
-- anon can call the function, so it must not be a way to write arbitrary
-- text or grow the table without bound. The assistant must be on the closed
-- list below (tests/ai-agents.test.ts holds it to the module's), the VIN
-- must be VIN-shaped, and it must be a car this database has listed, live or
-- delisted: one primary-key probe. Anything else is dropped silently.
--
-- Read with the service-role key (scraper/visit-report.mjs). anon and
-- authenticated reach the table only through the function.

create table if not exists agent_car_fetches (
  day   date   not null,
  agent text   not null,
  vin   text   not null,
  n     bigint not null default 0,
  primary key (day, agent, vin)
);

create index if not exists agent_car_fetches_vin on agent_car_fetches (vin);

alter table agent_car_fetches enable row level security;
revoke all on agent_car_fetches from public, anon, authenticated;

create or replace function agent_car_fetch_bump(_agent text, _vin text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
set lock_timeout = '500ms'
as $$
declare
  people constant text[] := array['chatgpt-user', 'claude-user', 'perplexity-user', 'meta-user', 'mistral-user'];
  v text := upper(_vin);
begin
  if _agent is null or v is null or not (_agent = any (people)) or v !~ '^[A-HJ-NPR-Z0-9]{17}$' then
    return;
  end if;
  if not exists (select 1 from listings where vin = v) then
    return;
  end if;
  insert into agent_car_fetches as a (day, agent, vin, n)
  values ((now() at time zone 'utc')::date, _agent, v, 1)
  on conflict (day, agent, vin) do update set n = a.n + 1;
end;
$$;

revoke all on function agent_car_fetch_bump(text, text) from public, anon, authenticated;
grant execute on function agent_car_fetch_bump(text, text) to anon;
