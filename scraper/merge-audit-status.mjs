#!/usr/bin/env node
// Fold this run's own audit records back into registry/audit-status.json
// after the working copy has been reset to the current remote tip.
//
//   node merge-audit-status.mjs --mine <saved-copy.json>
//
// WHY THIS EXISTS
//
// audit-status.json is the file that answers "did each check actually run?",
// and it had never once carried an answer for price-audit or colisting-sync.
// Not because they weren't running — the 2026-08-23 nightly artifact shows
// price-audit recording "9 flagged" at 16:48 — but because the commit that
// would have published that record never landed.
//
// nightly.yml staged this file in the same commit as registry.json,
// gm-warranty.json and vpic-cache.json. Those are large, high-churn caches
// that rolling-crawl.yml (32 commits on 2026-08-23 alone) and discover.yml
// rewrite constantly, so the rebase in that step's retry loop hits a CONTENT
// conflict on them. A content conflict is not a race a retry can win: it
// aborts, retries, and conflicts identically all five times. The last commit
// from that step to land was 2026-08-21 16:47. This file was collateral — it
// shared a commit with files it has no reason to share one with.
//
// feed-audits.yml is the control test: same retry loop, same file, staged
// ALONE, and it has landed every time.
//
// Splitting the commit is the first half of the fix. This is the second, and
// it is the one that keeps working as writers multiply: nightly and
// feed-audits both write this whole file from their own checkouts, so sooner
// or later they overlap, and a text rebase of two whole-file rewrites is a
// conflict — which here means the record is DROPPED, not delayed.
//
// THE ORDER MATTERS, and getting it wrong is silent. Merging the remote in and
// THEN committing does not work: the commit's diff still conflicts with the
// remote's own diff over the same lines, because both sides added the same
// region independently. Verified in a two-writer simulation on 2026-08-24 —
// it conflicted on all three attempts and the nightly record was lost exactly
// as in production. The order that works is: reset this file to the remote
// tip, THEN merge this run's saved entries into it, THEN commit. That way the
// commit is a clean addition on top of what is already published, and there is
// nothing for a rebase to reconcile.
//
// So the caller saves its copy BEFORE touching git, checks the file out at the
// remote tip, and calls this with --mine. mergeStatus composes by check name:
// the two sides' different checks all survive, and the same check recorded on
// both sides keeps the later reading.
import { readFile, writeFile } from "node:fs/promises";
import { mergeStatus, serializeStatus } from "./lib/audit-status.mjs";

const arg = (n, d) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : d; };
const MINE = arg("--mine", null);
const LOCAL = new URL("./registry/audit-status.json", import.meta.url);

if (!MINE) {
  console.error("merge-audit-status: --mine <saved-copy.json> is required");
  process.exit(2);
}

const readJson = async (src, what) => {
  try {
    return JSON.parse(await readFile(src, "utf-8"));
  } catch (e) {
    console.log(`merge-audit-status: ${what} unreadable (${e.code ?? e.message}) — treated as empty`);
    return {};
  }
};

// This run's records are side A, the published file side B. Which is which
// only decides ties, and mergeStatus breaks those on lastRunAt, not on side.
const mine = await readJson(MINE, "this run's saved copy");
const published = await readJson(LOCAL, "the checked-out file");

const merged = mergeStatus(mine, published);
await writeFile(LOCAL, serializeStatus(merged));

const mineNames = Object.keys(mine.checks ?? {});
const total = Object.keys(merged.checks ?? {}).length;
console.log(`merge-audit-status: ${total} checks after merge (${mineNames.length} recorded by this run: ${mineNames.join(", ") || "none"})`);
