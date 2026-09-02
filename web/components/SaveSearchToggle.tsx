"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  canonicalSearchQs,
  describeSearch,
  isSearchSaved,
  subscribeSavedSearches,
  toggleSavedSearch,
} from "@/lib/savedSearches";

// "Save this search" on the browse rail — the search-shaped sibling of the ☆
// on a card (components/SaveToggle.tsx). One glyph pair carries the state; the
// saved shelf lives on /saved's Searches tab.
//
// Renders unsaved on the server and corrects in an effect, like every other
// localStorage reader here, so the first client paint matches the static
// shell. The BLOCK/HOVER classes are the rail's, so this sits in the row as
// one more cell — minus the phone-only grow: on a phone the sort beside it
// takes the row's slack (components/Filters.tsx), and this holds its width.

const CELL = "border-r-[3px] border-b-[3px] border-ink";
const HOVER =
  "hover:ring-[3px] hover:ring-inset hover:ring-cobalt focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-cobalt";
const BLOCK = `${CELL} flex shrink-0 items-center sm:gap-2 px-4 py-2.5 text-[13px] font-bold uppercase tracking-[0.04em]`;

export function SaveSearchToggle() {
  const sp = useSearchParams();
  const qs = canonicalSearchQs(new URLSearchParams(sp.toString()));
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const sync = () => setSaved(isSearchSaved(qs));
    sync();
    return subscribeSavedSearches(sync);
  }, [qs]);

  const onClick = () => {
    setSaved(toggleSavedSearch({ qs, label: describeSearch(qs) }));
  };

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={saved}
      aria-label={saved ? "Saved search" : "Save search"}
      title={saved ? "Saved — see the Searches tab under Saved" : "Save this search to come back to it"}
      className={`${BLOCK} ${HOVER} ${saved ? "bg-ink text-paper" : "bg-paper text-ink"}`}
    >
      <span aria-hidden="true">{saved ? "★" : "☆"}</span>
      {/* On a phone the star stands alone — the same glyph the cards use for
          the same act — so count, sort and save share one row instead of the
          words costing the save a row of its own (2026-09-02). */}
      <span className="hidden sm:inline">{saved ? "Saved" : "Save search"}</span>
    </button>
  );
}
