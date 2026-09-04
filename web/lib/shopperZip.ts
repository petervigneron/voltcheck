"use client";

import { useEffect, useState } from "react";

// The shopper's own ZIP, for surfaces that answer differently by where the
// shopper lives (the car page's rebate block, lib/incentives/territory.ts).
//
// Two sources, in order: a ZIP the shopper TYPED — on the browse rail's
// "Near ZIP" field or in the rebate block itself — kept in this browser
// (localStorage) so every page agrees; else Vercel's IP geolocation via
// /api/whereami, a guess that is used but never stored. `undefined` while
// the question is still being settled, `null` when nothing is known, so a
// block can wait rather than paint a list and then shrink it.
//
// `typed` is the part callers must not ignore. A typed ZIP is the shopper
// saying where they live; an IP guess says only where their connection came
// out today, and these two are different facts. Owner, 2026-09-04: "people
// may be residents and be physically located away from their home when they
// search." A rebate turns on residency, so a guess is never allowed to
// answer a residency question on its own — see lib/incentives/visible.ts.

const KEY = "voltcheck.zip";
const ok = (v: unknown): v is string => typeof v === "string" && /^\d{5}$/.test(v);

export function readShopperZip(): string | null {
  try {
    const v = localStorage.getItem(KEY);
    return ok(v) ? v : null;
  } catch {
    return null;
  }
}

export function writeShopperZip(zip: string): void {
  try {
    if (ok(zip.trim())) localStorage.setItem(KEY, zip.trim());
    else if (!zip.trim()) localStorage.removeItem(KEY);
  } catch {
    // storage unavailable: the page still works, just without memory
  }
}

let ipZip: string | null | undefined;
let ipInflight: Promise<string | null> | null = null;
const ipGuess = () =>
  (ipInflight ??= fetch("/api/whereami")
    .then((res) => (res.ok ? res.json() : null))
    .then((geo: { postal?: string | null } | null) => (geo && ok(geo.postal) ? geo.postal : null))
    .catch(() => null)
    .then((v) => (ipZip = v)));

export interface ShopperZip {
  /** The ZIP, `null` when nothing is known, `undefined` while settling. */
  zip: string | null | undefined;
  /** True only when the shopper typed it. False for an IP guess, and while
   *  the question is unsettled. */
  typed: boolean;
  setZip: (zip: string) => void;
}

export function useShopperZip(): ShopperZip {
  const [known, setKnown] = useState<{ zip: string | null; typed: boolean } | undefined>(undefined);
  useEffect(() => {
    // Settled through a promise even when the answer is already in hand, so
    // the state update never runs synchronously inside the effect.
    const typed = readShopperZip();
    const answer: Promise<{ zip: string | null; typed: boolean }> = typed
      ? Promise.resolve({ zip: typed, typed: true })
      : (ipZip !== undefined ? Promise.resolve(ipZip) : ipGuess()).then((zip) => ({ zip, typed: false }));
    let alive = true;
    answer.then((v) => {
      if (alive) setKnown(v);
    });
    return () => {
      alive = false;
    };
  }, []);
  const setZip = (v: string) => {
    writeShopperZip(v);
    if (ok(v.trim())) setKnown({ zip: v.trim(), typed: true });
  };
  return { zip: known === undefined ? undefined : known.zip, typed: known?.typed ?? false, setZip };
}
