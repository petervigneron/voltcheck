// The Pro value watch — "Track this car's value", the line the /worth result
// carried as "coming with Pro" from 2026-08-26 until 2026-09-09.
//
// A watch is an ordinary alert subscription (0029) whose params are the
// /worth query string with `worth=1` in front: the same year, make, model,
// mileage, VIN, trim, drivetrain and condition the page itself reads. That
// buys the whole existing lane for free — the account-bound subscribe
// (alert_subscribe_mine), the unsubscribe token and page, the twenty-row
// cap, one row per (address, car) — and it means a watch is exactly the
// valuation the shopper saw, re-run: nothing the sender prices is anything
// the page would not have printed for the same URL.
//
// Two senders read the table, and the prefix is how they stay apart:
// scripts/send-alerts.mjs skips a `worth=1` row (it would otherwise read the
// make and model as a browse search and mail every new listing of the
// model), and scripts/send-worth.mjs takes only those rows. Pro decides at
// send time by address, the same way the standing order does.
//
// This file is the pure part: WorthInput ⇄ params, shared by the page
// (readInput), the control (components/TrackValue.tsx) and the sender.

import type { WorthInput } from "./listings/value";

export const WORTH_WATCH_PREFIX = "worth=1";

const VIN_RE = /^[A-HJ-NPR-Z0-9]{17}$/i;

/** The /worth query a valuation came from, or null when it is not one the
 *  page would value. Mileage over 300,000 is a typo or a car no model here
 *  has anything to say about; value.ts's own driven window does the rest. */
export function parseWorthInput(get: (k: string) => string | undefined): WorthInput | null {
  const year = Number(get("year"));
  const make = (get("make") ?? "").trim();
  const model = (get("model") ?? "").trim();
  const mileage = Number(String(get("miles") ?? "").replace(/[,\s]/g, ""));
  if (!Number.isInteger(year) || year < 1990 || year > 2100) return null;
  if (!make || !model) return null;
  if (!Number.isFinite(mileage) || mileage < 0 || mileage > 300_000) return null;
  const rawVin = (get("vin") ?? "").trim().toUpperCase();
  const trim = (get("trim") ?? "").trim();
  const rawCond = get("cond");
  const condition = rawCond === "good" || rawCond === "issues" || rawCond === "branded" ? rawCond : undefined;
  const rawDrive = get("drive");
  const drive = rawDrive === "RWD" || rawDrive === "AWD" || rawDrive === "FWD" ? rawDrive : undefined;
  return {
    year,
    make,
    model,
    mileage: Math.round(mileage),
    vin: VIN_RE.test(rawVin) ? rawVin : undefined,
    trim: trim || undefined,
    drive,
    condition,
  };
}

/** The subscription params for a watch on this car. Keys in a fixed order
 *  with blanks dropped, so the same car asked for twice is one row (0029's
 *  unique index is on the exact string). */
export function worthWatchParams(i: WorthInput): string {
  const p = new URLSearchParams();
  p.set("worth", "1");
  p.set("year", String(i.year));
  p.set("make", i.make);
  p.set("model", i.model);
  p.set("miles", String(i.mileage));
  if (i.vin) p.set("vin", i.vin);
  if (i.trim) p.set("trim", i.trim);
  if (i.drive) p.set("drive", i.drive);
  if (i.condition && i.condition !== "good") p.set("cond", i.condition);
  return p.toString();
}

export const isWorthWatch = (params: string | null | undefined): boolean =>
  typeof params === "string" && (params === WORTH_WATCH_PREFIX || params.startsWith(`${WORTH_WATCH_PREFIX}&`));

/** The car behind a watch row, or null for a row that is not one. */
export function readWorthWatch(params: string): WorthInput | null {
  if (!isWorthWatch(params)) return null;
  const p = new URLSearchParams(params);
  return parseWorthInput((k) => p.get(k) ?? undefined);
}

/** The /worth URL (path + query) a watch re-renders as — the link in the mail. */
export function worthWatchUrl(i: WorthInput): string {
  const p = new URLSearchParams(worthWatchParams(i));
  p.delete("worth");
  return `/worth?${p.toString()}`;
}

/** "2023 Tesla Model Y · 41,000 mi" — the row's label and the mail's subject. */
export const worthWatchLabel = (i: WorthInput): string =>
  `${i.year} ${i.make} ${i.model}`.replace(/\s+/g, " ").trim() + ` · ${i.mileage.toLocaleString("en-US")} mi`;
