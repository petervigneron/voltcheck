import { makeSlug, SLIM_CONDITIONS, type SlimRow } from "./records";
import { modelKey } from "@/lib/listings/modelName";
import { milesBetween } from "@/lib/geo";

// The query engine behind /api/v1/listings and the MCP search tool: parse a
// request's parameters into one typed query, run it over the slim index,
// hand back the ids of one page. Pure, so the tests can pin every filter.

export const SORTS = ["price_asc", "price_desc", "mileage_asc", "year_desc", "newest", "distance"] as const;
export type Sort = (typeof SORTS)[number];
export const MAX_LIMIT = 100;
export const DEFAULT_LIMIT = 25;
export const DEFAULT_RADIUS_MI = 100;
export const MAX_RADIUS_MI = 3000;

export interface ListingQuery {
  make?: string;
  model?: string;
  yearMin?: number;
  yearMax?: number;
  priceMin?: number;
  priceMax?: number;
  mileageMax?: number;
  condition?: Set<string>;
  kind?: "BEV" | "PHEV";
  states?: Set<string>;
  zip?: string;
  radiusMi: number;
  rangeMin?: number;
  kwhMin?: number;
  heatPump?: "yes" | "no";
  ports?: Set<string>;
  drives?: Set<string>;
  bodies?: Set<string>;
  sort?: Sort;
  limit: number;
  offset: number;
}

type Params = URLSearchParams | Record<string, unknown>;
const get = (p: Params, k: string): string | undefined => {
  const v = p instanceof URLSearchParams ? p.get(k) : p[k];
  if (v === undefined || v === null) return undefined;
  const s = String(v).trim();
  return s === "" ? undefined : s;
};

/** Every parameter the search understands. A request carrying any other key
 *  is refused: `max_price=20000` used to be dropped in silence and answered
 *  with all 170,946 cars under a 200 (audit, 2026-11-17), which an agent has
 *  no way to tell from a search that filtered. */
export const PARAMS = [
  "make", "model", "year_min", "year_max", "price_min", "price_max", "mileage_max", "condition", "kind", "state",
  "zip", "radius_mi", "range_min", "kwh_min", "heat_pump", "charge_port", "drive", "body", "sort", "limit", "offset",
] as const;

// "max_price" and "price_max" are the same words; so are "maxPrice" and
// "price-max". Matching on the sorted words finds the parameter that was
// meant without a list of misspellings to maintain.
const SYNONYM: Record<string, string> = { maximum: "max", minimum: "min", miles: "mileage", mile: "mileage", odometer: "mileage", radius: "radius_mi", zipcode: "zip", postal: "zip", fuel: "kind", type: "", port: "charge_port", battery: "kwh", states: "state", models: "model", makes: "make" };
const words = (k: string) =>
  k
    .replace(/([a-z])([A-Z])/g, "$1_$2")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .flatMap((w) => (SYNONYM[w] ?? w).split("_"))
    .filter((w, i, all) => w && all.indexOf(w) === i)
    .sort()
    .join("_");
