"use client";

import { useEffect, useMemo, useState } from "react";
import { ListingCard } from "./ListingCard";
import { SaveToggle } from "./SaveToggle";
import { useCardIndex } from "@/lib/listings/useCardIndex";
import { readSaved, subscribeSaved, type SavedEntry } from "@/lib/saved";
import { PriceDropSignup } from "./PriceDropSignup";
import { useProState } from "@/lib/useProState";

// The saved-cars panel of /saved (the tab shell is components/SavedView.tsx).
// localStorage names the cars, the same card index the browse grid downloads
// says which of them are still for sale. A saved car the index no longer
// carries has been delisted — it renders as exactly that, with the title and
// price snapshotted at save time, rather than vanishing (a shopper wondering
// where their car went) or rendering stale data as if it were live.

const CELL = "border-r-[3px] border-b-[3px] border-ink";

const SAVED_DATE_FMT = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });

function DelistedCard({ e }: { e: SavedEntry }) {
  return (
    <div className={`${CELL} relative flex flex-col bg-paper text-ink`}>
      <div className="border-b-[3px] border-ink bg-putty px-4 py-2 text-[10.5px] font-extrabold tracking-[0.14em] text-ink/55 uppercase">
        No longer listed
      </div>
      <div className="flex flex-1 flex-col gap-2 p-4">
        <h2 className="text-[15px] leading-tight font-bold">{e.title ?? e.id.toUpperCase()}</h2>
        <p className="text-[12.5px] text-ink/60 tabular-nums">
          Saved {SAVED_DATE_FMT.format(new Date(e.savedAt))}
          {e.priceUsd != null ? ` · was $${e.priceUsd.toLocaleString()}` : ""}
        </p>
      </div>
      <SaveToggle id={e.id} title={e.title ?? e.id.toUpperCase()} priceUsd={e.priceUsd} />
    </div>
  );
}

export function SavedCars() {
  // null until mount: localStorage is client-only, and the prerendered shell
  // has to match the first client paint.
  const [entries, setEntries] = useState<SavedEntry[] | null>(null);
  const pro = useProState();
  useEffect(() => {
    const sync = () => setEntries(readSaved());
    sync();
    return subscribeSaved(sync);
  }, []);

  const { rows, failed } = useCardIndex();
  const byId = useMemo(() => new Map((rows ?? []).map((r) => [r.id, r])), [rows]);
  // Newest save first — the order the shopper made, not the feed's.
  const sorted = useMemo(
    () => (entries ? [...entries].sort((a, b) => b.savedAt.localeCompare(a.savedAt)) : []),
    [entries]
  );

  if (entries !== null && entries.length === 0) {
    return (
      <div className="border-l-[3px] border-ink">
        <div className={`${CELL} bg-paper px-6 py-8 text-[15px] font-bold text-ink/60`}>
          Nothing saved yet — the ☆ on any car keeps it here.
        </div>
      </div>
    );
  }

  if (entries === null || (rows === null && !failed)) {
    return (
      <div className="grid grid-cols-1 border-l-[3px] border-ink sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: Math.min(entries?.length ?? 3, 6) }, (_, i) => (
          <div key={i} className={`${CELL} animate-pulse`} aria-hidden="true">
            <div className="aspect-[3/2] border-b-[3px] border-ink bg-putty" />
            <div className="h-[118px] bg-paper" />
          </div>
        ))}
      </div>
    );
  }

  if (rows === null) {
    // Without the index we can't tell "still for sale" from "delisted", so the
    // page claims neither.
    return (
      <div className="border-l-[3px] border-ink">
        <div className={`${CELL} bg-vermilion px-6 py-8 text-paper`}>
          <p className="text-[26px] leading-[1.1] font-extrabold tracking-[-0.025em]">
            Couldn&apos;t load the inventory.{" "}
            <button type="button" className="underline" onClick={() => window.location.reload()}>
              Try again
            </button>
          </p>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* The free alert (components/PriceDropSignup.tsx): an address for
          "tell me when one of these drops in price". Above the cards, so it
          is seen on a shelf of any length. */}
      <PriceDropSignup />
      <div className="grid grid-cols-1 border-l-[3px] border-ink sm:grid-cols-2 lg:grid-cols-3">
        {sorted.map((e, i) => {
          const r = byId.get(e.id);
          return r ? <ListingCard key={e.id} r={r} index={i} pro={pro} /> : <DelistedCard key={e.id} e={e} />;
        })}
      </div>
    </>
  );
}
