#!/usr/bin/env node
// Reference datasets → Supabase (migration 0016).
//
// Washington was the only state publishing per-transaction sale prices, and
// 0014 fits the whole fair-price model on it while warning that "coverage is
// Washington-only". These are the other sources a 50-state sweep turned up
// (write-up lives in the private research repo, not here):
//
//   cc4a      California Clean Cars 4 All — 15k used-EV sales with price and
//             odometer. CARB publishes it because the programme caps the used
//             PURCHASE PRICE at $45k, so it has to record the price.
//   ladwp     LADWP used-EV rebate — 7.6k FULL 17-char VINs, no price.
//   il_epa    Illinois EPA rebate — 14.4k FULL VINs, no price.
//   cheapr    Connecticut CHEAPR — 27.5k rebates, no price, no VIN.
//
// Unlike wa-prices.mjs this does not fetch from source, because three of the
// four publish xlsx or PDF behind quarter-stamped URLs. Extraction is a manual
// step; the extracted files live in the private research repo and this reads
// them from there. These refresh quarterly at best, so nightly automation
// would be pointless.
//
//   node reference-data.mjs [--dir PATH] [--only cc4a,ladwp,il_epa,cheapr] [--dry-run]
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const DEFAULT_DIR = "/Users/petervigneron/EV site/docs/transaction-data-requests/data";

function opt(name, fallback) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : fallback;
}
const DIR = resolve(opt("--dir", DEFAULT_DIR));
const DRY = process.argv.includes("--dry-run");
const ONLY = opt("--only", "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

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

// Minimal RFC-4180 reader: these files carry quoted fields with commas
// (dealership names) but no embedded newlines.
function parseCsv(text) {
  const rows = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line) continue;
    const cells = [];
    let cur = "";
    let quoted = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (quoted) {
        if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
        else if (c === '"') quoted = false;
        else cur += c;
      } else if (c === '"') quoted = true;
      else if (c === ",") { cells.push(cur); cur = ""; }
      else cur += c;
    }
    cells.push(cur);
    rows.push(cells);
  }
  const header = rows.shift();
  return rows.map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ""])));
}

