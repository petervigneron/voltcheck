#!/usr/bin/env node
// Fill missing trim/drive on scraped listings from NHTSA vPIC (free, batch of
// 50 VINs per call). There should never be version ambiguity the VIN can
// resolve — this closes the gap for listings whose dealer page omitted trim.
import { readFile, writeFile } from "node:fs/promises";
import { isKnownMake } from "./lib/makes.mjs";
import { EV_MODEL_RE, EV_ONLY_WMIS } from "./lib/ev.mjs";
import { fetchWithRetry } from "./lib/retry.mjs";

const src = new URL("./out/listings.json", import.meta.url);
const listings = JSON.parse(await readFile(src, "utf-8"));

// A "high" classification backed by nothing but the dealer's own fuel-type
// text — VIN not an EV-only WMI, model/name not a known EV — is only as good
// as the dealer's data entry (a 2015 Prius Two shipped as an EV because its
// page said fuelType "Electric", 2026-08-15). Those get vPIC-checked below.
function fuelTextOnly(l) {
  if (l.evConfidence !== "high" || l.evConfidenceSource === "vpic") return false;
  if (EV_ONLY_WMIS.has(String(l.vin ?? "").slice(0, 3).toUpperCase())) return false;
  return !EV_MODEL_RE.test([l.model, l.name, l.trim].filter(Boolean).join(" "));
}

// Name-match-only EVs (evConfidence "name_match") are held back by ingest.mjs
// until vPIC confirms the classification — pull those into the same batch
// even when their trim/drive/kwh are already filled, so every one gets
// checked. (Never the reverse: a name match alone never promotes anything.)
// Same batch also carries listings whose make isn't a real manufacturer
// (dealer name in the JSON-LD brand — see lib/makes.mjs) and the
// fuel-text-only classifications above.
const needsByVin = new Map();
for (const l of listings) {
  if (l.vin?.length !== 17) continue;
  if (!l.trim || !l.driveLine || l.vpicBatteryKwh == null || l.evConfidence === "name_match" || !isKnownMake(l.make) || fuelTextOnly(l)) {
    needsByVin.set(l.vin.toUpperCase(), l);
  }
}
const needs = [...needsByVin.values()];
console.error(`${needs.length} of ${listings.length} listings need vPIC enrichment`);

/**
 * Neither vPIC field is reliably the trim, so take whichever survives a junk
 * filter rather than ranking them. Observed on F-150 Lightnings 2026-08-15:
 *   2022-23  Series ""          Trim "SuperCrew"   -> nothing (cab style)
 *   2024     Series "PRO"/"XLT" Trim ""            -> Series
 *   2025     Series "F-Series"  Trim "XLT"         -> Trim
 * The old `Trim || Series` filled 31 live listings with "SuperCrew" — every
 * Lightning is a SuperCrew, so it names no version — and a naive flip to
 * `Series || Trim` would have stamped "F-Series" on the 2025 trucks instead.
 */
const CAB_STYLE_RE =
  /^(super\s*crew|super\s*cab|crew\s*cab|regular\s*cab|extended\s*cab|double\s*cab|quad\s*cab|king\s*cab)$/i;
// "F-Series", "E-Series": the model family in the trim column.
const FAMILY_RE = /^[a-z]-?series$/i;

