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
// vouch for it — an EV-only WMI, or a BEV/plug-in nameplate (nameplateVouches). Those
// that neither vouches for were admitted through some path we cannot re-check
// from stored data (a dealer's fuel-type text, an OEM facet), so they are put
// to vPIC, the same free federal decoder the ingest lane already trusts.
// Only an AFFIRMATIVE refutation counts: a blank decode proves nothing and
// must never retire a real EV.
//
// It reports and exits; it does not delete. Removing production rows is a
// deliberate act, and the report gives the exact VIN list to do it with.
// Exit 0 = clean, 10 = refuted rows found (so the nightly can shout).
import { readdir, readFile, writeFile } from "node:fs/promises";
import { EV_ONLY_WMIS, nameplateVouches, vpicRefutesEv } from "./lib/ev.mjs";
import { recordRun } from "./lib/audit-status.mjs";
import { fetchWithRetry } from "./lib/retry.mjs";

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

// Page through live listings, KEYSET (`vin=gt.`) rather than Range/OFFSET.
// Selecting only what the rules need was the earlier half of keeping this off
// the anon statement timeout, and it bought time rather than fixing anything:
// a narrower select makes each row cheaper, but OFFSET still makes the
// database produce and discard every row ahead of the one asked for, so the
// cost keeps climbing with inventory and trips the timeout again at some
// larger row count. recheck.mjs hit exactly that on 2026-08-23 at row 96,000
// (18,538 ms for one page, against anon's 3s); see the note there for the
// measurements. Keyset costs the same at row 96,000 as at row 0.
// fetchWithRetry, not bare fetch — this walk is in lib/retry.mjs's documented
// domino class (each Supabase-talking script fails in turn on the recovery
// windows), and its own HTTP 500 on 2026-08-23 18:50 was one. Page size stays
// 1000: measured 2026-08-24, steady-state pages run well under 1.5s; only the
// cold first request spiked, and that is a transient the retry covers.
const rows = [];
for (let after = ""; ; ) {
  const res = await fetchWithRetry(`audit: listing page after ${after || "start"}`, () =>
    fetch(
      `${SUPABASE_URL}/rest/v1/listings?select=vin,year,make,model,payload->>trim&delisted_at=is.null` +
        (after ? `&vin=gt.${encodeURIComponent(after)}` : "") +
        `&order=vin.asc&limit=1000`,
      { headers: H }
    )
  );
  if (!res.ok) { console.error(`audit: listing fetch failed HTTP ${res.status}`); await finish(1, "fail", `listing fetch failed HTTP ${res.status}`); }
  const page = await res.json();
  if (!Array.isArray(page) || !page.length) break;
  rows.push(...page);
  if (page.length < 1000 || (LIMIT && rows.length >= LIMIT)) break;
  after = page[page.length - 1].vin;
}
const live = LIMIT ? rows.slice(0, LIMIT) : rows;
console.error(`audit: ${live.length} live listings`);

// Which rows can today's rules still vouch for, without asking anyone? The
// nameplate test is the SAME predicate ingest's gate uses (lib/ev.mjs
// nameplateVouches: EV_MODEL_RE plus the year-gated plug-in nameplates), on
// purpose — an audit that vouched more narrowly than ingest would re-refute
// every night the plug-ins vPIC is wrong about (XM, S 580e, Polestar 1) that
// ingest admits on nameplate + fuel text.
const vouched = (r) => {
  const vin = String(r.vin ?? "").toUpperCase();
  if (vin.length === 17 && EV_ONLY_WMIS.has(vin.slice(0, 3))) return "wmi";
  if (nameplateVouches(r)) return "nameplate";
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

// Affirmative refutation only — and literally the same function vpic-enrich's
// demotion path calls (lib/ev.mjs), deliberately: an audit that judged more
// harshly than ingest would retire cars ingest would happily admit tomorrow.
const refutes = vpicRefutesEv;

// Cars a human has already looked at and kept. 26 live listings are refuted by
// vPIC and belong here anyway — it decodes the BMW XM as plain "Gasoline" and
// the Polestar 1 as "Strong HEV", and both are plug-in hybrids. Without this
// the audit would report the same 26 every night forever, and a check that
// cries wolf nightly is a check nobody reads, which is how it came to have
// never run at all. They are still printed, just under "settled" rather than
// as a finding, and a NEW refutation is what makes this exit non-zero.
//
// Every registry/ev-rules-audit-*.json is read and unioned, so a later
// adjudication adds a file rather than editing one — append-only, like the
// migrations. A missing or unreadable file means nothing is excluded, which is
// the loud direction.
const settled = new Map();
try {
  const dir = new URL("./registry/", import.meta.url);
  for (const f of (await readdir(dir)).filter((f) => /^ev-rules-audit-.*\.json$/.test(f))) {
    try {
      const doc = JSON.parse(await readFile(new URL(f, dir), "utf-8"));
      for (const r of doc.rows ?? []) if (r.verdict === "keep" && r.vin) settled.set(String(r.vin).toUpperCase(), r.reason ?? "");
    } catch (e) { console.error(`audit: ${f} unreadable (${e.message}) — nothing excluded from it`); }
  }
} catch { /* no registry dir is not a state worth failing on */ }

const bad = [];
const known = [];
let undecided = 0;
for (const row of unvouched) {
  const d = byVin.get(String(row.vin).toUpperCase());
  if (!d) { undecided++; continue; }
  if (refutes(d)) (settled.has(String(row.vin).toUpperCase()) ? known : bad).push({
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

if (known.length) {
  console.error(`\naudit: ${known.length} refuted listing(s) already adjudicated and KEPT — vPIC is wrong about these, not the feed:`);
  const byReason = new Map();
  for (const k of known) byReason.set(settled.get(k.vin.toUpperCase()), (byReason.get(settled.get(k.vin.toUpperCase())) ?? 0) + 1);
  for (const [reason, n] of [...byReason].sort((a, b) => b[1] - a[1])) console.error(`  ${String(n).padStart(4)}  ${String(reason).slice(0, 120)}`);
}
console.error(`\naudit: ${bad.length} live listings are NOT electric by vPIC (${undecided} undecided — left alone, ${known.length} already adjudicated)`);
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
await finish(bad.length ? 10 : 0, bad.length ? "warn" : "ok", `${live.length} live, ${bad.length} newly refuted by vPIC, ${known.length} adjudicated-and-kept, ${undecided} undecided`);
