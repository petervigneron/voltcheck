#!/usr/bin/env node
// Reads scraper/registry/audit-status.json and alarms on any check whose
// lastRunAt is older than its own expectedEveryHours.
//
// THIS is the fix for the actual bug report ("why do previously-promised
// audits not seem to be running"): finalize being cancelled at its time cap
// six nights running left every downstream audit silently un-run, and
// nothing anywhere said so — a green run of an earlier job read exactly like
// a passed audit. This script is deliberately the one piece of the whole
// system that does NOT read Supabase, does NOT read a crawl artifact, and
// does NOT depend on anything the nightly pipeline produced tonight: it reads
// one committed JSON file and does arithmetic on timestamps. It is meant to
// run in feed-audits.yml, on that workflow's own schedule, independent of
// whether nightly.yml's jobs even started — so a dead pipeline still gets
// caught by something.
//
//   node audit-status-check.mjs [--json]
//
// Exit 0 = every recorded check is within its expected cadence.
// Exit 10 = at least one check is stale (or has never run at all).
import { readStatus } from "./lib/audit-status.mjs";

const AS_JSON = process.argv.includes("--json");
const status = await readStatus();
const checks = status.checks ?? {};
const names = Object.keys(checks).sort();
const now = Date.now();

const rows = names.map((name) => {
  const c = checks[name];
  const ageHours = (now - Date.parse(c.lastRunAt)) / 3_600_000;
  const stale = ageHours > c.expectedEveryHours;
  return { name, ...c, ageHours: Math.round(ageHours * 10) / 10, stale };
});

// A check with NO recorded run ever is the same alarm as a stale one — it
// means either nothing wired it up yet, or the very first attempt never
// completed. Report it, don't silently skip it: it should show up the moment
// someone adds a check's name to the expected set below without also making
// it record a run.
const EXPECTED = [
  "sync-guard",
  "price-audit",
  "ev-rules-audit",
  "completeness-audit",
  "colisting-sync",
  "feed-shard-health",
];
for (const name of EXPECTED) {
  if (!(name in checks)) rows.push({ name, lastRunAt: null, result: "never-run", detail: "", expectedEveryHours: null, ageHours: Infinity, stale: true });
}
rows.sort((a, b) => a.name.localeCompare(b.name));

const staleRows = rows.filter((r) => r.stale);

if (AS_JSON) {
  console.log(JSON.stringify({ checks: rows, stale: staleRows.length }, null, 2));
  process.exit(staleRows.length ? 10 : 0);
}

console.log("Audit liveness — scraper/registry/audit-status.json\n");
for (const r of rows) {
  const age = r.lastRunAt ? `${r.ageHours}h ago (expected every ${r.expectedEveryHours}h)` : "NEVER RECORDED";
  console.log(`  ${r.stale ? "STALE" : "ok   "}  ${r.name.padEnd(20)} ${r.result.padEnd(13)} ${age}${r.detail ? " — " + r.detail : ""}`);
}

if (staleRows.length) {
  console.log(`\nFAIL — ${staleRows.length} of ${rows.length} checks are stale or have never run:`);
  for (const r of staleRows) {
    console.log(`::error::audit-status-check: "${r.name}" ${r.lastRunAt ? `last ran ${r.ageHours}h ago, expected every ${r.expectedEveryHours}h` : "has never recorded a run"} — its checks may not be happening at all`);
  }
  process.exit(10);
}
console.log(`\nOK — ${rows.length} checks all within their expected cadence`);
