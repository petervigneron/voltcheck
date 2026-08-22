-- The feed walk's cost was never the rows it returns. It was a join it
-- re-scanned from the top on every page.
--
-- live_listings_feed (0011, extended by 0026/0028/0040) joined listing_seen
-- and listing_freshness with plain LEFT JOINs. Postgres planned both as merge
-- joins, and a merge join's inner side is not bounded by the outer's
-- `vin >= 'W'` qual — so serving 500 rows scanned 95,686 rows of listing_seen
-- from the start of its index. Measured 2026-08-22 with
-- EXPLAIN (ANALYZE, BUFFERS) on one W-bucket page:
--
--   Merge Left Join (l.vin = s.vin)
--     -> Index Scan listings_live_vin on listings   rows=500     414 buffers
--     -> Index Scan listing_seen_pkey on listing_seen rows=95,686  66,405 buffers
--
-- 66,405 of the page's 68,093 buffers — 92% — to attach one timestamp per row.
-- Every page pays it, and a full feed walk is 226 pages. It is also why the
-- late-alphabet buckets were the slow ones: W is near the end of the vin
-- ordering, so its scan of listing_seen has furthest to travel. A probe of an
-- early bucket looks healthy for entirely the wrong reason.
--
-- This is the same bug 0032 diagnosed and fixed on the third join in this same
-- view, in the same words: "vin LIKE and vin-range quals do not push, which is
-- exactly the cohort fetch and every feed page". 0032 fixed the price lookup
-- and measured 698ms -> 29ms. These are the two joins it did not reach.
--
--   with the plain LEFT JOINs   68,093 buffers   1,123 ms
--   with these LATERALs          3,421 buffers       8.3 ms
--
-- 20x, and the plan is a nested loop doing 4 buffers per per-vin lookup
-- (414 + 2,000 + 1,007 = 3,421), which is root+leaf+heap on a 112k-row btree.
--
-- THE `LIMIT 1` IS LOAD-BEARING. DO NOT SIMPLIFY IT AWAY. A LATERAL that can
-- be flattened is pulled up by the planner and re-planned as the very join it
-- was meant to replace: the same rewrite without the LIMIT was measured at
-- 68,117 buffers, i.e. no change at all. A LIMIT blocks the pull-up. That is
-- also why 0032's lateral works, though its own comment credits the shape
-- rather than the LIMIT.
--
-- The LIMIT cannot change a result. listing_seen.vin carries a unique index
-- (its primary key); listing_freshness held 2,275 rows across 2,275 distinct
-- vins behind a unique index. At most one row can match either side.
--
-- Validated before applying, per CLAUDE.md's dry-run-as-a-temp-view rule:
--   * built as a temp view inside BEGIN/ROLLBACK and diffed against the live
--     one over 558 rows spanning both match and non-match sides:
--     0 rows in old-not-new, 0 in new-not-old, and 298 rows with no
--     listing_freshness match handled identically on both sides.
--   * LEFT semantics for listing_seen proved synthetically, because they
--     cannot be tested against real data: 0 live listings currently lack a
--     listing_seen row. Deleting one inside the transaction, both the old and
--     the new view kept the row and returned last_seen_at NULL. A LATERAL that
--     had silently become an inner join would have dropped it.
--
-- CREATE OR REPLACE, never DROP + CREATE: replace preserves anon's SELECT
-- grant, a drop would revoke it and 403 the whole site. security_invoker is
-- named explicitly rather than left to the default, because REPLACE sets the
-- options it is given and this one governs how anon reads the view.
create or replace view live_listings_feed
with (security_invoker = false) as
 SELECT l.vin,
    l.first_seen_at,
    s.last_seen_at,
    l.payload_public AS payload,
    h.prev_price_usd,
    h.price_changed_at,
    l.buyback_disclosed,
    f.listed_on
   FROM listings l
     LEFT JOIN LATERAL ( SELECT s2.last_seen_at
                           FROM listing_seen s2
                          WHERE s2.vin = l.vin
                          LIMIT 1) s ON true
     LEFT JOIN LATERAL ( SELECT
                CASE WHEN g.claimable THEN g.prev ELSE NULL::integer END AS prev_price_usd,
                CASE WHEN g.claimable THEN g.at1 ELSE NULL::timestamp with time zone END AS price_changed_at
           FROM ( SELECT g0.prev, g0.at1, g0.at2,
                        CASE
                            WHEN g0.n < 2 THEN false
                            WHEN g0.prov_cur IS NOT NULL AND g0.prov_prev IS NOT NULL THEN g0.prov_cur = g0.prov_prev
                            ELSE g0.same_src AND NOT (EXISTS ( SELECT 1
                               FROM price_methodology_transitions t
                              WHERE t.at > g0.at2 AND t.at <= g0.at1))
                        END AS claimable
                   FROM ( SELECT (array_agg(last2.price_usd ORDER BY last2.observed_at DESC))[2] AS prev,
                            (array_agg(last2.provenance ORDER BY last2.observed_at DESC))[1] AS prov_cur,
                            (array_agg(last2.provenance ORDER BY last2.observed_at DESC))[2] AS prov_prev,
                            max(last2.observed_at) AS at1,
                            min(last2.observed_at) AS at2,
                            NOT min(last2.src) IS DISTINCT FROM max(last2.src) AS same_src,
                            count(*) AS n
                           FROM ( SELECT p.price_usd,
                                    p.observed_at,
                                    p.provenance,
                                    COALESCE(r.source, '?'::text) AS src
                                   FROM listing_price_history p
                                     LEFT JOIN ingest_runs r ON r.id = p.run_id
                                  WHERE p.vin = l.vin
                                  ORDER BY p.observed_at DESC
                                 LIMIT 2) last2) g0) g) h ON true
     LEFT JOIN LATERAL ( SELECT f2.listed_on
                           FROM listing_freshness f2
                          WHERE f2.vin = l.vin
                          LIMIT 1) f ON true
  WHERE l.delisted_at IS NULL;
