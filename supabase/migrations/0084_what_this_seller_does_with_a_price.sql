-- What this seller does with a price, per dealer site, refreshed nightly.
--
-- The Pro block on the listing page answers two questions about the seller in
-- front of the shopper: of the EVs this site has listed, how many came down in
-- price, and how long a car waits before the first cut. Both are ESTIMATES and
-- the page marks them so; neither is a manufacturer figure and neither is a
-- transaction.
--
-- Measured on prod 2026-09-12 (172,003 live listings, 3,016,899 price-history
-- rows, the log starting 2026-08-11 — so "the last 30 days" is currently very
-- nearly the whole record):
--
--   9,155  dealer_domains hold a live priced listing
--   8,375  of them survive the lane exclusion below and have a readable series
--   2,136  clear the floor of 8 readable listings — 51,087 listings in all,
--          10,777 of them cut (21.1%), and that is what this view holds
--     897  of the 2,136 have at least one first cut on a car 0028 can date;
--     179  have the five this file needs before a median prints
--
--   cut share over the 2,136:   p10 0%  p25 0%  p50 12.5%  p75 34.8%  p95 75%
--                               631 sites at exactly 0, 14 at 100%
--   median days to first cut over the 179: p25 4.2  p50 7.2  p75 11.1,
--                               from 0.2 days to 22.4
--
-- ---------------------------------------------------------------------------
-- Three guards, and the third one is new.
--
-- (1) The step chain is listing_price_display's, verbatim: the current
--     seller's rows only (0061), matching provenance or 0040's same-source +
--     no-methodology-transition fallback (0041), matching dealer domain or
--     0048's A->B->A alternation fingerprint. The raw listing_price_history
--     rows are NOT counted — 0040's header says what they hold. A listing is
--     in the denominator only when its chain also ENDS at the price the page
--     shows (lib/listings/priceSeries.ts seriesEndingAt): if we will not draw
--     that car's series, we will not count it either.
--
-- (2) OEM locator lanes are not dealers. cadillac.com (13,166 live),
--     chevrolet.com (10,752), kia.com (9,928), ford-blue-advantage (8,671),
--     bmwusa.com, mbusa.com, audi-network, driveway.com, carbravo.com and 29
--     others aggregate every rooftop in the country behind one key, so "what
--     this seller does" computed over one of them is a sentence about a whole
--     brand, attached to a page that names a single store. Excluded by the
--     same two tests 0061 used, promoted from per-VIN to per-domain: the key
--     has no dot, or the domain has ever written an 'oem-%' provenance row.
--     38 domains match today and the test is self-maintaining — every lane in
--     scraper/lib/oem/ tags its rows that way.
--
-- (3) NEW, and the reason this file has a third guard at all: a same-domain,
--     same-provenance price flap that guards (1) and (2) both pass. Measured
--     while writing this migration — JTDACACU1V3085369 on keyestoyota.com
--     alternates $44,853 / $44,768 fourteen times between 08-27 and 09-09,
--     every row tagged 'jsonld', every row tagged keyestoyota.com, the high
--     one always written by a recheck run and the low one always by a nightly
--     run. 0041's provenance test passes (jsonld = jsonld), 0048's domain test
--     passes exactly (both sides carry the same real domain, so its
--     alternation fingerprint never gets to run — that fallback is only for
--     null-domain pairs), and 0040's same-source test is not reached because
--     provenance decided it. The result before this guard: keyestoyota.com
--     read as cutting 51 of 51 cars, ardmoretoyota.com 44 of 44,
--     alexandriatoyota.com 44 of 44 — a "this seller marks everything down"
--     claim built entirely out of an $85 disagreement between two of our own
--     lanes. Counted raw, 25,532 of 66,858 readable live cars (38%) had a cut.
--
--     So a cut counts here only when it is a cut a shopper could act on:
--       * a NEW LOW — strictly below every price this listing's chain has
--         shown before. A price that returns to a level already seen is a
--         return, not a markdown, and that is the flap's fingerprint whatever
--         the provenance says.  Alone: 20,788 cars.
--       * and at least PRICE_CUT_MIN_USD ($500) below the price before it —
--         the bar lib/listings/price.ts already sets for a cut worth a
--         shopper's attention, and an $85 lane disagreement is not one.
--         Alone: 18,052 cars.
--       Both: 14,656 of 66,858 (22%). The two guards together drop 10,876
--       cars (43% of the raw cuts) that the existing chain would have counted.
--
--     REJECTED: seeding a price_methodology_transitions row. The contract
--     (0040) is that those instants mark a change in HOW WE READ prices; the
--     nightly/recheck disagreement is continuous, not an instant, and a
--     transition row would suppress every genuine cut in the window for every
--     car on the site. REJECTED: dropping recheck rows from the chain. They
--     are the freshest observation we have of a car's price and the sparkline
--     is drawn from them. The flap is worth fixing at its source for
--     listing_price_display too — it is drawing $85 sawteeth on those pages
--     today — but that is a change to a view three surfaces read and does not
--     belong in a file adding a Pro block.
--
-- ---------------------------------------------------------------------------
-- Days to first cut is timed from listings.first_seen_at, and ONLY for cars
-- that hold a listing_freshness row — 0028's guards decide whether an
-- appearance is honestly a listing date, and 57,950 of 172,003 live cars
-- (34%) earn one. A car without one contributes to the cut share (whether it
-- was cut is knowable) and not to the median (when it was listed is not).
-- The median needs 5 such cars before it prints; below that it is one car's
-- story wearing a median's authority.
--
-- The delisting signal was noisy until 2026-09-12 (0082/0083, and commits
-- f67f250/a8815d7 the same day). Nothing in this file reads delisted_at
-- except `delisted_at is null`, which is the live-inventory test every other
-- view uses; first_seen_at is untouched by those fixes. Do NOT extend this
-- view with a days-to-sale, a time-on-lot-at-delisting, or anything else
-- derived from delisted_at until that signal has a clean window behind it.
--
-- Accepted residuals, all in the safe direction (understating how much a
-- seller discounts is the cheap error here; a false "this store marks
-- everything down" is the expensive one):
--   * a car listed two days ago sits in the denominator having had no chance
--     to be cut, so a fast-turning store reads quieter than it is;
--   * a genuine second cut that does not clear the previous low (a cut after
--     a raise) is not counted; the first cut still is, so the median's clock
--     is unaffected;
--   * a genuine cut under $500 is not counted at all.
--
-- REJECTED: computing any of this per request. It is a window over 3M history
-- rows joined to all of listings; 0020/0022/0028 settled that anon's 3s
-- statement timeout does not survive a scan of listings, let alone this.
-- Materialized, refreshed nightly by refresh_vin_variants('dealer_price_
-- behavior') after listing_freshness (which it reads) — see
-- scraper/refresh-variants.mjs for the order.

create materialized view dealer_price_behavior as
with lanes as (
  -- Guard (2). Every lane in scraper/lib/oem/ tags its price rows 'oem-%'.
  select distinct dealer_domain
  from listing_price_history
  where provenance like 'oem-%' and dealer_domain is not null
),
cars as (
  select l.vin,
         l.dealer_domain,
         l.price_usd    as price_now,
         l.first_seen_at,
         -- The junk-price floor, tiered by condition and model year. THIRD
         -- copy: web/lib/listings/price.ts and scraper/lib/price-floor.mjs
         -- hold the other two, and that file's header says which live
         -- listings cut each tier. Keep all three in step.
         case when l.condition = 'new'        then 15000
              when coalesce(l.year, 0) >= 2020 then 7000
              when coalesce(l.year, 0) >= 2018 then 4000
              else 1000 end as floor_usd
  from listings l
  where l.delisted_at is null
    and l.dealer_domain is not null
    and l.dealer_domain like '%.%'
    and l.dealer_domain not in (select dealer_domain from lanes)
),
mine as (
  -- listing_price_display's `mine` (0061): the chain runs over the rows the
  -- listing's CURRENT dealer_domain produced, plus pre-0048 rows whose
  -- observing domain was never recorded.
  select p.vin, p.price_usd, p.observed_at, p.provenance, p.dealer_domain,
         coalesce(r.source, '?') as src,
         c.dealer_domain as dom_now, c.price_now, c.first_seen_at, c.floor_usd
  from listing_price_history p
  join cars c on c.vin = p.vin
  left join ingest_runs r on r.id = p.run_id
  where p.price_usd > 0
    and (p.dealer_domain is null or p.dealer_domain = c.dealer_domain)
),
h as (
  select m.*,
         lag(observed_at)   over w as prev_at,
         lag(src)           over w as prev_src,
         lag(provenance)    over w as prev_prov,
         lag(dealer_domain) over w as prev_dom,
         lag(price_usd)     over w as prev_price,
         lag(price_usd, 2)  over w as back2_price
  from mine m
  window w as (partition by m.vin order by m.observed_at)
),
kept as (
  -- Guard (1), character for character listing_price_display's where-clause,
  -- then the floor the web applies to that view's output (db.ts realPrice).
  select vin, price_usd, observed_at, dom_now, price_now, first_seen_at
  from h
  where (prev_at is null
     or ( (case
             when provenance is not null and prev_prov is not null
               then provenance = prev_prov
             else src = prev_src
                  and not exists (select 1 from price_methodology_transitions t
                                  where t.at > prev_at and t.at <= observed_at)
           end)
          and
          (case
             when dealer_domain is not null and prev_dom is not null
               then dealer_domain = prev_dom
             else not (back2_price is not null
                       and price_usd = back2_price
                       and price_usd is distinct from prev_price)
           end) ))
    and price_usd >= floor_usd
),
seq as (
  select k.*,
         lag(price_usd) over w as prev_kept,
         -- Every kept price strictly before this one. Null on the first row,
         -- which makes the new-low test false there — as it must be.
         min(price_usd) over (partition by k.vin order by k.observed_at
                              rows between unbounded preceding and 1 preceding) as run_min,
         last_value(price_usd) over (partition by k.vin order by k.observed_at
                              rows between unbounded preceding and unbounded following) as last_kept
  from kept k
  window w as (partition by k.vin order by k.observed_at)
),
per_car as (
  -- seriesEndingAt: a chain that does not end at the price on the page is one
  -- this site refuses to draw, so it is not one this site counts either.
  select vin, dom_now, first_seen_at,
         min(observed_at) filter (
           where prev_kept is not null
             and price_usd < prev_kept                 -- a step down
             and price_usd < run_min                   -- guard (3): a new low
             and prev_kept - price_usd >= 500          -- guard (3): PRICE_CUT_MIN_USD
             and observed_at >= now() - interval '30 days'
         ) as first_cut_at
  from seq
  where last_kept = price_now
  group by vin, dom_now, first_seen_at
),
per_dealer as (
  select c.dom_now as dealer_domain,
         count(*)::int as listings_n,
         count(*) filter (where c.first_cut_at is not null)::int as cut_n,
         count(*) filter (where c.first_cut_at is not null and f.vin is not null)::int as dated_n,
         percentile_cont(0.5) within group (
           order by extract(epoch from (c.first_cut_at - c.first_seen_at)) / 86400.0
         ) filter (where c.first_cut_at is not null and f.vin is not null) as median_days
  from per_car c
  left join listing_freshness f using (vin)
  group by 1
)
select dealer_domain,
       listings_n,
       cut_n,
       round(cut_n::numeric / listings_n, 4) as cut_share,
       dated_n,
       case when dated_n >= 5 then round(median_days::numeric, 1) end as median_days_to_cut
from per_dealer
where listings_n >= 8;

-- Required for refresh ... concurrently, and it is the read key: the listing
-- page looks this up once by the dealer_domain on its own row.
create unique index dealer_price_behavior_domain on dealer_price_behavior (dealer_domain);

comment on materialized view dealer_price_behavior is
  'Per dealer site, over its live EV listings whose guarded asking-price chain (listing_price_display, 0040/0041/0048/0061) ends at the price on the page: how many came down to a new low by at least $500 in the last 30 days, and the median days from first sighting to that first cut for the cars 0028 gives a defensible listing date. OEM locator lanes excluded. ESTIMATES, both. Only sites with 8 or more readable listings have a row; median_days_to_cut is null under 5 dated cuts. Refreshed nightly by refresh_vin_variants(''dealer_price_behavior''), after listing_freshness.';

-- Read by the listing page as anon, the same way listing_price_display is
-- (0040). The Pro gate is the surface (components/ProOnly.tsx), as it is for
-- the ask-vs-market tile beside it; what this view holds is an aggregate over
-- public asking prices, and it is not in the browse shards, which is where
-- the data wall lives (lib/listings/proSignals.ts).
grant select on dealer_price_behavior to anon, authenticated;

-- 0051's function with one more branch. Verbatim otherwise — read off the
-- live definition 2026-09-12, which already carried the 0057/0061/0064
-- targets that no migration file shows.
create or replace function refresh_vin_variants(target text)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  n bigint;
begin
  case target
    when 'vin_variant_observed' then
      refresh materialized view concurrently vin_variant_observed;
      select count(*) into n from vin_variant_observed;
    when 'ev_cohort_trim_spread' then
      refresh materialized view concurrently ev_cohort_trim_spread;
      select count(*) into n from ev_cohort_trim_spread;
    when 'listing_freshness' then
      refresh materialized view concurrently listing_freshness;
      select count(*) into n from listing_freshness;
    when 'ev_cohort_velocity' then
      refresh materialized view concurrently ev_cohort_velocity;
      select count(*) into n from ev_cohort_velocity;
    when 'ev_cohort_ask_weekly' then
      refresh materialized view concurrently ev_cohort_ask_weekly;
      select count(*) into n from ev_cohort_ask_weekly;
    when 'ev_price_trend_sales' then
      refresh materialized view concurrently ev_price_trend_sales;
      select count(*) into n from ev_price_trend_sales;
    when 'ev_price_trend_ask_daily' then
      return advance_price_trend_ask_daily(3);
    when 'dealer_price_behavior' then
      refresh materialized view concurrently dealer_price_behavior;
      select count(*) into n from dealer_price_behavior;
    else
      raise exception 'refresh_vin_variants: unknown target %', target
        using hint = 'one of vin_variant_observed, ev_cohort_trim_spread, listing_freshness, ev_cohort_velocity, ev_cohort_ask_weekly, ev_price_trend_sales, ev_price_trend_ask_daily, dealer_price_behavior';
  end case;
  return jsonb_build_object('view', target, 'rows', n);
end;
$function$;

revoke execute on function refresh_vin_variants(text) from public, anon, authenticated;
grant  execute on function refresh_vin_variants(text) to service_role;
