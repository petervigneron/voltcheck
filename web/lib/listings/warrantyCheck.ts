import type { EnrichmentRow } from "../types";
import { ALL_ROWS } from "../enrichment/rows";
import { canonicalMake, matchIgnoringTrim } from "../enrichment/match";
import type { WarrantyAnswer, WarrantyModel, WarrantyTerm } from "./warrantyVerdict";
import type { ModelHub } from "./modelHubs";
import { factLinksFor } from "../facts/links";
import { FACT_SHEETS } from "../facts/registry";

export type { WarrantyAnswer, WarrantyBasis, WarrantyModel, WarrantyTerm } from "./warrantyVerdict";

// The /warranty tool: make, model and model year in, the high-voltage battery
// warranty out. It knows no trim and no VIN, so it answers for the whole
// cohort or not at all.
//
// The cohort is every row the matcher keeps when it spans a make/model/year
// with row trims ignored (matchIgnoringTrim, the same span an untrusted trim
// falls back to). A value prints only when every one of those rows carries it
// and they all agree. One trim with a 10-year term and another with 8 is two
// answers, and picking either is matching the wrong thing for the other.
//
// Two things make the span itself unsafe, and both go quiet rather than
// answer for part of a cohort:
//   * a row with no battery term at all. The rows that do have one would
//     then read as the whole cohort's answer when one version is unresearched;
//   * a `vinRequired` row (a nameplate a petrol car shares, keyed on the VIN).
//     The matcher drops those for a VIN-less decode, so what it returns is
//     the cohort minus the very versions that needed a VIN to tell apart.
//
// The in-force verdict is lib/listings/warranty.ts, never a second
// calculator. It runs on one synthetic row built from the agreed term, so it
// only exists when there is exactly one term.

