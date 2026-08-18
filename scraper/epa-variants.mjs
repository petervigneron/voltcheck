#!/usr/bin/env node
// EPA variant catalogue → Supabase epa_vehicle_variants (migration 0037).
//
// fueleconomy.gov's bulk vehicles.csv is the manufacturers' own certification
// data as the EPA publishes it: one row per rated configuration, with make,
// model string, model year, drive type, EPA range, and vehicle class. That is
// the variant space each model was actually SOLD in — which is what the browse
// rail needs, instead of inferring a model's versions from whatever happens to
// be listed this week (web/lib/listings/variantCatalog.ts has the consumer
// side and the shape of that bug).
//
// Kept rows: every battery-electric (fuelType "Electricity") and every plug-in
// hybrid (atvType "Plug-in Hybrid"). PHEVs carry no epa_range_mi — their
// electric range is a blended figure in columns of its own, and loading it
// into the EV-range column would print a false claim. Hydrogen and plain
// hybrids stay out: the site doesn't list them.
//
// KNOWN HOLES in the source, so a thin model-year isn't misread as a thin
// model (verified with control tests, 2026-08-17):
//   - MY2023 Ioniq 5 and MY2023 Mercedes EQE (sedan and SUV) are absent
//     outright; the neighboring years and MY2023 stablemates are present.
//   - Vehicles over 8,500 lb GVWR are exempt from EPA labeling: BrightDrop
//     Zevo, Ford E-Transit, Mercedes eSprinter and the Cadillac Escalade
//     IQ/IQL never appear (the Hummer EV and Silverado EV do — GM certified
//     them anyway). MY2024 GMC Sierra EV is likewise absent while MY2024
//     Silverado EV is present.
// Absence therefore means UNKNOWN downstream, never "no such version".
//
// The dataset refreshes upstream a few times a year; run this by hand after
// EPA updates, like reference-data.mjs. The load is staged and committed
// atomically (migration 0034's protocol): a failed run leaves the previous
// catalogue live, and replays are safe.
//
//   node epa-variants.mjs [--dry-run] [--file PATH]
//
// --file skips the download and reads a local vehicles.csv (the file is
// ~50 MB; keep one around when iterating).
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { stagedLoad } from "./lib/staged-load.mjs";

const CSV_URL = "https://www.fueleconomy.gov/feg/epadata/vehicles.csv";

function opt(name, fallback) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : fallback;
}
const DRY = process.argv.includes("--dry-run");
const FILE = opt("--file", "");

async function loadEnv(url) {
  try {
    const text = await readFile(url, "utf-8");
    for (const line of text.split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (m && !line.trimStart().startsWith("#") && !(m[1] in process.env)) {
        process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
      }
    }
  } catch {}
}
await loadEnv(new URL("./.env", import.meta.url));

// Full RFC-4180 state machine, unlike reference-data.mjs's line-based reader:
// this file is a third party's export and nothing guarantees its quoted
// fields never contain a newline, so splitting on lines first would corrupt
// silently the day one does.
function parseCsv(text) {
  const rows = [];
  let row = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') quoted = false;
      else cur += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(cur); cur = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cur); cur = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
    } else cur += c;
  }
  if (cur !== "" || row.length) { row.push(cur); rows.push(row); }
  const header = rows.shift();
  return rows.map((r) => Object.fromEntries(header.map((h, j) => [h, r[j] ?? ""])));
}

// The EPA writes drive out in words, several ways. "Part-time 4-Wheel Drive"
// (Rivian's dual-motor filings) and "4-Wheel Drive" (Silverado EV, G 580) are
// both all-wheel drive in the sense the filter asks about. "2-Wheel Drive"
// (90s compliance cars) doesn't say WHICH axle, so it maps to null — unknown,
// not a guess.
function normDrive(raw) {
  const d = String(raw ?? "");
  if (/All-Wheel|4-Wheel|4x4/i.test(d)) return "AWD";
  if (/Front/i.test(d)) return "FWD";
  if (/Rear/i.test(d)) return "RWD";
  return null;
}

let text;
if (FILE) {
  text = await readFile(resolve(FILE), "utf-8");
} else {
  console.error(`fetching ${CSV_URL} ...`);
  const res = await fetch(CSV_URL);
  if (!res.ok) {
    console.error(`epa-variants: download failed (HTTP ${res.status}) — previous catalogue stays live.`);
    process.exit(1);
  }
  text = await res.text();
}

const all = parseCsv(text);
const rows = [];
for (const r of all) {
  const bev = r.fuelType === "Electricity";
  const phev = r.atvType === "Plug-in Hybrid";
  if (!bev && !phev) continue;
  const range = bev ? Number.parseInt(r.range, 10) : NaN;
  rows.push({
    epaId: Number.parseInt(r.id, 10),
    make: r.make.trim(),
    model: r.model.trim(),
    baseModel: r.baseModel.trim() || null,
    modelYear: Number.parseInt(r.year, 10),
    evType: bev ? "BEV" : "PHEV",
    drive: normDrive(r.drive),
    epaRangeMi: Number.isFinite(range) && range > 0 ? range : null,
    vclass: r.VClass.trim() || null,
  });
}
const bad = rows.filter((r) => !Number.isFinite(r.epaId) || !Number.isFinite(r.modelYear) || !r.make || !r.model);
if (bad.length) {
  console.error(`epa-variants: ${bad.length} malformed rows (sample: ${JSON.stringify(bad[0])}) — refusing to load.`);
  process.exit(1);
}
// A short parse is the failure that hides: the commit protocol would happily
// swap in a half-file. The dataset has held ~1,500 BEV rows since 2024;
// anything far below that means the download or the parse broke, not the EPA.
const bevN = rows.filter((r) => r.evType === "BEV").length;
if (bevN < 1000) {
  console.error(`epa-variants: only ${bevN} BEV rows parsed (expected ~1,500+) — refusing to load.`);
  process.exit(1);
}
console.error(`epa-variants: ${rows.length} rows (${bevN} BEV, ${rows.length - bevN} PHEV) from ${all.length} vehicles`);

if (DRY) {
  console.error(`  sample: ${JSON.stringify(rows.find((r) => r.modelYear >= 2022))}`);
  process.exit(0);
}

const SUPABASE_URL = process.env.SUPABASE_URL;
const TOKEN = process.env.SUPABASE_INGEST_TOKEN;
const ANON = process.env.SUPABASE_ANON_KEY;
if (!SUPABASE_URL || !TOKEN || !ANON) {
  console.error("epa-variants: no Supabase credentials (scraper/.env) — skipping.");
  process.exit(0);
}

const inserted = await stagedLoad({ dataset: "epa_variants", rows, chunkSize: 4000, name: "epa_variants" });
console.error(`epa_variants: ${inserted} rows loaded`);
