import type { CardRow } from "./card";

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
  /** Distinct models under each make, for the filter panel's dropdowns. */
  makesModels: Record<string, string[]>;
}

export function modelTally(rows: CardRow[]): ModelTally {
  const tally = new Map<string, { count: number; forms: Map<string, { make: string; model: string; n: number }> }>();
  const makesModels: Record<string, string[]> = {};
  for (const r of rows) {
    (makesModels[r.make] ??= []).push(r.model);
    const form = `${r.make} ${r.model}`;
    const t = tally.get(form.toLowerCase()) ?? { count: 0, forms: new Map() };
    t.count += 1;
    const f = t.forms.get(form) ?? { make: r.make, model: r.model, n: 0 };
    f.n += 1;
    t.forms.set(form, f);
    tally.set(form.toLowerCase(), t);
  }
  for (const k of Object.keys(makesModels)) makesModels[k] = [...new Set(makesModels[k])].sort();
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
