"use client";

import { useEffect, useState } from "react";
import type { CardRow } from "./card";
import { unpackFirstPaint, type FirstPaintData } from "./firstPaint";
import { SHARDS, unpackIndex, type PackedIndex } from "./pack";

// The whole inventory arrives once per visitor (CDN-cached JSON, hourly
// revalidate) and every filter, sort, and page flip after that is a pure
// in-browser computation — no server round-trip, which is where the latency
// used to live. The first paint doesn't wait for it: useFirstPaint below
// fetches the small pristine-landing payload in parallel, and this download
// streams in behind it. Module-level cache so client-side navigation never
// refetches — and so /saved and the browse grid share one copy instead of two.
// (Extracted from components/Browse.tsx when /saved became a second reader.)
let indexCache: CardRow[] | null = null;
let indexPromise: Promise<CardRow[]> | null = null;

export function useCardIndex(): { rows: CardRow[] | null; failed: boolean } {
  const [rows, setRows] = useState<CardRow[] | null>(indexCache);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (indexCache) return;
    // Every shard at once: the wait is the slowest file, not the sum of them.
    // One shard failing fails the load — a grid quietly missing a sixth of the
    // inventory is the failure this whole path exists to prevent.
    indexPromise ??= Promise.all(
      Array.from({ length: SHARDS }, (_, i) =>
        fetch(`/api/index/${i}`).then(async (res) => {
          if (!res.ok) throw new Error(`index shard ${i}: ${res.status}`);
          // Unpacking is one pass over already-parsed JSON — cheaper than the
          // parse itself, and it happens once per visitor.
          return unpackIndex((await res.json()) as PackedIndex);
        })
      )
    ).then((shards) => {
      // Did the first-paint payload beat the full index? Decided once, here,
      // at the moment the index resolves: Browse only pins the first-paint
      // card order when it held from the start, because applying it late
      // would reorder pages relative to a grid the shopper already paged
      // through under the index's own ordering.
      firstWon = firstCache != null;
      // Shard membership is keyed on the car (api/index/[shard]), so a car
      // arriving twice means two shards were cached from different builds of
      // the old positional scheme — possible until every cache has turned
      // over. A doubled card reads as two cars for sale; keep the first.
      const seen = new Set<string>();
      return shards.flat().filter((r) => !seen.has(r.id) && (seen.add(r.id), true));
    });
    indexPromise.then(
      (rs) => {
        indexCache = rs;
        setRows(rs);
      },
      () => {
        indexPromise = null;
        setFailed(true);
      }
    );
  }, [failed]);
  return { rows, failed };
}

// The first-paint payload (/api/index/first, lib/listings/firstPaint.ts): the
// top page of featured cards plus the band, suggestions, and counts — a couple
// dozen KB that lands well before the shards above, so the pristine landing
// page paints without waiting for the country. Failure here is silent and
// terminal for the session: the full index is the fallback, and it is exactly
// the page we had before this payload existed.
let firstCache: FirstPaintData | null | undefined;
let firstPromise: Promise<FirstPaintData | null> | null = null;
let firstWon = false;

/** True iff the first-paint payload had already landed when the full index
 *  resolved — the near-universal case (it is 1% of the index's bytes, fetched
 *  in the same breath). Session-stable by construction. */
export const firstPaintWonRace = () => firstWon;

export function useFirstPaint(): FirstPaintData | null {
  const [first, setFirst] = useState<FirstPaintData | null>(firstCache ?? null);
  useEffect(() => {
    if (firstCache !== undefined) return;
    firstPromise ??= fetch("/api/index/first")
      .then(async (res) => (res.ok ? unpackFirstPaint(await res.json()) : null))
      .catch(() => null);
    firstPromise.then((d) => {
      firstCache = d;
      if (d) setFirst(d);
    });
  }, []);
  return first;
}
