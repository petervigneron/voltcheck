import type { EnrichmentResult, VinDecode, TeslaVinFacts } from "../types";
import { ENRICHMENT_ROWS } from "./data";
import { RESEARCH_ROWS } from "./data2";
import { RESEARCH_ROWS_3 } from "./data3";
import { RESEARCH_ROWS_4 } from "./data4";
import { RESEARCH_ROWS_5 } from "./data5";
import { applyBackfill } from "./backfill";

const ALL_ROWS = [...ENRICHMENT_ROWS, ...RESEARCH_ROWS, ...RESEARCH_ROWS_3, ...RESEARCH_ROWS_4, ...RESEARCH_ROWS_5];

const norm = (s?: string) => (s ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");

// "+" names a distinct car on several nameplates — Mercedes' EQE320+ (RWD,
// bigger pack) is a different vehicle from the EQE320 4MATIC, the Nissan Leaf
// 2026 S+ a different pack than the S — but norm() strips it like any other
// symbol, so two trims differing ONLY by a trailing "+" collapse to the same
// string ("250" and "250+" both norm to "250"; so do "EQE320" and "EQE320+").
// A gas CLA 250 and an electric CLA 250+ are exactly this shape. Every trim
// comparison below checks "+" presence FIRST and refuses the match outright
// when it differs on just one side — this used to fall through to a plain
// `a === b`, which is precisely the case that must be rejected: once "+" is
// stripped, "250" and "250+" ARE equal, so that fallback matched the exact
// pair it was written to keep apart. (It only avoided false substring credit,
// e.g. "EQE320" swallowing "EQE3204MATIC" — a real problem, but the fix must
// not also manufacture a false plain-equality match.)
function trimPlusMismatch(rt: string, decodedTrim: string): boolean {
  return /\+/.test(rt) !== /\+/.test(decodedTrim);
}

// Exact identity: used where a listing's trim must name one specific row,
// not just overlap with it (an unambiguous listing-side signal).
function trimStringsExact(rt: string, decodedTrim: string): boolean {
  if (trimPlusMismatch(rt, decodedTrim)) return false;
  return norm(rt) === norm(decodedTrim);
}

// Overlap: substring-tolerant, for rows/listings that restate the trim with
// extra words on either side ("EQE 500 4MATIC" vs "500 4MATIC").
function trimStringsOverlap(rt: string, decodedTrim: string): boolean {
  if (trimPlusMismatch(rt, decodedTrim)) return false;
  const a = norm(rt);
  const b = norm(decodedTrim);
  // Short trims ("S") must match exactly — substring logic would let Leaf "S"
  // swallow "SV" and "Pro S".
  if (a.length < 3 || b.length < 3) return a === b;
  return a.includes(b) || b.includes(a);
}

// Exported for direct unit testing (web/tests/match.test.ts) — the "+"
// significance and no-trim behavior are worth pinning down independent of
// whatever happens to be in the enrichment corpus on a given day.
export function trimMatches(rowTrim: string | string[] | undefined, decodedTrim: string | undefined): boolean {
  if (!rowTrim) return true; // row applies to all trims
  // A trim-specific row needs the listing to actually say which trim it is.
  // An absent listing trim used to pass this unconditionally ("keep row as a
  // candidate"), which is how a no-trim listing could pick up ANY row for its
  // make/model/year — including a row for a completely different car (a
  // mild-hybrid CLA with no trim string picking up an electric CLA's battery
  // and charging facts). Silence is the honest failure here, not a guess.
  if (!decodedTrim) return false;
  return (Array.isArray(rowTrim) ? rowTrim : [rowTrim]).some((rt) => trimStringsOverlap(rt, decodedTrim));
}

// A dealer feed can carry the SAME vehicle under two different `make`
// strings. Confirmed live 2026-08-21: BrightDrop's Zevo van arrives as make
// "BrightDrop"/"Brightdrop" (its own brand) AND as make "Chevrolet" (its GM
// commercial parent), for the identical physical van — match.ts's exact
// `norm(make) === norm(make)` equality had no way to see those as one make,
// so a Chevrolet-labeled Zevo could never match a BrightDrop-keyed row no
// matter how good the research was. Keyed by MODEL, not by make alone:
// folding "Chevrolet" wholesale would wrongly swallow every real Chevrolet EV
// (Bolt, Equinox EV, Blazer EV, Silverado EV). Checked 2026-08-21 against the
// live corpus for the same shape elsewhere — Polestar/Volvo and Genesis/
// Hyundai both arrive under one consistent make string (casing aside, which
// norm() already folds) — so this table stays a single curated entry, not a
// general cross-brand fold. This is production matching, not the separate
// report-only fold in scripts/live-enrichment-gap.mjs's
// REPORT_MODEL_MAKE_FOLD (which only relabels a chart bucket after every
// match verdict is already decided); add another row here only when a
// specific vehicle is confirmed to arrive under two make strings.
const MAKE_ALIASES: { modelRe: RegExp; canonicalMake: string }[] = [{ modelRe: /^zevo\b/i, canonicalMake: "BRIGHTDROP" }];
export const canonicalMake = (make: string | undefined, model: string | undefined): string => {
  const alias = MAKE_ALIASES.find((a) => a.modelRe.test(model ?? ""));
  return alias ? norm(alias.canonicalMake) : norm(make);
};

function normalizeDrive(d: string | undefined): "AWD" | "RWD" | "FWD" | undefined {
  if (!d) return undefined;
  const u = d.toUpperCase();
  if (/(AWD|4WD|4X4)/.test(u)) return "AWD";
  if (/(RWD|REAR)/.test(u)) return "RWD";
  if (/(FWD|FRONT)/.test(u)) return "FWD";
  return undefined;
}

// Public entry: resolve the row(s), then fill the centralized backfill facts
// (tested range, electric-drive warranty, recall notes) onto whatever we
// return. applyBackfill only fills gaps, so hand-curated values always win.
export function matchEnrichment(
  decode: VinDecode,
  tesla: TeslaVinFacts | null
): EnrichmentResult {
  const r = matchEnrichmentRaw(decode, tesla);
  if (r.exact) return { ...r, exact: applyBackfill(r.exact) };
  if (r.candidates) return { ...r, candidates: r.candidates.map((c) => applyBackfill(c)!) };
  return r;
}

function matchEnrichmentRaw(
  decode: VinDecode,
  tesla: TeslaVinFacts | null
): EnrichmentResult {
  const { make, model, modelYear } = decode;
  if (!make || !model || !modelYear) return {};

  // Some feeds restate the make inside the model ("Polestar 2" vs "2") —
  // compare models with any redundant make prefix stripped from both sides.
  const mk = canonicalMake(make, model);
  const modelKey = (s: string) => {
    const n = norm(s);
    return n.startsWith(mk) && n.length > mk.length ? n.slice(mk.length) : n;
  };
  let rows = ALL_ROWS.filter(
    (r) =>
      canonicalMake(r.make, r.model) === mk &&
      [r.model, ...(r.modelAliases ?? [])].some((m) => modelKey(m) === modelKey(model)) &&
      modelYear >= r.modelYears[0] &&
      modelYear <= r.modelYears[1] &&
      trimMatches(r.trim, decode.trim)
  );

  // VIN positions 1–3 name the body where showroom strings can't: dealers
  // file Mercedes' sedan and SUV under the same model and trim ("EQE",
  // "500 4MATIC"), and only the WMI separates W1K (Bremen sedan) from 4JG
  // (Tuscaloosa SUV) — different EPA ranges, different prices. Hard, like
  // vin8 below: a row keyed to WMIs must never match a VIN outside them.
  const wmi = decode.vin?.slice(0, 3).toUpperCase();
  if (wmi) {
    rows = rows.filter((r) => !r.wmi || r.wmi.includes(wmi));
  }

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
    const dt = decode.trim;
    const exactTrim = rows.filter((r) =>
      (Array.isArray(r.trim) ? r.trim : r.trim ? [r.trim] : []).some((rt) => trimStringsExact(rt, dt))
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
    const dt = decode.trim;
    const trimSpecific = rows.filter((r) => {
      if (!r.trim) return false;
      return (Array.isArray(r.trim) ? r.trim : [r.trim]).some((rt) => trimStringsOverlap(rt, dt));
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
