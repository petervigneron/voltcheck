// The model hubs' data, in one small artifact.
//
// Why an artifact of its own, rather than each hub page reading the feed.
// Cars are sharded by a hash of their VIN (pack.ts shardOfId), so a single
// model's inventory is spread across all 24 shards — answering "which cars
// are Ioniq 5s" from the packed feed means pulling every shard, ~50 MB, for
// each of 246 hubs. That is 12 GB of storage egress to warm one deploy, on a
// site whose whole egress budget is the reason the browse routes cache for a
// day (the 2026-08-17 incident). One ~1.5 MB file, fetched once and shared by
// every hub render in the instance, is the same data at 1/8000th the cost.
//
// Built by the same function the publisher calls, so the page and the
// artifact can never drift — the pattern app/api/index/[shard] already uses
// with buildFirstPaint and packIndex.

import type { CardRow } from "./card";
import { MODEL_HUBS, type ModelHub } from "./modelHubs";
import { modelKey } from "./modelName";

/**
 * How many cars a hub page lists.
 *
 * A crawl path, not a catalogue: the sitemap is what carries all ~149,000
 * listings, and a hub exists to give a crawler somewhere to walk from and a
 * shopper somewhere to land. 48 is enough that the page is worth reading and
 * small enough that 246 of them stay one modest file.
 */
export const HUB_CARS = 48;

/** One car as a hub row needs it — a tenth of a CardRow. */
export type HubCar = {
  /** The VIN, which is the listing's id and its URL. */
  id: string;
  year: number;
  title: string;
  trim?: string;
  priceUsd: number;
  realPrice: boolean;
  mileage?: number;
  condition?: "new" | "used" | "certified";
  state?: string;
};

/**
 * A hub's inventory, counted. This is the part of the page a search engine or
 * an assistant can quote — "929 2023s for sale, median asking $32,894" — and
 * it exists because on 2026-09-07 Gemini sent the owner to a competitor whose
 * only citable pages were monthly per-model price posts. Everything here is
 * derived from the public shards and nothing else, so the page gives the Pro
 * surfaces (ask-vs-market, trends, incentives) nothing.
 *
 * Every number is guarded by a floor (STATS_MIN below): a median over three
 * cars is a claim the site cannot stand behind, so it is left out rather
 * than printed. The house rule — matching nothing is honest, matching the
 * wrong thing is not — applies to aggregates too.
 */
export type HubStats = {
  /** ISO date (YYYY-MM-DD) the numbers were computed. */
  asOf: string;
  byCondition: { new: number; used: number; certified: number };
  /** Cars carrying a recent price cut (CardRow.cut). */
  cuts: number;
  /** One row per model year, oldest first. Medians only where the floor is met. */
  years: {
    year: number;
    n: number;
    /** Cars with a confirmed asking price (realPrice). */
    priced: number;
    medianUsd?: number;
    medianMiles?: number;
  }[];
  /** The battery/range pairings actually on the lot, most common first. */
  configs: { kwh: number; rangeMi: number; n: number }[];
  /** Only when enough cars carry a known answer. */
  heatPump?: { yes: number; no: number };
  /** Where the cars are, most first. */
  states: { state: string; n: number }[];
};

export type HubEntry = {
  /** Every live car on this hub, not just the listed ones. */
  total: number;
  cars: HubCar[];
  /** Absent on an artifact published before stats existed; the page renders without it. */
  stats?: HubStats;
};

export type HubIndex = {
  /** Bumped when the shape changes, so a stale body is recognisable. */
  v: 1;
  /** When the artifact was built (YYYY-MM-DD). Optional for the same reason stats is. */
  asOf?: string;
  hubs: Record<string, HubEntry>;
};

/** The fewest cars a median, a config row or a heat-pump split may rest on. */
export const STATS_MIN = 5;
/** Config and state rows shown per hub. */
export const STATS_TOP = 6;

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
}

