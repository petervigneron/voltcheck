#!/usr/bin/env node
// Post-sync listing-count regression alarm — run right after "Sync to
// Supabase" in nightly.yml's finalize-ingest job, gating the revalidate step
// that follows it exactly the way db-sync's own outcome already does.
//
// WHY: six straight nights (2026-08-18..21) finalize was cancelled at its
// time cap before any of the pipeline's audits ran, and nothing anywhere
// said so — a lost night looked exactly like a quiet one. Then, the night
// this was being built, a manual salvage sync dropped the reported live
// count from 87,082 to 58,741 (~28k rows) and nothing automated noticed; a
// human found it by curling the API. This script is the alarm for that
// specific failure shape: a listing-count regression, checked before it's
// warmed into the CDN cache shoppers actually hit.
//
// It does two things ONLY — it alarms, it never acts:
//   - reads the live count, GLOBAL and per LANE (scraper/lib/oem-lane-domains.mjs
//     splits national OEM-locator pulls from crawled dealer rooftops),
//     TWICE a short pause apart, and refuses to judge a read that isn't
//     stable between those two samples (lib/sync-guard-logic.mjs's
//     isStable) — because the 2026-08-21 incident was exactly a read taken
//     mid-write, and the correct response to that was to wait, not to act.
//     A naive single-sample check cannot tell "the data really changed"
//     apart from "I read it while someone was still writing it"; this can.
//   - compares a STABLE read against the last known-good counts recorded in
//     registry/audit-status.json and reports ok/warn/fail per
//     lib/sync-guard-logic.mjs's thresholds (justified there from this
//     pipeline's own logged history).
//
// It NEVER re-runs db-sync, never forces a revalidate, never deletes or
// restores anything, and never retries beyond its own two fixed samples —
// an automatic "keep sampling until it looks fine" loop would just be a
// slower way of doing the same wrong thing an automatic re-sync would do.
// A fail or an inconclusive read both mean the same thing operationally:
// don't warm the cache, tell a human, stop.
//
//   node sync-guard.mjs [--stability-wait-ms 20000]
//
// Exit 0  = stable and within threshold (ok or warn — warn does not block).
// Exit 1  = stable read shows a FAIL-level regression, global or lane.
// Exit 2  = could not get a stable read (two samples disagreed) — treated
//           the same as a fail by the workflow gate: do not warm the cache.
// Exit 0 (with a loud warning) if Supabase credentials are absent — same
//           "can't check, so don't pretend to have passed" posture as the
//           audits already have (this only ever runs where db-sync also ran).
import { readFile } from "node:fs/promises";
import { fetchWithRetry } from "./lib/retry.mjs";
import { OEM_LOCATOR_DOMAINS } from "./lib/oem-lane-domains.mjs";
import { THRESHOLDS, isStable, verdictFor, worstLevel } from "./lib/sync-guard-logic.mjs";
import { recordRun, readStatus } from "./lib/audit-status.mjs";
import { writeFile } from "node:fs/promises";

