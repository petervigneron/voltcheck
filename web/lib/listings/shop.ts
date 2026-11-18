import { DEFAULT_RADIUS_MI, runQuery, type ListingQuery } from "@/lib/api/query";
import { SLIM_EST_BATTERY, SLIM_EST_PORT, SLIM_EST_RANGE, slimEstimated, type ApiListing, type SlimRow } from "@/lib/api/records";
import { BASE } from "@/lib/sitemap";
import { STATS_MIN } from "./hubIndex";
import { nearRow, type NearRow } from "./near";
import { SHOP_CARS, shopHeading, shopPath, type ShopQuestion } from "./shopQuestions";

// /shop/<slug> — a fixed, hand-chosen set of questions a shopper asks an
// assistant ("used EVs under $25,000", "which EVs under $30,000 have a heat
// pump"), each answered from live inventory as a page an assistant can read
// and cite: how many cars match, which models, at what asking prices, with
// what range and battery. This file is the pure half — the question-to-query
// mapping, the per-model aggregation and the printed strings — so every
// filter and every string is tested (tests/shop.test.ts). The questions are
// in shopQuestions.ts, the data half is shopSearch.ts, and the page is
// app/shop/[slug]/page.tsx.
//
// THE HOUSE RULE ON CLAIMS, as it applies here:
//  - A question that turns on a fact the site does not know for a car (heat
//    pump, condition, kind) counts only the cars where that fact is
//    established as yes. The rest are not counted and not mentioned.
//  - "EPA range" means the EPA's figure: a car whose range is the maker's own
//    estimate does not count toward a range question. "NACS" likewise counts
//    only a port that is the maker's own word.
//  - The model table is ordered by how many cars match, never by merit, and
//    no page here ranks, recommends or calls anything best.
//  - A median rests on at least STATS_MIN priced cars, the model page's floor.
//  - A figure that is not the manufacturer's own carries "(est)".

const nf = new Intl.NumberFormat("en-US");
const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const dateOf = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

/** Does answering this question need the index's estimated bits? */
export const needsEstimated = (q: ShopQuestion) => q.rangeMin !== undefined || q.port !== undefined;

/** The public API's query for a question (lib/api/query.ts), so these pages
 *  and /api/v1/listings filter the same way. The bound is strict ("under
 *  $25,000" leaves a $25,000 car out), which the API's price_max is not;
 *  shopMatches applies it. */
export function shopQuery(q: ShopQuestion): ListingQuery {
  const lq: ListingQuery = {
    radiusMi: DEFAULT_RADIUS_MI,
    limit: SHOP_CARS,
    offset: 0,
    sort: "price_asc",
    condition: new Set(q.condition === "used" ? ["used", "certified"] : ["new"]),
    kind: q.kind,
    priceMax: q.under,
  };
  if (q.rangeMin !== undefined) lq.rangeMin = q.rangeMin;
  if (q.heatPump) lq.heatPump = "yes";
  if (q.port) lq.ports = new Set([q.port]);
  if (q.body) lq.bodies = new Set([q.body]);
  if (q.drive) lq.drives = new Set([q.drive]);
  return lq;
}

/** Every row of the index that answers the question, cheapest first. Throws
 *  when the question needs the estimated bits and the index has none: a
 *  range count that quietly includes estimates is a false answer. */
export function shopMatches(rows: SlimRow[], q: ShopQuestion): SlimRow[] {
  if (needsEstimated(q) && rows.length && slimEstimated(rows[0]) === undefined) {
    throw new Error(`shop: ${q.slug} needs the index's estimated bits, and this index predates them`);
  }
  return runQuery(rows, shopQuery(q)).hits.filter((r) => {
    if (!(r[4] < q.under)) return false;
    const est = slimEstimated(r) ?? 0;
    if (q.rangeMin !== undefined && est & SLIM_EST_RANGE) return false;
    if (q.port && est & SLIM_EST_PORT) return false;
    return true;
  });
}

/** What a model is called on the page, and its page when it has one. */
export interface ModelName {
  /** Groups the rows: a model page can be more than one feed spelling. */
  key: string;
  name: string;
  href?: string;
}

export interface Span {
  lo: number;
  hi: number;
  /** The end's figure is held only by cars whose figure is estimated. */
  loEst: boolean;
  hiEst: boolean;
}

export interface ShopModel extends ModelName {
  n: number;
  /** Lowest asking price; absent when no matching car has one. */
  min?: number;
  /** Only at STATS_MIN priced cars or more. */
  median?: number;
  /** Absent when no matching car states one, or the index cannot say which figures are estimated. */
  range?: Span;
  battery?: Span;
  years: number[];
  /** A plug-in hybrid's range is its electric-only range. */
  electricOnly: boolean;
}

function median(xs: number[]): number {
  const s = Float64Array.from(xs).sort();
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
}

class SpanAcc {
  private lo = Infinity;
  private hi = -Infinity;
  private firm = new Set<number>();
  add(v: number, est: boolean) {
    if (!(v > 0)) return;
    if (v < this.lo) this.lo = v;
    if (v > this.hi) this.hi = v;
    if (!est) this.firm.add(v);
  }
  span(): Span | undefined {
    if (this.lo === Infinity) return undefined;
    return { lo: this.lo, hi: this.hi, loEst: !this.firm.has(this.lo), hiEst: !this.firm.has(this.hi) };
  }
}

/** The matched rows by model, most cars first (then by name). Every matched
 *  row has a real price (shopMatches holds every question to a price bound). */
