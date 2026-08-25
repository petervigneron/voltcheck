import type { EnrichmentResult, VinDecode, TeslaVinFacts } from "../types";
import { ENRICHMENT_ROWS } from "./data";
import { RESEARCH_ROWS } from "./data2";
import { RESEARCH_ROWS_3 } from "./data3";
import { RESEARCH_ROWS_4 } from "./data4";
import { RESEARCH_ROWS_5 } from "./data5";
import { RESEARCH_ROWS_6 } from "./data6";
import { RESEARCH_ROWS_9 } from "./data9";
import { RESEARCH_ROWS_10 } from "./data10";
import { applyBackfill } from "./backfill";

const ALL_ROWS = [...ENRICHMENT_ROWS, ...RESEARCH_ROWS, ...RESEARCH_ROWS_3, ...RESEARCH_ROWS_4, ...RESEARCH_ROWS_5, ...RESEARCH_ROWS_6, ...RESEARCH_ROWS_9, ...RESEARCH_ROWS_10];

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
const rowTrims = (r: { trim?: string | string[] }): string[] =>
  Array.isArray(r.trim) ? r.trim : r.trim ? [r.trim] : [];

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

// Cohorts where vPIC's Trim field is a single-pattern filing artifact: the
// maker filed ONE Part 565 pattern covering every grade, so vPIC answers the
// same trim string for the whole cohort and the string identifies nothing.
// Verified against live VINs whose selling dealers name the real grade:
//
//   2026 RAV4 PHEV — every VIN decodes Trim "GR Sport", Series "64 Series"
//     (JTM7ERAV4TJ020569 sold as SE, JTM7ERAV4TD011420 as Woodland,
//     JTM7ERAV6TJ021402 as XSE; checked 2026-08-24). The 2021–25 Prime
//     ("50 Series") files real per-grade patterns — SE decodes SE — so the
//     entry is year-scoped to the new generation.
//   2026 Lexus NX 450h+ — the JTJHKCFZ pattern decodes "450h+ Luxury" on
//     cars sold as Premium (JTJHKCFZ1T2104331) and Premium Plus
//     (JTJHKCFZ1T2098854), grades 2026 added; 2022–25 had only Luxury and
//     F Sport Handling, each its own pattern, so those years stay honoured.
//     The F Sport pattern (JTJKKCFZ) still names its grade truly in 2026 and
//     is deliberately NOT listed. (2026 RX 450h+ decodes bare "450h+" —
//     grade-silent but true — and the 2026 Prius decodes no trim at all;
//     neither needs an entry.)
//
// Keying on the artifact STRING, not the whole cohort, is what lets this fail
// open in the right direction: if NHTSA's data is ever corrected and an XSE
// VIN starts decoding "XSE", that decode never hits the table and is honoured.
// An entry's series is the filing generation the artifact was verified on; a
// decode with no series still matches (losing the field must not resurrect
// the false exact), a different series does not.
const VPIC_PATTERN_TRIM_ARTIFACTS: {
  make: string;
  models: string[]; // vPIC's own model strings, not a feed's
  years: [number, number];
  series: string;
  trims: string[];
}[] = [
  { make: "TOYOTA", models: ["RAV4 Prime (PHEV)"], years: [2026, 2026], series: "64 Series", trims: ["GR Sport"] },
  { make: "LEXUS", models: ["NX"], years: [2026, 2026], series: "26 Series", trims: ["450h+ Luxury"] },
];

// Only ever true for a decode built by lib/vpic.ts (trimFromVpic is pure
// provenance) — a dealer feed writing "GR Sport" is a claim about a specific
// car and keeps its full weight. Exported for app/vin/[vin]/page.tsx, which
// must also not PRINT an artifact trim as the car's own.
export function vpicTrimIsPatternArtifact(decode: VinDecode): boolean {
  if (!decode.trimFromVpic || !decode.trim || !decode.modelYear) return false;
  const trim = decode.trim;
  const year = decode.modelYear;
  return VPIC_PATTERN_TRIM_ARTIFACTS.some(
    (a) =>
      norm(a.make) === norm(decode.make) &&
      a.models.some((m) => norm(m) === norm(decode.model)) &&
      year >= a.years[0] &&
      year <= a.years[1] &&
      a.trims.some((t) => norm(t) === norm(trim)) &&
      (!decode.series || norm(a.series) === norm(decode.series))
  );
}

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
  // An artifact trim (see VPIC_PATTERN_TRIM_ARTIFACTS) carries zero
  // information, so it must neither pick a row nor — the untrusted-trim
  // lesson — be bare-withheld, which would land on whichever row lacks a trim
  // key. Span the cohort's rows with row trims ignored instead: the result
  // collapses to one row only when VIN evidence or the drivetrain actually
  // collapses it (the 2026 NX 450h+, one row), and otherwise presents the
  // grade rows as candidates under the existing "exact trim determines which
  // row applies" discriminator (the 2026 RAV4 PHEV, four grades). Note this
  // path may only bypass a bare-nameplate row's trim guard because the
  // artifact string itself names the plug-in powertrain — only 450h+ VIN
  // patterns decode "450h+ Luxury", so a petrol NX never reaches the table.
  const r = vpicTrimIsPatternArtifact(decode)
    ? matchIgnoringTrim(decode, tesla)
    : decode.trimUntrusted
      ? matchWithoutTrustedTrim(decode, tesla)
      : matchEnrichmentRaw(decode, tesla);
  if (r.exact) return { ...r, exact: applyBackfill(r.exact) };
  if (r.candidates) return { ...r, candidates: r.candidates.map((c) => applyBackfill(c)!) };
  return r;
}