const norm = (s?: string) => (s ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");

/** The matcher's model comparison (match.ts matchEnrichmentRaw), reduced to
 *  what a VIN-less, vPIC-less decode can reach: exact on the normalised name
 *  with a redundant make prefix stripped. Used only to find vinRequired rows,
 *  which the matcher itself has already filtered out of what it returns. */
function sameModel(make: string, a: string, b: string): boolean {
  const mk = canonicalMake(make, b);
  const key = (s: string) => {
    const n = norm(s);
    return n.startsWith(mk) && n.length > mk.length ? n.slice(mk.length) : n;
  };
  return key(a) === key(b) && /\+/.test(a) === /\+/.test(b);
}

function hasVinRequiredRow(make: string, model: string, year: number): boolean {
  const mk = canonicalMake(make, model);
  return ALL_ROWS.some(
    (r) =>
      r.vinRequired &&
      canonicalMake(r.make, r.model) === mk &&
      year >= r.modelYears[0] &&
      year <= r.modelYears[1] &&
      [r.model, ...(r.modelAliases ?? [])].some((m) => sameModel(make, m, model))
  );
}

function spannedRows(make: string, model: string, year: number): EnrichmentRow[] {
  const r = matchIgnoringTrim({ vin: "", usMarket: true, make, model, modelYear: year }, null);
  return r.candidates ?? (r.exact ? [r.exact] : []);
}

/** The rows a make/model/year could be, or none when that set is not the whole cohort. */
export function cohortRows(make: string, model: string, year: number): EnrichmentRow[] {
  if (hasVinRequiredRow(make, model, year)) return [];
  return spannedRows(make, model, year);
}

const trimsOf = (r: EnrichmentRow): string[] => (Array.isArray(r.trim) ? r.trim : r.trim ? [r.trim] : []);
const termKey = (r: EnrichmentRow) =>
  `${r.warranty?.batteryYears?.value ?? ""}/${r.warranty?.batteryMiles?.value ?? ""}`;
const isEst = (r: EnrichmentRow) =>
  [r.warranty?.batteryYears, r.warranty?.batteryMiles].some((f) => f && f.source !== "mfr");

/** One value when every row carries the same one; otherwise undefined. */
function agreed<T>(rows: EnrichmentRow[], get: (r: EnrichmentRow) => T | undefined): T | undefined {
  const vals = rows.map(get);
  if (vals.some((v) => v === undefined)) return undefined;
  return vals.every((v) => v === vals[0]) ? vals[0] : undefined;
}

/** The answer for a set of cohort rows. Null when there is nothing to say. */
export function warrantyAnswerFromRows(rows: EnrichmentRow[], pickedModel: string): WarrantyAnswer | null {
  if (rows.length === 0) return null;
  if (rows.some((r) => r.warranty?.batteryYears == null && r.warranty?.batteryMiles == null)) return null;

  const groups = new Map<string, EnrichmentRow[]>();
  for (const r of rows) groups.set(termKey(r), [...(groups.get(termKey(r)) ?? []), r]);

  // Trims name a term only when every row names its trims and no trim name
  // turns up under two terms. A trim-less row is "every trim", and rows split
  // by drivetrain, pack or VIN code under one trim name land in two groups
  // with the same name, so either case leaves the terms unattributed.
  let attributable = groups.size > 1 && rows.every((r) => trimsOf(r).length > 0);
  if (attributable) {
    const owner = new Map<string, string>();
    for (const [k, rs] of groups)
      for (const t of rs.flatMap(trimsOf)) {
        const n = norm(t);
        if (owner.has(n) && owner.get(n) !== k) attributable = false;
        owner.set(n, k);
      }
  }

  const terms: WarrantyTerm[] = [...groups.values()]
    .map((rs) => ({
      years: rs[0].warranty?.batteryYears?.value,
      miles: rs[0].warranty?.batteryMiles?.value,
      trims: attributable ? [...new Set(rs.flatMap(trimsOf))] : undefined,
      est: rs.some(isEst),
    }))
    .sort((a, b) => (a.years ?? 0) - (b.years ?? 0) || (a.miles ?? Infinity) - (b.miles ?? Infinity));

  // The least favourable floor the cohort documents: the earliest of the
  // rows' own dates, and none at all (the model-year generic) if any row
  // lacks one. Each row's floor is a lower bound for its own cars, so the
  // earliest is a lower bound for all of them.
  const dates = rows.map((r) => r.warranty?.earliestInService?.value);
  const earliestInService = dates.every((d) => d && /^\d{4}-\d{2}-\d{2}$/.test(d))
    ? (dates as string[]).sort()[0]
    : undefined;

  const one = terms.length === 1 ? terms[0] : undefined;
  return {
    terms,
    basis: one ? { years: one.years, miles: one.miles, earliestInService, est: one.est } : undefined,
    floorPct: agreed(rows, (r) => r.warranty?.sohFloorPct?.value),
    transfers: agreed(rows, (r) => r.warranty?.batteryTransfers?.value),
    models: [...new Set([pickedModel, ...rows.map((r) => r.model)])],
  };
}

export function warrantyAnswer(make: string, model: string, year: number): WarrantyAnswer | null {
  return warrantyAnswerFromRows(cohortRows(make, model, year), model);
}

export { warrantyStatus } from "./warrantyVerdict";

const FIRST_YEAR = Math.min(...ALL_ROWS.map((r) => r.modelYears[0]));
const LAST_YEAR = Math.max(...ALL_ROWS.map((r) => r.modelYears[1]));

/** A hub's battery-warranty fact sheet, when one exists. */
export function warrantySheet(h: Pick<ModelHub, "make" | "model">): { href: string; label: string } | undefined {
  const link = factLinksFor(h.make, h.model).find((l) => l.path.endsWith("/battery-warranty"));
  const sheet = link && FACT_SHEETS.find((s) => `/facts/${s.make}/${s.model}/${s.topic}` === link.path);
  return sheet ? { href: link!.path, label: sheet.breadcrumbLabel } : undefined;
}

/**
 * The picker's data: every hub with at least one model year the rows cover,
 * and that year's answer (null where the cohort goes quiet). A year no row
 * covers is not offered at all.
 */
export function warrantyModels(hubs: ModelHub[]): WarrantyModel[] {
  const out: WarrantyModel[] = [];
  for (const h of hubs) {
    const years: WarrantyModel["years"] = [];
    for (let y = FIRST_YEAR; y <= LAST_YEAR; y++) {
      if (!hasVinRequiredRow(h.make, h.model, y) && spannedRows(h.make, h.model, y).length === 0) continue;
      years.push({ year: y, answer: warrantyAnswer(h.make, h.model, y) });
    }
    if (years.length === 0) continue;
    out.push({
      makeSlug: h.makeSlug,
      make: h.make,
      modelSlug: h.modelSlug,
      model: h.model,
      sheet: warrantySheet(h),
      years,
    });
  }
  return out;
}
