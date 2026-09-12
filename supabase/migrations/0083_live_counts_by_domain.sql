-- How many cars each of these domains has live right now — one round trip.
--
-- db-sync's delist guard checks the dealer lane in AGGREGATE (its own
-- comment says why: thousands of rooftops, one count request each was not
-- affordable, and a lane-wide crawl failure shows in the total). What the
-- aggregate cannot see is ONE rooftop certified complete on a walk that saw
-- half its lot — and that is how most of the crawl's delist churn is made
-- (2026-09-12: 14,942 crawl delists Sep 7–11, 48% relisted within 3 days;
-- audimv.com flipped 85 cars 962 times, beavertonmazda.com 70 cars 431
-- times). A per-rooftop check needs per-rooftop prior counts, and this is
-- the affordable way to get them: one grouped count over the live index,
-- for exactly the domains a sync is about to certify.
--
-- security definer, service_role only: db-sync writes with the service key
-- already; anon has no business counting the graveyard's neighbours.

create or replace function live_counts_by_domain(_domains text[])
returns table (dealer_domain text, live bigint)
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select l.dealer_domain, count(*)::bigint
  from listings l
  where l.delisted_at is null
    and l.dealer_domain = any (_domains)
  group by l.dealer_domain
$$;

revoke execute on function live_counts_by_domain(text[]) from public, anon, authenticated;
grant execute on function live_counts_by_domain(text[]) to service_role;
