-- "A branded-title dealership" is a statement about the dealer, not the car.
--
-- 0068 flagged 13 live rows on today's thin descriptions. Read one by one,
-- 4 are the car's own title ("this vehicle has a rebuilt title due to prior
-- accident history", carvymotors.com; "rebuilt title!!!", nextstepcars.com;
-- "this vehicle has branded title history"), and 5 are stricklandauto.com's
-- opener on every car it lists: "At Strickland Auto, we take pride in being
-- a branded-title dealership that builds a high volume of vehicles
-- in-house." 0068's subject rule let it through because "a" precedes the
-- phrase. The 1,632-character note says nothing else about the title.
--
-- Strickland's cars very likely ARE rebuilds — a dealership that builds
-- vehicles in-house says so — but the seller has not said it of this car, and
-- the house rule is that the site does not infer a claim the seller did not
-- make. Matching nothing is honest; matching the wrong thing is not. If a
-- dealer-level signal is wanted, it is a prioritiser in the shape of
-- buyback-dealers.mjs, not a flag on the car.
--
-- The change is one lookahead on the subject clause: "branded title" followed
-- by dealer/dealership/specialist/expert/store/inventory/vehicles/cars/
-- business/program is the dealer talking about itself. Controls, verified as
-- literal strings 2026-09-06 (0068's, plus the Strickland sentence and "we
-- are a salvage title specialist"): 14 of 14 agree; the four genuine car-level
-- disclosures above all still match. Can only un-flag; over today's rows,
-- 5 lose (Strickland), 0 gain.
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
  );
