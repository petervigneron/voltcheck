"use client";

import { useEffect } from "react";
import { readSaved, subscribeSaved } from "@/lib/saved";
import { postWatchlist, readWatchlistEmail } from "@/lib/watchlist";

// Keeps the free price-drop alert (lib/watchlist.ts) in step with the stars.
// Mounted once in the root layout, renders nothing: when the shopper has
// given an address for their saved cars, every change to the shelf — on the
// grid, on a listing page, on /saved — re-posts the newest fifty ids, and the
// server replaces the one subscription in place (0060). Debounced, because a
// shopper starring five cars in a row is one change, not five emails' worth
// of requests. Nothing is posted for a visitor who never gave an address.

export function WatchlistSync() {
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const off = subscribeSaved(() => {
      const email = readWatchlistEmail();
      if (!email) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        const ids = [...readSaved()].sort((a, b) => b.savedAt.localeCompare(a.savedAt)).map((e) => e.id);
        void postWatchlist(email, ids);
      }, 2000);
    });
    return () => {
      off();
      if (timer) clearTimeout(timer);
    };
  }, []);
  return null;
}
