"use client";

import { useEffect, useState } from "react";
import { SavedCars } from "./Saved";
import { SavedSearches } from "./SavedSearches";
import { readSaved, subscribeSaved } from "@/lib/saved";
import { readSavedSearches, subscribeSavedSearches } from "@/lib/savedSearches";

// /saved, in two tabs: the cars a shopper starred (components/Saved.tsx) and
// the searches they kept (components/SavedSearches.tsx). Both shelves live in
// localStorage, so this owns the page shell and the counts and hands each tab
// its panel. Tab choice is local state, not the URL — /saved is a personal
// view, and which tab you're on isn't worth a shareable link.

const CELL = "border-r-[3px] border-b-[3px] border-ink";
const TAB = "px-5 py-4 text-[10.5px] font-extrabold tracking-[0.14em] uppercase tabular-nums focus:outline-none focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-cobalt";

type Tab = "cars" | "searches";

export function SavedView() {
  const [tab, setTab] = useState<Tab>("cars");
  // Counts are null until mount so the server render and first client paint
  // agree (localStorage is client-only).
  const [counts, setCounts] = useState<{ cars: number; searches: number } | null>(null);

  useEffect(() => {
    const sync = () => setCounts({ cars: readSaved().length, searches: readSavedSearches().length });
    sync();
    const offCars = subscribeSaved(sync);
    const offSearches = subscribeSavedSearches(sync);
    return () => {
      offCars();
      offSearches();
    };
  }, []);

  const label = (base: string, n: number | undefined) => (n !== undefined ? `${base} · ${n}` : base);

  return (
    <div className="mx-auto max-w-[1400px] px-0 sm:px-6 sm:py-6">
      <div className="border-t-[3px] border-l-[3px] border-ink">
        <div className="flex flex-wrap items-stretch">
          <button
            type="button"
            aria-pressed={tab === "cars"}
            onClick={() => setTab("cars")}
            className={`${CELL} ${TAB} ${tab === "cars" ? "bg-ink text-paper" : "bg-paper text-ink hover:bg-putty"}`}
          >
            {label("Cars", counts?.cars)}
          </button>
          <button
            type="button"
            aria-pressed={tab === "searches"}
            onClick={() => setTab("searches")}
            className={`${CELL} ${TAB} ${tab === "searches" ? "bg-ink text-paper" : "bg-paper text-ink hover:bg-putty"}`}
          >
            {label("Searches", counts?.searches)}
          </button>
          <div className={`${CELL} flex-1 min-w-[40px] bg-paper`} aria-hidden="true" />
        </div>
      </div>

      {tab === "cars" ? <SavedCars /> : <SavedSearches />}
    </div>
  );
}