const editDistance = (a: string, b: string): number => {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array<number>(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
};
/** The parameter an unknown key most plausibly meant, or undefined. */
export function nearestParam(key: string): string | undefined {
  const w = words(key);
  const byWords = PARAMS.find((p) => words(p) === w);
  if (byWords) return byWords;
  const k = key.toLowerCase();
  return PARAMS.map((p) => [p, editDistance(k, p)] as const)
    .filter(([p, d]) => d <= (p.length <= 4 ? 1 : 2))
    .sort((a, b) => a[1] - b[1])[0]?.[0];
}

// What people call a make, mapped to the slug its cars are filed under.
// `make=Mercedes` answered 200 with zero cars against 10,386 on the site
// (audit, 2026-11-17) — an agent reports that as "none for sale". Only names
// that mean exactly one make are here.
const MAKE_ALIASES: Record<string, string> = {
  mercedes: "mercedes-benz",
  benz: "mercedes-benz",
  mb: "mercedes-benz",
  vw: "volkswagen",
  chevy: "chevrolet",
  alfa: "alfa-romeo",
  rolls: "rolls-royce",
};
/** A make as typed → the slug to search under: an alias, else the slug in
 *  `known` that is the same letters ("landrover", "Land-Rover", "land rover"),
 *  else the plain slug. */
export function resolveMake(make: string, known?: Iterable<string>): string {
  const slug = makeSlug(make);
  if (MAKE_ALIASES[slug]) return MAKE_ALIASES[slug];
  if (known) {
    const flat = slug.replace(/-/g, "");
    for (const k of known) if (k === slug) return k;
    for (const k of known) if (k.replace(/-/g, "") === flat) return k;
  }
  return slug;
}

const csvSet = (v: string | undefined, norm: (s: string) => string) =>
  v ? new Set(v.split(",").map((s) => norm(s.trim())).filter(Boolean)) : undefined;

/** Parse query parameters (URL or a JSON object) into a ListingQuery. Unknown
 *  values are reported, never silently dropped: an agent that asked for
 *  `condition=cpo` should learn the vocabulary, not get every car. */
export function parseQuery(p: Params): { query: ListingQuery; errors: string[] } {
  const errors: string[] = [];
  for (const k of p instanceof URLSearchParams ? new Set(p.keys()) : Object.keys(p)) {
    if ((PARAMS as readonly string[]).includes(k)) continue;
    const near = nearestParam(k);
    errors.push(`${k}: not a parameter this search takes${near ? `; did you mean ${near}?` : ""}`);
  }
  if (errors.length) errors.push(`parameters: ${PARAMS.join(", ")}`);
  const num = (k: string, min: number, max: number): number | undefined => {
    const s = get(p, k);
    if (s === undefined) return undefined;
    const n = Number(s.replace(/[$,]/g, ""));
    if (!Number.isFinite(n) || n < min || n > max) {
      errors.push(`${k}: expected a number between ${min} and ${max}`);
      return undefined;
    }
    return n;
  };
  const q: ListingQuery = { radiusMi: DEFAULT_RADIUS_MI, limit: DEFAULT_LIMIT, offset: 0 };
  const make = get(p, "make");
  if (make) q.make = resolveMake(make);
  const model = get(p, "model");
  if (model) q.model = modelKey(model);
  q.yearMin = num("year_min", 1990, 2100);
  q.yearMax = num("year_max", 1990, 2100);
  q.priceMin = num("price_min", 0, 10_000_000);
  q.priceMax = num("price_max", 0, 10_000_000);
  q.mileageMax = num("mileage_max", 0, 10_000_000);
  q.rangeMin = num("range_min", 0, 2000);
  q.kwhMin = num("kwh_min", 0, 1000);
  const cond = csvSet(get(p, "condition"), (s) => s.toLowerCase());
  if (cond) {
    for (const c of cond) if (!(SLIM_CONDITIONS as readonly string[]).includes(c)) errors.push(`condition: "${c}" is not one of ${SLIM_CONDITIONS.join(", ")}`);
    q.condition = cond;
  }
  const kind = get(p, "kind")?.toUpperCase();
  if (kind) {
    if (kind === "BEV" || kind === "PHEV") q.kind = kind;
    else errors.push('kind: expected "BEV" or "PHEV"');
  }
  q.states = csvSet(get(p, "state"), (s) => s.toUpperCase());
  const zip = get(p, "zip");
  if (zip) {
    if (/^\d{5}(-\d{4})?$/.test(zip)) q.zip = zip.slice(0, 5);
    else errors.push("zip: expected a 5-digit US ZIP code");
  }
  const radius = num("radius_mi", 1, MAX_RADIUS_MI);
  if (radius !== undefined) q.radiusMi = radius;
  const hp = get(p, "heat_pump")?.toLowerCase();
  if (hp) {
    if (hp === "yes" || hp === "no") q.heatPump = hp;
    else errors.push('heat_pump: expected "yes" or "no"');
  }
  q.ports = csvSet(get(p, "charge_port"), (s) => (s.toUpperCase() === "CCS" ? "CCS1" : s.toUpperCase() === "CHADEMO" ? "CHAdeMO" : s.toUpperCase()));
  q.drives = csvSet(get(p, "drive"), (s) => s.toUpperCase());
  q.bodies = csvSet(get(p, "body"), (s) => s.toLowerCase());
  const sort = get(p, "sort");
  if (sort) {
    if ((SORTS as readonly string[]).includes(sort)) q.sort = sort as Sort;
    else errors.push(`sort: expected one of ${SORTS.join(", ")}`);
  }
  if (q.sort === "distance" && !q.zip) errors.push("sort=distance needs a zip");
  const limit = num("limit", 1, MAX_LIMIT);
  if (limit !== undefined) q.limit = Math.floor(limit);
  const offset = num("offset", 0, 1_000_000);
  if (offset !== undefined) q.offset = Math.floor(offset);
  return { query: q, errors };
}

export interface QueryResult {
  total: number;
  /** [id, makeSlug] for the page, in order. */
  page: [string, string][];
  /** Miles from the query zip, by id, when one was given. */
  distances?: Map<string, number>;
  /** Cars that pass every other filter but carry no answer for a filter that
   *  was asked — left out of `total`, and counted here so the caller knows
   *  how many the question could not be put to. */
  notEstablished: { condition?: number; kind?: number; heat_pump?: number };
  /** Every matched row, in result order: what a summary of the whole set reads. */
  hits: SlimRow[];
}

/** Run a query over the slim index. `origin` is the query zip's centroid;
 *  a zip the caller could not resolve simply means no distance filter. */
export function runQuery(rows: SlimRow[], q: ListingQuery, origin?: [number, number]): QueryResult {
  const priced = q.priceMin !== undefined || q.priceMax !== undefined;
  const distances = origin ? new Map<string, number>() : undefined;
  const hits: SlimRow[] = [];
  const notEstablished: QueryResult["notEstablished"] = {};
  for (const r of rows) {
    // The three filters a car can have no answer to. Unknown still matches
    // neither side — unknown is not BEV (lib/listings/kind.ts) — but it is
    // held to the end rather than dropped here, so it can be counted.
    let unknown = 0;
    if (q.make && r[1] !== q.make) continue;
    if (q.model && r[2] !== q.model) continue;
    if (q.yearMin !== undefined && r[3] < q.yearMin) continue;
    if (q.yearMax !== undefined && r[3] > q.yearMax) continue;
    // A car with no real asking price has nothing to compare against a price
    // bound: "under $20,000" must not return "call for price".
    if (priced && r[4] === 0) continue;
    if (q.priceMin !== undefined && r[4] < q.priceMin) continue;
    if (q.priceMax !== undefined && r[4] > q.priceMax) continue;
    if (q.mileageMax !== undefined && (r[5] < 0 || r[5] > q.mileageMax)) continue;
    if (q.condition) {
      if (r[6] < 0) unknown |= 1;
      else if (!q.condition.has(SLIM_CONDITIONS[r[6]])) continue;
    }
    if (q.kind) {
      if (r[10] < 0) unknown |= 2;
      else if (r[10] !== (q.kind === "BEV" ? 0 : 1)) continue;
    }
    if (q.states && !q.states.has(r[7])) continue;
    if (q.rangeMin !== undefined && r[11] < q.rangeMin) continue;
    if (q.kwhMin !== undefined && r[12] < q.kwhMin) continue;
    if (q.heatPump) {
      if (r[13] < 0) unknown |= 4;
      else if (r[13] !== (q.heatPump === "yes" ? 1 : 0)) continue;
    }
    if (q.ports && !q.ports.has(r[14])) continue;
    if (q.drives && !q.drives.has(r[15])) continue;
    if (q.bodies && !q.bodies.has(r[16])) continue;
    let d: number | undefined;
    if (origin) {
      // Unknown location cannot be inside any radius.
      if (r[8] === null || r[9] === null) continue;
      d = milesBetween(origin, [r[8], r[9]]);
      if (d > q.radiusMi) continue;
    }
    if (unknown) {
      if (unknown & 1) notEstablished.condition = (notEstablished.condition ?? 0) + 1;
      if (unknown & 2) notEstablished.kind = (notEstablished.kind ?? 0) + 1;
      if (unknown & 4) notEstablished.heat_pump = (notEstablished.heat_pump ?? 0) + 1;
      continue;
    }
    if (d !== undefined) distances!.set(r[0], d);
    hits.push(r);
  }
  const sort: Sort = q.sort ?? (origin ? "distance" : "price_asc");
  const noPriceLast = (a: SlimRow, b: SlimRow) => (a[4] === 0 ? 1 : 0) - (b[4] === 0 ? 1 : 0);
  const cmp: Record<Sort, (a: SlimRow, b: SlimRow) => number> = {
    price_asc: (a, b) => noPriceLast(a, b) || a[4] - b[4],
    price_desc: (a, b) => noPriceLast(a, b) || b[4] - a[4],
    mileage_asc: (a, b) => (a[5] < 0 ? 1 : 0) - (b[5] < 0 ? 1 : 0) || a[5] - b[5],
    year_desc: (a, b) => b[3] - a[3] || noPriceLast(a, b) || a[4] - b[4],
    newest: (a, b) => b[17] - a[17] || noPriceLast(a, b) || a[4] - b[4],
    distance: (a, b) => (distances?.get(a[0]) ?? 0) - (distances?.get(b[0]) ?? 0) || noPriceLast(a, b) || a[4] - b[4],
  };
  // Stable on id after the sort key, so two requests page through the same
  // order rather than shuffling equal-priced cars between pages.
  hits.sort((a, b) => cmp[sort](a, b) || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  const page = hits.slice(q.offset, q.offset + q.limit).map((r): [string, string] => [r[0], r[1]]);
  return { total: hits.length, page, distances, notEstablished, hits };
}
