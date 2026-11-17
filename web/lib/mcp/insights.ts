import { MODEL_HUBS, hubPath, type ModelHub } from "@/lib/listings/modelHubs";
import { modelKey } from "@/lib/listings/modelName";
import { resolveMake } from "@/lib/api/query";
import { SITE } from "@/lib/api/records";
import { warrantyAnswer, warrantySheet, warrantyStatus } from "@/lib/listings/warrantyCheck";
import { hubIndexKey, type HubEntry, type HubIndex } from "@/lib/listings/hubIndex";
import { MARKET_MIN_CARS, type Market } from "@/lib/market";
import type { ModelSpeed } from "@/lib/listings/speed";

// The two connector tools that answer about a model rather than a car:
// battery_warranty and market_snapshot. Neither computes a figure of its own.
// Every value is one a page already prints — /warranty (warrantyCheck.ts and
// the verdict it hands to warranty.ts), /ev/<make>/<model> (the hub artifact)
// and /market (market_snapshot, model_selling_speed) — read through the same
// functions and the same guards, so the connector cannot say what the site
// would not. Where a page goes quiet, the tool goes quiet with it.

/** The connector's label on links to our own pages (lib/visit.ts visitSrc). */
const REF = "mcp";
const ours = (path: string) => `${SITE}${path}?ref=${REF}`;

const MAKE_SLUGS = [...new Set(MODEL_HUBS.map((h) => h.makeSlug))];

/**
 * The model page a make and model name, matched the way the hubs match a car:
 * the make through the search's own resolveMake (aliases, spacing and case),
 * the model exactly on modelKey against the hub's keys. Every spelling
 * list_models returns for a model with a page lands here. A name with no page
 * is an error that says which argument and what it could have been.
 */
export function resolveHub(make: unknown, model: unknown): ModelHub {
  if (typeof make !== "string" || !make.trim()) throw new Error("make: required");
  if (typeof model !== "string" || !model.trim()) throw new Error("model: required");
  const slug = resolveMake(make, MAKE_SLUGS);
  const forMake = MODEL_HUBS.filter((h) => h.makeSlug === slug);
  if (!forMake.length) {
    const makes = [...new Set(MODEL_HUBS.map((h) => h.make))].sort((a, b) => a.localeCompare(b));
    throw new Error(`make: no model page is filed under "${make}". Makes with model pages: ${makes.join(", ")}.`);
  }
  const key = modelKey(model);
  const hub = forMake.find((h) => h.keys.includes(key));
  if (!hub) {
    const names = forMake.map((h) => h.model).sort((a, b) => a.localeCompare(b));
    throw new Error(`model: no ${forMake[0].make} model page is filed under "${model}". Models with pages: ${names.join(", ")}.`);
  }
  return hub;
}

function integerArg(name: string, v: unknown, min: number, max: number): number {
  const n = typeof v === "string" && v.trim() ? Number(v.replace(/,/g, "")) : v;
  if (typeof n !== "number" || !Number.isInteger(n) || n < min || n > max) throw new Error(`${name}: expected a whole number between ${min} and ${max}`);
  return n;
}

// ------------------------------------------------------------ warranty

/** The /warranty page's own sentence, carried as a field. */
export const WARRANTY_CAVEAT = "The term runs from the car's first sale date, which this check doesn't know.";

export interface WarrantyResult {
  make: string;
  model: string;
  year: number;
  established: boolean;
  terms?: { years?: number; miles?: number; unlimited_miles?: true; trims?: string[]; estimated: boolean }[];
  status?: string;
  capacity_floor_pct?: number;
  transfers?: boolean;
  estimated?: boolean;
  caveat?: string;
  fact_sheet?: string;
}

