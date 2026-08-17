#!/usr/bin/env node
// What version is each sold car? — VIN(1-8) + model year → a named variant.
//
// wa_ev_sales publishes VIN 1-10 and no trim, so a page listing recent sales
// can say what a car sold for but not WHICH version sold. That makes the list
// unreadable for any model whose trims are thousands apart: a Lightning Pro
// and a Lightning Platinum in the same column look like the same truck at two
// prices. This script closes that gap from the primary source — NHTSA vPIC,
// which decodes the manufacturer's own VIN submission, free and in batches
// of 50.
//
// VIN 9 is the check digit and VIN 10 is the model year, so VIN 1-8 plus the
// year is exactly as informative as the published 1-10 prefix, and it is the
// same key ev_price_model (0014) already cohorts on.
//
//   node vpic-variants.mjs [--dry-run] [--limit N]
//
// Monthly, alongside wa-prices.mjs: cohorts only appear when WA publishes a
// model year we've never seen.
import { readFile } from "node:fs/promises";
import { fetchWithRetry } from "./lib/retry.mjs";

const SODA = "https://data.wa.gov/resource/rpr4-cgyd.json";
const BATCH = 50;

const DRY = process.argv.includes("--dry-run");
const LIMIT = (() => {
  const i = process.argv.indexOf("--limit");
  return i >= 0 ? Number(process.argv[i + 1]) : Infinity;
})();

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

// ── Cohorts ────────────────────────────────────────────────────────────────
// Same filter wa-prices.mjs loads under, so every cohort here has rows in
// wa_ev_sales and no cohort in wa_ev_sales is missing here.
const since = new Date();
since.setMonth(since.getMonth() - 24);
const where =
  `new_or_used_vehicle='Used' AND sale_price>5000 AND sale_price<250000 ` +
  `AND date_of_vehicle_sale>'${since.toISOString().slice(0, 10)}'`;

const url =
  `${SODA}?$select=substring(vin_1_10,1,8) as v8,model_year,count(*) as n` +
  `&$where=${encodeURIComponent(where)}&$group=v8,model_year&$limit=50000`;
// Read-only; the ingest writes below stay retry-free for the same
// duplicate-on-replay reason documented in wa-prices.mjs.
const res = await fetchWithRetry("vpic-variants: SODA cohorts", () =>
  fetch(url, {
    headers: { "user-agent": "VoltcheckBot/0.1 (+https://voltcheck.net/bot)" },
  })
);
if (!res.ok) {
  console.error(`vpic-variants: SODA HTTP ${res.status} — ${(await res.text()).slice(0, 200)}`);
  process.exit(1);
}
const cohorts = (await res.json())
  .map((r) => ({ vin8: String(r.v8 ?? "").toUpperCase(), modelYear: Number(r.model_year), n: Number(r.n) }))
  .filter((c) => c.vin8.length === 8 && Number.isFinite(c.modelYear))
  .sort((a, b) => b.n - a.n)
  .slice(0, LIMIT);
console.error(`vpic-variants: ${cohorts.length} VIN(1-8)+year cohorts to decode`);

// ── What counts as a version ───────────────────────────────────────────────
// vPIC files the same fact under different headings by year and maker: 2024
// Lightnings answer in Series ("Lariat"), 2025 in Trim, Teslas in neither.
// All four fields are read, then filtered — a heading is not evidence.

// A cab style is not a trim. Every Lightning is a SuperCrew, so "SuperCrew"
// in the Trim field names the body, not the version, and printing it as one
// tells a shopper nothing while looking like it did. Same list as the web
// lane's CAB_STYLES (web/lib/listings/enrich.ts) — kept in sync by hand.
const CAB_STYLES =
  /^(super\s*crew|super\s*cab|crew\s*cab|regular\s*cab|extended\s*cab|double\s*cab|quad\s*cab|king\s*cab|super\s*crew\s*cab)$/i;
// Body-class words and vPIC placeholders that ride along in these fields.
const NOT_A_TRIM =
  /^(n\/?a|none|not applicable|other|unknown|pickup|sedan|suv|wagon|hatchback|coupe|van|truck|4dr|2dr|electric|ev|bev)$/i;
// The model name restated. "F-Series" in Series on a 2025 Lightning is the
// nameplate, not the version.
function echoesModel(t, model) {
  const norm = (s) => s.replace(/[^a-z0-9]/gi, "").toLowerCase();
  const nt = norm(t);
  const nm = norm(model);
  if (!nt) return true;
  if (nm && (nt === nm || nm.startsWith(nt) || nt.startsWith(nm))) return true;
  return /^(f-?series|e-?series|silverado|sierra|model[123sxy])$/i.test(t.trim());
}

// vPIC files some trims in caps and some in title case, and the same truck can
// come back "PRO" one model year and "Pro" the next — two spellings of one
// version, side by side in the same list.
//
// Short all-caps trims are almost always genuine acronyms that must stay
// shouting (SE, SEL, XLT, LTZ, GT, HSE, 2LT), so the rule is: keep words of
// three letters or fewer uppercase. The exceptions are the handful of real
// English words short enough to be caught by it. PRO is the only one in the
// current data; the rest are here because they are the plausible next ones.
const SHORT_WORDS = new Set(["PRO", "MAX", "AIR", "GTS", "SKY", "ONE", "DUO"]);

function titleCase(t) {
  return t.replace(/[A-Za-z]+/g, (w) =>
    w.length <= 3 && !SHORT_WORDS.has(w.toUpperCase())
      ? w.toUpperCase()
      : w[0] + w.slice(1).toLowerCase()
  );
}

