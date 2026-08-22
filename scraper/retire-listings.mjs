#!/usr/bin/env node
// Retire listings that should never have been admitted (migration 0043).
//
//   node retire-listings.mjs <file.json> [--apply]
//
// The file is a JSON array of { vin, verdict, reason }, or an object with a
// `rows` array of the same — the shape audit-listings.mjs's --json output is
// adjudicated into. Only rows whose verdict is "remove" are acted on. Reason
// is not decoration: it is stored on the retired_listing row, and a VIN
// removed without one is a deletion nobody can later check.
//
// WHY THIS IS A SEPARATE SCRIPT AND NOT A FLAG ON THE AUDIT: the audit's
// verdict is "today's rules cannot vouch for this car", which is not the same
// claim as "this car does not belong on the site". vPIC decodes the BMW XM as
// plain Gasoline and the Polestar 1 as Strong HEV, and both are genuine
// plug-in hybrids — of the 308 rows the first complete audit refuted on
// 2026-08-22, 26 were cars vPIC is simply wrong about. Wiring the audit
// straight into a delete would have retired them. A human decides; this
// carries out the decision.
//
// Dry by default. --apply is the deliberate act.
import { readFile } from "node:fs/promises";

async function loadEnv(url) {
  try {
    for (const line of (await readFile(url, "utf-8")).split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (m && !line.trimStart().startsWith("#") && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch {} // no .env file is a supported state (CI supplies step env)
}
await loadEnv(new URL("./.env", import.meta.url));

const file = process.argv[2];
const APPLY = process.argv.includes("--apply");
if (!file) { console.error("usage: retire-listings.mjs <file.json> [--apply]"); process.exit(2); }

const parsed = JSON.parse(await readFile(file, "utf-8"));
const rows = (Array.isArray(parsed) ? parsed : parsed.rows ?? [])
  .filter((r) => r.verdict == null || r.verdict === "remove")
  .map((r) => ({
    vin: String(r.vin).toUpperCase(),
    reason: r.reason ?? "",
    // Stored alongside the payload on the retirement row (migration 0044), so
    // a reversal can see what the verdict was actually made on rather than
    // just that one was made.
    vpic: r.vpic ?? (r.vpicLevel || r.vpicTrim ? { level: r.vpicLevel ?? "", trim: r.vpicTrim ?? "" } : null),
  }));
const missing = rows.filter((r) => !r.reason);
if (missing.length) {
  console.error(`retire: ${missing.length} row(s) carry no reason — refusing. A deletion nobody can check is not one worth making.`);
  process.exit(2);
}
console.error(`retire: ${rows.length} listing(s) to retire`);
const byReason = new Map();
for (const r of rows) byReason.set(r.reason, (byReason.get(r.reason) ?? 0) + 1);
for (const [reason, n] of [...byReason].sort((a, b) => b[1] - a[1])) console.error(`  ${String(n).padStart(4)}  ${reason.slice(0, 150)}`);

if (!APPLY) { console.error("\nretire: dry run — pass --apply to carry it out."); process.exit(0); }

const { SUPABASE_URL, SUPABASE_ANON_KEY: ANON, SUPABASE_INGEST_TOKEN: TOKEN } = process.env;
if (!SUPABASE_URL || !ANON || !TOKEN) { console.error("retire: no Supabase credentials"); process.exit(1); }

const res = await fetch(`${SUPABASE_URL}/functions/v1/ingest`, {
  method: "POST",
  headers: {
    apikey: ANON,
    Authorization: `Bearer ${ANON}`,
    "x-ingest-token": TOKEN,
    "x-ingest-rpc": "retire_misclassified_listings",
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ _rows: rows }),
});
const text = await res.text();
if (!res.ok) { console.error(`retire: HTTP ${res.status} ${text}`); process.exit(1); }
const out = JSON.parse(text);
if (out.refused) { console.error(`retire: REFUSED — ${out.refused}`); process.exit(1); }
console.error(`retire: asked ${out.asked}, removed ${out.removed}`);
