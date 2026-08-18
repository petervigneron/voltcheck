"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { BROWSE_QS_KEY } from "@/lib/browseState";

// The link back to the browse grid, on a listing detail page. The grid keeps
// all of its state — the search words, filters, sort, and which page you were
// on — in the URL query string (components/Browse.tsx via lib/pushUrl.ts). A
// plain <Link href="/"> throws every bit of that away and drops the shopper on
// an unfiltered page one, which is the bug this replaces.
//
// So the grid stashes its query string in sessionStorage (lib/browseState.ts)
// on every change, and this reads it back to reconstruct /?<qs>. That href is
// the reliable path — it restores the exact filtered results for a middle
// click, a right-click "open in new tab", or a shopper who reloaded the detail
// page. When we can tell the grid is the previous entry in this tab's history
// (a stored query string proves the shopper was just there), the click prefers
// router.back() instead: same destination, but the browser also restores the
// scroll position, so a click into the 40th card and back lands on the 40th
// card rather than the top.
export function BackToResults() {
  const router = useRouter();
  // Start at "/" so the server render and first client paint agree
  // (sessionStorage is client-only); the effect fills in the real query string.
  // canGoBack: a stored query string means the grid was open in this tab, so
  // its entry is behind us in history and back() will restore scroll. Without
  // one (direct link, shared URL, fresh tab) the plain href navigation is right.
  const [{ href, canGoBack }, setState] = useState({ href: "/", canGoBack: false });

  useEffect(() => {
    const sync = () => {
      let qs: string | null = null;
      try {
        qs = sessionStorage.getItem(BROWSE_QS_KEY);
      } catch {
        // Private mode or blocked storage — fall back to plain "/".
      }
      setState({ href: qs ? `/?${qs}` : "/", canGoBack: !!qs && window.history.length > 1 });
    };
    sync();
  }, []);

  return (
    <Link
      href={href}
      onClick={(e) => {
        if (canGoBack) {
          e.preventDefault();
          router.back();
        }
      }}
      className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 px-3 py-2 text-sm font-semibold text-zinc-600 hover:border-emerald-500 hover:text-emerald-600 dark:border-zinc-700 dark:text-zinc-300 dark:hover:border-emerald-500"
    >
      <span aria-hidden="true">←</span> Back to results
    </Link>
  );
}
