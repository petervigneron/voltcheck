-- A seller who says every car it sells has a branded title has said it of
-- this car.
--
-- Owner, 2026-09-08, on parklinemotors.com's 2022 Rivian R1T 7FCTGAAA1NN011275
-- ($45,821, 25,726 mi): "How did we miss the branded title on this truck?!!?"
-- 0069 ruled that "a premium selection of pre-owned branded title vehicles"
-- and "our branded title expertise" are the dealer talking about itself, and
-- they are — but Parkline's homepage also says "Every car in our inventory is
-- handpicked and expertly rebuilt", and 24 of its 45 cars carry a per-car
-- sentence ("This branded title Tesla Model Y has passed...") that the other
-- 21, this Rivian included, happen not to. The seller has made the claim
-- about every car on the lot; the site was waiting for it to be repeated on
-- each one.
--
-- So ingest.mjs now writes `inventoryBranded: true` onto every car of a
-- rooftop in registry/branded-title-dealers.json — a hand-curated list where
-- each entry quotes the seller's own words and where they were read
-- (parklinemotors.com and stricklandauto.com today), because the claim
-- covers a whole lot and one wrong entry would brand dozens of clean cars.
-- Candidates are surfaced by buyback-dealers.mjs; a person adds them. This
-- migration is the join: branded_title_disclosed also reads that field. The
-- dealer-word and Carfax clauses are 0069's and 0070's, restated because SET
-- EXPRESSION takes the whole expression. buyback_disclosed is untouched — a
-- rebuilt-title lot is not a repurchase lot.
--
-- Measured before applying: 0 rows change on apply (no row carries the field
-- yet); the first sync of the two lots brands 45 + 5 cars.
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
    or coalesce(payload->>'titleBrand','') <> ''
    -- NEW 2026-09-08: the seller says it of every car on the lot.
    or coalesce(payload->>'inventoryBranded','') = 'true'
  );
