import type { CardRow } from "./card";
import { REMOVABLE, SPEC_FACETS, splitValues, type FacetKey, type RemovableFilter } from "../filters";
import { modelKey } from "./modelName";
import { isDeal } from "./deal";

// The browse grid's filter semantics as one shared function. Extracted from
// components/Browse.tsx when alert emails became a second consumer: an alert
// that fires on a car the shopper's own search wouldn't show is a broken
// promise, and two implementations of "matches" is how that happens.
//
// Consumers: Browse.tsx (client, per keystroke) and scripts/send-alerts.mjs
// (Node, nightly). Runtime imports here stay RELATIVE and dependency-free —
// the sender runs this file under node --experimental-strip-types, which
// erases `import type` but cannot resolve the "@/" alias.

// Which field on a row each spec facet groups by. Values are strings because
// that's what a URL carries; the numeric facets sort back to numbers.
export const FACET_OF: Record<FacetKey, (r: CardRow) => string | undefined> = {
  trim: (r) => r.trim,
  kwh: (r) => (r.kwh != null ? String(r.kwh) : undefined),
  epa: (r) => (r.rangeMi != null ? String(r.rangeMi) : undefined),
  drive: (r) => r.drive,
};

export interface MatchContext {
  /** Distance from the search's origin, when one exists. Its absence is what
   *  disables the zip filter — same as Browse with no resolvable origin. */
  distanceMi?: (r: CardRow) => number | undefined;
  /** Whether the searcher holds a Pro pass. Its absence is what disables the
   *  deals filter: Browse passes lib/useProState's answer, the alert sender
   *  passes whether the subscription's address holds a live pass. */
  pro?: boolean;
}

export type FilterTests = Partial<Record<RemovableFilter, (r: CardRow) => boolean>>;

/**
 * Each active filter is its own predicate, which is what lets an empty
 * result say how many cars dropping any single one would give back.
 * `get` returns the raw URL value for a key, "" when absent.
 */
export function buildTests(get: (k: string) => string, ctx: MatchContext = {}): FilterTests {
  const num = (k: string) => Number(get(k)) || undefined;
  const tests: FilterTests = {};

  const q = get("q").toLowerCase().trim();
  const zip = get("zip");
  const radiusParam = get("radius");
  const radius = radiusParam || "50";

  // An inferred origin only *filters* when the visitor explicitly chose a
  // radius; otherwise the 50-mile default would silently hide most inventory
  // behind a guess, with no chip to say so.
  if (ctx.distanceMi && radius !== "any" && (zip || radiusParam)) {
    const within = Number(radius);
    const distanceMi = ctx.distanceMi;
    tests.zip = (r) => {
      const d = distanceMi(r);
      return d !== undefined && d <= within;
    };
  }
  if (q) {
    // A one- or two-letter token is a substring of half the language: "y" in
    // "tesla model y" lands inside "grey" and drags in every Model 3 painted
    // Stealth Grey. Short tokens have to match a whole word; longer ones keep
    // matching inside one, which is what lets "buzz" find "ID. Buzz".
    const toks = q.split(/\s+/).map((tok) => {
      if (tok.length > 2) return (hay: string) => hay.includes(tok);
      const re = new RegExp(`\\b${tok.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`);
      return (hay: string) => re.test(hay);
    });
    tests.q = (r) => toks.every((match) => match(r.hay));
  }
  const make = get("make");
  const model = get("model");
  const cond = get("cond");
  const drive = get("drive");
  const body = get("body");
  const minPrice = num("minPrice");
  const maxPrice = num("maxPrice");
  const minYear = num("minYear");
  const maxYear = num("maxYear");
  const maxMiles = num("maxMiles");
  const minRange = num("minRange");
  if (make) tests.make = (r) => r.make === make;
  // Folded, not exact: the dropdown now offers one entry per model and the
  // feed spells most of them several ways, so an exact test would answer
  // "Tucson Plug-in Hybrid" with 695 of the 1,125 that exist. Folding also
  // keeps every URL and saved alert that predates the dropdown working — an
  // old ?model=TUCSON+PLUG-IN+HYBRID folds to the same key as the label that
  // replaced it, which is why pruning the tail costs no car its own page.
  if (model) {
    const k = modelKey(model);
    tests.model = (r) => modelKey(r.model) === k;
  }
  if (cond === "new") tests.cond = (r) => r.condition === "new";
  else if (cond === "used") tests.cond = (r) => r.condition === "used" || r.condition === "certified" || !r.condition;
  // Values OR, same as the spec facets below: the drivetrain facet writes
  // "RWD,AWD" into the one key the panel and the quick toggle already use,
  // and a single value is the one-element case of the same test.
  if (drive) {
    const on = new Set(splitValues(drive));
    tests.drive = (r) => r.drive !== undefined && on.has(r.drive);
  }
  // Curated model→body map; cars we can't verifiably classify sit this one out.
  if (body) tests.body = (r) => r.body === body;
  // A price filter is about price, so a car whose feed gave us a lease
  // payment instead of one can't satisfy it either way.
  if (minPrice) tests.minPrice = (r) => r.realPrice && r.priceUsd >= minPrice;
  if (maxPrice) tests.maxPrice = (r) => r.realPrice && r.priceUsd <= maxPrice;
  if (minYear) tests.minYear = (r) => r.year >= minYear;
  if (maxYear) tests.maxYear = (r) => r.year <= maxYear;
  if (maxMiles) tests.maxMiles = (r) => r.mileage != null && r.mileage <= maxMiles;
  if (minRange) tests.minRange = (r) => !!r.rangeMi && r.rangeMi >= minRange;
  if (get("heatPump") === "1") tests.heatPump = (r) => r.heatPump === "yes";
  // Only cuts the card itself claims (≥$500, ≤14 days, both prices real —
  // card.ts `cut`), so the toggle can never surface a cheaper extraction
  // methodology as a discount.
  if (get("cut") === "1") tests.cut = (r) => r.cut !== undefined;
  // The card's own incentive summary (buildIndex → lib/incentives/match.ts):
  // set only where the car meets a program's car-side conditions under the
  // site policy, so the toggle can never keep a car on a guess.
  // Pro only since 2026-09-03, the same way as "deal" below: a stranger's
  // ?rebate=1 is inert, and the rail hides the toggle without a pass.
  if (get("rebate") === "1" && ctx.pro) tests.rebate = (r) => r.incentive !== undefined;
  // Pro only. The predicate is the card's own ask-vs-market figure at the
  // threshold in lib/listings/deal.ts; a car with no figure is unjudged and
  // sits the filter out.
  if (get("deal") === "1" && ctx.pro) tests.deal = (r) => isDeal(r);
  // Values OR within a spec facet ("Lariat or XLT"), facets AND with each
  // other. A car whose version we can't pin down has no value to match on and
  // sits the facet out, the same way the drivetrain and body filters work.
  for (const f of SPEC_FACETS) {
    const on = new Set(splitValues(get(f.key)));
    if (!on.size) continue;
    const facetOf = FACET_OF[f.key];
    tests[f.key] = (r) => {
      const v = facetOf(r);
      return v !== undefined && on.has(v);
    };
  }
  return tests;
}

