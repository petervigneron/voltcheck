-- What 15,549 dealer notes taught the disclosure test in one afternoon.
--
-- vdp-notes.mjs had read zero cars since 08-27 (see the 09-06 commit that
-- fixed it). Its first real run read the notes of 15,549 used and certified
-- cars on dealer.com lots, and the review queue — every note using buyback
-- vocabulary, matched or not — came back with 460 cars. Read one by one,
-- 331 of them were the false-positive shapes the column must keep ignoring
-- (Carfax Buyback Guarantee, AutoCheck 3 Year Buyback Protection, Hertz's
-- Buy Back Guarantee, "GA Lemon Law or Registration fees", "no lemon
-- history, no branded title"), and 67 were disclosures in wordings none of
-- the ten clauses knew. Dry run over the 16,086 notes in the cache: 132
-- flagged before, 199 after; every one of the 67 quoted below or a sibling.
--
-- NEW WORDINGS, with the car they were read from:
--
--   "VEHICLE IS A BUYBACK THAT WAS REPAIRED BY MANUFACTURER & UNDER FACTORY
--    WARRANTY"  — 46 cars on one lot (3GN7DNRP8SS254736 and siblings).
--    0024's clause wanted "THIS vehicle is a".
--   "This vehicle is a Mercedes-Benz USA Manufactured Buy-Back, reacquired
--    on 4/24/2026 due to an alleged malfunction"  — 6 (W1N9M0KB1RN087104).
--    "Manufactured", hyphenated.
--   "This Vehicle is a Manufacturer Buy back"  — 7SAYGDEF1PF659481. Spaced.
--   "Manuf Buyback RAV:NOISE:R F BEARING"  — 1FT6W3L77RWG24570, Ford's own
--    reacquired-vehicle code pasted into the notes.
--   "BRANDED TITLE LEMON LAW BUY BACK"  — 7SAYGDEE4PA151414. 0024's
--    'lemon.law buyback' needed the word unbroken.
--   "LEMON BUYBACK"  — 3FMTK4SE8PMA77866; "BUYBACK LEMON TITLE"  —
--    KNDRMDLH2N5094221. No "law".
--   "GM BUYBACK", "FACTORY BUYBACK", "GM FACTORY BUYBACK"  — one GM lot
--    (1GKB0NDEXRU114044, 1GKB0NDE9SU109990, 1GKTENDE8TU601384).
--   "Reaquired Vehicle", "REACQUIRED VEHCILE"  — SAL1L9E44SA463681,
--    1GKB0RDC3SU103866. The maker's word, misspelled twice over.
--   "This vehicle was repurchased by Subaru of America"  — JTMABABA4PA022176.
--    The maker named as a company, not as "the manufacturer".
--
-- WHAT STAYS UNFLAGGED, ON PURPOSE. "This branded title Tesla Model Y has
-- passed a thorough 150+ point inspection" (Parkline Motors, ~15 cars) and
-- "This vehicle has a Branded Title" are real disclosures — of a brand, not
-- of a repurchase. A branded title can be salvage or flood; the flag this
-- column drives reads "Manufacturer repurchase" and would be a false claim
-- on those. That is a different fact and would need its own column.
--
-- ONE OLD CONTROL WAS NEVER PASSING. 0053 and 0054 both list
--   'we never sell a manufacturer buyback and do not offer lemon law
--    vehicles.'                                                    -> no match
-- but the guard was '(not|never|no) (a |an )?manufacturer buyback', and "never
-- SELL a" has a word in between, so the live expression flags that sentence.
-- Tested 2026-09-06 both as a literal string and as a JS mirror. The guard
-- now allows up to two words between the negation and the phrase, and this
-- file's control run was made against the expression it ships.
--
-- CONTROLS. All verified as literal strings against this exact expression,
-- 2026-09-06 — 0024's, 0053's, 0054's, 0066's, and twelve new ones drawn from
-- the queue's false-positive shapes:
--   'coverage does not apply to as-is, tax tow, salvage, or lemon law
--    vehicles.'                                                    -> no match
--   'we never sell a manufacturer buyback and do not offer lemon law
--    vehicles.'                                                    -> no match
--   'we reacquired this vehicle from its original owner, a local
--    one-owner trade.'                                             -> no match
--   'this vehicle has never been repurchased by the manufacturer;
--    clean title.'                                                 -> no match
--   'covered by the carfax buyback guarantee for added peace of mind.'
--   'includes autocheck vehicle history report with 3 year buyback
--    protection.'
--   'our 7 day/250 mile buy back guarantee, as well as a standard
--    12mth/12k mile limited powertrain warranty.'
--   'military deployment buyback guarantee - free delivery anywhere in
--    colorado.'
--   'price does not include state/county/local tax, tag, ga lemon law or
--    registration fees.'
--   'all prices plus tax, tag, title, and georgia lemon law.'
--   'we verify every vehicle for quality no lemon history, no branded
--    title, and no major damage.'
--   'we do not carry any salvaged, true miles unknown, lemon law, or
--    flooded vehicles.'
--   'this mach-e was repurchased from the winners of a giveaway at the
--    hollywood casino.'
--   'this branded title tesla model y has passed a thorough 150+ point
--    inspection.'
--   'gm buyback protection plan available on every used car.'
--   'this vehicle has a branded title.'                            -> no match
-- and every disclosure quoted above matches.
--
-- Over the database as it stands (before tonight's sync carries the notes
-- in): see the dry-run counts recorded in the commit. Additive except for the
-- loosened guard, which can only UN-flag a denial — measured, 0 rows lose.
alter table listings
  alter column buyback_disclosed
  set expression as (
    lower(coalesce(payload->>'description','')) ~ 'agreeing to repurchase the vehicle'
    -- lemon-law buyback, any spacing or hyphenation; "lemon buyback"; "buyback lemon title"
    or lower(coalesce(payload->>'description','')) ~ 'lemon([\s-]?law)?[\s-]?buy[\s-]?back'
    or lower(coalesce(payload->>'description','')) ~ 'buy[\s-]?back lemon'
    -- "vehicle is a buyback", with or without "this", with the maker's shorthands
    or lower(coalesce(payload->>'description','')) ~ '(^|[^a-z])vehicle (is|was) a ((manufacturer|manufactured|manuf\.?|factory|gm|ford) )?(buy[\s-]?back|repurchase)'
    -- manufacturer / manufactured / manuf. buy-back, guarded against a denial
    -- with up to two words between ("we never SELL A manufacturer buyback")
    or (lower(coalesce(payload->>'description','')) ~ 'manuf(acturer|actured|\.)?''?s? buy[\s-]?back'
        and lower(coalesce(payload->>'description','')) !~ '(not|never|no)( [a-z]+){0,2} (a |an )?manuf(acturer|actured|\.)?''?s? buy[\s-]?back')
    -- the maker or the factory as the noun's owner, but never a "buyback
    -- guarantee / protection / program" (dealer return policies, history reports)
    or lower(coalesce(payload->>'description','')) ~ '(^|[^a-z])(gm|ford|factory|gm factory|ford factory) buy[\s-]?back(?![\s-]?(guarantee|protection|program))'
    -- the maker's word, tolerating both misspellings seen
    or (lower(coalesce(payload->>'description','')) ~ 'reac?quired (this )?veh[ci]{2,3}le'
        and lower(coalesce(payload->>'description','')) !~ '(we|our (dealership|store|team)) (have |has )?reac?quired')
    or lower(coalesce(payload->>'description','')) ~ 'lemon.law[^.!]{0,40}branded title'
    or lower(coalesce(payload->>'description','')) ~ 'reac?quired by (the )?manufacturer'
    or lower(coalesce(payload->>'description','')) ~ 'buy[\s-]?back\s*/\s*lemon[\s-]?law'
    or lower(coalesce(payload->>'description','')) ~ 'lemon[\s-]?law\s*/\s*buy[\s-]?back'
    or (lower(coalesce(payload->>'description','')) ~ 'repurchased by (the |its )?manufacturer'
        and lower(coalesce(payload->>'description','')) !~ '(not|never) (been )?repurchased by')
    -- the maker named as a company: "repurchased by Subaru of America"
    or lower(coalesce(payload->>'description','')) ~ 'repurchased by [a-z][a-z-]*( [a-z-]+){0,2} (of america|usa|north america|of north america|motor company)'
  );