function trimFrom(r) {
  const model = String(r.Model ?? "");
  for (const raw of [r.Series, r.Trim, r.Series2, r.Trim2]) {
    const t = String(raw ?? "").trim().replace(/\s+/g, " ");
    if (!t || t.length > 32) continue;
    if (CAB_STYLES.test(t) || NOT_A_TRIM.test(t) || echoesModel(t, model)) continue;
    // Only fold vPIC's all-caps spellings; a trim it already title-cased is
    // left exactly as filed.
    return /^[A-Z0-9 +-]+$/.test(t) && /[A-Z]{2,}/.test(t) ? titleCase(t) : t;
  }
  return null;
}

// When the VIN doesn't encode the trim (Ford didn't stamp one on 2022-23
// Lightnings; Tesla never has), it still encodes the powertrain — and that is
// the split that moves the price. Report only what vPIC returned, never a
// marketing name inferred from it.
function specFrom(r) {
  const kwh = Number(r.BatteryKWh);
  if (Number.isFinite(kwh) && kwh > 0) return `${Math.round(kwh)} kWh`;
  const hp = Number(r.EngineHP);
  if (Number.isFinite(hp) && hp > 0) return `${Math.round(hp)} hp`;
  return null;
}

function normDrive(s) {
  const u = String(s ?? "").toUpperCase();
  if (/(AWD|4WD|4X4)/.test(u)) return "AWD";
  if (/(RWD|REAR)/.test(u)) return "RWD";
  if (/(FWD|FRONT)/.test(u)) return "FWD";
  return null;
}

// ── Decode ─────────────────────────────────────────────────────────────────
const out = [];
for (let i = 0; i < cohorts.length; i += BATCH) {
  const batch = cohorts.slice(i, i + BATCH);
  const body =
    `DATA=${encodeURIComponent(batch.map((c) => `${c.vin8},${c.modelYear}`).join(";"))}&format=json`;
  const res = await fetchWithRetry(
    `vpic-variants: batch ${i / BATCH}`,
    () =>
      fetch("https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValuesBatch/", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body,
      }),
    { waits: [5, 15] } // vPIC read: degrade fast, see vpic-enrich.mjs
  );
  if (!res.ok) {
    console.error(`vpic-variants: batch ${i / BATCH} failed ${res.status === 0 ? await res.text() : `HTTP ${res.status}`}`);
    continue;
  }
  const json = await res.json();
  // vPIC returns results in request order but echoes the VIN, so match on it
  // rather than trusting position.
  const byVin = new Map();
  for (const r of json.Results ?? []) {
    const k = `${String(r.VIN ?? "").toUpperCase()}|${r.ModelYear}`;
    if (!byVin.has(k)) byVin.set(k, r);
  }
  for (const c of batch) {
    const r = byVin.get(`${c.vin8}|${c.modelYear}`);
    if (!r) continue;
    const trim = trimFrom(r);
    out.push({
      vin8: c.vin8,
      modelYear: c.modelYear,
      make: String(r.Make ?? "").trim() || null,
      model: String(r.Model ?? "").trim() || null,
      // The version, when the VIN carries one. Null is a real answer and the
      // page prints it as "Unknown" rather than filling it with the cab style.
      trim,
      // The powertrain split, always recorded — it is what discriminates the
      // cohorts whose trim is null, and it is a fact either way.
      spec: specFrom(r),
      drive: normDrive(r.DriveType),
      bodyClass: String(r.BodyClass ?? "").trim() || null,
      salesN: c.n,
    });
  }
  console.error(`  decoded ${out.length}/${cohorts.length}`);
  await new Promise((r) => setTimeout(r, 400));
}

const withTrim = out.filter((v) => v.trim).length;
const withSpec = out.filter((v) => !v.trim && v.spec).length;
const salesWithTrim = out.filter((v) => v.trim).reduce((a, v) => a + v.salesN, 0);
const salesTotal = out.reduce((a, v) => a + v.salesN, 0);
console.error(
  `vpic-variants: ${out.length} cohorts — ${withTrim} named, ${withSpec} spec-only, ` +
    `${out.length - withTrim - withSpec} unknown; ` +
    `${((100 * salesWithTrim) / (salesTotal || 1)).toFixed(1)}% of sales rows get a trim name`
);

if (DRY) {
  console.log(JSON.stringify(out, null, 1));
  process.exit(0);
}

const SUPABASE_URL = process.env.SUPABASE_URL;
const TOKEN = process.env.SUPABASE_INGEST_TOKEN;
const ANON = process.env.SUPABASE_ANON_KEY;
if (!SUPABASE_URL || !TOKEN || !ANON) {
  console.error("vpic-variants: no Supabase credentials (scraper/.env) — skipping.");
  process.exit(0);
}

const CHUNK = 1000;
let loaded = 0;
for (let i = 0; i < out.length; i += CHUNK) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/ingest`, {
    method: "POST",
    headers: {
      apikey: ANON,
      Authorization: `Bearer ${ANON}`,
      "x-ingest-token": TOKEN,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ dataset: "vin_variants", rows: out.slice(i, i + CHUNK), replace: i === 0 }),
  });
  if (!res.ok) {
    console.error(`vpic-variants: FAILED at ${i} — HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
    process.exit(1);
  }
  loaded += (await res.json()).inserted ?? 0;
  console.error(`  loaded ${loaded}/${out.length}`);
}
console.error(`vpic-variants: ${loaded} variants loaded`);
