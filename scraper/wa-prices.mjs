#!/usr/bin/env node
// Washington DOL EV title transactions → Supabase (wa_ev_sales).
//
// What people actually PAID, as opposed to what dealers ASK. Source:
// data.wa.gov dataset rpr4-cgyd, ODbL, refreshed monthly by WA DOL. See
// supabase/migrations/0003 for why this lives in its own table.
//
//   node wa-prices.mjs [--months 24] [--dry-run]
//
// Monthly is plenty — the upstream file only updates monthly.
import { readFile } from "node:fs/promises";
import { fetchWithRetry } from "./lib/retry.mjs";
import { stagedLoad } from "./lib/staged-load.mjs";

const SODA = "https://data.wa.gov/resource/rpr4-cgyd.json";
const PAGE = 50000;

function flag(name, fallback) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? Number(process.argv[i + 1]) : fallback;
}
const MONTHS = flag("--months", 24);
const DRY = process.argv.includes("--dry-run");

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

// WA publishes make in caps and model close to our canonical spelling, but
// a handful differ. Verified against WA's own distinct values 2026-08-11.
const MAKE_ALLCAPS = new Set(["BMW", "GMC", "MINI"]);
function canonMake(m) {
  const u = (m ?? "").trim().toUpperCase();
  if (MAKE_ALLCAPS.has(u)) return u;
  if (u === "MERCEDES-BENZ") return "Mercedes-Benz";
  return u.charAt(0) + u.slice(1).toLowerCase();
}
const MODEL_FIXUPS = {
  "NIRO": "Niro EV",
  "KONA": "Kona Electric",
  "BLAZER": "Blazer EV",
  "EQUINOX": "Equinox EV",
  "SILVERADO": "Silverado EV",
  "F-150": "F-150 Lightning",
  "ARIYA HATCHBACK": "Ariya",
  "ARIYA MPV": "Ariya",
  "HUMMER EV PICKUP": "Hummer EV",
  "MUSTANG MACH-E": "Mustang Mach-E",
  "ID. BUZZ": "ID. Buzz",
  "IONIQ 5": "Ioniq 5",
  "IONIQ 6": "Ioniq 6",
};
function canonModel(m) {
  const t = (m ?? "").trim().replace(/\s+/g, " ");
  return MODEL_FIXUPS[t.toUpperCase()] ?? t;
}

const since = new Date();
since.setMonth(since.getMonth() - MONTHS);
const sinceIso = since.toISOString().slice(0, 10);

// Floor at $5,000: WA's own docs note sale_price is a DECLARED figure, and
// the low tail is family transfers and salvage, not market sales. Ceiling
// guards data-entry noise.
//
// Odometer brands are dropped because mileage is the price model's only
// regressor (supabase/migrations/0015): a row whose reading is disclosed as
// wrong contributes a point on the wrong part of the curve. These are the
// federally required title disclosures, so a car carrying one has a history
// worth pricing differently even setting the reading aside — WA publishes no
// title brand at all, and this is the closest thing to one in the dataset.
// 176 rows of 60,302 over 24 months, and they sell ~40% below clean ones.
// NULL survives on purpose: most rows are "Odometer reading is not collected
// at time of renewal" or have no code, and absent is not the same as branded.
const ODOMETER_BRANDS = ["Not actual mileage", "Exceeds mechanical limits"];
const where =
  `new_or_used_vehicle='Used' AND sale_price>5000 AND sale_price<250000 ` +
  `AND date_of_vehicle_sale>'${sinceIso}' ` +
  `AND (odometer_code IS NULL OR odometer_code NOT IN(${ODOMETER_BRANDS.map((b) => `'${b}'`).join(",")}))`;

const rows = [];
for (let offset = 0; ; offset += PAGE) {
  const url =
    `${SODA}?$select=vin_1_10,make,model,model_year,electric_vehicle_type,sale_price,` +
    `odometer_reading,date_of_vehicle_sale,county,city,zip,transaction_type` +
    `&$where=${encodeURIComponent(where)}&$order=date_of_vehicle_sale&$limit=${PAGE}&$offset=${offset}`;
  const res = await fetchWithRetry(`wa-prices: SODA offset ${offset}`, () =>
    fetch(url, { headers: { "user-agent": "VoltcheckBot/0.1 (+https://voltcheck-mu.vercel.app/bot)" } })
  );
  if (!res.ok) {
    console.error(`wa-prices: SODA HTTP ${res.status} — ${(await res.text()).slice(0, 200)}`);
    process.exit(1);
  }
  const page = await res.json();
  rows.push(...page);
  console.error(`  fetched ${rows.length}`);
  if (page.length < PAGE) break;
}

const out = rows
  .map((r) => ({
    vinPrefix: r.vin_1_10,
    make: canonMake(r.make),
    model: canonModel(r.model),
    modelRaw: r.model,
    modelYear: Number(r.model_year) || null,
    evType: r.electric_vehicle_type?.includes("Plug-in") ? "PHEV" : "BEV",
    salePrice: Math.round(Number(r.sale_price)),
    odometer: r.odometer_reading != null ? Math.round(Number(r.odometer_reading)) : null,
    saleDate: r.date_of_vehicle_sale?.slice(0, 10),
    county: r.county,
    city: r.city,
    zip: r.zip,
    transactionType: r.transaction_type,
  }))
  // An odometer of 0 on a used car is a missing reading, not a fact.
  .map((r) => ({ ...r, odometer: r.odometer && r.odometer > 100 ? r.odometer : null }))
  .filter((r) => r.make && r.model && r.modelYear && r.salePrice && r.saleDate);

console.error(`wa-prices: ${out.length} usable used-EV sales since ${sinceIso}`);
if (DRY) {
  const sample = out.slice(-3);
  console.error(JSON.stringify(sample, null, 1));
  process.exit(0);
}

const SUPABASE_URL = process.env.SUPABASE_URL;
const TOKEN = process.env.SUPABASE_INGEST_TOKEN;
const ANON = process.env.SUPABASE_ANON_KEY;
if (!SUPABASE_URL || !TOKEN || !ANON) {
  console.error("wa-prices: no Supabase credentials (scraper/.env) — skipping.");
  process.exit(0);
}

// Chunked because the whole archive in one jsonb payload blows the statement
// timeout. Staged + committed (lib/staged-load.mjs, migration 0033) so a
// mid-load failure leaves last month's table live instead of half-replaced,
// and a lost response can be retried without duplicating sale rows.
const inserted = await stagedLoad({ dataset: "wa_sales", rows: out, chunkSize: 4000, name: "wa-prices" });
console.error(`wa-prices: ${inserted} transactions loaded`);