// Round rather than truncate: CC4A prices carry cents ("26435.85"), and
// stripping the separator instead of parsing it turns $26,435 into $2.6M.
const int = (v) => {
  const n = Number.parseFloat(String(v ?? "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? Math.round(n) : null;
};
const clean = (v) => {
  const s = String(v ?? "").trim();
  return s === "" ? null : s;
};
// ZIPs arrive from a spreadsheet as numbers, so Connecticut's 06840 shows up
// as 6840. Pad anything that is plausibly a ZIP back to five.
const zip5 = (v) => {
  const s = clean(v);
  if (!s) return null;
  return /^\d{1,5}$/.test(s) ? s.padStart(5, "0") : s;
};

// Three encodings survive upstream: ISO, m/d/yyyy, and Excel serials (days
// since 1899-12-30). Dropping the latter two silently would have discarded
// 1,599 of 15,081 CC4A rows.
const EXCEL_EPOCH_MS = Date.UTC(1899, 11, 30);
function isoDate(v) {
  const s = String(v ?? "").trim();
  if (!s) return null;
  const iso = s.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const mdy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (mdy) {
    const [, m, d, y] = mdy;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  if (/^\d+(\.\d+)?$/.test(s)) {
    const days = Number.parseFloat(s);
    if (days > 20000 && days < 80000) {
      return new Date(EXCEL_EPOCH_MS + days * 86400000).toISOString().slice(0, 10);
    }
  }
  return null;
}

// A full VIN is 17 characters and never contains I, O or Q — but that alone
// lets real junk through. Both source registries carry it: LADWP's file
// includes the literal placeholder "12345654321345432" and VINs shifted by a
// stray leading zero, and Illinois has rows using O for 0.
//
// So: recover the O/0 confusion, reject a leading zero (no WMI starts with
// one), and for North American VINs (first char 1-5) verify the ISO 3779
// check digit at position 9. That kills the placeholder and the shifted rows
// without touching imports like BMW's WBY, whose issuers don't all comply.
const VIN_RE = /^[A-HJ-NPR-Z0-9]{17}$/;
const TRANSLIT = { A: 1, B: 2, C: 3, D: 4, E: 5, F: 6, G: 7, H: 8, J: 1, K: 2, L: 3, M: 4, N: 5, P: 7, R: 9, S: 2, T: 3, U: 4, V: 5, W: 6, X: 7, Y: 8, Z: 9 };
const WEIGHTS = [8, 7, 6, 5, 4, 3, 2, 10, 0, 9, 8, 7, 6, 5, 4, 3, 2];

function checkDigitOk(vin) {
  let sum = 0;
  for (let i = 0; i < 17; i++) {
    const c = vin[i];
    const val = /\d/.test(c) ? Number(c) : TRANSLIT[c];
    if (val === undefined) return false;
    sum += val * WEIGHTS[i];
  }
  const expected = sum % 11;
  return vin[8] === (expected === 10 ? "X" : String(expected));
}

function normVin(raw) {
  let v = String(raw ?? "").trim().toUpperCase();
  if (!VIN_RE.test(v)) {
    v = v.replace(/O/g, "0");
    if (!VIN_RE.test(v)) return null;
  }
  if (v.startsWith("0")) return null;
  if (/^\d{17}$/.test(v)) return null; // all-digits placeholders
  if (/^[1-5]/.test(v) && !checkDigitOk(v)) return null;
  return v;
}

const DATASETS = {
  cc4a: {
    dataset: "cc4a_sales",
    file: "ca_cc4a_used_ev_prices.csv",
    parse: (text) =>
      parseCsv(text)
        .map((r) => ({
          make: clean(r["Replacement Make"]),
          model: clean(r["Replacement Model"]),
          sub_model: clean(r["Replacement Sub Model"]),
          model_year: int(r["Replacement MY"]),
          ev_type: clean(r["Replacement Tech"]),
          sale_price: int(r["Total Vehicle Purchase Price"]),
          odometer: int(r["Replacement Mileage"]),
          sale_date: isoDate(r["Purchase or Lease Date"]),
          county: clean(r["County"]),
          zip: zip5(r["Zip Code"]),
          dealership: clean(r["Dealership"]),
          air_district: clean(r["District"]),
        }))
        // make/model/price/date are NOT NULL in 0016; ~2% of rows upstream
        // have an unparseable date and are dropped rather than faked.
        .filter((r) => r.make && r.model && r.sale_price > 0 && r.sale_date),
  },
  ladwp: {
    dataset: "rebate_vins",
    file: "ladwp_used_ev_vins.csv",
    parse: (text) =>
      parseCsv(text)
        .map((r) => ({
          vin: normVin(r.vin),
          source: "LADWP",
          model_year: null,
          make: null,
          model: null,
          rebate_date: isoDate(r.rebate_date),
        }))
        .filter((r) => r.vin),
  },
  il_epa: {
    dataset: "rebate_vins",
    file: "il_epa_rebated_ev_vins.json",
    parse: (text) => {
      const raw = JSON.parse(text);
      const rows = Array.isArray(raw) ? raw : Object.values(raw).find(Array.isArray) ?? [];
      return rows
        .map((r) => {
          const [year, make, model, vin] = Array.isArray(r) ? r : Object.values(r);
          return {
            vin: normVin(vin),
            source: "IL_EPA",
            model_year: int(year),
            make: clean(make),
            model: clean(model),
            rebate_date: null, // Illinois publishes no date
          };
        })
        .filter((r) => r.vin);
    },
  },
  cheapr: {
    dataset: "cheapr_rebates",
    file: "ct_cheapr_rebates.csv",
    parse: (text) =>
      parseCsv(text).map((r) => ({
        applicant_type: clean(r["Applicant Type"]),
        application_date: isoDate(r["Application Submission Date"]),
        zip: zip5(r["ZIP Code"]),
        rebate_amount: int(r["Rebate Amount"]),
        purchase_date: isoDate(r["Date of Purchase or Lease"]),
        model_year: int(r["Vehicle Year"]),
        model: clean(r["Model"]),
        new_or_used: clean(r["New/Used"])?.toLowerCase().startsWith("used") ? "Used" : clean(r["New/Used"]),
        purchase_or_lease: clean(r["Purchase or Lease"]),
        rebate_type: clean(r["Rebate Type"]),
        dealership: clean(r["Dealership Name"]),
        dealership_zip: zip5(r["Dealership ZIP Code"]),
      })),
  },
};

const SUPABASE_URL = process.env.SUPABASE_URL;
const TOKEN = process.env.SUPABASE_INGEST_TOKEN;
const ANON = process.env.SUPABASE_ANON_KEY;
if (!DRY && (!SUPABASE_URL || !TOKEN || !ANON)) {
  console.error("reference-data: no Supabase credentials (scraper/.env) — skipping.");
  process.exit(0);
}

// Same reason as wa-prices: one jsonb payload this size blows the statement
// timeout. Only the first chunk of a source replaces; the rest append.
const CHUNK = 4000;

for (const [name, spec] of Object.entries(DATASETS)) {
  if (ONLY.length && !ONLY.includes(name)) continue;
  let text;
  try {
    text = await readFile(resolve(DIR, spec.file), "utf-8");
  } catch {
    console.error(`${name}: ${spec.file} not found in ${DIR} — skipping.`);
    continue;
  }
  const rows = spec.parse(text);
  console.error(`${name}: ${rows.length} rows parsed`);
  if (DRY) {
    console.error(`  sample: ${JSON.stringify(rows[0])}`);
    continue;
  }
  let inserted = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const batch = rows.slice(i, i + CHUNK);
    const res = await fetch(`${SUPABASE_URL}/functions/v1/ingest`, {
      method: "POST",
      headers: {
        apikey: ANON,
        Authorization: `Bearer ${ANON}`,
        "x-ingest-token": TOKEN,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ dataset: spec.dataset, rows: batch, replace: i === 0 }),
    });
    if (!res.ok) {
      console.error(`${name}: FAILED at row ${i} — HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
      process.exit(1);
    }
    inserted += (await res.json()).inserted ?? 0;
    console.error(`  loaded ${inserted}/${rows.length}`);
  }
  console.error(`${name}: ${inserted} rows loaded`);
}
