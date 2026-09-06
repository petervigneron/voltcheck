import type { CardRow } from "./card";
import { SPEC_FACETS, splitValues, type FacetGroup, type RemovableFilter } from "../filters";
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
// Each menu takes several values that OR, the way the trim menu does, and
// stays put reading what's picked ("Ford, Tesla") — the owner's call of
// 2026-09-05 after a day with the single-choice version: "it would make
// sense to be able to select multiple brands at once". match.ts ORs the
// comma list in the same `make` and `model` keys the panel and every saved
// alert already use. The model menu is offered under exactly one make,
// because a model belongs to a make and the panel's own model list is keyed
// the same way. Nothing shows on the pristine landing — there is no result
// set to narrow yet, and the popular band already answers "where do I start".
//
// Counts hold every OTHER filter fixed and lift the menu's own key (and the
// keys below it — a model or a trim means nothing under a different make), so
// a make's number is what picking it alone would leave, never a share of a
// pool that a stale model choice has already emptied.

const LIFT_FOR_MAKE = new Set<string>(["make", "model", ...SPEC_FACETS.map((f) => f.key)]);
const LIFT_FOR_MODEL = new Set<string>(["model", ...SPEC_FACETS.map((f) => f.key)]);

/** The menus this result set can offer, in the order they read. */
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

  const out: FacetGroup[] = [];
  const makes = splitValues(get("make"));
  const models = splitValues(get("model"));

  const makeCounts = new Map<string, number>();
  for (const r of all) if (passes(r, LIFT_FOR_MAKE)) makeCounts.set(r.make, (makeCounts.get(r.make) ?? 0) + 1);
  // A picked make stays listed even when the other filters have emptied it
  // (a menu can't lose the value it is showing), and one make isn't a
  // choice: "tesla" typed in the box already answered it.
  for (const m of makes) if (!makeCounts.has(m)) makeCounts.set(m, 0);
  if (makeCounts.size >= 2 || makes.length > 0)
    out.push({ key: "make", label: "Make", values: order([...makeCounts].map(([v, n]) => ({ v, label: v, n }))) });

  if (makes.length !== 1) return out;
  // The models on offer under this make, under the dropdown's own labels
  // (tally.ts folds the feed's spellings and prunes the single-car tail), so
  // the menu writes the same URL the panel would and the two never disagree.
  const labels = new Map<string, string>();
  for (const l of makesModels[makes[0]] ?? []) labels.set(modelKey(l), l);
  for (const m of models) if (!labels.has(modelKey(m))) labels.set(modelKey(m), m);
  const modelCounts = new Map<string, number>();
  for (const r of all) {
    if (!passes(r, LIFT_FOR_MODEL)) continue;
    const k = modelKey(r.model);
    if (labels.has(k)) modelCounts.set(k, (modelCounts.get(k) ?? 0) + 1);
  }
  for (const m of models) if (!modelCounts.has(modelKey(m))) modelCounts.set(modelKey(m), 0);
  if (modelCounts.size >= 2 || models.length > 0)
    out.push({
      key: "model",
      label: "Model",
      values: order([...modelCounts].map(([k, n]) => ({ v: labels.get(k)!, label: labels.get(k)!, n }))),
    });
  return out;
}

// By name, not by depth: a shopper opening a list of forty makes is looking
// for one they already have in mind, and the count beside it says the depth.
// (The trim menu sorts by depth because nobody knows trim names in advance;
// everybody knows "Ford".) Case-insensitive, since the names are feed
// spellings and an ASCII sort files every SHOUTED one above the rest.
function order(values: FacetGroup["values"]): FacetGroup["values"] {
  return values.sort((a, b) => a.v.localeCompare(b.v, "en", { sensitivity: "base" }));
}
