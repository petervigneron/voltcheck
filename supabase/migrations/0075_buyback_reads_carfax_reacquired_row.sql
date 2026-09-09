-- Carfax states a manufacturer buyback as a row of its own, not only under
-- "Branded Title:".
--
-- victoryfordkc.com's 2024 F-150 Lightning 1FTVW3L70RWG09842 ($47,500,
-- 12,014 mi), 2026-09-09: its snapshot has no title-brand row and opens with
-- "Reacquired by Manufacturer". The lane's first parser read only "Branded
-- Title: …", cached the car as clean, and the owner found it on the site
-- with no warning the day after the lot's other buyback sold. The parser now
-- keeps any row naming a brand, a buyback or a reacquisition as titleBrand
-- (scraper/lib/carfax-snapshot.mjs), and re-asks every "clean" answer the
-- old parser wrote. This migration is the matching join: 0070's clause
-- matched titleBrand only on buyback|lemon; it now also matches the
-- reacquired and repurchase wordings. branded_title_disclosed already reads
-- any titleBrand and is untouched. The dealer-word clauses are 0067's,
-- restated because SET EXPRESSION takes the whole expression.
--
-- Controls on titleBrand, as literal strings 2026-09-09: "Reacquired by
-- Manufacturer" -> true; "Buyback/Lemon" -> true; "Salvage" -> false (a
-- brand, not a repurchase); "" -> false. 0 rows change on apply: no row yet
-- carries the new wording.
alter table listings
  alter column buyback_disclosed
  set expression as (
    lower(coalesce(payload->>'description','')) ~ 'agreeing to repurchase the vehicle'
    or lower(coalesce(payload->>'description','')) ~ 'lemon([\s-]?law)?[\s-]?buy[\s-]?back'
    or lower(coalesce(payload->>'description','')) ~ 'buy[\s-]?back lemon'
    or lower(coalesce(payload->>'description','')) ~ '(^|[^a-z])vehicle (is|was) a ((manufacturer|manufactured|manuf\.?|factory|gm|ford) )?(buy[\s-]?back|repurchase)'
    or (lower(coalesce(payload->>'description','')) ~ 'manuf(acturer|actured|\.)?''?s? buy[\s-]?back'
        and lower(coalesce(payload->>'description','')) !~ '(not|never|no)( [a-z]+){0,2} (a |an )?manuf(acturer|actured|\.)?''?s? buy[\s-]?back')
    or lower(coalesce(payload->>'description','')) ~ '(^|[^a-z])(gm|ford|factory|gm factory|ford factory) buy[\s-]?back(?![\s-]?(guarantee|protection|program))'
    or (lower(coalesce(payload->>'description','')) ~ 'reac?quired (this )?veh[ci]{2,3}le'
        and lower(coalesce(payload->>'description','')) !~ '(we|our (dealership|store|team)) (have |has )?reac?quired')
    or lower(coalesce(payload->>'description','')) ~ 'lemon.law[^.!]{0,40}branded title'
    or lower(coalesce(payload->>'description','')) ~ 'reac?quired by (the )?manufacturer'
    or lower(coalesce(payload->>'description','')) ~ 'buy[\s-]?back\s*/\s*lemon[\s-]?law'
    or lower(coalesce(payload->>'description','')) ~ 'lemon[\s-]?law\s*/\s*buy[\s-]?back'
    or (lower(coalesce(payload->>'description','')) ~ 'repurchased by (the |its )?manufacturer'
        and lower(coalesce(payload->>'description','')) !~ '(not|never) (been )?repurchased by')
    or lower(coalesce(payload->>'description','')) ~ 'repurchased by [a-z][a-z-]*( [a-z-]+){0,2} (of america|usa|north america|of north america|motor company)'
    -- 2026-09-09: Carfax's own wordings for a repurchase, in any row.
    or lower(coalesce(payload->>'titleBrand','')) ~ '(buy[\s-]?back|lemon|reac?quired|repurchase)'
  );
