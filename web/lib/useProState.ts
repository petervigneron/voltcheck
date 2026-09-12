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
// `expired` is the second bit (0087), and only ever true when `active` is
// false: this browser's account or cookie bought a pass and its time is up.
// It changes nothing about what is allowed — every gate stays on `active` —
// and only what a blocked control is allowed to say.
//
// A pass activated mid-session arrives through /pro/access, which is a full
// navigation, so a stale cache cannot outlive the page that holds it.

export interface ProState {
  active: boolean;
  expired: boolean;
}

const NONE: ProState = { active: false, expired: false };

let cache: ProState | null = null;
let inflight: Promise<ProState> | null = null;

/** The whole answer, or null while it is on its way. */
export function useProPass(): ProState | null {
  const [state, setState] = useState<ProState | null>(cache);
  useEffect(() => {
    if (cache !== null) return;
    inflight ??= fetch("/api/pro/state", { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) return NONE;
        const j = (await res.json()) as { active?: boolean; expired?: boolean };
        return { active: !!j.active, expired: !j.active && !!j.expired };
      })
      .catch(() => NONE);
    let alive = true;
    inflight.then((v) => {
      cache = v;
      if (alive) setState(v);
    });
    return () => {
      alive = false;
    };
  }, []);
  return state;
}

/** Just the entitlement, for the gates that only ever asked that. */
export function useProState(): boolean | null {
  const state = useProPass();
  return state === null ? null : state.active;
}
