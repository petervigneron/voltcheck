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

/**
 * Merge two readings of this file, newest-wins per check.
 *
 * WHY: this file has more than one writer — nightly.yml records price-audit
 * and sync-guard, feed-audits.yml records four more on its own 6-hourly
 * schedule — and each writes the WHOLE file from its own runner's checkout.
 * Replayed as a git diff that is a conflict waiting to happen, and a rebase
 * conflict here is not a delay, it is data loss: the commit step aborts,
 * retries into the same conflict, and drops the record entirely.
 *
 * Merging by check name instead of by text makes concurrent writers safe by
 * construction. Two runs that recorded different checks both keep theirs; two
 * runs that recorded the SAME check keep the later reading, which is the one
 * a staleness test wants. Nothing here is additive-only or lossy-by-timing,
 * so it does not matter which side is "ours".
 *
 * An entry with no parseable lastRunAt loses to one that has it — a malformed
 * record must never shadow a real run and make a live check look dead.
 */
export function mergeStatus(a, b) {
  const at = (e) => {
    const t = Date.parse(e?.lastRunAt ?? "");
    return Number.isFinite(t) ? t : -Infinity;
  };
  const out = {
    _comment: a?._comment ?? b?._comment,
    checks: { ...(b?.checks ?? {}) },
  };
  for (const [name, entry] of Object.entries(a?.checks ?? {})) {
    const rival = out.checks[name];
    if (rival === undefined || at(entry) >= at(rival)) out.checks[name] = entry;
  }
  // lastGoodCounts is sync-guard's own single-writer record; it carries its
  // own timestamp, so it merges on the same rule rather than by position.
  const counts = [a?.lastGoodCounts, b?.lastGoodCounts].filter(Boolean);
  if (counts.length) {
    counts.sort((x, y) => Date.parse(y.at ?? "") - Date.parse(x.at ?? ""));
    out.lastGoodCounts = counts[0];
  }
  return out;
}

export function serializeStatus(status) {
  return JSON.stringify(status, null, 2) + "\n";
}
