import { INCENTIVE_PROGRAMS, type Program } from "./registry";

// Which programs a shopper's ZIP can actually use.
//
// The matcher (match.ts) names every program whose CAR-side conditions a
// listing meets, keyed on the dealer's state — so a used car in California
// meets a dozen utility programs at once, one per utility, and the page
// listed them all. The shopper is a customer of exactly one. Given their
// ZIP, this keeps the programs whose territory holds it and drops the rest,
// so the page can answer with the one or two that are theirs (owner,
// 2026-09-03: a ZIP, not a picker).
//
// Territory comes from data/utility-zips.json, built by
// scripts/build-utility-zips.mjs from the EIA-861 utility ZIP tables and the
// Census ZCTA-county file. Both are approximate at the edges (a ZIP on a
// service boundary lists both utilities; PG&E's own report omitted San
// Francisco and the build adds the city's entry), which is the safe
// direction: a program shown to a neighbour across the line is one line
// they will confirm and discard, a program hidden from its own customer is
// money they never hear about. A utility program with no territory data
// stays for every ZIP in its state — it cannot narrow, so it does not
// pretend to.
//
// A ZIP outside the program's state keeps nothing of that state's: every
// live program requires residency in its state.

interface Table {
  zipState: Record<string, string>;
  prefixState: Record<string, string>;
  programs: Record<string, string[]>;
}

export interface ZipPrograms {
  /** The ZIP's state. */
  state: string;
  /** Ids of the live programs a resident of this ZIP can use. */
  keep: string[];
}

/** Pure, for tests: the same answer from a table already in hand. */
export function keepForZip(zip: string, table: Table, programs: Program[] = INCENTIVE_PROGRAMS): ZipPrograms | null {
  const z = zip.trim();
  if (!/^\d{5}$/.test(z)) return null;
  const state = table.zipState[z] ?? table.prefixState[z.slice(0, 3)];
  if (!state) return null;
  const keep = programs
    .filter((p) => {
      if (p.status !== "live" || p.jurisdiction.state !== state) return false;
      if (p.jurisdiction.kind !== "utility") return true;
      const zips = table.programs[p.id];
      return !zips || zips.includes(z);
    })
    .map((p) => p.id);
  return { state, keep };
}

// The 550 KB table loads once per server instance and never reaches a
// browser; the route below is the only reader. Same shape as lib/zips.ts.
let tablePromise: Promise<Table> | undefined;
const loadTable = () =>
  (tablePromise ??= import("@/data/utility-zips.json").then((m) => m.default as unknown as Table));

export async function programsForZip(zip: string): Promise<ZipPrograms | null> {
  if (!/^\d{5}$/.test(zip.trim())) return null;
  return keepForZip(zip, await loadTable());
}
