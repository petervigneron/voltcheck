"use client";

import { useEffect, useState } from "react";

// The shopper's own ZIP, for surfaces that answer differently by where the
// shopper lives (the car page's rebate block, lib/incentives/territory.ts).
//
// Two sources, in order: a ZIP the shopper typed — on the browse rail's
// "Near ZIP" field or in the rebate block itself — kept in this browser
// (localStorage) so every page agrees; else Vercel's IP geolocation via
// /api/whereami, a guess that is used but never stored. `undefined` while
// the question is still being settled, `null` when nothing is known, so a
// block can wait rather than paint a list and then shrink it.

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

export function useShopperZip(): { zip: string | null | undefined; setZip: (zip: string) => void } {
  const [zip, setZipState] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    // Settled through a promise even when the answer is already in hand, so
    // the state update never runs synchronously inside the effect.
    const typed = readShopperZip();
    const answer = typed ? Promise.resolve(typed) : ipZip !== undefined ? Promise.resolve(ipZip) : ipGuess();
    let alive = true;
    answer.then((v) => {
      if (alive) setZipState(v);
    });
    return () => {
      alive = false;
    };
  }, []);
  const setZip = (v: string) => {
    writeShopperZip(v);
    if (ok(v.trim())) setZipState(v.trim());
  };
  return { zip, setZip };
}
