-- A third disclosure template, found by reading a lot we had never read.
--
-- 0053 was written from the two templates the corpus then held. The per-VIN
-- notes lane (scraper/vdp-notes.mjs) went and fetched dealer notes that no
-- inventory API carries, and the very first four cars it read produced a third:
--
--   bostonforeignmotor.com, 2024 BMW i4 WBY43FK03RCR45219 and 2023 i5
--   WB523CF09PCL96166 (2026-08-27): "THIS VEHICLE WAS REAQUIRED BY
--   MANUFACTURER UNDER THE STATE CONSUMER WARRANTY LAW ( BUY BACK/LEMON LAW)
--   DUE TO HIGH VOLTAGE BATTERY MODULE 5 CONCERN. REPLACED CELL MODUEL 5 AT
--   10,552 MILES."
--
-- Two reasons nothing matched. The dealer spells it REAQUIRED, missing the c —
-- so 0053's `reacquired` misses it, and would have missed it even if the word
-- order had been right. And the two terms arrive as a parenthetical pair,
-- "( BUY BACK/LEMON LAW)", not as the adjacent phrase "lemon law buyback".
--
-- The pattern is a claim about a real car, so both clauses are narrow:
--
--   `reac?quired by (the )?manufacturer`  — tolerates the missing c, and
--       requires the manufacturer as the actor, which is the whole
--       distinction between a repurchase and a dealer taking a car in trade.
--   `buy back / lemon law` in either order, slash-joined — a pairing that
--       appears in disclosures and nowhere else.
--
-- Controls, all verified as literal strings 2026-08-27 (0024's two, 0053's
-- third, and two new ones for the wording added here):
--   'coverage does not apply to as-is, tax tow, salvage, or lemon law
--    vehicles.'                                                     -> no match
--   'we never sell a manufacturer buyback and do not offer lemon law
--    vehicles.'                                                     -> no match
--   'we reacquired this vehicle from its original owner, a local
--    one-owner trade.'                                              -> no match
--   'still covered by the manufacturer warranty; ask about our lemon
--    law protection plan add-on.'                                   -> no match
--   'clean carfax, one owner, no accidents, buy back guarantee on
--    financing available.'                                          -> no match
-- and both real disclosures above match, as does the correctly spelled
-- "this vehicle was reacquired by the manufacturer".
--
-- Dry run over all 137,612 rows before applying: 0 rows lose a flag, 0 gain
-- one — the Boston cars are not in `listings` yet, because their notes were
-- read into the lane's cache and reach the payload on the next sync. Strictly
-- additive by construction and measured.
--
-- EXPECT A FOURTH TEMPLATE. Three lots have produced three wordings, so the
-- lane now prints every note it reads that uses buyback language, whether or
-- not these patterns match it (see vdp-notes.mjs's review queue). Reading a
-- new lot is what finds a new template; the queue is what stops it being the
-- owner who finds it.
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
    -- NEW 2026-08-27: the manufacturer as the actor, tolerating the missing c.
    or lower(coalesce(payload->>'description','')) ~ 'reac?quired by (the )?manufacturer'
    -- NEW 2026-08-27: the parenthetical pairing, either order.
    or lower(coalesce(payload->>'description','')) ~ 'buy[\s-]?back\s*/\s*lemon[\s-]?law'
    or lower(coalesce(payload->>'description','')) ~ 'lemon[\s-]?law\s*/\s*buy[\s-]?back'
  );
