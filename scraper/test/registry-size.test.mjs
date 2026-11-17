// node --test scraper/test/registry-size.test.mjs
//
// GitHub refuses a push carrying any file over 100 MB, and the workflows that
// commit the registry caches only WARN when a push fails. So a cache that
// crosses the line does not break anything loudly: it just stops being saved.
// registry/vpic-cache.json did exactly that on 2026-11-05 (104,857,537 bytes,
// 63 under the limit) and for eleven days every run decoded VINs, failed to
// push them, and decoded them again — the 2026-11-16 nightly lost 10,871.
//
// This is the loud part. It fails at HALF the limit, on any file under
// scraper/registry, so the warning arrives months before a push is refused.
// If it fails: the fix is in lib/vin-cache-io.mjs (more shards for a sharded
// cache; pruning or sharding for the rows cache) — not raising the budget.
import test from "node:test";
import assert from "node:assert/strict";
import { readdir, stat, mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  GITHUB_FILE_LIMIT,
  REGISTRY_FILE_BUDGET,
  formatOf,
  packRows,
  readVinCache,
  shardOfVin,
  stringifyRows,
  unpackRows,
  writeVinCache,
} from "../lib/vin-cache-io.mjs";

const REGISTRY = fileURLToPath(new URL("../registry", import.meta.url));

async function walk(dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(p)));
    else out.push([p, (await stat(p)).size]);
  }
  return out;
}

test("no file under scraper/registry is past half of GitHub's 100 MB limit", async () => {
  assert.equal(REGISTRY_FILE_BUDGET * 2, GITHUB_FILE_LIMIT);
  const over = (await walk(REGISTRY)).filter(([, size]) => size > REGISTRY_FILE_BUDGET);
  assert.deepEqual(
    over.map(([p, size]) => `${path.relative(REGISTRY, p)} is ${(size / 1024 / 1024).toFixed(1)} MB`),
    [],
    "a registry file is over the 50 MB budget; past 100 MB GitHub refuses the push and the cache silently stops saving (see lib/vin-cache-io.mjs)"
  );
});

test("the retired single-file dealer-notes cache has not come back", async () => {
  await assert.rejects(stat(path.join(REGISTRY, "vdp-notes.json")), { code: "ENOENT" });
});

test("the committed vPIC cache is in the rows shape and reads back as VIN → entry", async () => {
  const raw = JSON.parse(await readFile(path.join(REGISTRY, "vpic-cache.json"), "utf-8"));
  assert.equal(raw.format, "vin-rows/1");
  const cache = await readVinCache(path.join(REGISTRY, "vpic-cache.json"));
  const vins = Object.keys(cache);
  assert.ok(vins.length > 400_000, `only ${vins.length} VINs — the cache has been truncated`);
  const e = cache[vins[0]];
  assert.match(e.checkedAt, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok("ElectrificationLevel" in e && "Trim" in e);
});

test("rows shape round-trips exactly, including an absent Model and an odd checkedAt", () => {
  const cache = {
    AAA: { checkedAt: "2026-08-21", Series: "", Trim: "S", Make: "NISSAN" }, // pre-09-09: no Model key
    BBB: { checkedAt: "2026-11-05", Series: "", Trim: "S", Make: "NISSAN", Model: "" }, // blank Model is a real answer
    CCC: { checkedAt: "2026-11-05", Series: "", Trim: "S", Make: "NISSAN" },
    DDD: { Series: "", Trim: "S", Make: "NISSAN" }, // no checkedAt at all
    EEE: { checkedAt: "not-a-date", Trim: "X" },
    FFF: { checkedAt: "2026-02-31", Trim: "X" }, // not a real day: kept verbatim, not rolled over
  };
  const packed = packRows(cache);
  assert.equal(packed.rows.length, 3, "AAA/CCC/DDD share a row; BBB differs by having Model; EEE/FFF share one");
  const back = unpackRows(JSON.parse(stringifyRows(cache)));
  assert.deepEqual(back, cache);
  assert.equal("Model" in back.AAA, false);
  assert.equal("Model" in back.BBB, true);
  assert.equal("checkedAt" in back.DDD, false);
  assert.deepEqual(Object.keys(back), Object.keys(cache), "VIN order is kept, so a merge appends rather than reshuffles");
  assert.equal(JSON.stringify(back.AAA), JSON.stringify(cache.AAA), "field order inside an entry is kept");
});

test("each cache path gets its shape, and a copy under another name still reads", async () => {
  assert.equal(formatOf("scraper/registry/vpic-cache.json"), "rows");
  assert.equal(formatOf("scraper/registry/vdp-notes"), "shards");
  assert.equal(formatOf("scraper/registry/gm-warranty.json"), "plain");
  assert.equal(shardOfVin("1C4RJXN6XSW578469"), "9");
  assert.equal(shardOfVin("ODDKEYX"), "0");

  const dir = await mkdtemp(path.join(tmpdir(), "vin-cache-io-"));
  try {
    const cache = { "1N4AZ1CP0JC300001": { checkedAt: "2026-08-21", Trim: "S" }, "1N4AZ1CP0JC300017": { checkedAt: "2026-08-22", Trim: "S" } };
    // rows: written at the real name, read back from a "mine" copy.
    await writeVinCache(path.join(dir, "vpic-cache.json"), cache);
    await writeFile(path.join(dir, "vpic-cache-mine.json"), await readFile(path.join(dir, "vpic-cache.json")));
    assert.deepEqual(await readVinCache(path.join(dir, "vpic-cache-mine.json")), cache);
    // and the old one-object-per-VIN file a run that started before the change still holds.
    await writeFile(path.join(dir, "old.json"), JSON.stringify(cache));
    assert.deepEqual(await readVinCache(path.join(dir, "old.json")), cache);
    // shards: ten files, each VIN in the one its last digit names.
    await writeVinCache(path.join(dir, "vdp-notes"), cache, { indent: 1 });
    assert.deepEqual((await readdir(path.join(dir, "vdp-notes"))).sort(), ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"].map((n) => `${n}.json`));
    assert.deepEqual(Object.keys(JSON.parse(await readFile(path.join(dir, "vdp-notes", "7.json"), "utf-8"))), ["1N4AZ1CP0JC300017"]);
    assert.deepEqual(await readVinCache(path.join(dir, "vdp-notes")), cache);
    await assert.rejects(readVinCache(path.join(dir, "absent.json")), { code: "ENOENT" });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
