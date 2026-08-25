import type { CardRow } from "./card";
import { cleanModel, modelKey, preferredForm } from "./modelName";

// The per-model tally behind the popular band, the search suggestions, the
// make/model dropdowns, and the featured sort's depth term. Extracted from
// components/Browse.tsx when /api/index/first became a second consumer: the
// server-rendered first paint and the client's own recompute have to agree on
// what "the four deepest models" means, and two implementations of a tally is
// how they stop agreeing.
//
// Case-insensitive because dealer feeds disagree on casing ("Nissan ARIYA" /
// "Nissan Ariya"); the most common form is the display one.

export interface ModelCount {
  make: string;
  model: string;
  count: number;
}

export interface ModelTally {
  /** Cars per model, keyed lowercased "make model" — featuredScore's depth term. */
  counts: Map<string, number>;
  /** Every model listed at least twice, deepest first, for the search box.
   *  A model listed once is as likely a feed typo as a car. */
  suggestions: { label: string; count: number }[];
  /** The four deepest models — the band under the search box. Deep inventory
   *  is the popularity signal we actually have. */
  popular: ModelCount[];
  /** The models on offer under each make, for the filter panel's and /worth's
   *  dropdowns — folded and pruned, not the raw distinct strings. */
  makesModels: Record<string, string[]>;
}

/**
 * How many cars a spelling needs before it is offered as a model to pick.
 *
 * The same floor, for the same reason, as `suggestions` below: a model listed
 * once is as likely a feed typo as a car. It is doing more work here, because
 * a dropdown is a list of claims about what exists — 169 of the 591 folded
 * Hyundai-through-Volvo entries were single cars, and they are where the ad
 * copy ("Model 3 FSD INCLUDED!!"), the truncated VIN-decoder junk ("AVZZ",
 * "ACZZ") and the trim-contaminated one-offs ("IONIQ 6 SE Standard Range")
 * all live. Nothing becomes unreachable: the search box matches the raw
 * string in `hay`, and a pruned model still answers its own URL, because
 * match.ts compares folded keys rather than list membership.
 */
const MIN_LISTINGS_TO_OFFER = 2;

export function modelTally(rows: CardRow[]): ModelTally {
  const tally = new Map<string, { count: number; forms: Map<string, { make: string; model: string; n: number }> }>();
  // Per make, per folded model: how many cars, and how each spelling was typed.
  const offered = new Map<string, Map<string, { n: number; forms: Map<string, number> }>>();
  for (const r of rows) {
    const byModel = offered.get(r.make) ?? new Map();
    const k = modelKey(r.model);
    const e = byModel.get(k) ?? { n: 0, forms: new Map<string, number>() };
    e.n += 1;
    const shown = cleanModel(r.model);
    e.forms.set(shown, (e.forms.get(shown) ?? 0) + 1);
    byModel.set(k, e);
    offered.set(r.make, byModel);
    // `tally` below keys on the RAW lowercased string and stays that way. It
    // feeds the featured sort's depth term, which components/Browse.tsx and
    // firstPaint.ts both recompute — the two have to agree on the key, and a
    // grid that reshuffles under the shopper is what that costs.
    const form = `${r.make} ${r.model}`;
    const t = tally.get(form.toLowerCase()) ?? { count: 0, forms: new Map() };
    t.count += 1;
    const f = t.forms.get(form) ?? { make: r.make, model: r.model, n: 0 };
    f.n += 1;
    t.forms.set(form, f);
    tally.set(form.toLowerCase(), t);
  }
  // Sorted case-insensitively, because the labels are feed spellings and an
  // ASCII sort files every SHOUTED one in its own block above the lowercase
  // ones. A native select's type-ahead is keyed on the label, so alphabetical
  // is what makes a 20-entry list usable.
  const makesModels: Record<string, string[]> = {};
  for (const [make, byModel] of offered) {
    makesModels[make] = [...byModel.values()]
      .filter((e) => e.n >= MIN_LISTINGS_TO_OFFER)
      .map((e) => preferredForm(e.forms))
      .sort((a, b) => a.localeCompare(b, "en", { sensitivity: "base" }));
  }
  const counts = new Map<string, number>();
  const canon = [...tally.entries()]
    .map(([key, t]) => {
      counts.set(key, t.count);
      const best = [...t.forms.values()].sort((a, b) => b.n - a.n)[0];
      return { make: best.make, model: best.model, count: t.count };
    })
    .sort((a, b) => b.count - a.count);
  const suggestions = canon
    .filter((c) => c.count >= 2)
    .map((c) => ({ label: `${c.make} ${c.model}`, count: c.count }));
  return { counts, suggestions, popular: canon.slice(0, 4), makesModels };
}
