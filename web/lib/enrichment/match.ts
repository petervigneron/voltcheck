import type { EnrichmentResult, VinDecode, TeslaVinFacts } from "../types";
import { ENRICHMENT_ROWS } from "./data";
import { RESEARCH_ROWS } from "./data2";
import { RESEARCH_ROWS_3 } from "./data3";
import { RESEARCH_ROWS_4 } from "./data4";

const ALL_ROWS = [...ENRICHMENT_ROWS, ...RESEARCH_ROWS, ...RESEARCH_ROWS_3, ...RESEARCH_ROWS_4];

const norm = (s?: string) => (s ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");

function trimMatches(rowTrim: string | string[] | undefined, decodedTrim: string | undefined): boolean {
  if (!rowTrim) return true; // row applies to all trims
  if (!decodedTrim) return true; // unknown trim: keep row as a candidate
  const b = norm(decodedTrim);
  return (Array.isArray(rowTrim) ? rowTrim : [rowTrim]).some((rt) => {
    const a = norm(rt);
    // Short trims ("S") must match exactly — substring logic would let Leaf "S"
    // swallow "SV" and "Pro S".
    if (a.length < 3 || b.length < 3) return a === b;
    return a.includes(b) || b.includes(a);
  });
}

function normalizeDrive(d: string | undefined): "AWD" | "RWD" | "FWD" | undefined {
  if (!d) return undefined;
  const u = d.toUpperCase();
  if (/(AWD|4WD|4X4)/.test(u)) return "AWD";
  if (/(RWD|REAR)/.test(u)) return "RWD";
  if (/(FWD|FRONT)/.test(u)) return "FWD";
  return undefined;
}

export function matchEnrichment(
  decode: VinDecode,
  tesla: TeslaVinFacts | null
): EnrichmentResult {
  const { make, model, modelYear } = decode;
  if (!make || !model || !modelYear) return {};

  let rows = ALL_ROWS.filter(
    (r) =>
      norm(r.make) === norm(make) &&
      norm(r.model) === norm(model) &&
      modelYear >= r.modelYears[0] &&
      modelYear <= r.modelYears[1] &&
      trimMatches(r.trim, decode.trim)
  );

  // VIN position 8 is the maker's own motor/battery code — the one field a
  // dealer feed can't blur. Must run before the kWh-hint filter: vPIC's
  // battery figure is a model-level constant on some trucks (every 2023
  // Lightning reads "98"), and the hint would otherwise veto the correct
  // Extended Range row. A hard filter, unlike the soft hints below: a row
  // keyed to specific codes must never match a car with a different code —
  // matching nothing is honest, matching the wrong pack is not.
  const vin8 = decode.vin?.[7]?.toUpperCase();
  if (vin8) {
    rows = rows.filter((r) => !r.vin8 || r.vin8.includes(vin8));
  }

  // An exact trim-name match is the strongest listing-side signal there is —
  // it must win before the soft hints below get a chance to veto it (a junk
  // kWh hint once resolved an explicit "Light Long Range" to the Light row).
  if (decode.trim && rows.length > 1) {
    const b = norm(decode.trim);
    const exactTrim = rows.filter((r) =>
      (Array.isArray(r.trim) ? r.trim : r.trim ? [r.trim] : []).some((rt) => norm(rt) === b)
    );
    if (exactTrim.length === 1) return { exact: exactTrim[0] };
  }

  // Drivetrain resolves pack/rating on many models (Ariya, Lyriq, Blazer…)
  const listingDrive = normalizeDrive(decode.driveType);
  if (listingDrive) {
    const driveRows = rows.filter((r) => !r.drive || r.drive === listingDrive);
    if (driveRows.length > 0) rows = driveRows;
  }

  // The VIN's battery-size decode discriminates pack variants (Ariya 63 vs
  // 87, ID.4 Standard vs Pro): keep rows whose pack is within 20% of the hint.
  if (decode.batteryKwhHint && !rows.some((r) => r.ignoreKwhHint)) {
    const hint = decode.batteryKwhHint;
    const kwhRows = rows.filter((r) => {
      const k = r.battery?.packUsableKwh?.value ?? r.battery?.packGrossKwh?.value;
      return k === undefined || Math.abs(k - hint) / hint <= 0.2;
    });
    if (kwhRows.length > 0) rows = kwhRows;
  }

  if (rows.length === 0) return {};
  if (rows.length === 1) return { exact: rows[0] };

  // A row keyed to this listing's trim beats trim-agnostic rows: a
  // "WT - Standard Range" listing resolves to the Standard Range row rather
  // than presenting candidates.
  if (decode.trim) {
    const b = norm(decode.trim);
    const trimSpecific = rows.filter((r) => {
      if (!r.trim) return false;
      return (Array.isArray(r.trim) ? r.trim : [r.trim]).some((rt) => {
        const a = norm(rt);
        return a.includes(b) || b.includes(a);
      });
    });
    if (trimSpecific.length === 1) return { exact: trimSpecific[0] };
    if (trimSpecific.length > 1) rows = trimSpecific;
  }

  // Plant discriminates Tesla pack variants — from VIN position 11, no lookup.
  if (tesla?.plant) {
    const byPlant = rows.filter((r) => !r.plant || r.plant === tesla.plant!.code);
    if (byPlant.length === 1) return { exact: byPlant[0] };
    if (byPlant.length > 0) rows = byPlant;
  }

  // Still ambiguous: say so, and say what question resolves it. That honesty
  // is the product, not a failure state.
  const discriminator = rows.some((r) => r.plant)
    ? "Two different Model Ys match this listing — 279 mi (~68 kWh) vs 330 mi (~77 kWh) — and listings often blur the trim names. A Fremont-built VIN (11th character F) can only be the 330-mile car; Austin (A) built both, so for an Austin VIN ask for the window sticker or the door-jamb EPA label, which names the exact trim."
    : rows.some((r) => r.trim)
      ? "Exact trim determines which row applies — the VIN does not reliably encode it. Check the window sticker."
      : rows.some((r) => r.drive)
        ? "The listing doesn't state the drivetrain; AWD and RWD versions carry different EPA ranges."
        : undefined;

  return { candidates: rows, discriminator };
}
