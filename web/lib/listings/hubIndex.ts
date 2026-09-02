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

export type HubEntry = {
  /** Every live car on this hub, not just the listed ones. */
  total: number;
  cars: HubCar[];
};

export type HubIndex = {
  /** Bumped when the shape changes, so a stale body is recognisable. */
  v: 1;
  hubs: Record<string, HubEntry>;
};

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

export function buildHubIndex(rows: CardRow[]): HubIndex {
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
    hubs[key] = { total: all.length, cars };
  }
  return { v: 1, hubs };
}