function vpicTrim(r, l) {
  for (const cand of [r.Series, r.Trim]) {
    const t = String(cand ?? "").trim();
    if (!t) continue;
    if (CAB_STYLE_RE.test(t) || FAMILY_RE.test(t)) continue;
    // The make or the model restated where the version belongs.
    const n = (s) => String(s ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (n(t) === n(l.make) || n(t) === n(l.model)) continue;
    return t;
  }
  return "";
}

function normDrive(s) {
  const u = String(s ?? "").toUpperCase();
  if (/(AWD|4WD|4X4)/.test(u)) return "AWD";
  if (/(RWD|REAR)/.test(u)) return "RWD";
  if (/(FWD|FRONT)/.test(u)) return "FWD";
  return undefined;
}

// vPIC confirms BEV via ElectrificationLevel ("BEV (Battery Electric
// Vehicle)") or, when that's blank, a bare "Electric" FuelTypePrimary with no
// secondary fuel. PHEVs/HEVs report FuelTypePrimary "Electric" too (secondary
// "Gasoline", ElectrificationLevel "PHEV (...)"), so both are checked and
// excluded explicitly — this is the only path that promotes a name-match EV,
// and it never fires on name text alone.
// The reverse check, for demoting fuel-text-only classifications: demotion is
// evidence-based only. A blank vPIC decode proves nothing and must not delist
// a real EV — only an affirmative non-plug-in hybrid level or a pure
// combustion fuel row refutes. (Control-tested 2026-08-15: Prius Two → Strong
// HEV refuted; Cayenne "S" E-Hybrid, GLC 350e, AMG E 53 → PHEV kept; the GLC
// reports FuelTypePrimary "Gasoline" WITH level PHEV, which is why the level
// is consulted first.)
function vpicRefutesEv(r) {
  const level = String(r.ElectrificationLevel ?? "");
  if (/phev|plug|bev|battery electric/i.test(level)) return false;
  if (/hev|hybrid|mild/i.test(level)) return true;
  const fuels = `${r.FuelTypePrimary ?? ""} ${r.FuelTypeSecondary ?? ""}`;
  return /gasoline|diesel|flex|e85/i.test(fuels) && !/electric/i.test(fuels);
}

function vpicConfirmsBev(r) {
  const level = String(r.ElectrificationLevel ?? "");
  const fuelPrimary = String(r.FuelTypePrimary ?? "");
  const fuelSecondary = String(r.FuelTypeSecondary ?? "");
  if (/hev|phev|hybrid/i.test(level) || /hybrid/i.test(fuelPrimary) || fuelSecondary.trim()) return false;
  if (/\bbev\b|battery electric/i.test(level)) return true;
  return /electric/i.test(fuelPrimary);
}

let filledTrim = 0;
let filledDrive = 0;
let promoted = 0;
let fixedMake = 0;
let demoted = 0;
let decoded = 0;

// Applies one vPIC decode row to its listing in place. `listings` holds the
// same object references as `needsByVin`, so this mutates the array
// checkpointed below — no separate merge step.
function applyDecode(l, r) {
  decoded++;
  if (!isKnownMake(l.make) && isKnownMake(r.Make)) {
    l.make = r.Make.trim();
    l.makeSource = "vpic";
    fixedMake++;
  }
  if (fuelTextOnly(l)) {
    if (vpicRefutesEv(r)) {
      l.evConfidence = "vpic_refuted"; // ingest keeps only "high"
      demoted++;
    } else if (/phev|plug/i.test(String(r.ElectrificationLevel ?? "")) && l.evKind === "BEV") {
      l.evKind = "PHEV"; // dealer said bare "Electric" on a plug-in hybrid
    }
  }
  const trim = vpicTrim(r, l);
  if (!l.trim && trim) {
    l.trim = trim;
    l.trimSource = "vpic";
    filledTrim++;
  }
  const d = normDrive(r.DriveType);
  if (!l.driveLine && d) {
    l.driveLine = d;
    l.driveSource = "vpic";
    filledDrive++;
  }
  const kwh = Number(r.BatteryKWh);
  if (Number.isFinite(kwh) && kwh > 0) l.vpicBatteryKwh = kwh;
  if (l.evConfidence === "name_match" && vpicConfirmsBev(r)) {
    l.evConfidence = "high";
    l.evKind = "BEV";
    l.evConfidenceSource = "vpic";
    promoted++;
  }
}

// Checkpointed like crawl.mjs's writeOutput: called on a timer while batches
// are still in flight, and once more when the loop ends or is cut short by
// the nightly workflow's `timeout 150m`. 2026-08-20: on a night with a huge
// new-VIN backlog, vpic-enrich ran the whole run to a single write at the
// very end, so a `timeout` kill threw away every decode already fetched —
// the backlog didn't shrink and the next night paid the same cost again.
// Applying each batch's decodes immediately (above) and checkpointing here
// means a kill keeps whatever was decoded before it, so the backlog actually
// shrinks night over night instead of resetting to zero.
let writing = false;
async function writeOutput() {
  if (writing) return;
  writing = true;
  try {
    await writeFile(src, JSON.stringify(listings, null, 2));
  } finally {
    writing = false;
  }
}
const checkpoint = setInterval(() => { writeOutput().catch(() => {}); }, 120_000);
checkpoint.unref?.();

for (let i = 0; i < needs.length; i += 50) {
  const batch = needs.slice(i, i + 50).map((l) => l.vin);
  // Short waits, unlike the database's ladder: vPIC has no 2-minute recovery
  // cycle to outlast, and there are hundreds of batches — a full outage must
  // degrade to "these VINs stay unenriched tonight" quickly, not stall for
  // hours. fetchWithRetry also turns a thrown fetch (connection reset) into
  // a skipped batch instead of an unhandled rejection killing the run.
  const res = await fetchWithRetry(
    `vPIC batch ${i / 50}`,
    () =>
      fetch("https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValuesBatch/", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: `DATA=${encodeURIComponent(batch.join(";"))}&format=json`,
      }),
    { waits: [5, 15] }
  );
  if (!res.ok) {
    console.error(`vPIC batch ${i / 50} failed: ${res.status === 0 ? await res.text() : `HTTP ${res.status}`}`);
    continue;
  }
  const json = await res.json();
  for (const r of json.Results ?? []) {
    if (!r.VIN) continue;
    const l = needsByVin.get(r.VIN.toUpperCase());
    if (l) applyDecode(l, r);
  }
  await new Promise((r) => setTimeout(r, 400));
}

clearInterval(checkpoint);
await writeOutput();
console.error(
  `decoded ${decoded}/${needs.length}, filled trim on ${filledTrim}, drive on ${filledDrive}, promoted ${promoted} name-match EVs to high confidence, repaired ${fixedMake} makes, refuted ${demoted} non-EVs → out/listings.json`
);
