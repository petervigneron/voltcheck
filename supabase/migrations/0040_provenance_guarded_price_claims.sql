-- A price cut is only claimable between like-for-like observations.
--
-- The failure this fixes (measured 2026-08-19): the crawl lane read
-- dealer.com's internetPrice (3aa18b3, 08-14) while recheck.mjs reads the
-- JSON-LD offer price. Both numbers coexist on dealer pages, so every
-- listing where they disagree logged a phantom price "change" whenever the
-- observing lane switched. Recheck run 362 alone wrote 7,734 "changes"
-- across 31,366 listings — a 25% one-run repricing rate against a ~7.5%/week
-- base rate; 45% of all used-EV price steps in the 08-11→19 window were
-- cross-lane. Verified on live VDPs: mcgovernhyundai.com Ioniq 5
-- "$53,770→$29,495" — both prices on the page simultaneously (field flip);
-- winnerfordofdover.com ID.4 "$33,099" — appears nowhere on the page, and
-- that step was nightly→nightly straddling the 08-14 switch, which is why
-- same-source pairing alone is NOT sufficient. Shopper exposure at
-- measurement time: 9,154 live cards chip-eligible for "price cut $X",
-- 7,036 (77%) of them on cross-lane steps, 2,814 claiming ≥$5,000.
--
-- Two guards, both applied to the feed's prev-price pair and to the new
-- sparkline series:
--   1. Same run source. The last two history rows must come from the same
--      ingest source (nightly/recheck/...). Kills the crawl↔recheck flap
--      machine.
--   2. No methodology transition between them. price_methodology_transitions
--      lists the instants the pipeline changed how it reads prices; a pair
--      straddling one is a correction of our reading, not a dealer action,
--      and the claim goes quiet. Seeded with the 08-14 internetPrice switch
--      and with 2026-08-19 18:00Z — ahead of the first bulk run that applies
--      the 367042d resolver fix plus the dealer.com/DealerOn/Team Velocity/
--      dealr.cloud API lanes, which will rewrite prices at scale. That run's
--      genuine dealer cuts are suppressed along with the corrections for one
--      cycle; the asymmetry is deliberate (a missed cut chip costs little, a
--      false $24k cut costs trust — the house rule's expensive direction).
--      Post-transition pairs self-heal: the next change after the rewrite
--      pairs two new-methodology rows and claims normally.
--
-- REJECTED for tonight: a provenance column (extractor+field) on
-- listing_price_history — the durable fix, but it needs the scraper to emit
-- provenance without widening the listing payload (payload-equality IS
-- row-equality since 0025; widening it forces nightly full-row rewrites,
-- the exact OOM the 0025/0026 discipline exists to prevent). Do it as its
-- own change with its own testing, not in a same-day hotfix.
-- REJECTED: confirmation-based claims (cut counts once the lower price is
-- re-observed) — a methodology correction stabilizes exactly like a real
-- cut, so confirmation cannot tell them apart; only provenance can.
--
-- The view replacement preserves 0032's exact output shape and reloptions
-- (security_invoker = false is load-bearing — see 0032's header) and its
-- per-VIN limit-2 lateral cost shape: the additions are two PK lookups into
-- ingest_runs and an EXISTS over a 2-row table per emitted feed row.

create table if not exists price_methodology_transitions (
  at timestamptz primary key,
  reason text not null
);

alter table price_methodology_transitions enable row level security;
create policy "public read" on price_methodology_transitions
  for select to anon, authenticated using (true);

insert into price_methodology_transitions (at, reason) values
  ('2026-08-14 22:00+00',
   '3aa18b3 switched crawl dealer.com price to internetPrice-first (first run 08-14 23:23Z). Pairs straddling this are field flips: winnerfordofdover ID.4 57235->33099 verified phantom on the live VDP.'),
  ('2026-08-19 18:00+00',
   '367042d resolver fix (JSON-LD-first, abstain) + dealer.com/DealerOn/Team Velocity/dealr.cloud API lanes land in the next bulk run and rewrite prices at scale. Steps straddling this are our corrections, not dealer repricing.')
on conflict (at) do nothing;

create or replace view live_listings_feed
with (security_invoker = false) as
select l.vin,
       l.first_seen_at,
       s.last_seen_at,
       l.payload_public as payload,
       h.prev_price_usd,
       h.price_changed_at,
       l.buyback_disclosed,
       f.listed_on
from listings l
left join listing_seen s using (vin)
left join lateral (
  select case when g.same_src and not exists (
                select 1 from price_methodology_transitions t
                where t.at > g.at2 and t.at <= g.at1)
              then g.prev end as prev_price_usd,
         case when g.same_src and not exists (
                select 1 from price_methodology_transitions t
                where t.at > g.at2 and t.at <= g.at1)
              then g.at1 end as price_changed_at
  from (
    select (array_agg(last2.price_usd order by last2.observed_at desc))[2] as prev,
           max(last2.observed_at) as at1,
           min(last2.observed_at) as at2,
           (min(last2.src) is not distinct from max(last2.src)) as same_src
    from (
      select p.price_usd, p.observed_at, coalesce(r.source, '?') as src
      from listing_price_history p
      left join ingest_runs r on r.id = p.run_id
      where p.vin = l.vin
      order by p.observed_at desc
      limit 2
    ) last2
  ) g
) h on true
left join listing_freshness f using (vin)
where l.delisted_at is null;

-- The detail page's sparkline series, same two guards applied stepwise.
-- A row survives if it starts the series or extends it from the same lane
-- with no transition in between; zero-price abstain sentinels (see 0039)
-- are excluded before chaining so an abstain never breaks a genuine pair.
-- Dropping a suspect row also drops its successors' claim to a "step" —
-- the series goes quiet rather than drawing a move we cannot stand behind,
-- which can leave the sparkline one genuine move behind the card price
-- until the next same-lane observation. That direction is the safe one.
create view listing_price_display
with (security_invoker = false) as
with h as (
  select p.vin, p.price_usd, p.observed_at,
         coalesce(r.source, '?') as src,
         lag(p.observed_at) over w as prev_at,
         lag(coalesce(r.source, '?')) over w as prev_src
  from listing_price_history p
  left join ingest_runs r on r.id = p.run_id
  where p.price_usd > 0
  window w as (partition by p.vin order by p.observed_at)
)
select vin, price_usd, observed_at
from h
where prev_at is null
   or (src = prev_src
       and not exists (select 1 from price_methodology_transitions t
                       where t.at > prev_at and t.at <= observed_at));

grant select on listing_price_display to anon, authenticated;
