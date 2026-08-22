#!/usr/bin/env node
// Re-judge every live listing against today's classification rules.
//
//   node audit-listings.mjs [--limit N] [--write-vins <file>] [--json <file>]
//
// WHY THIS EXISTS: ingest admits a car once, and nothing ever revisits that
// decision. When a classification rule changes, listings already in the table
// keep whatever verdict they were admitted under — and recheck will not
// retire them, because recheck asks "is it still for sale?", not "should it
// ever have been here?". A car that is genuinely on a dealer's lot answers
// yes forever.
//
// That gap put six plug-in-hybrid Polestar 1s on the site, one at $157,049,
// and they would have stayed indefinitely: EV_ONLY_WMIS had trusted their
// WMI, and removing it (2026-08-18) stopped new ones being admitted without
// touching the six already there. Two of the six also escaped a hand-written
// query because their model read "Polestar 1" rather than "1" — which is the
// argument for auditing by rule rather than by anyone's ad-hoc WHERE clause.
//
// WHAT IT DOES: for each live listing, ask whether TODAY's rules can still
// vouch for it — an EV-only WMI, or a nameplate matching EV_MODEL_RE. Those
// that neither vouches for were admitted through some path we cannot re-check
// from stored data (a dealer's fuel-type text, an OEM facet), so they are put
// to vPIC, the same free federal decoder the ingest lane already trusts.
// Only an AFFIRMATIVE refutation counts: a blank decode proves nothing and
// must never retire a real EV.
//
// It reports and exits; it does not delete. Removing production rows is a
// deliberate act, and the report gives the exact VIN list to do it with.
// Exit 0 = clean, 10 = refuted rows found (so the nightly can shout).
import { readFile, writeFile } from "node:fs/promises";
import { EV_MODEL_RE, EV_ONLY_WMIS } from "./lib/ev.mjs";
import { recordRun } from "./lib/audit-status.mjs";

const arg = (n, d) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : d; };
const LIMIT = Number(arg("--limit", 0));
const VIN_OUT = arg("--write-vins", null);
// The console report prints the first 40 refuted rows and counts the rest.
// That is the right shape for a nightly log and the wrong shape for acting on
// the list: the 2026-08-22 run reported 320 rows and showed 40 of them, and
// the 280 it elided were not the same KIND of row as the 40 it showed (real
// plug-in hybrids vPIC mislabels are mixed in among genuine non-EVs, and
// neither group clusters). --json writes every refuted row with the vPIC
// fields the verdict was made on, so the judgement can be made off the whole
// list instead of a sample of it.
const JSON_OUT = arg("--json", null);

async function finish(code, result, detail) {
  await recordRun("ev-rules-audit", { result, detail, expectedEveryHours: 27 });
  process.exit(code);
}

