// One page per calendar month at /market/<yyyy-mm>, cut from the two series
// /market already prints.
//
// WHY. /market moves every day, so nothing on it can be quoted and still be
// true next week. A month that has ended does not move: "used EV sale prices
// in Washington, October 2026" is one figure with one count behind it, and a
// page that holds only that is something a post or a story can point at.
// The site's measured constraint (2026-11-17) is that nothing links to it.
//
// NOTHING NEW IS MEASURED HERE. The sold figure is the month's own row of
// market.sold, with every guard migration 0116 put on it. The asking figure
// is the site index (0061) read at two month-ends. This file only decides
// which months are whole enough to print.
//
// A month is printed only once it is over, and an asking figure only when
// both ends of it are real month-ends: the last reading in the month and the
// last reading in the month before must each fall in that month's final
// days (EDGE_DAYS). The index begins mid-August 2026, so August has no
// month-before reading and gets no asking figure; a figure from the 15th
// would be a half-month under a heading that names the month.
//
// KNOWN LIMIT. market.sold is the last SOLD_MONTHS (20) of the series, so a
// sold-only month's page stops resolving once it is older than that. Every
// month from September 2026 on keeps its asking figure for as long as the
// index keeps its history, which is the part that matters for a page meant
// to be linked; widening the sold window is a change to lib/market.ts.
import type { Market } from "./market";

/** A month-end reading must be this close to the month's last day. */
export const EDGE_DAYS = 3;

export interface MonthReport {
  /** yyyy-mm */
  month: string;
  sold?: { change: number; sales: number };
  asking?: { change: number; from: string; to: string; cars: number };
}

const daysIn = (ym: string) => new Date(Date.UTC(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)), 0)).getUTCDate();

export function prevMonth(ym: string): string {
  const d = new Date(Date.UTC(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)) - 2, 1));
  return d.toISOString().slice(0, 7);
}

export function nextMonth(ym: string): string {
  const d = new Date(Date.UTC(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)), 1));
  return d.toISOString().slice(0, 7);
}

/** Every finished month with at least one figure, newest first. */
export function monthReports(market: Pick<Market, "asOf" | "sold" | "site">): MonthReport[] {
  const current = market.asOf.slice(0, 7);
  // The last reading in each month, kept only if it is a true month-end.
  const ends = new Map<string, Market["site"][number]>();
  for (const p of market.site) {
    const ym = p.day.slice(0, 7);
    const held = ends.get(ym);
    if (!held || p.day > held.day) ends.set(ym, p);
  }
  for (const [ym, p] of ends) {
    if (Number(p.day.slice(8, 10)) < daysIn(ym) - EDGE_DAYS + 1) ends.delete(ym);
  }

  const out = new Map<string, MonthReport>();
  const at = (ym: string) => out.get(ym) ?? out.set(ym, { month: ym }).get(ym)!;
  for (const m of market.sold) {
    const ym = m.month.slice(0, 7);
    if (ym < current) at(ym).sold = { change: m.change, sales: m.sales };
  }
  for (const [ym, to] of ends) {
    const from = ends.get(prevMonth(ym));
    if (ym >= current || !from || !(from.idx > 0)) continue;
    at(ym).asking = {
      change: Math.round((to.idx / from.idx - 1) * 1000) / 10,
      from: from.day,
      to: to.day,
      cars: to.cars,
    };
  }
  return [...out.values()].sort((a, b) => b.month.localeCompare(a.month));
}