/**
 * The listing's trim is contradicted by its own description and the VIN can't
 * defend it (lib/listings/trimTrust.ts). The trim is still in `decode.trim`,
 * because the only useful question is whether it CHANGED the answer, and that
 * takes both matches:
 *
 *   honouring it   — the row the feed's claim picks, i.e. today's answer;
 *   withholding it — the row the VIN, drivetrain and battery hint pick alone.
 *
 * Agree, and the trim was never load-bearing: it narrowed nothing, so nothing
 * about it being wrong changes the facts. That is the Lightning and Mach-E
 * shape this was written for — keyed on VIN position 8, with trim only naming
 * a narrower override the disputed value doesn't reach — and the Ariya shape,
 * settled by its drivetrain. All ten live `trimSuspect` listings on 2026-08-21
 * were of this kind, and none of them moves.
 *
 * Disagree, and the trim WAS load-bearing, so neither answer is safe. Note in
 * particular that the withheld answer is not a safe fallback and must never be
 * taken on its own: withholding the trim doesn't demote a listing to a generic
 * row, it demotes it to whichever row happens to carry no trim key, and that
 * row is usually another specific version. Measured across the corpus
 * 2026-08-21: on 39 (make, model, year, trim) combinations a bare withhold
 * swapped one exact row for a different exact row — a 2022 Ioniq 5 Standard
 * Range would have gone from its own 220 mi to the trim-less RWD row's 303 mi.
 * Printing 303 on a car we have just decided we can't identify is the
 * matching-the-wrong-thing failure exactly, and in the expensive direction.
 *
 * So a disagreement resolves to candidates over every row the VIN allows,
 * which is what the "exact trim determines which row applies" discriminator
 * already existed to explain, and `agreed()` in lib/listings/enrich.ts still
 * surfaces the facts they share — the port standard doesn't care which Model 3
 * this is. Never an `exact`, and never on a single surviving row.
 *
 * That last rule is the deliberately conservative one, so here is what it
 * costs. Sweeping every (make, model, year, trim) the corpus knows, 40 cohorts
 * fall to nothing rather than to candidates because only one row survives.
 * Twenty-six of them are separated from their siblings by the DRIVETRAIN
 * alone — and on those nameplates the trim IS the drivetrain (BMW eDrive40 vs
 * M60, Volvo Single vs Twin Motor, ID.4 Pro RWD vs Pro AWD, EQE320+ vs EQE320
 * 4MATIC). The drive field arrives in the same feed record as the trim we have
 * just decided is wrong, so letting it settle single-vs-dual when
 * single-vs-dual is the dispute would be circular. Eleven more are the only
 * row we hold for that model year, where "narrowed to one" narrowed nothing
 * and the car may be a version we never researched. That leaves two —
 * `model-y-lr-awd-2024` and `i6-2023-25-sr` — where a vin8 code the dealer
 * cannot blur does identify the row and we stay quiet anyway. Recovering them
 * would mean asserting a trim-keyed row's range on a car whose trim we just
 * declared unknowable, and a false range costs a shopper money in a way
 * silence does not. Two cohorts, and no live listing among them on 2026-08-21.
 */
// Exported for lib/listings/teslaRangeAbstain.ts: which row(s) the VIN,
// drivetrain, and battery-size hint narrow a car to on their own, with the
// claimed trim never in the room to decide anything, one way or the other.
//
// This is deliberately NOT "drop the trim and see what's left" — that
// question is answered by matchEnrichmentRaw({ ...decode, trim: undefined })
// without `ignoreRowTrims`, and it is the wrong question here, for the same
// reason matchWithoutTrustedTrim's own doc comment gives at length: dropping
// a trim doesn't demote a listing to a generic answer, it demotes it to
// whichever row happens to carry no trim key, and calling that "the VIN
// resolved it" would be false in exactly the cohorts that need this most —
// Tesla's 2024 Model 3/Y rows, where the untrimmed row is real (a plain RWD
// car exists) but is not more true of THIS car than the trimmed row is.
// `ignoreRowTrims` keeps every row for the model/year/vin8/wmi in play,
// trimmed or not, so a result only collapses to one when vin8, plant,
// drivetrain, or the battery-size hint actually did the collapsing.
export function matchIgnoringTrim(decode: VinDecode, tesla: TeslaVinFacts | null): EnrichmentResult {
  return matchEnrichmentRaw({ ...decode, trim: undefined }, tesla, { ignoreRowTrims: true });
}

