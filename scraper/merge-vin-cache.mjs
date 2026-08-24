#!/usr/bin/env node
// Fold this run's own cache entries back into a VIN-keyed registry file after
// the working copy has been reset to the current remote tip.
//
//   node merge-vin-cache.mjs --file registry/vpic-cache.json \
//                            --mine "$RUNNER_TEMP/vpic-cache-mine.json" [--indent 0]
//
// WHY THIS EXISTS
//
// registry/vpic-cache.json is 28 MB on ONE LINE — JSON.stringify with no
// indent. A single-line file cannot be merged by git at all: any change by
// two writers is a conflict on the same line, every time, deterministically.
// It has four writers on independent schedules (rolling-crawl.yml, 48 runs a
// day; nightly.yml; discover.yml touching its neighbours), so the loser of
// every overlap used to abort, retry into the identical conflict five times,
// and drop the commit.
//
// rolling-crawl runs often enough to usually be the winner. nightly runs once
// and was always the loser: nothing from its registry commit had landed since
// 2026-08-21 16:47 — not this cache, and not gm-warranty.json, which was only
// ever collateral for sharing the commit.
//
// The same shape, and the same fix, as merge-audit-status.mjs: give each file
// its own commit so no file's conflict can take another down, and combine the
// two sides by KEY rather than by text so concurrent writers compose. For a
// cache of permanent per-VIN facts the combination is a union — see
// lib/vin-cache-merge.mjs on why that can never lose a legitimate edit.
//
// THE ORDER MATTERS and gets no warning if wrong. Merging the remote in and
// then committing still conflicts, because both sides then carry overlapping
// edits to the same region. The caller must save its copy BEFORE touching
// git, check the file out at the remote tip, and call this with --mine; the
// commit is then a clean addition on top of what is already published and a
// rebase has nothing to reconcile.
import { readFile, writeFile } from "node:fs/promises";
import { mergeVinCache } from "./lib/vin-cache-merge.mjs";

const arg = (n, d) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : d; };
const FILE = arg("--file", null);
const MINE = arg("--mine", null);
// Matches how each writer already serialises its own file, so a merged write
// is not a whole-file reformat: vpic-enrich.mjs uses no indent, gm-warranty.mjs
// uses 1. Getting this wrong would still be valid JSON but would rewrite every
// line and make the diff useless.
const INDENT = Number(arg("--indent", 0));

if (!FILE || !MINE) {
  console.error("merge-vin-cache: --file <path> and --mine <saved-copy.json> are required");
  process.exit(2);
}

const readJson = async (src, what) => {
  try {
    return JSON.parse(await readFile(src, "utf-8"));
  } catch (e) {
    console.log(`merge-vin-cache: ${what} unreadable (${e.code ?? e.message}) — treated as empty`);
    return {};
  }
};

const mine = await readJson(MINE, "this run's saved copy");
const published = await readJson(FILE, "the checked-out file");
const merged = mergeVinCache(mine, published);

await writeFile(FILE, JSON.stringify(merged, null, INDENT || undefined));

const added = Object.keys(merged).length - Object.keys(published).length;
console.log(
  `merge-vin-cache: ${FILE} — ${Object.keys(published).length} published + ${Object.keys(mine).length} from this run = ${Object.keys(merged).length} (${added} new)`
);
