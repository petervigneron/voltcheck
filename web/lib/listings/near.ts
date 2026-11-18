import { hubPath, type ModelHub } from "./modelHubs";
import type { ApiListing } from "@/lib/api/records";
import type { SearchBreakdown } from "@/lib/api/search";
import { STATS_MIN } from "./hubIndex";

// /ev/<make>/<model>/near/<zip> — one model's cars around a ZIP, as HTML a
// fetcher with no JavaScript can read. The browse grid answers the same
// question, but builds its answer in the browser from JSON, so an assistant
// that fetches a URL on a shopper's behalf ("used EV6 under $28,000 near
// Chicago") had no page to read. This file is the pure half: parameters in,
// path and rows out, so every clamp and every printed string is tested
// (tests/near.test.ts) rather than trusted. The data half is nearSearch.ts.

export const NEAR_DEFAULT_RADIUS = 100;
export const NEAR_MAX_RADIUS = 500;
/** Cars a page shows, nearest first. */
export const NEAR_ROWS = 50;

export const NEAR_CONDITIONS = ["new", "used", "certified"] as const;
export type NearCondition = (typeof NEAR_CONDITIONS)[number];

export interface NearParams {
  condition?: NearCondition;
  maxPrice?: number;
  maxMiles?: number;
  radius: number;
  yearMin?: number;
}

type Raw = URLSearchParams | Record<string, string | string[] | undefined>;

const first = (raw: Raw, k: string): string | undefined => {
  const v = raw instanceof URLSearchParams ? raw.get(k) : raw[k];
  const s = (Array.isArray(v) ? v[0] : v)?.trim();
  return s ? s : undefined;
};

/** A whole number from "28000", "$28,000" or "28000.5"; undefined for anything else. */
const whole = (s: string | undefined): number | undefined => {
  if (s === undefined) return undefined;
  const n = Number(s.replace(/[$,\s]/g, ""));
  return Number.isFinite(n) ? Math.round(n) : undefined;
};

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/** The page's parameters. Unknown keys are ignored, out-of-range numbers are
 *  clamped, and anything unreadable is dropped as if it had not been sent —
 *  this is a page a person or an assistant typed, not the API, which refuses
 *  instead (lib/api/query.ts). A cap of zero or less is no cap. */
export function parseNearParams(raw: Raw): NearParams {
  const p: NearParams = { radius: NEAR_DEFAULT_RADIUS };
  const c = first(raw, "condition")?.toLowerCase();
  if (c && (NEAR_CONDITIONS as readonly string[]).includes(c)) p.condition = c as NearCondition;
  const price = whole(first(raw, "max_price"));
  if (price !== undefined && price > 0) p.maxPrice = Math.min(price, 10_000_000);
  const miles = whole(first(raw, "max_miles"));
  if (miles !== undefined && miles >= 0) p.maxMiles = Math.min(miles, 1_000_000);
  const radius = whole(first(raw, "radius"));
  if (radius !== undefined && radius > 0) p.radius = clamp(radius, 1, NEAR_MAX_RADIUS);
  const year = whole(first(raw, "year_min"));
  if (year !== undefined) p.yearMin = clamp(year, 1990, 2100);
  return p;
}

/** A ZIP as it appears in the path: exactly five digits. */
export function isNearZip(s: string): boolean {
  return /^\d{5}$/.test(s);
}

/** A ZIP as a person types it into the form: five digits, or ZIP+4. */
export function typedZip(s: string | null | undefined): string | undefined {
  const t = (s ?? "").trim();
  return /^\d{5}(-\d{4})?$/.test(t) ? t.slice(0, 5) : undefined;
}

/** The conditions a filter admits. Certified pre-owned is used: a shopper
 *  asking for a used EV6 is asking for the certified ones too, and leaving
 *  them out would hide cars from the one search most likely to want them. */
export function conditionSet(c: NearCondition): Set<string> {
  return new Set(c === "used" ? ["used", "certified"] : [c]);
}

/** The query string, in one order, with the default radius left out — so
 *  one search has one URL and the CDN caches it once. */
export function nearQuery(p: NearParams): string {
  const q = new URLSearchParams();
  if (p.condition) q.set("condition", p.condition);
  if (p.maxPrice !== undefined) q.set("max_price", String(p.maxPrice));
  if (p.maxMiles !== undefined) q.set("max_miles", String(p.maxMiles));
  if (p.yearMin !== undefined) q.set("year_min", String(p.yearMin));
  if (p.radius !== NEAR_DEFAULT_RADIUS) q.set("radius", String(p.radius));
  const s = q.toString();
  return s ? `?${s}` : "";
}

export function nearBasePath(hub: ModelHub, zip: string): string {
  return `${hubPath(hub)}/near/${zip}`;
}

export function nearPath(hub: ModelHub, zip: string, p: NearParams): string {
  return `${nearBasePath(hub, zip)}${nearQuery(p)}`;
}

const nf = new Intl.NumberFormat("en-US");
const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const dayOf = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const dateOf = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

const COND_LABEL: Record<NearCondition, string> = { new: "New", used: "Used", certified: "Certified" };

/** "Used Kia EV6 up to $28,000 for sale near 60614". */
export function nearHeading(name: string, zip: string, p: NearParams): string {
  const cond = p.condition ? `${COND_LABEL[p.condition]} ` : "";
  const price = p.maxPrice !== undefined ? ` up to ${money.format(p.maxPrice)}` : "";
  return `${cond}${name}${price} for sale near ${zip}`;
}

