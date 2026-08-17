import type { Listing } from "./types";

/**
 * Model-year trim renames: when a maker keeps a car but renames its trims from
 * one model year to the next, a dealer feed built off last year's catalog can
 * carry the RETIRED name on a current car. We show the maker's own current name
 * for that year, not the feed's stale one — but only for the years the rename
 * applies to, because the old name is still the correct one for the older car.
 *
 * Cadillac renamed the Escalade IQ / IQL trims for 2026 (primary-verified
 * against cadillac.com's own configurator, see
 * docs/accuracy-study/verification-escalade-trim-rename.md):
 *   2025: Luxury 1, Luxury 2, Sport 1, Sport 2            (numbered)
 *   2026: Luxury, Premium Luxury, Sport, Premium Sport    (named)
 *   map:  Luxury 1 → Luxury, Luxury 2 → Premium Luxury,
 *         Sport 1 → Sport,   Sport 2 → Premium Sport
 * The accuracy study caught a 2026 IQL (VIN 1GYLEMKL0TU108512) whose feed still
 * read "Sport 2"; we printed the retired name beside a 2026 car. The sibling
 * 2026 IQ that arrived already named "Premium Sport" was right — so this is a
 * stale-feed-name gap, not a missing car, and the fix is a targeted rewrite
 * rather than anything that touches how the car is matched or priced.
 *
 * The table is deliberately narrow. Only the numbered legacy tokens rewrite,
 * and only from the first model year of the new naming onward: a 2025 car keeps
 * its numbered name (correct for that year), and a 2026 car that already
 * carries "Sport" / "Premium Sport" passes through untouched. Each pattern
 * requires the digit and anchors at the string start, so it rewrites the
 * leading trim token in place and preserves any trailing feed cruft the rest of
 * the trim pipeline is responsible for ("Sport 2 AWD" → "Premium Sport AWD",
 * which cleanTrim then strips down as before).
 */

type Rename = [from: RegExp, to: string];

const ESCALADE_2026: Rename[] = [
  [/^luxury\s*1\b/i, "Luxury"],
  [/^luxury\s*2\b/i, "Premium Luxury"],
  [/^sport\s*1\b/i, "Sport"],
  [/^sport\s*2\b/i, "Premium Sport"],
];

const TRIM_RENAMES: Array<{ make: string; models: string[]; firstYear: number; renames: Rename[] }> = [
  { make: "CADILLAC", models: ["Escalade IQ", "Escalade IQL"], firstYear: 2026, renames: ESCALADE_2026 },
];

/**
 * The feed's trim as the maker names it for this car's model year. Returns
 * `l.trim` unchanged (including undefined) when no rename applies, so callers
 * can read it in place of `l.trim` without changing empty/undefined semantics.
 */
export function renamedTrim(l: Pick<Listing, "make" | "model" | "year" | "trim">): string | undefined {
  const raw = l.trim;
  if (!raw) return raw;
  const make = l.make.trim().toUpperCase();
  const model = l.model.trim().toLowerCase();
  const spec = TRIM_RENAMES.find((r) => r.make === make && r.models.some((m) => m.toLowerCase() === model));
  if (!spec || l.year < spec.firstYear) return raw;
  const trimmed = raw.trim();
  for (const [from, to] of spec.renames) {
    if (from.test(trimmed)) return trimmed.replace(from, to);
  }
  return raw;
}
