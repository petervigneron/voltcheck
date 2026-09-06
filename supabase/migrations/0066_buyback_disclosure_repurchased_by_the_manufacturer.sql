-- A fourth disclosure template: the manufacturer as the actor of "repurchased".
--
-- 0054 said to expect a fourth template. This is it, and it was found the way
-- the others were — by the owner opening a listing. aaronfordofpoway.com's 2023
-- F-150 Lightning 1FT6W1EV6PWG56603 (2026-09-06, $40,085, 23,258 mi) ends its
-- dealer notes:
--
--   "This is a Lemon Law Buyback vehicle. No hidden fees. All reconditioning
--    costs are fully included in our pricing. This vehicle was repurchased by
--    the manufacturer and is offered at a discounted price."
--
-- The first sentence matches 0024's 'lemon.law buyback', so this car needed no
-- new pattern — it needed its notes READ, which is the scraper fix that ships
-- with this migration (vdp-notes.mjs had selected 0 cars on every nightly
-- since 08-27). But the second sentence is a shape none of the nine clauses
-- knows: 0024's 'this vehicle (is|was) a (manufacturer )?(buyback|repurchase)'
-- needs the noun ("was a repurchase"), and 0054's 'reac?quired by (the
-- )?manufacturer' needs that verb. "repurchased by the manufacturer" is the
-- plainest English a dealer could use for it and matched nothing.
--
-- It is not hypothetical. Dry run over all 210,813 rows, 2026-09-06:
-- 'repurchased by (the |its )?manufacturer' matches 64, 61 already flagged,
-- and the 3 it newly flags are all the same fifth wording, on two lots that
-- use nothing else the column knows:
--
--   lesueurcarco.com KNDCS3LF0R5179696, usedvwaudi.com KNDCR3L11S5145109 and
--   5YJ3E1EA7SF933694: "This vehicle was repurchased by the manufacturer due
--   to a complaint from the previous owner. Despite having resolved the
--   issue, the manufacturer stepped in to promote customer satisfaction."
--
-- Three live cars — a 2024 Kia EV9, a 2025 Kia Niro EV and a 2025 Tesla Model
-- 3 — whose own listings say they are buybacks and whose cards said nothing.
--
-- CONTROLS, verified as literal strings 2026-09-06 (0024's, 0053's, 0054's,
-- and one new for this verb):
--   'coverage does not apply to as-is, tax tow, salvage, or lemon law
--    vehicles.'                                                     -> no match
--   'we never sell a manufacturer buyback and do not offer lemon law
--    vehicles.'                                                     -> no match
--   'we reacquired this vehicle from its original owner, a local
--    one-owner trade.'                                              -> no match
--   'this vehicle has never been repurchased by the manufacturer;
--    clean title.'                                                  -> no match
--   'we repurchased this vehicle from its first owner.'             -> no match
-- The negation guard's shape appears on 0 rows in today's corpus, so it could
-- not be re-verified by counting; it is tested directly.
--
-- Strictly additive by construction (one more OR), and measured: 0 rows lose
-- a flag, 3 gain one. SET EXPRESSION, one statement, for the reasons 0053
-- gives — the column is under live_listings_feed and the view chain on it.
alter table listings
  alter column buyback_disclosed
  set expression as (
    lower(coalesce(payload->>'description','')) ~ 'agreeing to repurchase the vehicle'
    or lower(coalesce(payload->>'description','')) ~ 'lemon.law buyback'
    or lower(coalesce(payload->>'description','')) ~ 'this vehicle (is|was) a (manufacturer )?(buyback|repurchase)'
    or (lower(coalesce(payload->>'description','')) ~ 'manufacturer buyback'
        and lower(coalesce(payload->>'description','')) !~ '(not|never|no) (a |an )?manufacturer buyback')
    or (lower(coalesce(payload->>'description','')) ~ 'reacquired (this )?vehicle'
        and lower(coalesce(payload->>'description','')) !~ '(we|our (dealership|store|team)) (have |has )?reacquired')
    or lower(coalesce(payload->>'description','')) ~ 'lemon.law[^.!]{0,40}branded title'
    or lower(coalesce(payload->>'description','')) ~ 'reac?quired by (the )?manufacturer'
    or lower(coalesce(payload->>'description','')) ~ 'buy[\s-]?back\s*/\s*lemon[\s-]?law'
    or lower(coalesce(payload->>'description','')) ~ 'lemon[\s-]?law\s*/\s*buy[\s-]?back'
    -- NEW 2026-09-06: the plain verb with the manufacturer as its agent,
    -- guarded against a denial of it.
    or (lower(coalesce(payload->>'description','')) ~ 'repurchased by (the |its )?manufacturer'
        and lower(coalesce(payload->>'description','')) !~ '(not|never) (been )?repurchased by')
  );