// Wrapped, because NO .env FILE IS A SUPPORTED STATE — it is in fact the
// normal state on CI, where the workflow supplies SUPABASE_URL and
// SUPABASE_ANON_KEY as step env instead. Unwrapped, this threw
// ENOENT .../scraper/.env on every GitHub run and killed the script before
// the credential check below could do its job, so this audit had NEVER once
// run in CI while appearing scheduled — the feed-audits lane was red from
// 2026-08-21 for exactly this. Same guard colisting-sync.mjs, db-sync.mjs and
// seven others already carry; these two were the odd ones out.
try {
  for (const line of (await readFile(new URL("./.env", import.meta.url), "utf-8")).split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !line.trimStart().startsWith("#") && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
} catch {}
const { SUPABASE_URL, SUPABASE_ANON_KEY: ANON } = process.env;
if (!SUPABASE_URL || !ANON) { console.error("audit: no Supabase credentials"); await finish(0, "inconclusive", "no Supabase credentials"); }
const H = { apikey: ANON, Authorization: `Bearer ${ANON}` };

// Page through live listings. Selecting only what the rules need keeps this
// off the 8s anon statement timeout that a wide scan now trips at 81k rows.
const rows = [];
for (let from = 0; ; from += 1000) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/listings?select=vin,year,make,model,payload->>trim&delisted_at=is.null&order=vin.asc`,
    { headers: { ...H, Range: `${from}-${from + 999}` } }
  );
  if (!res.ok) { console.error(`audit: listing fetch failed HTTP ${res.status}`); await finish(1, "fail", `listing fetch failed HTTP ${res.status}`); }
  const page = await res.json();
  if (!Array.isArray(page) || !page.length) break;
  rows.push(...page);
  if (page.length < 1000 || (LIMIT && rows.length >= LIMIT)) break;
}
const live = LIMIT ? rows.slice(0, LIMIT) : rows;
console.error(`audit: ${live.length} live listings`);

// Which rows can today's rules still vouch for, without asking anyone?
const vouched = (r) => {
  const vin = String(r.vin ?? "").toUpperCase();
  if (vin.length === 17 && EV_ONLY_WMIS.has(vin.slice(0, 3))) return "wmi";
  if (EV_MODEL_RE.test([r.model, r.make, r.trim].filter(Boolean).join(" "))) return "nameplate";
  return null;
};
const unvouched = live.filter((r) => !vouched(r) && String(r.vin ?? "").length === 17);
console.error(`audit: ${live.length - unvouched.length} vouched by WMI or nameplate, ${unvouched.length} need vPIC`);
if (!unvouched.length) { console.error("audit: clean"); await finish(0, "ok", `${live.length} live, all vouched by WMI or nameplate`); }

// Same decoder, same batch size and courtesy pause as vpic-enrich.mjs.
const byVin = new Map();
for (let i = 0; i < unvouched.length; i += 50) {
  const batch = unvouched.slice(i, i + 50).map((r) => r.vin);
  try {
    const res = await fetch("https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValuesBatch/", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: `DATA=${encodeURIComponent(batch.join(";"))}&format=json`,
    });
    if (res.ok) for (const r of (await res.json()).Results ?? []) if (r.VIN) byVin.set(r.VIN.toUpperCase(), r);
  } catch { /* a failed batch leaves those VINs unjudged, which is the safe direction */ }
  if (i % 1000 === 0) console.error(`  vPIC ${i}/${unvouched.length}`);
  await new Promise((r) => setTimeout(r, 400));
}

// Affirmative refutation only — identical logic to vpic-enrich's demotion
// path, deliberately: an audit that judged more harshly than ingest would
// retire cars ingest would happily admit tomorrow.
const refutes = (r) => {
  const level = String(r.ElectrificationLevel ?? "");
  if (/phev|plug|bev|battery electric/i.test(level)) return false;
  if (/hev|hybrid|mild/i.test(level)) return true;
  const fuels = `${r.FuelTypePrimary ?? ""} ${r.FuelTypeSecondary ?? ""}`;
  return /gasoline|diesel|flex|e85/i.test(fuels) && !/electric/i.test(fuels);
};

const bad = [];
let undecided = 0;
for (const row of unvouched) {
  const d = byVin.get(String(row.vin).toUpperCase());
  if (!d) { undecided++; continue; }
  if (refutes(d)) bad.push({
    ...row,
    level: d.ElectrificationLevel,
    fuel: `${d.FuelTypePrimary ?? ""}${d.FuelTypeSecondary ? "/" + d.FuelTypeSecondary : ""}`,
    // Kept separate from the display string above: a judgement about whether
    // vPIC is RIGHT has to read the raw fields, not a formatted summary.
    vpic: {
      ElectrificationLevel: d.ElectrificationLevel ?? "",
      FuelTypePrimary: d.FuelTypePrimary ?? "",
      FuelTypeSecondary: d.FuelTypeSecondary ?? "",
      Series: d.Series ?? "",
      Trim: d.Trim ?? "",
      Make: d.Make ?? "",
    },
  });
}

console.error(`\naudit: ${bad.length} live listings are NOT electric by vPIC (${undecided} undecided — left alone)`);
for (const b of bad.slice(0, 40)) {
  console.error(`  ${b.vin}  ${b.year} ${b.make} ${b.model}${b.trim ? " " + b.trim : ""}  [${b.level || b.fuel}]`);
}
if (bad.length > 40) console.error(`  … and ${bad.length - 40} more`);

if (JSON_OUT) {
  await writeFile(JSON_OUT, JSON.stringify({ live: live.length, unvouched: unvouched.length, undecided, refuted: bad }, null, 2));
  console.error(`\naudit: ${bad.length} refuted row(s) written to ${JSON_OUT}`);
}

if (VIN_OUT && bad.length) {
  await writeFile(VIN_OUT, bad.map((b) => b.vin).join("\n"));
  console.error(`\naudit: VINs written to ${VIN_OUT}`);
}
await finish(bad.length ? 10 : 0, bad.length ? "warn" : "ok", `${live.length} live, ${bad.length} refuted by vPIC, ${undecided} undecided`);
