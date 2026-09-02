"use client";

import { useEffect, useState } from "react";

// Whether this browser holds a live Pro pass, for client components that
// gate a control on it (the deal sort in components/Filters.tsx and
// components/Browse.tsx). Asks /api/pro/state once per page load and shares
// the answer across every component that mounts — the same module-cache shape
// as lib/listings/useCardIndex.ts.
//
// Three states, on purpose: null while the answer is on its way, so a control
// that depends on it can hold still instead of flashing from locked to open;
// then true or false. Failure is false: an unreachable endpoint must read as
// "no pass", never as one.
//
// A pass activated mid-session arrives through /pro/access, which is a full
// navigation, so a stale cache cannot outlive the page that holds it.

let cache: boolean | null = null;
let inflight: Promise<boolean> | null = null;

export function useProState(): boolean | null {
  const [pro, setPro] = useState<boolean | null>(cache);
  useEffect(() => {
    if (cache !== null) return;
    inflight ??= fetch("/api/pro/state", { cache: "no-store" })
      .then(async (res) => (res.ok ? !!((await res.json()) as { active?: boolean }).active : false))
      .catch(() => false);
    let alive = true;
    inflight.then((v) => {
      cache = v;
      if (alive) setPro(v);
    });
    return () => {
      alive = false;
    };
  }, []);
  return pro;
}
