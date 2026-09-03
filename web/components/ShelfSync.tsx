"use client";

import { useEffect } from "react";
import { useUser } from "@/lib/useUser";
import { readSaved, replaceSaved, subscribeSaved } from "@/lib/saved";
import { readSavedSearches, replaceSavedSearches, subscribeSavedSearches } from "@/lib/savedSearches";
import { sameShelf, unionShelf, validShelf, type Shelf } from "@/lib/shelfMerge";

// Keeps a signed-in shopper's shelf the same on every device. Mounted once
// in the root layout, renders nothing. localStorage stays the thing every
// star and every /saved tab reads (nothing else on the site changed for
// accounts); this is what moves it to and from the account:
//
//   on load, signed in   pull /api/account/shelf. First time this browser
//                        has seen this account: union the local shelf in
//                        and push the result. Otherwise the account's copy
//                        replaces the local one (lib/shelfMerge.ts says why
//                        deletions make that the only honest rule).
//   on any local change  push the whole local shelf, debounced — five stars
//                        in a row are one write.
//
// The "seen this account" flag is the account's email in localStorage; sign
// out clears it along with the shelves (components/AccountPanel.tsx).

const SYNCED_KEY = "voltcheck.shelf.synced.v1";

const localShelf = (): Shelf => validShelf({ cars: readSaved(), searches: readSavedSearches() });

async function push(shelf: Shelf): Promise<void> {
  try {
    await fetch("/api/account/shelf", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(shelf),
    });
  } catch {
    // Offline or the account route is down: the local shelf is intact and
    // the next change pushes everything again.
  }
}

export function ShelfSync() {
  const email = useUser();

  useEffect(() => {
    if (!email) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    // Pushes are held until the pull has settled, or a star during the first
    // second could push the pre-merge local shelf over the account's.
    let pulled = false;

    const schedulePush = () => {
      if (!pulled) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void push(localShelf()), 1500);
    };

    (async () => {
      let account: Shelf | null = null;
      try {
        const res = await fetch("/api/account/shelf", { cache: "no-store" });
        if (res.ok) {
          const b = (await res.json()) as { cars?: unknown; searches?: unknown };
          account = validShelf({ cars: b.cars, searches: b.searches });
        }
      } catch {
        account = null;
      }
      if (!alive) return;
      pulled = true;
      if (!account) return;

      let synced: string | null = null;
      try {
        synced = localStorage.getItem(SYNCED_KEY);
      } catch {
        synced = null;
      }
      const local = localShelf();
      const merged = synced === email ? account : unionShelf(local, account);
      if (!sameShelf(merged, local)) {
        replaceSaved(merged.cars);
        replaceSavedSearches(merged.searches);
      }
      if (!sameShelf(merged, account)) await push(merged);
      try {
        localStorage.setItem(SYNCED_KEY, email);
      } catch {
        // then the next load unions again, which is safe
      }
    })();

    const offCars = subscribeSaved(schedulePush);
    const offSearches = subscribeSavedSearches(schedulePush);
    return () => {
      alive = false;
      offCars();
      offSearches();
      if (timer) clearTimeout(timer);
    };
  }, [email]);

  return null;
}

/** What sign-out does to this browser's shelves: they belong to the account
 *  now, and the next person at this keyboard is not that account. */
export function forgetLocalShelf(): void {
  replaceSaved([]);
  replaceSavedSearches([]);
  try {
    localStorage.removeItem(SYNCED_KEY);
  } catch {
    // nothing to forget
  }
}
