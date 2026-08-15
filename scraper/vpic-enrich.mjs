#!/usr/bin/env node
// Fill missing trim/drive on scraped listings from NHTSA vPIC (free, batch of
// 50 VINs per call). There should never be version ambiguity the VIN can
// resolve — this closes the gap for listings whose dealer page omitted trim.
import { readFile, writeFile } from "node:fs/promises";
import { isKnownMake } from "./lib/makes.mjs";
import { EV_MODEL_RE, EV_ONLY_WMIS } from "./lib/ev.mjs";

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

function normDrive(s) {
  const u = String(s ?? "").toUpperCase();
  if (/(AWD|4WD|4X4)/.test(u)) return "AWD";
  if (/(RWD|REAR)/.test(u)) return "RWD";
  if (/(FWD|FRONT)/.test(u)) return "FWD";
  return undefined;
}

const byVin = new Map();
for (let i = 0; i < needs.length; i += 50) {
  const batch = needs.slice(i, i + 50).map((l) => l.vin);
  const res = await fetch("https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValuesBatch/", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: `DATA=${encodeURIComponent(batch.join(";"))}&format=json`,
  });
  if (!res.ok) {
    console.error(`vPIC batch ${i / 50} failed: HTTP ${res.status}`);
    continue;
  }
  const json = await res.json();
  for (const r of json.Results ?? []) {
    if (r.VIN) byVin.set(r.VIN.toUpperCase(), r);
  }
  await new Promise((r) => setTimeout(r, 400));
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
for (const l of listings) {
  const r = byVin.get(l.vin?.toUpperCase());
  if (!r) continue;
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
  const trim = (r.Trim || r.Series || "").trim();
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
await writeFile(src, JSON.stringify(listings, null, 2));
console.error(
  `filled trim on ${filledTrim}, drive on ${filledDrive}, promoted ${promoted} name-match EVs to high confidence, repaired ${fixedMake} makes, refuted ${demoted} non-EVs → out/listings.json`
);
