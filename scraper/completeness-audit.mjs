#!/usr/bin/env node
// Which live listings are missing the facts a shopper needs, grouped by the
// dealer they came from — the report that turns "a human noticed one empty
// page" into "here are the 200 lots whose odometer we never captured".
//
//   node completeness-audit.mjs [--limit N] [--max-broken-dealers N] [--json]
//
// WHY THIS EXISTS: ingest admits a listing on a VIN, a price and a photo, and
// nothing downstream ever asks whether the rest of the record is actually
// there. A used car with no mileage still renders — it just shows a price and
// a blank where the odometer belongs, which reads as a low-mileage car, not a
// missing fact. So a whole dealer's inventory can lose its mileage the day its
// platform changes a class name, and the only detector is someone opening one
// of its listings and noticing (that is exactly how a jimshorkey.com F-150
// Lightning — 6 of 6 of that lot's used cars with null mileage — was found).
//
// A single missing odometer is noise; a DEALER at 100% null is a broken
// parser. So this aggregates by dealer_domain and shouts about the pattern,
// not the row: a lot with >= MIN_USED used/certified cars and >= 90% of them
// missing mileage is a platform we're not reading. Run today it finds 202 such
// lots (2,069 cars) — most of them, like jimshorkey, DealerOn storefronts
// whose VDPs reached us through the generic extractor before the DealerOn
// odometer parse existed. The fix is a per-platform parser, and this names the
// worklist by dealer so the clusters are visible.
//
// It reports; it does not edit. And it ratchets: 202 broken lots exist the day
// it's born, so the gate is "no MORE than the committed baseline", not zero —
// a NEW lot going dark turns it red, the backlog doesn't. Lower
// --max-broken-dealers as parsers land; never raise it to hide a regression.
// Exit 0 = at or under baseline, 10 = over (so the nightly can shout).
import { readFile } from "node:fs/promises";
import { recordRun } from "./lib/audit-status.mjs";

const arg = (n, d) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : d; };
const LIMIT = Number(arg("--limit", 0));
const BASELINE = Number(arg("--max-broken-dealers", 0));
const AS_JSON = process.argv.includes("--json");

async function finish(code, result, detail) {
  await recordRun("completeness-audit", { result, detail, expectedEveryHours: 27 });
  process.exit(code);
}

// A lot needs this many used/certified cars before its null-mileage RATE means
// anything — one used car with no odometer is not evidence of a broken parser.
const MIN_USED = 5;
// At or above this share missing, the lot is not unlucky, it's unread.
const BROKEN_AT = 0.9;

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
if (!SUPABASE_URL || !ANON) { console.error("completeness-audit: no Supabase credentials"); await finish(0, "inconclusive", "no Supabase credentials"); }
const H = { apikey: ANON, Authorization: `Bearer ${ANON}` };

// Page through live used/certified listings — only the columns the checks
// need, to stay off the anon statement timeout (same discipline as
// audit-listings.mjs). New cars legitimately have no odometer, so they are out
// of scope; this is a used-car completeness check.
//
// trimSuspect is read off `payload`, not `payload_public`: since 0042 the
// generated column is NULL for the 84% of listings that never had a
// description to strip, and reading it here would have quietly reported
// almost no contradicted trims. The two carry the same trimSuspect either
// way, and the extraction happens server-side, so no description crosses the
// wire.
const rows = [];
for (let from = 0; ; from += 1000) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/listings?select=dealer_domain,mileage,state,condition,susp:payload->>trimSuspect` +
      `&delisted_at=is.null&condition=in.(used,certified)&order=dealer_domain.asc`,
    { headers: { ...H, Range: `${from}-${from + 999}` } }
  );
  if (!res.ok) { console.error(`completeness-audit: fetch failed HTTP ${res.status}`); await finish(1, "fail", `fetch failed HTTP ${res.status}`); }
  const page = await res.json();
  if (!Array.isArray(page) || !page.length) break;
  rows.push(...page);
  if (page.length < 1000 || (LIMIT && rows.length >= LIMIT)) break;
}
const live = LIMIT ? rows.slice(0, LIMIT) : rows;

// Site-wide shape.
const nullMi = live.filter((r) => r.mileage == null).length;
const nullState = live.filter((r) => r.state == null).length;
const contradicted = live.filter((r) => r.susp != null).length;

// Per-dealer aggregate.
const byDealer = new Map();
for (const r of live) {
  const k = r.dealer_domain ?? "(none)";
  const d = byDealer.get(k) ?? { domain: k, used: 0, nullMi: 0 };
  d.used++;
  if (r.mileage == null) d.nullMi++;
  byDealer.set(k, d);
}
const broken = [...byDealer.values()]
  .filter((d) => d.used >= MIN_USED && d.nullMi / d.used >= BROKEN_AT)
  .sort((a, b) => b.nullMi - a.nullMi);
const carsInBroken = broken.reduce((s, d) => s + d.nullMi, 0);

if (AS_JSON) {
  console.log(JSON.stringify({
    live: live.length, nullMi, nullState, contradicted,
    brokenDealers: broken.length, carsInBroken,
    broken: broken.map((d) => ({ domain: d.domain, used: d.used, nullMi: d.nullMi })),
  }, null, 2));
  await finish(broken.length > BASELINE ? 10 : 0, broken.length > BASELINE ? "warn" : "ok", `${live.length} live, ${broken.length} broken-parser lots (baseline ${BASELINE})`);
}

console.log(`Listing completeness — ${live.length} live used/certified listings\n`);
console.log(`  no mileage:        ${nullMi} (${pct(nullMi, live.length)}%)`);
console.log(`  no location:       ${nullState} (${pct(nullState, live.length)}%)`);
console.log(`  contradicted trim: ${contradicted} (${pct(contradicted, live.length)}%)`);
console.log(`\nBroken-parser lots (>=${MIN_USED} used cars, >=${BROKEN_AT * 100}% missing mileage): ${broken.length}`);
console.log(`Cars hidden behind them: ${carsInBroken}\n`);
for (const d of broken.slice(0, 40)) {
  console.log(`  ${d.domain.padEnd(42)} ${d.nullMi}/${d.used} used cars have no mileage`);
}
if (broken.length > 40) console.log(`  … and ${broken.length - 40} more lots`);

const failed = broken.length > BASELINE;
console.log(`\n${failed ? "FAIL" : "OK"} — ${broken.length} broken-parser lots (baseline ${BASELINE})`);
if (failed) console.log(`  ${broken.length - BASELINE} more than the committed baseline — a lot's mileage capture regressed.`);
await finish(failed ? 10 : 0, failed ? "warn" : "ok", `${live.length} live, ${broken.length} broken-parser lots (baseline ${BASELINE})`);

function pct(n, d) { return d ? Math.round((1000 * n) / d) / 10 : 0; }
