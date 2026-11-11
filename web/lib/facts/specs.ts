// A model's spec page: every version of one nameplate, by model year, with
// its battery, range, charging, port, heat pump and battery warranty.
//
// WHY. Read on 2026-11-11: in ninety days Google showed the site 540 times,
// and every query that earned an impression was a question about a specific
// car's facts ("ariya charging", "ev9 heat pump", "optiq battery warranty").
// None was a "for sale" search. The 43 hand-audited sheets under /facts are
// the only pages that answer such questions, for about 19 models. The
// enrichment table already holds the same facts for 229 of the 246 model
// hubs; they were just only ever printed one car at a time, on a listing.
// This prints them by model.
//
// NOTHING IS RESEARCHED OR COMPUTED HERE. Every cell is a Fact from
// lib/enrichment, the same value with the same source a listing page for
// that car already shows. So the page inherits that table's accuracy and
// its rules:
//   * a missing fact is a blank cell, and a column nobody fills is not drawn;
//   * a figure from a source other than the maker's is marked est., and a
//     yes-or-no fact (port, heat pump) never is (FactRow.tsx says why);
//   * a Fact's `note` is working, not copy, and is not read here at all
//     (lib/enrichment/noteRule.ts).
//
// Matching is the hubs' own contract: exact on make and modelKey, through
// the row's model or one of its aliases. A feed-label row is not a version
// (types.ts feedLabelRow) and is left out.
import type { EnrichmentRow, Fact, HeatPump } from "@/lib/types";
import { ALL_ROWS } from "@/lib/enrichment/rows";
import { MODEL_HUBS, hubPath, type ModelHub } from "@/lib/listings/modelHubs";
import { modelKey } from "@/lib/listings/modelName";

export interface SpecCell {
  text: string;
  /** A non-maker figure. Never set on a yes-or-no fact. */
  est: boolean;
  sourceUrl?: string;
  asOf: string;
}

export const SPEC_COLUMNS = ["battery", "range", "dc", "time", "port", "heatPump", "warranty"] as const;
export type SpecColumn = (typeof SPEC_COLUMNS)[number];

export const SPEC_HEADS: Record<SpecColumn, string> = {
  battery: "Battery",
  // "Electric", because on a plug-in hybrid "EPA range 22 mi" reads as the whole car's.
  range: "EPA electric range",
  dc: "DC fast charging",
  time: "10–80%",
  port: "Port",
  heatPump: "Heat pump",
  warranty: "Battery warranty",
};

/** How a column is named in running text (titles, descriptions). */
export const SPEC_WORDS: Record<SpecColumn, string> = {
  battery: "battery size",
  range: "range",
  dc: "charging speed",
  time: "10–80% charge time",
  port: "charge port",
  heatPump: "heat pump",
  warranty: "battery warranty",
};

export interface SpecLine {
  from: number;
  to: number;
  /** Trim, drivetrain and pack as the row keys them; empty when the row is every version. */
  version: string;
  cells: Partial<Record<SpecColumn, SpecCell>>;
}

const nf = new Intl.NumberFormat("en-US");
const HEAT_PUMP: Record<HeatPump, string> = { standard: "Standard", optional: "Optional", awd_only: "AWD only", none: "None" };

const estimated = (f: Fact<unknown>) => f.source === "est" || f.source === "agg" || f.source === "unknown";

function cell(f: Fact<unknown> | undefined, text: (v: never) => string, yesNo = false): SpecCell | undefined {
  if (!f || f.value === undefined || f.value === null) return undefined;
  return { text: text(f.value as never), est: !yesNo && estimated(f), sourceUrl: f.sourceUrl, asOf: f.asOf };
}

/**
 * How the line names its version. A trim array is one grade under the names
 * a maker or the feeds have given it, so the first stands for all; and a
 * drivetrain or pack the trim already says ("Long Range RWD" + RWD + Long
 * Range) is not said again.
 */
export function versionOf(r: Pick<EnrichmentRow, "trim" | "drive" | "packVariant">): string {
  const trim = Array.isArray(r.trim) ? r.trim[0] : r.trim;
  const parts: string[] = [];
  for (const s of [trim, r.drive, r.packVariant]) {
    const t = s?.trim();
    if (!t) continue;
    if (parts.some((p) => p.toLowerCase().includes(t.toLowerCase()))) continue;
    parts.push(t);
  }
  return parts.join(" · ");
}

