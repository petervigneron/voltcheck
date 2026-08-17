-- The feed's price-history lookup goes back to per-VIN (0012's lateral).
--
-- 0026 replaced that lateral with one GroupAggregate over ALL of
-- listing_price_history because the feed was then read by OFFSET: a deep
-- page scanned 41k rows below its limit and ran the lateral for every one
-- of them, so paying the aggregate once per page was the cheaper shape.
-- That premise is gone — web/lib/listings/db.ts has since moved to
-- VIN-keyed pagination (each page is an index range scan bounded at 1000
-- rows), so the lateral runs at most 1000 times per request again.
--
-- Meanwhile the aggregate's cost lands on every NARROW read. It is keyed
-- to nothing, so any query the planner can't push an equality into pays a
-- full pass over the history table — 94,389 rows on 2026-08-17, growing
-- 5-10k a night, on its way to anon's 3s statement timeout. A vin=eq read
-- stays fast (the equality pushes through the join into the aggregate);
-- vin LIKE and vin-range quals do not push, which is exactly the cohort
-- fetch and every feed page.
--
-- Measured on prod, 2026-08-17 (94,389 history rows, 71,394 live cars),
-- aggregate form vs this lateral, explain analyze:
--
--   keyed feed page (vin range, 1000 rows)   698ms -> 29ms
--     (466ms of the 698 was the aggregate's scan of the history index)
--   cohort LIKE read (2,198 rows, worst live cohort)   223ms -> 55ms
--   by-id vin=eq read   1.6ms -> 0.3ms
--
-- The hourly full-feed revalidate reads ~70 keyed pages: ~2s of summed
-- database time in this form vs ~45s in the aggregate form. The per-VIN
-- scan is backward on price_history_vin_idx (vin, observed_at), limit 2 —
-- bounded per row no matter how long a car's price history grows.
--
-- REJECTED: materializing prev_price_usd/price_changed_at into a nightly
-- matview like 0020/0022/0028 — those exist because their aggregates scan
-- listings-wide state, but this value is per-VIN, index-bounded, and
-- ingest writes the history row at the moment a price changes; a matview
-- would add a refresh dependency and a stale-price window for a read that
-- costs 8 microseconds live. REJECTED: keeping the aggregate and adding
-- lateral-shaped variants for the narrow reads — two views claiming the
-- same columns is how the shapes drift apart.
--
-- Same output shape as 0028 (create or replace requires it; the web reads
-- columns by name) and same reloptions: security_invoker = false is
-- load-bearing — 0028's first application dropped it, anon feed reads died
-- on listing_seen, and the site fell back to the bundled snapshot. Read
-- the LIVE view's reloptions before replacing a view; pg_get_viewdef does
-- not show them. (Checked 2026-08-17: {security_invoker=false}, owner
-- postgres.)

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
  select (array_agg(price_usd order by observed_at desc))[2] as prev_price_usd,
         max(observed_at) as price_changed_at
  from (
    select price_usd, observed_at
    from listing_price_history p
    where p.vin = l.vin
    order by observed_at desc
    limit 2
  ) last2
) h on true
left join listing_freshness f using (vin)
where l.delisted_at is null;
