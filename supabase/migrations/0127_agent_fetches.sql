-- Which AI assistants read the site, and what kind of page they read.
--
-- Every automated visit was discarded (web/lib/visit.ts automatedAgent), and
-- crawlers never run the client beacon, so the site could not say whether
-- any assistant fetches it. The owner asked to see that apart from people.
-- Most pages are static or CDN-cached and no page handler runs for them, so
-- the count is taken in web/proxy.ts, which Next invokes only when the
-- user-agent names a known assistant (its second matcher), and which calls
-- agent_fetch_bump() after the response has gone.
--
-- One row per (UTC day, assistant, page kind), bumped in place — never a row
-- per fetch: a crawler can fetch tens of thousands of pages a day. Nothing
-- about the request is stored beyond the two labels: no path, VIN, ZIP, IP or
-- user-agent string.
--
-- The two allowlists are web/lib/aiAgents.ts AI_AGENT_LABELS and PAGE_KINDS,
-- exactly (tests/ai-agents.test.ts reads them out of this file). A label
-- added there needs the next migration to replace this function. Anything
-- not on a list is dropped silently: anon can call this, so it must not be
-- a way to write arbitrary text into the database.
--
-- Read by scraper/visit-report.mjs with the service-role key. anon and
-- authenticated get nothing on the table; they reach it only through the
-- function.

create table if not exists agent_fetches (
  day   date   not null,
  agent text   not null,
  kind  text   not null,
  n     bigint not null default 0,
  primary key (day, agent, kind)
);

alter table agent_fetches enable row level security;
-- Supabase's default privileges grant new public tables to anon and
-- authenticated; take that back so the function is the only door.
revoke all on agent_fetches from public, anon, authenticated;

-- One primary-key upsert: a single index probe and a single-row update, far
-- inside anon's 3 s statement timeout. The lock_timeout is the backstop for a
-- burst of one crawler queuing on one hot row's lock: a count that would
-- wait longer errors and is dropped (the proxy ignores the answer) rather
-- than holding a connection. (statement_timeout set on a function does not
-- govern the statement already running, which is why it is not used here.)
create or replace function agent_fetch_bump(_agent text, _kind text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
set lock_timeout = '500ms'
as $$
declare
  agents constant text[] := array['openai-train', 'openai-search', 'chatgpt-user', 'anthropic-crawl', 'claude-search', 'claude-user', 'perplexity-crawl', 'perplexity-user', 'google-ai', 'apple-ai', 'amazon', 'meta-ai', 'meta-user', 'bytedance', 'commoncrawl', 'mistral-user', 'duckassist', 'cohere'];
  kinds  constant text[] := array['home', 'listing', 'model', 'near', 'facts', 'warranty', 'market', 'api', 'mcp', 'llms', 'sitemap', 'robots', 'other'];
begin
  if _agent is null or _kind is null or not (_agent = any (agents)) or not (_kind = any (kinds)) then
    return;
  end if;
  insert into agent_fetches as a (day, agent, kind, n)
  values ((now() at time zone 'utc')::date, _agent, _kind, 1)
  on conflict (day, agent, kind) do update set n = a.n + 1;
end;
$$;

revoke all on function agent_fetch_bump(text, text) from public, anon, authenticated;
grant execute on function agent_fetch_bump(text, text) to anon;