function lineOf(r: EnrichmentRow): SpecLine {
  const cells: SpecLine["cells"] = {};
  // Usable is the figure a shopper compares; gross only where no usable one exists, and it says so.
  cells.battery =
    cell(r.battery?.packUsableKwh, (v: number) => `${v} kWh`) ?? cell(r.battery?.packGrossKwh, (v: number) => `${v} kWh gross`);
  cells.range = cell(r.range?.epaRangeMi, (v: number) => `${nf.format(v)} mi`);
  cells.dc =
    cell(r.charging?.dcPeakKw, (v: number) => `${v} kW`) ??
    (r.charging?.dcFastCharging?.value === "none" || r.charging?.dcFastCharging?.value === "not_fitted"
      ? cell(r.charging.dcFastCharging, () => "None", true)
      : undefined);
  cells.time = cell(r.charging?.chargeTime1080Min, (v: number) => `${v} min`);
  cells.port = cell(r.charging?.portStandard, (v: string) => v, true);
  cells.heatPump = cell(r.thermal?.heatPump, (v: HeatPump) => HEAT_PUMP[v] ?? String(v), true);
  const yrs = r.warranty?.batteryYears;
  const mi = r.warranty?.batteryMiles;
  if (yrs && mi) cells.warranty = cell(yrs, (v: number) => `${v} yr / ${nf.format(mi.value)} mi`);
  for (const k of SPEC_COLUMNS) if (!cells[k]) delete cells[k];
  return { from: r.modelYears[0], to: r.modelYears[1], version: versionOf(r), cells };
}

const cellKey = (c: SpecCell | undefined) => (c ? `${c.text}|${c.est}` : "");
const lineKey = (l: SpecLine) => `${l.version}#${SPEC_COLUMNS.map((k) => cellKey(l.cells[k])).join("#")}`;

/**
 * A hub's lines, newest first. Two rows that say exactly the same thing
 * about the same version in adjoining or overlapping years are one line
 * with the years joined: the table is by what differs, and a maker who
 * changed nothing for three years gets one row, not three.
 */
export function specLines(hub: ModelHub, rows: EnrichmentRow[] = ALL_ROWS): SpecLine[] {
  const make = hub.make.toLowerCase();
  const mine = rows.filter(
    (r) =>
      !r.feedLabelRow &&
      r.make.toLowerCase() === make &&
      [r.model, ...(r.modelAliases ?? [])].some((m) => hub.keys.includes(modelKey(m))),
  );
  const lines = mine
    .map(lineOf)
    .filter((l) => Object.keys(l.cells).length > 0)
    .sort((a, b) => a.from - b.from || a.to - b.to);
  const merged: SpecLine[] = [];
  for (const l of lines) {
    const k = lineKey(l);
    const prev = merged.find((m) => lineKey(m) === k && l.from <= m.to + 1);
    if (prev) prev.to = Math.max(prev.to, l.to);
    else merged.push({ ...l, cells: { ...l.cells } });
  }
  return merged.sort((a, b) => b.to - a.to || b.from - a.from || a.version.localeCompare(b.version));
}

/** Columns at least one line fills, in display order. */
export function specColumns(lines: SpecLine[]): SpecColumn[] {
  return SPEC_COLUMNS.filter((k) => lines.some((l) => l.cells[k]));
}

/** A page needs more than one kind of fact to be worth a URL. */
export const SPEC_MIN_COLUMNS = 2;

export const specPath = (h: ModelHub): string => `${hubPath(h)}/specs`;

/** The hubs that get a spec page. Computed once; the data is code. */
export const SPEC_HUBS: ModelHub[] = MODEL_HUBS.filter((h) => specColumns(specLines(h)).length >= SPEC_MIN_COLUMNS);

const SPEC_PATHS = new Set(SPEC_HUBS.map(specPath));
export const hasSpecs = (h: ModelHub): boolean => SPEC_PATHS.has(specPath(h));

export const yearSpan = (lines: SpecLine[]): [number, number] => [
  Math.min(...lines.map((l) => l.from)),
  Math.max(...lines.map((l) => l.to)),
];