/** What /warranty shows for one make, model, year and odometer reading. */
export function batteryWarranty(args: Record<string, unknown>, now: Date = new Date()): WarrantyResult {
  const hub = resolveHub(args.make, args.model);
  const year = integerArg("year", args.year, 1990, 2100);
  const mileage = args.mileage === undefined || args.mileage === null ? undefined : integerArg("mileage", args.mileage, 0, 999_999);
  const sheet = warrantySheet(hub);
  const base = { make: hub.make, model: hub.model, year };
  const fact_sheet = sheet ? ours(sheet.href) : undefined;
  const answer = warrantyAnswer(hub.make, hub.model, year);
  // Quiet is quiet: no term, no fallback, only the sheet a person can read.
  if (!answer) return { ...base, established: false, ...(fact_sheet ? { fact_sheet } : {}) };
  const status = warrantyStatus(answer, { make: hub.make, year, mileage }, now);
  const expired = status.state === "expired";
  const out: WarrantyResult = {
    ...base,
    established: true,
    terms: answer.terms.map((t) => ({
      ...(t.years != null ? { years: t.years } : {}),
      ...(t.miles != null ? { miles: t.miles } : t.years != null ? { unlimited_miles: true as const } : {}),
      ...(t.trims ? { trims: t.trims } : {}),
      estimated: t.est,
    })),
  };
  if (status.state !== "unknown") out.status = status.label;
  // The page hides both once the warranty has expired: they describe a
  // coverage this car no longer has.
  if (!expired && answer.floorPct != null) out.capacity_floor_pct = answer.floorPct;
  if (!expired && answer.transfers != null) out.transfers = answer.transfers;
  out.estimated = answer.terms.some((t) => t.est);
  out.caveat = WARRANTY_CAVEAT;
  if (fact_sheet) out.fact_sheet = fact_sheet;
  return out;
}

// ------------------------------------------------------------ market

export interface MarketSnapshot {
  make: string;
  model: string;
  page: string;
  for_sale: number;
  as_of?: string;
  by_year: { year: number; for_sale: number; median_asking_usd: number | null }[];
  asking_at_40000_mi_usd?: number;
  change_30d_pct?: number | null;
  change_60d_pct?: number | null;
  market_as_of?: string;
  no_longer_listed_after_30_days_pct?: number;
  no_longer_listed_window?: { from: string; to: string; used_cars_listed: number };
}

/**
 * One model's figures, shaped from what the model page and /market print.
 * `market` and `speed` are null when they could not be read; their fields are
 * then left out and the hub figures still answer. Pure.
 */
export function shapeMarketSnapshot(
  hub: ModelHub,
  entry: HubEntry,
  indexAsOf: string | undefined,
  market: Market | null,
  speed: Map<string, ModelSpeed> | null,
): MarketSnapshot {
  const path = hubPath(hub);
  const stats = entry.stats;
  const out: MarketSnapshot = {
    make: hub.make,
    model: hub.model,
    page: ours(path),
    for_sale: entry.total,
    ...(stats?.asOf ?? indexAsOf ? { as_of: stats?.asOf ?? indexAsOf } : {}),
    // The model page's own table: a year is a row when a median cleared the
    // floor (STATS_MIN), and its asking median is blank when only the
    // mileage one did.
    by_year: (stats?.years ?? [])
      .filter((y) => y.medianUsd !== undefined || y.medianMiles !== undefined)
      .map((y) => ({ year: y.year, for_sale: y.n, median_asking_usd: y.medianUsd ?? null })),
  };
  // /market's row, under the same car-count floor /market prints it at.
  const row = market?.rows.find((r) => r.path === path && r.cars >= MARKET_MIN_CARS);
  if (row) {
    out.asking_at_40000_mi_usd = row.ask;
    out.change_30d_pct = row.change30;
    out.change_60d_pct = row.change60;
    out.market_as_of = market!.asOf;
  }
  const s = speed?.get(path);
  if (s) {
    out.no_longer_listed_after_30_days_pct = s.pct;
    out.no_longer_listed_window = { from: s.from, to: s.to, used_cars_listed: s.listed };
  }
  return out;
}

/** How long a database read may hold up a market_snapshot answer. */
export const MARKET_READ_MS = 4000;

/** A read that answers within `ms`, or null: never a throw, never a hang. */
export async function bounded<T>(read: (signal: AbortSignal) => Promise<T>, ms: number): Promise<T | null> {
  const ctl = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => {
      ctl.abort();
      resolve(null);
    }, ms);
  });
  try {
    return await Promise.race([read(ctl.signal).catch(() => null), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

export interface MarketDeps {
  hubIndex: () => Promise<HubIndex | null>;
  market: (signal: AbortSignal) => Promise<Market>;
  speed: (signal: AbortSignal) => Promise<Map<string, ModelSpeed>>;
}

export async function marketSnapshot(args: Record<string, unknown>, deps: MarketDeps, ms = MARKET_READ_MS): Promise<MarketSnapshot> {
  const hub = resolveHub(args.make, args.model);
  const [index, market, speed] = await Promise.all([deps.hubIndex(), bounded(deps.market, ms), bounded(deps.speed, ms)]);
  if (!index) throw new Error("model figures are not available right now");
  const entry = index.hubs[hubIndexKey(hub)] ?? { total: 0, cars: [] };
  return shapeMarketSnapshot(hub, entry, index.asOf, market, speed);
}
