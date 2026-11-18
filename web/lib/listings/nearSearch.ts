import { apiIndex, apiManifest, apiPartition, hydrate } from "@/lib/api/artifacts";
import { runQuery, type ListingQuery } from "@/lib/api/query";
import { breakdownOf, type SearchBreakdown } from "@/lib/api/search";
import type { ApiListing, SlimRow } from "@/lib/api/records";
import type { ModelHub } from "./modelHubs";
import { conditionSet, NEAR_ROWS, type NearParams } from "./near";

// The data half of /ev/<make>/<model>/near/<zip>: the public API's own
// search (lib/api) over the published artifacts, never the database. Same
// manifest, same slim index, same filter engine, same breakdown — so this
// page and /api/v1/listings cannot disagree about a car.
//
// One difference, and it is the hub's: a model hub can be more than one
// feed spelling ("NX 450h+" and "NX 450h Plus", lib/listings/modelHubs.ts),
// and the API's `model=` matches one modelKey. So the index is narrowed to
// the hub's own make and keys first, and the query runs with no make or
// model of its own.
//
// Unreadable artifacts THROW. An empty table here reads as "no EV6 near
// Chicago", which is a false answer; a 500 is an honest one. Same choice as
// the browse shards and the API's 503.

export interface NearResult {
  asOf: string;
  total: number;
  cars: { rec: ApiListing; distanceMi?: number }[];
  breakdown: SearchBreakdown;
}

/** The hub's rows of the slim index. Pure. */
export function hubRows(rows: SlimRow[], hub: ModelHub): SlimRow[] {
  const keys = new Set(hub.keys);
  return rows.filter((r) => r[1] === hub.makeSlug && keys.has(r[2]));
}

/** The query the page runs, from its parameters. Pure. */
export function nearListingQuery(p: NearParams): ListingQuery {
  const q: ListingQuery = { radiusMi: p.radius, limit: NEAR_ROWS, offset: 0, sort: "distance" };
  if (p.condition) q.condition = conditionSet(p.condition);
  if (p.maxPrice !== undefined) q.priceMax = p.maxPrice;
  if (p.maxMiles !== undefined) q.mileageMax = p.maxMiles;
  if (p.yearMin !== undefined) q.yearMin = p.yearMin;
  return q;
}

export async function nearSearch(hub: ModelHub, origin: [number, number], p: NearParams): Promise<NearResult> {
  const m = await apiManifest();
  if (!m) throw new Error("near: the inventory manifest is missing or stale");
  const idx = await apiIndex(m);
  if (!idx) throw new Error("near: the inventory index could not be read");
  const r = runQuery(hubRows(idx.r, hub), nearListingQuery(p), origin);
  // hydrate() quietly drops a partition it cannot read ("costs its cars, not
  // the response"), which on this page would print a count over an empty
  // table. Read it first, and refuse when it is not there.
  if (r.page.length && !(await apiPartition(m, hub.makeSlug))) {
    throw new Error(`near: the ${hub.makeSlug} partition could not be read`);
  }
  const recs = await hydrate(m, r.page);
  return {
    asOf: m.as_of,
    total: r.total,
    cars: recs.map((rec) => ({ rec, distanceMi: r.distances?.get(rec.id) })),
    breakdown: breakdownOf(r.hits),
  };
}
