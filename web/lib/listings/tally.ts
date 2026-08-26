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

/** Per make, per folded model: how many cars, and how each spelling was
 *  typed. The one fold behind both the model dropdowns and the trim facets —
 *  extracted so the two can never disagree about which spelling a cell is
 *  filed under, because worthTrimTally keys its map by the exact label
 *  makesModels offers. */
function offeredFold(rows: CardRow[]): Map<string, Map<string, { n: number; forms: Map<string, number> }>> {
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
  }
  return offered;
}

export function modelTally(rows: CardRow[]): ModelTally {
  const tally = new Map<string, { count: number; forms: Map<string, { make: string; model: string; n: number }> }>();
  const offered = offeredFold(rows);
  for (const r of rows) {
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

// ── The trim facets behind /worth's trim picker ────────────────────────────

/**
 * How many live cars a trim needs before it is offered as an option.
 *
 * comps.ts MIN_PEERS restated (not imported: comps.ts drags the enrichment
 * layer into whatever bundle imports it, and this file rides in the browse
 * client). value.ts narrowByTrim keeps the wide pool when a trim selects
 * fewer than four peers, so a trim under this floor could never narrow
 * anything — offering it would invite a pick the answer then silently
 * ignores.
 */
const MIN_TRIM_LISTINGS = 4;

export interface WorthTrims {
  v: 1;
  /** make → model label (exactly as makesModels offers it) → model year →
   *  trims, deepest first. */
  trims: Record<string, Record<string, Record<string, string[]>>>;
}

/**
 * The trims on offer per make/model/model-year cell — /api/index/trims, the
 * day-cached payload behind /worth's trim dropdown.
 *
 * Built from CardRow.trim, which is already the honest subset: buildIndex.ts
 * sets it only where trimClaim asserts, spells it through specTrim, and folds
 * casing per model — the same normalization value.ts narrowByTrim runs on
 * whatever the form submits, so an option offered here round-trips to the key
 * the ask pool actually carries.
 *
 * Keyed by the same labels as makesModels, via the same fold, so the client
 * can look a cell up with the strings its own dropdowns hold. A model the
 * dropdown prunes gets no trim entry either — its cell is unreachable.
 */
export function worthTrimTally(rows: CardRow[]): WorthTrims {
  const offered = offeredFold(rows);
  const labels = new Map<string, Map<string, string>>();
  for (const [make, byModel] of offered) {
    const m = new Map<string, string>();
    for (const [k, e] of byModel) if (e.n >= MIN_LISTINGS_TO_OFFER) m.set(k, preferredForm(e.forms));
    labels.set(make, m);
  }
  // make → label → year → trim → live cars carrying it.
  const acc = new Map<string, Map<string, Map<number, Map<string, number>>>>();
  for (const r of rows) {
    if (!r.trim || !r.year) continue;
    const label = labels.get(r.make)?.get(modelKey(r.model));
    if (!label) continue;
    const byLabel = acc.get(r.make) ?? new Map();
    const byYear = byLabel.get(label) ?? new Map();
    const byTrim = byYear.get(r.year) ?? new Map();
    byTrim.set(r.trim, (byTrim.get(r.trim) ?? 0) + 1);
    byYear.set(r.year, byTrim);
    byLabel.set(label, byYear);
    acc.set(r.make, byLabel);
  }
  const trims: WorthTrims["trims"] = {};
  for (const [make, byLabel] of acc) {
    for (const [label, byYear] of byLabel) {
      for (const [year, byTrim] of byYear) {
        // Deepest first: a seller's trim is far more often the common one, and
        // a five-entry list has no type-ahead to serve alphabetically.
        const offer = [...byTrim.entries()]
          .filter(([, n]) => n >= MIN_TRIM_LISTINGS)
          .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
          .map(([t]) => t);
        if (offer.length === 0) continue;
        ((trims[make] ??= {})[label] ??= {})[String(year)] = offer;
      }
    }
  }
  return { v: 1, trims };
}
