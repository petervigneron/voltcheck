-- The buyback disclosure test learns two families of words it was missing.
--
-- 0024 built this column from the disclosure templates the live corpus held on
-- 2026-08-16 and said what to do next: "Extending the patterns is a new
-- migration; keep the controls." This is that migration. Both additions come
-- from cars that are live on the site right now, and both were found the same
-- way 0024's were — by reading the dealer's own words.
--
-- FAMILY 1: the maker's own term of art is "reacquired", not "buyback".
--
--   Dennis Sneed Ford (sneedford.com, Gower MO) resells Ford's Manufacturer
--   Buy-Back programme as its business — its own landing page says so, and 210
--   of the 260 cars on its used lot, including ALL 25 of its F-150 Lightnings,
--   end their dealer comments with "PART OF FORDS REACQUIRED VEHICLE BRANDED
--   PROGRAM AND COMES WITH A 12 MONTH 12,000 MILE SPECIAL FORD MOTOR COMPANY
--   FACTORY LIMITED BUMPER TO BUMPER WARRANTY". Not one of 0024's four patterns
--   matches that sentence. One of those trucks was listed here at $45,499
--   against the original MSRP of $88,224 its own comment states.
--
--   The same word, other subject: carvision.com's Audi rows read "audi
--   reacquired this vehicle due to customer concerns involving a charging
--   connector that would not release". Those 43 rows are already flagged (they
--   also carry 0024's "agreeing to repurchase the vehicle"), so this pattern
--   adds nothing on today's corpus — it is here for the Ford wording, and the
--   Audi sentence is what fixes its shape.
--
-- FAMILY 2: "lemon law" and "buyback" are not always adjacent.
--
--   highlineautosales.com writes "lemon law permanently branded title!!" on
--   seven live cars, and "lemon law buyback permanently branded title" on an
--   eighth. 0024's 'lemon.law buyback' matches only the eighth. Same dealer,
--   same disclosure, same brand on the title — flagged or not on word order.
--
-- WHAT IS NOT CHANGED: absence still asserts nothing. A seller who stays
-- silent stays invisible and the site stays silent about them in turn. This
-- reads the seller's own statement about their own car and nothing else; no
-- title data is being inferred.
--
-- CONTROLS. 0024's two known false-positive shapes are neither present in
-- today's corpus (0 rows each, so they could not be re-verified by counting)
-- nor matched when tested directly, and a third was added for the new
-- "reacquired" wording — a dealer who reacquired a car themselves, which is a
-- trade, not a manufacturer repurchase. Verified against the live corpus and
-- as literal strings, 2026-08-27:
--
--   'coverage does not apply to as-is, tax tow, salvage, or lemon law
--    vehicles.'                                                    -> no match
--   'we never sell a manufacturer buyback, and we do not sell lemon
--    law vehicles.'                                                -> no match
--   'we reacquired this vehicle from its original owner, a local
--    one-owner trade.'                                             -> no match
--   'clean carfax, one owner, no accidents, branded nothing.'      -> no match
--
--   and the three disclosures above all match. Over all 10,902 live rows that
--   carry a description: 'reacquired (this )?vehicle' matches 43, every one
--   already flagged; the lemon-law/branded-title pattern matches 12 and newly
--   flags 7 — the highlineautosales rows, read individually.
--
-- THE BIGGER HALF OF THIS BUG WAS NOT THE PATTERNS. Only 10,902 of 137,612
-- live listings carried a description at all, because the DealerOn and
-- dealer.com API lanes — most of the crawl — never read one. This column is
-- computed from payload->>'description', so on 92% of the site it was reading
-- a field nothing filled: not a strict test, no test. sneedford.com is a
-- DealerOn rooftop, which is why its 25 disclosed buybacks arrived here
-- looking clean. scraper/lib/platforms/dealeron-api.mjs now carries the card's
-- VehicleComments through (it was always in the response we already fetched);
-- the dealer.com API lane has the same gap and is NOT fixed by this migration.
--
-- SET EXPRESSION (PG17) rather than drop-and-re-add: the column is referenced
-- by live_listings_feed and every view layered on it, so dropping it would
-- take the browse feed's view chain with it. This rewrites the table (252 MB)
-- under an ACCESS EXCLUSIVE lock; the ingest gateway retries, and the walk is
-- cached, so a short block is survivable. It is one statement on purpose.
alter table listings
  alter column buyback_disclosed
  set expression as (
    lower(coalesce(payload->>'description','')) ~ 'agreeing to repurchase the vehicle'
    or lower(coalesce(payload->>'description','')) ~ 'lemon.law buyback'
    or lower(coalesce(payload->>'description','')) ~ 'this vehicle (is|was) a (manufacturer )?(buyback|repurchase)'
    or (lower(coalesce(payload->>'description','')) ~ 'manufacturer buyback'
        and lower(coalesce(payload->>'description','')) !~ '(not|never|no) (a |an )?manufacturer buyback')
    -- NEW 2026-08-27, family 1: the maker's own word. Guarded against the
    -- dealer-as-subject reading ("we reacquired this vehicle from its owner"),
    -- which is a trade-in and not a repurchase.
    or (lower(coalesce(payload->>'description','')) ~ 'reacquired (this )?vehicle'
        and lower(coalesce(payload->>'description','')) !~ '(we|our (dealership|store|team)) (have |has )?reacquired')
    -- NEW 2026-08-27, family 2: the brand on the title, named in the same
    -- breath as the law that put it there. Bounded to one sentence ([^.!]) so
    -- a "lemon law" exclusion in warranty fine print cannot reach a "branded
    -- title" phrase somewhere else in the copy.
    or lower(coalesce(payload->>'description','')) ~ 'lemon.law[^.!]{0,40}branded title'
  );
-- No STORED keyword: SET EXPRESSION keeps the column's existing storage, and
-- naming it again is a syntax error (tried, 2026-08-27).

