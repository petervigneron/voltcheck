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
//
// ON-DISK SHAPE (2026-11-17). Reading and writing go through
// lib/vin-cache-io.mjs, which stores vpic-cache.json as deduplicated rows and
// the dealer-notes cache as ten shard files under registry/vdp-notes/ — both
// because the single files hit GitHub's 100 MB limit and every push after
// 2026-11-05 was refused. --file may therefore be a directory, and --mine a
// copy of one. This script also says so, as an error annotation, when what it
// just wrote is past half that limit: a cache that cannot be pushed fails as a
// warning nobody reads, eleven nights running.
import path from "node:path";
import { mergeVinCache } from "./lib/vin-cache-merge.mjs";
import { readVinCache, writeVinCache, REGISTRY_FILE_BUDGET, GITHUB_FILE_LIMIT } from "./lib/vin-cache-io.mjs";

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
    return await readVinCache(src);
  } catch (e) {
    console.log(`merge-vin-cache: ${what} unreadable (${e.code ?? e.message}) — treated as empty`);
    return {};
  }
};

// registry/vdp-notes.json is retired: the cache is the registry/vdp-notes/
// directory now. A run that checked out before the split still names the old
// path here, and writing it would put an 80 MB file back beside the shards
// that nothing reads. Refuse quietly — the caller then finds nothing staged,
// and that run's reads are re-fetched on the next sweep.
if (path.basename(FILE) === "vdp-notes.json") {
  console.log(`merge-vin-cache: ${FILE} is retired (the cache is ${path.join(path.dirname(FILE), "vdp-notes")}/ now) — nothing written`);
  process.exit(0);
}

const mine = await readJson(MINE, "this run's saved copy");
const published = await readJson(FILE, "the checked-out file");
const merged = mergeVinCache(mine, published);

const largest = await writeVinCache(FILE, merged, { indent: INDENT });

const added = Object.keys(merged).length - Object.keys(published).length;
console.log(
  `merge-vin-cache: ${FILE} — ${Object.keys(published).length} published + ${Object.keys(mine).length} from this run = ${Object.keys(merged).length} (${added} new)`
);
const mb = (n) => (n / 1024 / 1024).toFixed(1);
if (largest > REGISTRY_FILE_BUDGET) {
  // GitHub Actions turns this line into a red annotation on the run.
  console.log(
    `::error title=Registry cache near GitHub's file limit::${FILE} wrote a ${mb(largest)} MB file. ` +
      `GitHub refuses pushes of files over ${mb(GITHUB_FILE_LIMIT)} MB, and a refused cache push loses every entry this run added. ` +
      `See scraper/lib/vin-cache-io.mjs.`
  );
} else {
  console.log(`merge-vin-cache: largest file written ${mb(largest)} MB (budget ${mb(REGISTRY_FILE_BUDGET)}, GitHub limit ${mb(GITHUB_FILE_LIMIT)})`);
}