/**
 * Whether a row has a knowable answer on a quick toggle's axis — the
 * denominator for "does this toggle divide anything".
 *
 * The toggles only ever admit cars we can verifiably classify, so a car we
 * know nothing about fails every one of them. That makes a pure count of
 * non-matches a lie about what the button does: on an F-150 Lightning search
 * "200+ mi range" excludes 19 of 357 trucks, and NOT ONE of them is under 200
 * miles — every Lightning is 230, 240, 300 or 320. The 19 are trucks whose
 * range we never resolved. Offered, that button reads as a range filter and
 * acts as a "do we have data" filter. Same story on an Ioniq 5, where it hides
 * 700 cars and none of them are short-range.
 *
 * So the rail counts fails among cars it can actually judge. Keep these in
 * step with the predicates in buildTests above: each one answers "could this
 * row ever pass or fail this filter on its merits", not "does it pass".
 */
export const QUICK_KNOWS: Partial<Record<RemovableFilter, (r: CardRow) => boolean>> = {
  body: (r) => r.body !== undefined,
  minRange: (r) => r.rangeMi != null,
  maxMiles: (r) => r.mileage != null,
  drive: (r) => r.drive !== undefined,
  // A lease payment where a price should be isn't a cheap car, it's no price.
  maxPrice: (r) => r.realPrice,
  minPrice: (r) => r.realPrice,
  // "verify" is an unresolved claim, not an answer.
  heatPump: (r) => r.heatPump === "yes" || r.heatPump === "no",
  // A cut is a price event, so only cars with a believable price can be
  // judged for one.
  cut: (r) => r.realPrice,
  // A program needs a dealer state, a condition and a real price to be
  // judged at all; a row missing any of those never passes or fails on its
  // merits.
  rebate: (r) => r.state !== undefined && r.condition !== undefined && r.realPrice,
};

/** The filters that are actually on, in the order they read. */
export function activeFilterKeys(tests: FilterTests): RemovableFilter[] {
  return REMOVABLE.filter((k) => tests[k]);
}

/** Does this row pass every active filter (minus `skip`, for relief counts)? */
export function rowMatches(tests: FilterTests, r: CardRow, skip?: string): boolean {
  return activeFilterKeys(tests).every((k) => k === skip || tests[k]!(r));
}
