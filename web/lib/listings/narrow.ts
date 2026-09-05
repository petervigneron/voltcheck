import type { CardRow } from "./card";
import { SPEC_FACETS, type FacetGroup, type RemovableFilter } from "../filters";
import type { FilterTests } from "./match";
import { modelKey } from "./modelName";

// The narrowing menus under the filter rail: which makes a filtered result
// spans, and once a make is picked, which of its models.
//
// Why it exists (owner, 2026-09-05): press "Price cut" or "AWD" or the rebate
// toggle and the grid is thousands of cars across forty makes, and the only
// way to get to the Fords among them was to open "All filters" and find the
// make in a <select> whose closed state doesn't even say what's in it. A
// shopper who has just narrowed by one axis is asked the next question on
// the page itself, with the count each answer would leave, the same way the
// spec rail asks "which version" once the results are one model. A menu, not
// a row of chips (owner, same day, after seeing the chips): forty-three makes
// is a list to scan for a name, and a menu costs one cell of the page.
//
// Each row is single-choice, because `make` and `model` are single-valued
// everywhere they are read (match.ts, the panel, the alert sender), and it
// stands only while the question is open: a chosen make is already on the
// rail as its own remove-chip, so repeating it as a pressed row would be two
// controls for one state and a row of the page for nothing. Pick a make, the
// make row gives way to the model row; pick a model, and the spec rail takes
// over. Nothing shows on the pristine landing — there is no result set to
// narrow yet, and the popular band already answers "where do I start".
//
// Counts hold every OTHER filter fixed and lift the row's own key (and the
// keys below it — a model or a trim means nothing under a different make), so
// a make's number is what pressing it would leave, never a share of a pool
// that a stale model choice has already emptied.

const LIFT_FOR_MAKE = new Set<string>(["make", "model", ...SPEC_FACETS.map((f) => f.key)]);
const LIFT_FOR_MODEL = new Set<string>(["model", ...SPEC_FACETS.map((f) => f.key)]);

/** The row whose question is open right now, or nothing. */
export function narrowFacets(
  all: CardRow[],
  tests: FilterTests,
  activeKeys: RemovableFilter[],
  get: (k: string) => string,
  makesModels: Record<string, string[]>
): FacetGroup[] {
  // Nothing has been narrowed, so there is nothing to narrow further.
  if (activeKeys.length === 0) return [];
  const passes = (r: CardRow, lift: Set<string>) => activeKeys.every((k) => lift.has(k) || tests[k]!(r));

  const make = get("make");
  if (!make) {
    const counts = new Map<string, number>();
    for (const r of all) if (passes(r, LIFT_FOR_MAKE)) counts.set(r.make, (counts.get(r.make) ?? 0) + 1);
    // One make isn't a choice: "tesla" typed in the box already answered it.
    if (counts.size < 2) return [];
    return [{ key: "make", label: "Make", values: order([...counts].map(([v, n]) => ({ v, label: v, n }))) }];
  }

  if (get("model")) return [];
  // The models on offer under this make, under the dropdown's own labels
  // (tally.ts folds the feed's spellings and prunes the single-car tail), so
  // a chip writes the same URL the panel would and the two never disagree.
  const labels = new Map<string, string>();
  for (const l of makesModels[make] ?? []) labels.set(modelKey(l), l);
  const counts = new Map<string, number>();
  for (const r of all) {
    if (!passes(r, LIFT_FOR_MODEL)) continue;
    const k = modelKey(r.model);
    if (labels.has(k)) counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  if (counts.size < 2) return [];
  return [
    {
      key: "model",
      label: "Model",
      values: order([...counts].map(([k, n]) => ({ v: labels.get(k)!, label: labels.get(k)!, n }))),
    },
  ];
}

// By name, not by depth: a shopper opening a list of forty makes is looking
// for one they already have in mind, and the count beside it says the depth.
// (The trim menu sorts by depth because nobody knows trim names in advance;
// everybody knows "Ford".) Case-insensitive, since the names are feed
// spellings and an ASCII sort files every SHOUTED one above the rest.
function order(values: FacetGroup["values"]): FacetGroup["values"] {
  return values.sort((a, b) => a.v.localeCompare(b.v, "en", { sensitivity: "base" }));
}
