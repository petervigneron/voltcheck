// The fix for the actual meta-problem behind six lost nights: every check in
// this pipeline ran as a step with no output anyone saw unless they opened
// that run's logs — so a check that never executed (finalize cancelled at
// its time cap before reaching it) was indistinguishable, at a glance, from
// a check that ran and passed. Nothing else in the repo answered "did the
// price audit actually run last night?" without reading Action logs.
//
// scraper/registry/audit-status.json is the answer: a small, git-committed
// file (same pattern as registry.json/gm-warranty.json/vpic-cache.json —
// committed state a script updates and a workflow commits forward) recording
// the last time each named check ran and what it found. It is committed
// state on purpose, not a database table: it needs to be readable by a human
// looking at the repo (or its GitHub file view / blame) with zero setup, it
// changes at most a few times a day, and it must itself survive a night the
// database is unreachable — a table in the same fragile Supabase instance
// would go dark for exactly the failure this file exists to catch.
//
// A stale entry is exactly as loud as a failed one: audit-status-check.mjs
// (run on its own schedule in feed-audits.yml, independent of nightly.yml's
// fate) reads this file and alarms on any check whose lastRunAt is older
// than its own expectedEveryHours — silence must not read as success.
import { readFile, writeFile } from "node:fs/promises";

const DEFAULT_PATH = new URL("../registry/audit-status.json", import.meta.url);

export async function readStatus(path = DEFAULT_PATH) {
  try {
    return JSON.parse(await readFile(path, "utf-8"));
  } catch {
    return { _comment: "Written by scraper/lib/audit-status.mjs. Do not hand-edit — see that file's header.", checks: {} };
  }
}

/**
 * Record that a named check ran. Called by the check itself, right after it
 * finishes (success or failure alike — a recorded failure is still a record;
 * the thing this guards against is the check never running at all).
 *
 * @param name            stable id, e.g. "price-audit", "sync-guard"
 * @param result           "ok" | "warn" | "fail" | "inconclusive"
 * @param detail            short human-readable one-liner (no newlines)
 * @param expectedEveryHours  how often this check is supposed to run; the
 *                            staleness check in audit-status-check.mjs alarms
 *                            once lastRunAt is older than this
 */
export async function recordRun(name, { result, detail = "", expectedEveryHours }, path = DEFAULT_PATH) {
  if (!["ok", "warn", "fail", "inconclusive"].includes(result)) {
    throw new Error(`audit-status: invalid result "${result}" for check "${name}"`);
  }
  const status = await readStatus(path);
  status.checks ??= {};
  const prior = status.checks[name];
  status.checks[name] = {
    lastRunAt: new Date().toISOString(),
    result,
    detail,
    // Sticky: a run that forgets to pass it keeps whatever cadence was last
    // recorded rather than silently losing the staleness gate entirely.
    expectedEveryHours: expectedEveryHours ?? prior?.expectedEveryHours ?? 24,
  };
  await writeFile(path, JSON.stringify(status, null, 2) + "\n");
  return status.checks[name];
}