export function shopModels(hits: SlimRow[], nameOf: (makeSlug: string, modelKey: string) => ModelName): ShopModel[] {
  type Acc = { name: ModelName; n: number; prices: number[]; years: Set<number>; range: SpanAcc; battery: SpanAcc; phev: boolean };
  const by = new Map<string, Acc>();
  const estKnown = hits.length > 0 && slimEstimated(hits[0]) !== undefined;
  for (const r of hits) {
    const name = nameOf(r[1], r[2]);
    let a = by.get(name.key);
    if (!a) by.set(name.key, (a = { name, n: 0, prices: [], years: new Set(), range: new SpanAcc(), battery: new SpanAcc(), phev: false }));
    a.n++;
    if (r[4] > 0) a.prices.push(r[4]);
    a.years.add(r[3]);
    const est = slimEstimated(r) ?? 0;
    a.range.add(r[11], Boolean(est & SLIM_EST_RANGE));
    a.battery.add(r[12], Boolean(est & SLIM_EST_BATTERY));
    if (r[10] === 1) a.phev = true;
  }
  const out: ShopModel[] = [];
  for (const a of by.values()) {
    const m: ShopModel = {
      ...a.name,
      n: a.n,
      years: [...a.years].sort((x, y) => x - y),
      electricOnly: a.phev,
    };
    if (a.prices.length) m.min = a.prices.reduce((x, y) => (y < x ? y : x));
    if (a.prices.length >= STATS_MIN) m.median = median(a.prices);
    if (estKnown) {
      const rs = a.range.span();
      const bs = a.battery.span();
      if (rs) m.range = rs;
      if (bs) m.battery = bs;
    }
    out.push(m);
  }
  return out.sort((x, y) => y.n - x.n || x.name.localeCompare(y.name));
}

/** "220 (est)–310 mi", "77 kWh", "25–42 mi electric". */
export function formatSpan(s: Span, unit: string): string {
  const e = (b: boolean) => (b ? " (est)" : "");
  if (s.lo === s.hi) return `${nf.format(s.lo)}${e(s.loEst)} ${unit}`;
  return `${nf.format(s.lo)}${e(s.loEst)}–${nf.format(s.hi)}${e(s.hiEst)} ${unit}`;
}

/** "2017–2019, 2021". */
export function formatYears(years: number[]): string {
  const parts: string[] = [];
  let i = 0;
  while (i < years.length) {
    let j = i;
    while (j + 1 < years.length && years[j + 1] === years[j] + 1) j++;
    parts.push(j === i ? String(years[i]) : `${years[i]}–${years[j]}`);
    i = j + 1;
  }
  return parts.join(", ");
}

/** One table row, every cell a string or absent. */
export interface ShopModelRow {
  key: string;
  name: string;
  href?: string;
  cars: string;
  lowest?: string;
  median?: string;
  range?: string;
  battery?: string;
  years: string;
}

export function shopModelRow(m: ShopModel): ShopModelRow {
  const row: ShopModelRow = {
    key: m.key,
    name: m.name,
    cars: nf.format(m.n),
    years: formatYears(m.years),
  };
  if (m.href) row.href = m.href;
  if (m.min !== undefined) row.lowest = money.format(m.min);
  if (m.median !== undefined) row.median = money.format(m.median);
  if (m.range) row.range = formatSpan(m.range, m.electricOnly ? "mi electric" : "mi");
  if (m.battery) row.battery = formatSpan(m.battery, "kWh");
  return row;
}

/** "as of Nov 18, 2026", or undefined for a date that does not parse. */
export function shopAsOf(asOf: string): string | undefined {
  const d = new Date(asOf);
  return Number.isFinite(d.getTime()) ? `as of ${dateOf.format(d)}` : undefined;
}

/** "4,512 cars · United States · as of Nov 18, 2026". */
export function shopCountLine(total: number, asOf: string): string {
  const parts = [`${nf.format(total)} ${total === 1 ? "car" : "cars"}`, "United States"];
  const when = shopAsOf(asOf);
  if (when) parts.push(when);
  return parts.join(" · ");
}

/** The meta description: the count and the three models with the most cars,
 *  each with its median where the floor allows one. */
export function shopDescription(q: ShopQuestion, total: number, models: ShopModel[], asOf: string): string {
  const h = shopHeading(q);
  const asof = shopAsOf(asOf);
  const when = asof ? `, ${asof}` : "";
  const head = `${nf.format(total)} ${h.charAt(0).toLowerCase()}${h.slice(1)} for sale in the United States${when}.`;
  const top = models
    .slice(0, 3)
    .map((m) => `${m.name}: ${nf.format(m.n)} ${m.n === 1 ? "car" : "cars"}${m.median !== undefined ? `, median ${money.format(m.median)}` : ""}`);
  return top.length ? `${head} ${top.join("; ")}.` : head;
}

/** One car under the table: the near page's row (lib/listings/near.ts, so
 *  the same "(est)" marks and the same disclosure labels), named in full
 *  because the cars here are of many models. */
export function shopCarRow(rec: ApiListing): NearRow {
  return { ...nearRow(rec, undefined, rec.model), car: rec.title };
}

/** The models in the table as an ItemList, names and their model pages.
 *  numberOfItems counts the table's rows, the claim the page itself makes. */
export function shopItemListJsonLd(q: ShopQuestion, models: Pick<ShopModel, "name" | "href">[]): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    "@id": `${BASE}${shopPath(q)}#models`,
    name: shopHeading(q),
    numberOfItems: models.length,
    itemListElement: models.map((m, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: m.name,
      ...(m.href ? { url: `${BASE}${m.href}` } : {}),
    })),
  };
}
