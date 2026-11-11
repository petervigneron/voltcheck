// The public market page's data: market_index() (migration 0115) joined to
// the model hubs.
//
// The RPC is the aggregate of the nightly trend tables — the site-wide
// asking-price index and, per model, a standard-car asking level with its
// 30- and 60-day change. Its header says what each guard is for. This module
// adds the two rules that belong to the page rather than the database:
//
//   * a row exists only for a model that has a hub (lib/listings/modelHubs),
//     matched exactly on the hub's own keys — the same no-prefix contract the
//     hubs, the fact links and the facets use. A cohort with no hub is
//     dropped, not guessed onto a neighbour.
//   * a change is printed only when it was read from at least half the
//     model's cars (MIN_SHARE). Under that the cell is empty: a figure about
//     a minority of the cars under a heading that names the model would be
//     the wrong claim.

import { MODEL_HUBS, hubPath, type ModelHub } from "./listings/modelHubs";

export const MIN_SHARE = 0.5;

export interface RawMarketModel {
  cohort: string;
  cars: number;
  ask: number;
  c30: number | null;
  s30: number | null;
  c60: number | null;
  s60: number | null;
}

export interface RawMarket {
  asOf: string;
  site: { d: string; i: number; c: number }[] | null;
  models: RawMarketModel[] | null;
  /** Washington sold prices, one row per complete month (migration 0116). */
  sold?: { m: string; pct: number; cohorts: number; sales: number }[] | null;
}

export interface MarketRow {
  path: string;
  make: string;
  model: string;
  cars: number;
  ask: number;
  /** Percent, or null when the guards left too little to stand on. */
  change30: number | null;
  change60: number | null;
}

/** One month of the sold-price series. */
export interface SoldMonth {
  /** First day of the month, ISO. */
  month: string;
  /** Percent change from the month before, same model and model year. */
  change: number;
  /** Chained level, 100 in the month before the first one shown. */
  idx: number;
  /** Arms-length sales in the month. */
  sales: number;
}

/** How many months of sold prices the page draws. */
export const SOLD_MONTHS = 20;

/**
 * The monthly changes chained into a level. Only an unbroken run counts: a
 * gap (a month the database withheld) would chain two non-adjacent months as
 * if they were neighbours, so the series restarts after one and the page
 * draws the most recent run.
 */
export function chainSold(raw: RawMarket["sold"], months = SOLD_MONTHS): SoldMonth[] {
  const rows = (raw ?? [])
    .filter((r) => r && /^\d{4}-\d{2}-01$/.test(r.m) && Number.isFinite(Number(r.pct)) && Number(r.sales) > 0)
    .map((r) => ({ month: r.m, change: Number(r.pct), sales: Number(r.sales) }))
    .sort((a, b) => a.month.localeCompare(b.month));
  const next = (iso: string) => {
    const d = new Date(`${iso}T00:00:00Z`);
    d.setUTCMonth(d.getUTCMonth() + 1);
    return d.toISOString().slice(0, 10);
  };
  let run: typeof rows = [];
  for (const r of rows) {
    if (run.length && next(run[run.length - 1].month) !== r.month) run = [];
    run.push(r);
  }
  const shown = run.slice(-months);
  let idx = 100;
  return shown.map((r) => {
    idx *= 1 + r.change / 100;
    return { ...r, idx: Math.round(idx * 100) / 100 };
  });
}

export interface Market {
  asOf: string;
  /** Washington sold prices by month; empty when there is no unbroken run. */
  sold: SoldMonth[];
  /** The site index, 1.0 on its first day. */
  site: { day: string; idx: number; cars: number }[];
  rows: MarketRow[];
}

const cohortOf = (h: ModelHub, key: string) => `${h.make.toLowerCase()} ${key}`;

/** One number from several cohorts' numbers, weighted by the cars behind each. */
function pooled(parts: { cars: number; change: number | null; share: number | null }[]): number | null {
  let stood = 0;
  let sum = 0;
  let all = 0;
  for (const p of parts) {
    all += p.cars;
    if (p.change == null || p.share == null || !Number.isFinite(p.change)) continue;
    const behind = p.cars * p.share;
    stood += behind;
    sum += p.change * behind;
  }
  if (!all || stood / all < MIN_SHARE) return null;
  return Math.round((sum / stood) * 10) / 10;
}

export function shapeMarket(raw: RawMarket, hubs: ModelHub[] = MODEL_HUBS): Market {
  const byCohort = new Map<string, RawMarketModel>();
  for (const m of raw.models ?? []) {
    if (m && typeof m.cohort === "string" && Number.isFinite(m.cars) && m.cars > 0 && Number.isFinite(m.ask) && m.ask > 0)
      byCohort.set(m.cohort, m);
  }
  const rows: MarketRow[] = [];
  for (const h of hubs) {
    const found = h.keys.map((k) => byCohort.get(cohortOf(h, k))).filter((m): m is RawMarketModel => !!m);
    if (!found.length) continue;
    const cars = found.reduce((n, m) => n + m.cars, 0);
    rows.push({
      path: hubPath(h),
      make: h.make,
      model: h.model,
      cars,
      ask: Math.round(found.reduce((s, m) => s + m.ask * m.cars, 0) / cars),
      change30: pooled(found.map((m) => ({ cars: m.cars, change: m.c30, share: m.s30 }))),
      change60: pooled(found.map((m) => ({ cars: m.cars, change: m.c60, share: m.s60 }))),
    });
  }
  rows.sort((a, b) => b.cars - a.cars || a.model.localeCompare(b.model));
  const site = (raw.site ?? [])
    .filter((p) => p && typeof p.d === "string" && Number.isFinite(p.i) && p.i > 0)
    .map((p) => ({ day: p.d, idx: Number(p.i), cars: Number(p.c) || 0 }));
  return { asOf: raw.asOf, sold: chainSold(raw.sold), site, rows };
}

/**
 * Throws when the database does not answer or answers something that is not
 * a market. The page is cached for a day, and a throw leaves yesterday's
 * render in place; returning an empty market would cache a blank page under
 * a heading that promises numbers.
 */
export async function fetchMarket(): Promise<Market> {
  const base = process.env.SUPABASE_URL?.replace(/\/$/, "");
  const key = process.env.SUPABASE_ANON_KEY;
  if (!base || !key) throw new Error("market: Supabase is not configured");
  const res = await fetch(`${base}/rest/v1/rpc/market_index`, {
    method: "POST",
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: "{}",
    next: { revalidate: 86_400 },
  });
  if (!res.ok) throw new Error(`market: market_index answered ${res.status}`);
  const raw = (await res.json()) as RawMarket;
  if (!raw || typeof raw.asOf !== "string") throw new Error("market: no asOf");
  const market = shapeMarket(raw);
  if (market.site.length < 2 || !market.rows.length) throw new Error("market: empty");
  return market;
}