export function hubStats(all: CardRow[], asOf: string): HubStats {
  const byCondition = { new: 0, used: 0, certified: 0 };
  let cuts = 0;
  const byYear = new Map<number, CardRow[]>();
  const configs = new Map<string, { kwh: number; rangeMi: number; n: number }>();
  const hp = { yes: 0, no: 0 };
  const states = new Map<string, number>();
  for (const r of all) {
    if (r.condition) byCondition[r.condition]++;
    if (r.cut) cuts++;
    const y = byYear.get(r.year);
    if (y) y.push(r);
    else byYear.set(r.year, [r]);
    if (r.kwh !== undefined && r.rangeMi !== undefined) {
      const k = `${r.kwh}|${r.rangeMi}`;
      const c = configs.get(k);
      if (c) c.n++;
      else configs.set(k, { kwh: r.kwh, rangeMi: r.rangeMi, n: 1 });
    }
    if (r.heatPump === "yes") hp.yes++;
    else if (r.heatPump === "no") hp.no++;
    if (r.state) states.set(r.state, (states.get(r.state) ?? 0) + 1);
  }
  const years = [...byYear.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([year, rows]) => {
      const prices = rows.filter((r) => r.realPrice && r.priceUsd > 0).map((r) => r.priceUsd);
      const miles = rows.map((r) => r.mileage).filter((m): m is number => m !== undefined);
      return {
        year,
        n: rows.length,
        priced: prices.length,
        ...(prices.length >= STATS_MIN ? { medianUsd: median(prices) } : {}),
        ...(miles.length >= STATS_MIN ? { medianMiles: median(miles) } : {}),
      };
    });
  const known = hp.yes + hp.no;
  return {
    asOf,
    byCondition,
    cuts,
    years,
    configs: [...configs.values()]
      .filter((c) => c.n >= STATS_MIN)
      .sort((a, b) => b.n - a.n)
      .slice(0, STATS_TOP),
    ...(known >= STATS_MIN ? { heatPump: hp } : {}),
    states: [...states.entries()]
      .map(([state, n]) => ({ state, n }))
      .sort((a, b) => b.n - a.n)
      .slice(0, STATS_TOP),
  };
}

/** A hub's key in the artifact, and its URL path below /ev. */
export function hubIndexKey(h: ModelHub): string {
  return `${h.makeSlug}/${h.modelSlug}`;
}

function toHubCar(r: CardRow): HubCar {
  return {
    id: r.id,
    year: r.year,
    title: r.title,
    trim: r.trim,
    priceUsd: r.priceUsd,
    realPrice: r.realPrice,
    mileage: r.mileage,
    condition: r.condition,
    state: r.state,
  };
}

export function buildHubIndex(rows: CardRow[], asOf = new Date().toISOString().slice(0, 10)): HubIndex {
  // Same matching contract as lib/facts/links.ts: exact on make plus
  // modelKey, no prefix rule. A car whose model does not resolve to a hub
  // simply appears on none, which is the honest outcome — the alternative is
  // a page that quietly claims a car it should not.
  const byKey = new Map<string, ModelHub>();
  for (const h of MODEL_HUBS) {
    for (const k of h.keys) byKey.set(`${h.make.toLowerCase()}|${k}`, h);
  }

  const collected = new Map<string, CardRow[]>();
  for (const r of rows) {
    const h = byKey.get(`${(r.make ?? "").toLowerCase()}|${modelKey(r.model ?? "")}`);
    if (!h) continue;
    const key = hubIndexKey(h);
    let list = collected.get(key);
    if (!list) {
      list = [];
      collected.set(key, list);
    }
    list.push(r);
  }

  const hubs: Record<string, HubEntry> = {};
  for (const h of MODEL_HUBS) {
    const key = hubIndexKey(h);
    const all = collected.get(key) ?? [];
    // Newest first, then fewest miles. An ordinary default for a car list
    // that makes no claim of its own — deliberately not "cheapest first",
    // which would read as a bargain the page has not actually established.
    const cars = [...all]
      .sort((a, b) => b.year - a.year || (a.mileage ?? Infinity) - (b.mileage ?? Infinity))
      .slice(0, HUB_CARS)
      .map(toHubCar);
    hubs[key] = { total: all.length, cars, stats: hubStats(all, asOf) };
  }
  return { v: 1, asOf, hubs };
}