function matchWithoutTrustedTrim(
  decode: VinDecode,
  tesla: TeslaVinFacts | null
): EnrichmentResult {
  const honoured = matchEnrichmentRaw(decode, tesla);
  const withheld = matchEnrichmentRaw({ ...decode, trim: undefined }, tesla);
  if (honoured.exact && honoured.exact.id === withheld.exact?.id) return honoured;

  const spanning = matchEnrichmentRaw({ ...decode, trim: undefined }, tesla, { ignoreRowTrims: true });
  const rows = spanning.candidates ?? (spanning.exact ? [spanning.exact] : []);
  if (rows.length < 2) return {};
  return {
    candidates: rows,
    discriminator:
      "This listing's trim field is contradicted by its own description, and the VIN doesn't name the version on its own — so we won't pick between these. The window sticker or the door-jamb label settles it.",
  };
}

function matchEnrichmentRaw(
  decode: VinDecode,
  tesla: TeslaVinFacts | null,
  // matchWithoutTrustedTrim's last step only: keep trim-keyed rows in play
  // even though the decode carries no trim, so the set of versions the car
  // could be can be shown. Never set on an ordinary match — a listing that
  // simply has no trim must keep falling through to nothing, which is the
  // whole point of trimMatches() refusing an absent trim.
  opts?: { ignoreRowTrims?: boolean }
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
  // The trailing "+" is identity at the MODEL level too, not just the trim
  // level trimPlusMismatch was written for: dealers file the EQE 350+ under
  // model "EQE 350+", which norm() collapses onto "EQE 350" — the 4MATIC's
  // filing. Same rule as every trim comparison above: a one-sided plus is two
  // different cars, not a spelling variant. Checked against the corpus's
  // plus-bearing model strings (Lexus NX/RX 450h+, TX 550h+) before applying:
  // each deliberately lists its plus-less spellings as aliases, and `.some()`
  // still admits those pairs — parity only rejects the cross-matches.
  let rows = ALL_ROWS.filter(
    (r) =>
      canonicalMake(r.make, r.model) === mk &&
      [r.model, ...(r.modelAliases ?? [])].some((m) => modelKey(m) === modelKey(model) && !trimPlusMismatch(m, model)) &&
      modelYear >= r.modelYears[0] &&
      modelYear <= r.modelYears[1] &&
      // Spanning a cohort's versions is exactly when a feedLabelRow must NOT
      // appear: its trim key catches a label ("64 Series"), not a grade, so
      // it is not one of the versions the car could be.
      (opts?.ignoreRowTrims ? !r.feedLabelRow : trimMatches(r.trim, decode.trim))
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

  // The vehicle descriptor (VIN position 4 on) separates cars a trim string
  // cannot. The Cadillac Lyriq is why: `trimStringsOverlap` is substring-
  // tolerant both ways, so the V-Series row's "V Sport" key swallowed every
  // ordinary Lyriq listing that said only "Sport", and 878 of them printed
  // the V's 285 mi. The V is a different VIN — 1GYXP against 1GYKP — and no
  // amount of trim-string curation fixes a feed that writes "Sport" for both.
  const vds = decode.vin?.slice(3).toUpperCase();
  if (vds) {
    rows = rows.filter((r) => !r.vds || r.vds.some((p) => vds.startsWith(p.toUpperCase())));
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
    const trimSpecific = rows.filter((r) => rowTrims(r).some((rt) => trimStringsOverlap(rt, dt)));
    if (trimSpecific.length === 1) return { exact: trimSpecific[0] };
    if (trimSpecific.length > 1) {
      // Overlap is substring-tolerant in both directions, so a grade whose
      // name contains another grade's swallows it: "XLE Plus" overlaps a
      // listing that says only "XLE", and a 2026 bZ XLE FWD therefore tied
      // with the XLE FWD Plus row — 236 mi against 314, decided by nothing,
      // and 1,950 live listings deep. The early exact-trim pass above can't
      // help there: it runs before the drivetrain filter, where "XLE" still
      // matched the FWD and AWD XLE rows both, so it saw two exact hits and
      // stood aside. Ask it again now that drivetrain has narrowed the
      // field — an exact name is still the strongest listing-side signal
      // there is, and it should not lose to a longer name that merely
      // contains it.
      const exactTrim = trimSpecific.filter((r) => rowTrims(r).some((rt) => trimStringsExact(rt, dt)));
      if (exactTrim.length === 1) return { exact: exactTrim[0] };
      rows = trimSpecific;
    }
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
