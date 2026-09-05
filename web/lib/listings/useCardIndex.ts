"use client";

import { useEffect, useState } from "react";
import type { CardRow } from "./card";
import { unpackFirstPaint, type FirstPaintData } from "./firstPaint";
import { SHARDS, unpackIndex, type PackedIndex } from "./pack";
import type { WorthTrims } from "./tally";
import { mergePro, unpackPro, type PackedPro } from "./proSignals";
import { useProState } from "@/lib/useProState";

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
// The Pro fields (lib/listings/proSignals.ts) arrive through their own
// pass-checked route and are merged into the cached rows once; the public
// shards stopped carrying them on 2026-09-05. Module-level like the index,
// so /saved and the grid merge one copy.
let proMerged = false;
let proPromise: Promise<void> | null = null;

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
  // A pass-holder's grid gets its deal and rebate fields from /api/index/pro
  // once the index is here. A stranger's fetch is never made: the route
  // would answer 401, and asking it is how a grid learns nothing.
  const pro = useProState();
  useEffect(() => {
    if (pro !== true || !rows || proMerged) return;
    proPromise ??= fetch("/api/index/pro", { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) return;
        const packed = (await res.json()) as PackedPro;
        if (!packed || packed.v !== 1 || !indexCache) return;
        indexCache = mergePro(indexCache, unpackPro(packed));
        proMerged = true;
      })
      .catch(() => {});
    let alive = true;
    proPromise.then(() => {
      if (alive && proMerged && indexCache) setRows(indexCache);
    });
    return () => {
      alive = false;
    };
  }, [pro, rows]);
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

// The trim facets (/api/index/trims, lib/listings/tally.ts worthTrimTally):
// what /worth's trim dropdown offers per make/model/year cell. Fetched only
// by the valuation form, module-cached like the payloads above, and a failure
// is silent for the same reason theirs is: the trim was optional before the
// dropdown existed, and a form without trim options is exactly the form we
// had — never a blocked estimate.
let trimsCache: WorthTrims | null | undefined;
let trimsPromise: Promise<WorthTrims | null> | null = null;

export function useWorthTrims(): WorthTrims | null {
  const [trims, setTrims] = useState<WorthTrims | null>(trimsCache ?? null);
  useEffect(() => {
    if (trimsCache !== undefined) return;
    trimsPromise ??= fetch("/api/index/trims")
      .then(async (res) => {
        if (!res.ok) return null;
        const j = (await res.json()) as WorthTrims;
        return j && j.v === 1 && j.trims ? j : null;
      })
      .catch(() => null);
    trimsPromise.then((d) => {
      trimsCache = d;
      if (d) setTrims(d);
    });
  }, []);
  return trims;
}

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