for (const line of (await readFile(new URL("./.env", import.meta.url), "utf-8").catch(() => "")).split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
  if (m && !line.trimStart().startsWith("#") && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const { SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY } = process.env;
const KEY = SUPABASE_ANON_KEY || SUPABASE_SERVICE_ROLE_KEY;

const arg = (n, d) => { const i = process.argv.indexOf(n); return i >= 0 ? Number(process.argv[i + 1]) : d; };
const STABILITY_WAIT_MS = arg("--stability-wait-ms", 20_000);

if (!SUPABASE_URL || !KEY) {
  console.error("sync-guard: no Supabase credentials — cannot check the live count. Not alarming (nothing to compare), but recording that this check did not actually run.");
  await recordRun("sync-guard", { result: "inconclusive", detail: "no Supabase credentials", expectedEveryHours: 27 });
  process.exit(0);
}

async function liveCount(domains) {
  const filter = domains ? `&dealer_domain=in.(${domains.map(encodeURIComponent).join(",")})` : "";
  const res = await fetchWithRetry(`sync-guard: live count (${domains ? domains.length + " domains" : "total"})`, () =>
    fetch(`${SUPABASE_URL}/rest/v1/listings?select=vin&delisted_at=is.null${filter}`, {
      headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, Range: "0-0", Prefer: "count=exact" },
    })
  );
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const n = Number(res.headers.get("content-range")?.split("/")[1]);
  if (!Number.isFinite(n)) throw new Error("count missing from content-range header");
  return n;
}

async function sample() {
  const total = await liveCount(null);
  const oem = await liveCount([...OEM_LOCATOR_DOMAINS]);
  return { total, oem, dealer: total - oem };
}

let a, b;
try {
  a = await sample();
  await new Promise((r) => setTimeout(r, STABILITY_WAIT_MS));
  b = await sample();
} catch (e) {
  console.error(`sync-guard: could not read the live count (${e.message}) — cannot check tonight's total.`);
  await recordRun("sync-guard", { result: "inconclusive", detail: `read failed: ${e.message}`, expectedEveryHours: 27 });
  process.exit(2);
}

const stable = isStable(a.total, b.total) && isStable(a.oem, b.oem) && isStable(a.dealer, b.dealer);
if (!stable) {
  console.error(
    `sync-guard: UNSTABLE READ — total ${a.total} then ${b.total} (${STABILITY_WAIT_MS}ms apart). The database is ` +
    "still being written to (this run's own sync, or something else). Not judging this as pass or fail — a write " +
    "in progress is exactly the 2026-08-21 incident's shape. Not warming the cache; re-run this check once the " +
    "write you know about has finished, or investigate what else is writing."
  );
  await recordRun("sync-guard", {
    result: "inconclusive",
    detail: `unstable read: total ${a.total} -> ${b.total}`,
    expectedEveryHours: 27,
  });
  process.exit(2);
}
const cur = b; // the later of the two agreeing samples

const status = await readStatus();
const prev = status.lastGoodCounts ?? null;

const verdicts = {
  total: verdictFor(prev?.total, cur.total, THRESHOLDS.globalWarnDrop, THRESHOLDS.globalFailDrop),
  oem: verdictFor(prev?.oem, cur.oem, THRESHOLDS.laneWarnDrop, THRESHOLDS.laneFailDrop),
  dealer: verdictFor(prev?.dealer, cur.dealer, THRESHOLDS.laneWarnDrop, THRESHOLDS.laneFailDrop),
};
const level = worstLevel(Object.values(verdicts).map((v) => v.level));

console.log(`sync-guard: live count — total ${cur.total} (was ${prev?.total ?? "unknown"}), oem ${cur.oem} (was ${prev?.oem ?? "unknown"}), dealer ${cur.dealer} (was ${prev?.dealer ?? "unknown"})`);
for (const [k, v] of Object.entries(verdicts)) {
  console.log(`  ${k}: ${v.level.toUpperCase()} — ${v.reason}`);
  if (v.level !== "ok") console.log(`::${v.level === "fail" ? "error" : "warning"}::sync-guard: ${k} lane ${v.reason}`);
}

// Record this run's stable counts as tomorrow's baseline REGARDLESS of the
// verdict — a fail here is often a real regression that then gets corrected
// by a human; freezing the baseline at the last-good number would make the
// NEXT correct night look like a suspicious jump back up. What matters is
// that today's fail/warn is loud right now, which the exit code + ::error::
// annotations above already are.
status.lastGoodCounts = { ...cur, at: new Date().toISOString() };
await writeFile(new URL("./registry/audit-status.json", import.meta.url), JSON.stringify(status, null, 2) + "\n");

// Also fold in db-sync's own delisting-rate figures if this run's
// out/sync-totals.json is present (written by db-sync.mjs right before this
// script runs) — not required for the verdict above, but worth surfacing in
// the same recorded detail line so a human reading audit-status.json sees
// both signals together.
let delistDetail = "";
try {
  const syncTotals = JSON.parse(await readFile(new URL("./out/sync-totals.json", import.meta.url), "utf-8"));
  const t = syncTotals.totals;
  delistDetail = ` | tonight's sync: ${t.seen} seen, ${t.delisted} delisted (${t.seen ? ((100 * t.delisted) / t.seen).toFixed(1) : "0"}%)`;
  const refused = Object.entries(syncTotals.laneReport ?? {}).filter(([, v]) => v?.refused);
  if (refused.length) delistDetail += `; REFUSED to delist: ${refused.map(([lane]) => lane).join(", ")}`;
} catch {
  // sync-totals.json is best-effort; its absence just means a slightly
  // shorter status line, not a failure of this check.
}

await recordRun("sync-guard", {
  result: level,
  detail: `total ${cur.total}, oem ${cur.oem}, dealer ${cur.dealer}${delistDetail}`,
  expectedEveryHours: 27,
});

if (level === "fail") {
  console.error("sync-guard: FAIL — a live-count regression beyond the fail threshold. Not warming the cache.");
  process.exit(1);
}
if (level === "warn") {
  console.error("sync-guard: WARN — a live-count drop worth a human's attention, below the fail threshold. Proceeding.");
}
process.exit(0);
