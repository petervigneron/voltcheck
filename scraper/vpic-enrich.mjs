#!/usr/bin/env node
// Fill missing trim/drive on scraped listings from NHTSA vPIC (free, batch of
// 50 VINs per call). There should never be version ambiguity the VIN can
// resolve — this closes the gap for listings whose dealer page omitted trim.
import { readFile, writeFile } from "node:fs/promises";

const src = new URL("./out/listings.json", import.meta.url);
const listings = JSON.parse(await readFile(src, "utf-8"));

const needs = listings.filter((l) => l.vin?.length === 17 && (!l.trim || !l.driveLine || l.vpicBatteryKwh == null));
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

let filledTrim = 0;
let filledDrive = 0;
for (const l of listings) {
  const r = byVin.get(l.vin?.toUpperCase());
  if (!r) continue;
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
}
await writeFile(src, JSON.stringify(listings, null, 2));
console.error(`filled trim on ${filledTrim}, drive on ${filledDrive} → out/listings.json`);
