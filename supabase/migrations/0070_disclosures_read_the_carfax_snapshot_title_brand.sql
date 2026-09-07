-- The two disclosure columns also read the title brand off the dealer's own
-- Carfax Snapshot.
--
-- Owner, 2026-09-07, on victoryfordkc.com's 2024 F-150 Lightning Flash
-- 1FT6W3L70RWG19114 ($43,500): "This is another buyback but I only saw it on
-- the carfax. Is there anyway for us to see it?" The dealer wrote no notes
-- and its inventory API says nothing; the Carfax Snapshot the dealer embeds
-- on the VDP for every shopper reads "Branded Title: Buyback/Lemon".
-- scraper/carfax-snapshot.mjs reads that one line, only where the seller
-- published the snapshot key, and ingest carries it into the payload as
-- `titleBrand` (a short string, never a timestamp — 0025's payload-equality
-- rule). The what-and-why is in scraper/lib/carfax-snapshot.mjs.
--
-- This migration is the join: buyback_disclosed is also true when the brand
-- names a buyback or lemon; branded_title_disclosed is also true when there
-- is any brand at all. The dealer-word clauses are exactly 0067's and
-- 0069's, restated because SET EXPRESSION takes the whole expression.
--
-- Nothing else moves: a car with no titleBrand evaluates exactly as before
-- (measured: 0 rows change on apply, since no row carries the key yet).
-- The Carfax words seen so far: "Buyback/Lemon". Others ("Salvage",
-- "Rebuilt", "Flood", …) land as branded titles by construction.
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
    -- NEW 2026-09-07: the dealer's Carfax Snapshot names a buyback or lemon brand.
    or lower(coalesce(payload->>'titleBrand','')) ~ '(buy[\s-]?back|lemon)'
  );

alter table listings
  alter column branded_title_disclosed
  set expression as (
    (
      lower(coalesce(payload->>'description','')) ~ '(^|[.!,;:]\s*|\s(this|a|an|has|with|is|carries|the)\s+)(branded|salvage|rebuilt|flood)[ -]title(?![ -]?(dealer|dealership|specialist|expert|store|inventory|vehicles|cars|business|program))'
      or lower(coalesce(payload->>'description','')) ~ 'this (branded|salvage|rebuilt|flood)[ -]title '
      or lower(coalesce(payload->>'description','')) ~ 'title (is|has been|was) branded'
      or lower(coalesce(payload->>'description','')) ~ 'branded as (a )?(salvage|rebuilt|lemon|flood)'
      or lower(coalesce(payload->>'description','')) ~ 'lemon( law)? (branded )?title'
      or lower(coalesce(payload->>'description','')) ~ 'title:\s*(branded|salvage|rebuilt|flood|lemon)\M'
    )
    and lower(coalesce(payload->>'description','')) !~ '(not|no|never|without|isn''t|is not) (a |an )?(salvage|rebuilt|flood|branded|lemon)[ -]title'
    -- NEW 2026-09-07: any brand on the dealer's Carfax Snapshot.
    or coalesce(payload->>'titleBrand','') <> ''
  );
