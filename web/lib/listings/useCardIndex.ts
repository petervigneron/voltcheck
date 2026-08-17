"use client";

import { useEffect, useState } from "react";
import type { CardRow } from "./card";
import { SHARDS, unpackIndex, type PackedIndex } from "./pack";

// The whole inventory arrives once per visitor (CDN-cached JSON, hourly
// revalidate) and every filter, sort, and page flip after that is a pure
// in-browser computation — no server round-trip, which is where the latency
// used to live. Module-level cache so client-side navigation never refetches —
// and so /saved and the browse grid share one copy instead of two.
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
