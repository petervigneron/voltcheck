// The Pro standing order ("Describe your ideal car and at your ideal price,
// and be notified when it becomes available" — owner, 2026-09-02): a car the
// shopper wants that may not be for sale yet, at a price it may not be
// listed at yet. It is stored as an ordinary alert subscription (0029) whose
// params are a browse query string, so the sender (scripts/send-alerts.mjs)
// matches it with the same lib/listings/match.ts predicates the grid uses and
// fires when a car appears that fits — newly listed, or an existing car cut
// into range. What makes it Pro is the sender's rule: new-car emails go only
// to subscriptions whose address holds a live pass; free subscriptions get
// price cuts only.
//
// This file is the pure part: form state → query string. Every key it writes
// is one match.ts already understands, so a standing order can never ask for
// something the grid could not show.

export interface WatchInput {
  make: string;
  model: string;
  /** Any of these trims — "SEL or higher" is SEL and Limited ticked. Empty = any. */
  trims: string[];
  drive: string;
  /** Oldest acceptable model year. */
  minYear: string;
  maxMiles: string;
  maxPrice: string;
  cond: "" | "new" | "used";
  zip: string;
  /** Miles from the ZIP; "any" or "" = no distance limit. */
  radius: string;
}

const posInt = (s: string): number | undefined => {
  const n = Number(String(s).replace(/[^\d]/g, ""));
  return Number.isInteger(n) && n > 0 ? n : undefined;
};

export function watchParams(w: WatchInput): string {
  const p = new URLSearchParams();
  if (w.make) p.set("make", w.make);
  if (w.model) p.set("model", w.model);
  const trims = (w.trims ?? []).map((t) => t.trim()).filter(Boolean);
  if (trims.length) p.set("trim", trims.join(","));
  if (w.drive) p.set("drive", w.drive);
  if (/^\d{4}$/.test(w.minYear)) p.set("minYear", w.minYear);
  const miles = posInt(w.maxMiles);
  if (miles) p.set("maxMiles", String(miles));
  const price = posInt(w.maxPrice);
  if (price) p.set("maxPrice", String(price));
  if (w.cond === "new" || w.cond === "used") p.set("cond", w.cond);
  if (/^\d{5}$/.test(w.zip)) {
    p.set("zip", w.zip);
    if (w.radius && w.radius !== "any") p.set("radius", w.radius);
  }
  return p.toString();
}