/** "37 cars · within 100 miles · 40,000 miles or less · 2023 or newer · as of Nov 18, 2026". */
export function nearCountLine(total: number, p: NearParams, asOf: string): string {
  const parts = [`${nf.format(total)} ${total === 1 ? "car" : "cars"}`, `within ${nf.format(p.radius)} miles`];
  if (p.maxMiles !== undefined) parts.push(`${nf.format(p.maxMiles)} miles or less`);
  if (p.yearMin !== undefined) parts.push(`${p.yearMin} or newer`);
  const d = new Date(asOf);
  if (Number.isFinite(d.getTime())) parts.push(`as of ${dateOf.format(d)}`);
  return parts.join(" · ");
}

export interface NearRow {
  id: string;
  href: string;
  /** Year and trim; the model when the site does not state a trim. */
  car: string;
  condition?: string;
  price?: string;
  miles?: string;
  place?: string;
  distance?: string;
  range?: string;
  battery?: string;
  lastSeen?: string;
  /** Disclosures from the seller's own description. */
  flags: string[];
}

/** One table row from an API record. Every field is absent rather than
 *  filled when the record has nothing to say, and a figure that is not the
 *  manufacturer's own carries "(est)", the same mark the car's tiles use. */
export function nearRow(rec: ApiListing, distanceMi: number | undefined, modelName: string): NearRow {
  const row: NearRow = {
    id: rec.id,
    href: `/listing/${rec.id}`,
    car: `${rec.year} ${rec.trim ?? modelName}`,
    flags: [],
  };
  if (rec.condition) row.condition = COND_LABEL[rec.condition];
  if (rec.price_usd !== null) row.price = money.format(rec.price_usd);
  if (rec.mileage !== undefined) row.miles = nf.format(rec.mileage);
  const place = [rec.location.city, rec.location.state].filter(Boolean).join(", ");
  if (place) row.place = place;
  if (distanceMi !== undefined) row.distance = `${nf.format(Math.round(distanceMi))} mi`;
  // A plug-in hybrid's figure is its electric-only range; printed bare in a
  // column of BEV ranges it would read as the whole car's.
  if (rec.range) row.range = `${rec.range.mi} mi${rec.range.electric_only ? " electric" : ""}${rec.range.estimated ? " (est)" : ""}`;
  if (rec.battery) row.battery = `${rec.battery.kwh} kWh${rec.battery.estimated ? " (est)" : ""}`;
  if (rec.last_seen) {
    const d = new Date(`${rec.last_seen}T00:00:00Z`);
    if (Number.isFinite(d.getTime())) row.lastSeen = dayOf.format(d);
  }
  if (rec.buyback_disclosed) row.flags.push("Manufacturer buyback");
  if (rec.branded_title_disclosed) row.flags.push("Branded title");
  return row;
}

export interface NearAsking {
  n: number;
  min: string;
  median: string;
  max: string;
}

/** Lowest, median and highest asking price, under the model page's floor:
 *  a median over fewer than STATS_MIN cars is not printed. */
export function nearAsking(b: SearchBreakdown | undefined): NearAsking | undefined {
  const a = b?.asking_usd;
  if (!a || a.n < STATS_MIN) return undefined;
  return { n: a.n, min: money.format(a.min), median: money.format(a.median), max: money.format(a.max) };
}

export interface NearLink {
  label: string;
  href: string;
}

const half = (r: number) => Math.max(1, Math.round(r / 2));

/** The same search, wider and narrower. Each link changes one thing. */
export function nearLinks(
  hub: ModelHub,
  zip: string,
  p: NearParams,
  b?: SearchBreakdown,
): { wider: NearLink[]; narrower: NearLink[] } {
  const at = (q: NearParams) => nearPath(hub, zip, q);
  const wider: NearLink[] = [];
  const narrower: NearLink[] = [];
  if (p.radius < NEAR_MAX_RADIUS) {
    const r = Math.min(NEAR_MAX_RADIUS, p.radius * 2);
    wider.push({ label: `Within ${nf.format(r)} miles`, href: at({ ...p, radius: r }) });
  }
  if (p.maxPrice !== undefined) wider.push({ label: "Any price", href: at({ ...p, maxPrice: undefined }) });
  if (p.maxMiles !== undefined) wider.push({ label: "Any mileage", href: at({ ...p, maxMiles: undefined }) });
  if (p.yearMin !== undefined) wider.push({ label: "Any year", href: at({ ...p, yearMin: undefined }) });
  if (p.condition) wider.push({ label: "Any condition", href: at({ ...p, condition: undefined }) });

  if (p.radius > 10) {
    const r = half(p.radius);
    narrower.push({ label: `Within ${nf.format(r)} miles`, href: at({ ...p, radius: r }) });
  }
  if (!p.condition) {
    for (const c of NEAR_CONDITIONS) narrower.push({ label: COND_LABEL[c], href: at({ ...p, condition: c }) });
  }
  // Under the median, rounded down to a thousand — only when the median is
  // one the page itself prints, so the link never cites a number it hid.
  const a = b?.asking_usd;
  if (p.maxPrice === undefined && a && a.n >= STATS_MIN) {
    const cap = Math.floor(a.median / 1000) * 1000;
    if (cap > 0) narrower.push({ label: `Up to ${money.format(cap)}`, href: at({ ...p, maxPrice: cap }) });
  }
  return { wider, narrower };
}
