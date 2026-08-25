// One nameplate, one entry.
//
// A dealer feed's `model` field is free text, and 137,322 cars filed 721
// distinct spellings of about 500 cars. Most of the difference is nothing:
// "Tucson Plug-In Hybrid", "TUCSON Plug-in Hybrid", "TUCSON PLUG-IN HYBRID"
// and "Tucson Plugin Hybrid" are 1,125 of the same car typed four ways. Some
// of it is a dealer using the model field as an ad slot — "IONIQ 5 SEL
// (ORIGINAL MSRP $42,350!!!!)", "Model 3 FSD INCLUDED!!".
//
// Left alone that reaches the shopper twice, and the second time costs money.
// The make/model dropdown listed all 40 Hyundai spellings, and picking the
// wrong one is not a cosmetic mistake: on 2026-08-25 /worth answered
// `model=IONIQ 5 SEL` (4 cars nationally, 0 of them a 2023) with "fewer than
// four comparable listings — too few to put a number on", where `model=Ioniq
// 5` answered $24,500 from 440 comps. Same car. The seller who happened to
// scroll to the uglier entry was told their car couldn't be valued.
//
// WHAT THIS FOLDS, and only this: case, whitespace, and punctuation. Two
// strings merge only when they are the same characters typed differently, so
// a fold can never put two different cars in one bucket. The plus is the one
// exception carried through — it is identity at the model level, not
// punctuation (a Mercedes EQS 450+ is rear-drive and an EQS 450 is a 4MATIC;
// lib/enrichment/match.ts holds the same rule as trimPlusMismatch).
//
// WHAT THIS DELIBERATELY DOES NOT FOLD: trim words. "IONIQ 5 SEL" keeps its
// own entry rather than collapsing onto "Ioniq 5". A prefix rule would do it
// in one line and would also collapse "Ioniq 5 N" — a $67k performance car —
// onto the $44k Ioniq 5, and no ratio test separates them (the N is 73 cars
// against 4,948, 1.5%, which is exactly where the ad-slot strings live too).
// Collapsing to the nameplate needs a curated authority to be safe, and
// matching the wrong thing is worse than matching nothing. The tail is
// handled by depth instead — see tally.ts.

/**
 * A model string with dealer noise removed: a trailing parenthetical and any
 * repeated whitespace. Everything a shopper reads goes through this, so the
 * label in a dropdown is a real feed spelling minus the ad copy.
 */
export function cleanModel(model: string): string {
  return model.replace(/\s*\([^)]*\)\s*$/, " ").replace(/\s+/g, " ").trim();
}

/**
 * The comparison key. Everything but letters, digits and the plus is dropped,
 * which is what lets "Plug-In", "Plug In" and "Plugin" answer to each other
 * without any list of spellings to maintain.
 */
export function modelKey(model: string): string {
  return cleanModel(model).toLowerCase().replace(/[^a-z0-9+]/g, "");
}

/**
 * Which of several spellings of one model to show.
 *
 * The commonest wins, because the feed's own majority is the closest thing to
 * a house style we have. Ties go to the spelling that isn't shouting:
 * "eSprinter 2500" and "Esprinter 2500" are 24 cars each, and one of them is
 * how Mercedes writes it.
 */
export function preferredForm(forms: Map<string, number>): string {
  const shouty = (s: string) => s === s.toUpperCase();
  return [...forms.entries()].sort(
    (a, b) => b[1] - a[1] || Number(shouty(a[0])) - Number(shouty(b[0])) || a[0].localeCompare(b[0])
  )[0][0];
}
