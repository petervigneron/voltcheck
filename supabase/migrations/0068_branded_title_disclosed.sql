-- A branded title gets the same warning a manufacturer repurchase does.
--
-- Owner, 2026-09-06, on being told ~15 Parkline Motors cars ("This branded
-- title Tesla Model Y has passed a thorough 150+ point inspection") were
-- being left unflagged because a brand is not a repurchase: "Good lord I do
-- not distinguish between repurchase and branded title. They both need a
-- warning." So: a second column, read the same way as buyback_disclosed
-- (0024) — from the seller's own description, at write time, by audited
-- patterns — and printed as its own words. It is NOT folded into
-- buyback_disclosed, because that column's flag reads "Manufacturer
-- repurchase" and a salvage or flood brand is not one; this one reads
-- "Branded title". Where a car carries both (the leskovar.com Teslas:
-- "BRANDED TITLE LEMON LAW BUYBACK"), the site prints the repurchase, the
-- more specific fact.
--
-- WORDINGS, from the 16,086 dealer notes read on 2026-09-06 (47 cars match,
-- every one read individually):
--   "This branded title Tesla Model Y has passed a thorough 150+ point
--    inspection at our dealership"       — Parkline Motors, ~26 cars (Teslas,
--    Rivians, a BMW iX, a Cybertruck); their pitch copy on the same pages
--    ("Save thousands with our branded title expertise", "a premium
--    selection of pre-owned branded title vehicles") is NOT a claim about the
--    car and does not match — see the subject rule below.
--   "This vehicle has a Branded Title"    — 1GT40LEL7SU406584
--   "Salvage Title but in excellent shape", "SALVAGE TITLE"
--                                          — 7SAYGDEE2PA118444, 5YJ3E1EC7PF704232
--   "LEMON LAW BRANDED TITLE", "BRANDED TITLE LEMON LAW BUYBACK",
--   "BUYBACK LEMON TITLE"                 — already repurchases, now also this.
--
-- THE SUBJECT RULE. "branded title" flags only where the car is the subject:
-- at the start of a sentence or clause, or after this/a/an/has/with/is/
-- carries/the. That is what keeps "pre-owned branded title vehicles", "our
-- branded title expertise", "no branded title", "a bad branded title" and
-- "clean, non-branded title" quiet — none of those put the words after a
-- word from that list, and a hyphen is not a clause boundary. A guard on
-- top catches the one denial shape the rule alone lets through ("this is
-- not a salvage title vehicle", found by the control run).
--
-- CONTROLS, verified as literal strings against this expression 2026-09-06:
--   'does not apply to as-is, tax tow, salvage, or lemon law vehicles.'
--   'offering a premium selection of pre-owned branded title vehicles.'
--   'we do not sell manufacturer buybacks/lemon law vehicles or any other
--    vehicle with a bad branded title.'
--   'have a clean, non-branded title as verified by a carfax vehicle
--    history report.'
--   'we also verify every vehicle for quality no lemon history, no branded
--    title, and no major damage.'
--   'a guaranteed clean title with no salvage, junk, rebuilt, fire, flood,
--    hail or lemon brands.'
--   'save thousands with our branded title expertise'
--   'hd radio with navigation/sony branded sound system.'
--   'no title brands of any kind have been reported.'
--   'kia branded vehicles with 0-100,000 miles.'
--   'this is not a salvage title vehicle.'                       -> no match
-- and the disclosures quoted above all match.
--
-- The view gains the column at the END, which is the only place CREATE OR
-- REPLACE VIEW accepts a new one, and exactly how 0024 added
-- buyback_disclosed. The body is the live definition as of 0048, unchanged
-- otherwise; security_invoker is stated because it is what the view has now.
-- ADD COLUMN ... GENERATED ... STORED rewrites the 252 MB table under ACCESS
-- EXCLUSIVE, as 0024 did; the ingest gateway retries and the walk is cached.
alter table listings
  add column branded_title_disclosed boolean not null
  generated always as (
    (
      lower(coalesce(payload->>'description','')) ~ '(^|[.!,;:]\s*|\s(this|a|an|has|with|is|carries|the)\s+)(branded|salvage|rebuilt|flood)[ -]title'
      or lower(coalesce(payload->>'description','')) ~ 'this (branded|salvage|rebuilt|flood)[ -]title '
      or lower(coalesce(payload->>'description','')) ~ 'title (is|has been|was) branded'
      or lower(coalesce(payload->>'description','')) ~ 'branded as (a )?(salvage|rebuilt|lemon|flood)'
      or lower(coalesce(payload->>'description','')) ~ 'lemon( law)? (branded )?title'
      or lower(coalesce(payload->>'description','')) ~ 'title:\s*(branded|salvage|rebuilt|flood|lemon)\M'
    )
    and lower(coalesce(payload->>'description','')) !~ '(not|no|never|without|isn''t|is not) (a |an )?(salvage|rebuilt|flood|branded|lemon)[ -]title'
  ) stored;

create or replace view live_listings_feed
with (security_invoker = false) as
SELECT l.vin,
    l.first_seen_at,
    s.last_seen_at,
    COALESCE(l.payload_public, l.payload) AS payload,
    h.prev_price_usd,
    h.price_changed_at,
    l.buyback_disclosed,
    f.listed_on,
    l.branded_title_disclosed
   FROM listings l
     LEFT JOIN LATERAL ( SELECT s2.last_seen_at
           FROM listing_seen s2
          WHERE s2.vin = l.vin
         LIMIT 1) s ON true
     LEFT JOIN LATERAL ( SELECT
                CASE
                    WHEN g.claimable THEN g.prev
                    ELSE NULL::integer
                END AS prev_price_usd,
                CASE
                    WHEN g.claimable THEN g.at1
                    ELSE NULL::timestamp with time zone
                END AS price_changed_at
           FROM ( SELECT g0.prev,
                    g0.at1,
                        CASE
                            WHEN g0.n < 2 THEN false
                            ELSE
                            CASE
                                WHEN g0.prov_cur IS NOT NULL AND g0.prov_prev IS NOT NULL THEN g0.prov_cur = g0.prov_prev
                                ELSE g0.same_src AND NOT (EXISTS ( SELECT 1
                                   FROM price_methodology_transitions t
                                  WHERE t.at > g0.at2 AND t.at <= g0.at1))
                            END AND
                            CASE
                                WHEN g0.dom_cur IS NOT NULL AND g0.dom_prev IS NOT NULL THEN g0.dom_cur = g0.dom_prev
                                ELSE NOT (g0.back2 IS NOT NULL AND g0.cur = g0.back2 AND g0.cur IS DISTINCT FROM g0.prev)
                            END
                        END AS claimable
                   FROM ( SELECT (array_agg(last3.price_usd ORDER BY last3.observed_at DESC))[1] AS cur,
                            (array_agg(last3.price_usd ORDER BY last3.observed_at DESC))[2] AS prev,
                            (array_agg(last3.price_usd ORDER BY last3.observed_at DESC))[3] AS back2,
                            (array_agg(last3.provenance ORDER BY last3.observed_at DESC))[1] AS prov_cur,
                            (array_agg(last3.provenance ORDER BY last3.observed_at DESC))[2] AS prov_prev,
                            (array_agg(last3.dealer_domain ORDER BY last3.observed_at DESC))[1] AS dom_cur,
                            (array_agg(last3.dealer_domain ORDER BY last3.observed_at DESC))[2] AS dom_prev,
                            (array_agg(last3.observed_at ORDER BY last3.observed_at DESC))[1] AS at1,
                            (array_agg(last3.observed_at ORDER BY last3.observed_at DESC))[2] AS at2,
                            NOT (array_agg(last3.src ORDER BY last3.observed_at DESC))[1] IS DISTINCT FROM (array_agg(last3.src ORDER BY last3.observed_at DESC))[2] AS same_src,
                            count(*) AS n
                           FROM ( SELECT p.price_usd,
                                    p.observed_at,
                                    p.provenance,
                                    p.dealer_domain,
                                    COALESCE(r.source, '?'::text) AS src
                                   FROM listing_price_history p
                                     LEFT JOIN ingest_runs r ON r.id = p.run_id
                                  WHERE p.vin = l.vin
                                  ORDER BY p.observed_at DESC
                                 LIMIT 3) last3) g0) g) h ON true
     LEFT JOIN LATERAL ( SELECT f2.listed_on
           FROM listing_freshness f2
          WHERE f2.vin = l.vin
         LIMIT 1) f ON true
  WHERE l.delisted_at IS NULL;
