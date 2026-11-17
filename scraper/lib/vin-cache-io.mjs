// How the two big VIN-keyed caches are stored on disk, and the size budget
// that keeps them pushable.
//
// WHY THIS EXISTS (2026-11-17). GitHub refuses any file over 100 MB. On
// 2026-11-05 registry/vpic-cache.json reached 104,857,537 bytes — 63 under the
// limit — and every push after that was rejected (GH001). The workflows only
// warn on a lost cache push ("this file catches up next run"), and it could
// never catch up: each run merged its decodes into a file that was already
// too big, lost them, and re-asked NHTSA for the same VINs the next time. The
// 2026-11-16 nightly merged 401,581 published + 10,871 new entries and threw
// all of them away. registry/vdp-notes.json was 81.5 MB and growing ~1.4 MB a
// day, so it had about two weeks left.
//
// Measured before choosing (main at e5597ea10):
//
//   vpic-cache.json   401,581 VINs, 261 bytes each — but only 3,625 DISTINCT
//                     decodes. 97 MB of the file was the same few thousand
//                     rows written out 400,000 times.
//   vdp-notes.json    69,237 VINs, 1,177 bytes each, 57,036 distinct texts —
//                     free text, nothing to deduplicate.
//
// So the two files get different answers, both lossless:
//
//   "rows"    vpic-cache.json. Each distinct decode is stored once in `rows`;
//             a VIN is `[row index, day number]`. Same path, same contents
//             once read (verified deep-equal on all 401,581), 14.1 MB instead
//             of 104.9 — 35 bytes a VIN. The file took 97,398 new VINs in
//             October (~3,100 a night, ~0.11 MB), which puts the 50 MB budget
//             below about eleven months out; at 10,000 a night it is still
//             over three months to the budget and eight to GitHub's limit.
//   "shards"  vdp-notes/ — ten files, 0.json … 9.json, by the VIN's last
//             character (the serial's last digit, so they fill evenly:
//             6,771–7,035 entries each when split). ~8 MB a file, growing
//             ~0.14 MB a day each: most of a year to the budget.
//
// Every reader and writer goes through readVinCache / writeVinCache, so
// callers still see the plain `{ VIN: entry }` object they always did.
//
// REJECTED, with the numbers:
//   - Dropping unread fields. Every stored field is read (vpic-enrich.mjs
//     CACHE_FIELDS; checkedAt decides merges). Nothing to drop.
//   - Pruning VINs gone from the site. 260,599 of the 401,581 vPIC entries
//     are not in today's feed, so it would have bought 65% — once. But the
//     file records when a VIN was DECODED, not when it was last needed, and
//     13,838 entries are decodes that are neither BEV nor PHEV: those cars
//     are never on the site, so "gone from listings" would drop them and
//     re-ask NHTSA for them on every crawl that meets them. For the notes it is worse: 398 cars still listed
//     hold notes older than 60 days, and dropping a car's notes can drop the
//     buyback disclosure they carry.
//   - Keying the vPIC cache by VIN pattern (positions 1–8, 10, 11) instead of
//     by VIN: ~1 MB forever, but 91 of the 4,358 patterns in the file hold
//     more than one distinct decode (ignoring the Model field older entries
//     lack), so a pattern does not determine the row — and a wrong row is a
//     wrong trim or a wrong EV verdict on a real listing.
//   - gzip. vdp-notes gzips to 21.8 MB, but a compressed blob does not delta:
//     the rolling crawl commits this file up to 48 times a day, and each
//     commit would add ~20 MB to the repository.
//   - Supabase storage. Four workflows write the vPIC cache on independent
//     schedules; git's push-or-retry is what makes their merges compose. A
//     bucket object has no such check, so the loser of a race is silently
//     overwritten — the 2026-08-21 failure again, without the log line.
//   - Git LFS: not needed at these sizes.
import { readFile, writeFile, readdir, mkdir, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

/** GitHub's hard limit on one file. A push carrying a bigger one is refused. */
export const GITHUB_FILE_LIMIT = 100 * 1024 * 1024;
/** Half of it. test/registry-size.test.mjs fails, and merge-vin-cache.mjs
 *  raises an error annotation, when any registry file passes this — months
 *  before a push can be refused, not the night it is. */
export const REGISTRY_FILE_BUDGET = 50 * 1024 * 1024;

const ROWS_FORMAT = "vin-rows/1";
const SHARD_NAMES = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];

const toPath = (p) => (p instanceof URL ? fileURLToPath(p) : String(p));

/** Which on-disk shape a cache path uses. Decided by the path alone, so a
 *  missing file or directory is still written in the right shape. */
export function formatOf(p) {
  const base = path.basename(toPath(p));
  if (base === "vpic-cache.json") return "rows";
  if (base === "vdp-notes") return "shards";
  return "plain";
}

// ── "rows" ─────────────────────────────────────────────────────────────────

const DAY_MS = 86_400_000;
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
// checkedAt is a YYYY-MM-DD string in every entry these caches hold; it is
// stored as a day number (7 bytes less per VIN). Anything else — absent, or a
// string that is not a plain date — is kept exactly as it was.
const packDate = (s) => {
  if (typeof s === "string" && ISO_DAY.test(s)) {
    const t = Date.parse(s);
    if (Number.isFinite(t) && new Date(t).toISOString().slice(0, 10) === s) return t / DAY_MS;
  }
  return s === undefined ? null : s;
};
const unpackDate = (d) => (typeof d === "number" ? new Date(d * DAY_MS).toISOString().slice(0, 10) : d);

/** `{ VIN: { checkedAt, ...fields } }` → the "rows" object. Rows are numbered
 *  in order of first appearance, so appending VINs never renumbers a row and a
 *  commit's diff is the new lines only. */
export function packRows(cache) {
  const rows = [];
  const index = new Map();
  const vins = {};
  for (const [vin, entry] of Object.entries(cache ?? {})) {
    const { checkedAt, ...row } = entry ?? {};
    // Key order is part of the key: a row is reproduced exactly as it was
    // written, including whether it has a Model key at all (vpic-enrich.mjs
    // re-asks vPIC for an entry with none).
    const key = JSON.stringify(row);
    let i = index.get(key);
    if (i === undefined) {
      i = rows.length;
      rows.push(row);
      index.set(key, i);
    }
    vins[vin] = [i, packDate(checkedAt)];
  }
  return { format: ROWS_FORMAT, rows, vins };
}

export const isPackedRows = (o) => o?.format === ROWS_FORMAT && Array.isArray(o.rows) && typeof o.vins === "object";

export function unpackRows(packed) {
  const out = {};
  for (const [vin, [i, day]] of Object.entries(packed.vins)) {
    const row = packed.rows[i];
    if (!row) throw new Error(`vin cache: ${vin} points at row ${i}, which does not exist`);
    const checkedAt = unpackDate(day);
    out[vin] = checkedAt === null ? { ...row } : { checkedAt, ...row };
  }
  return out;
}

/** One row and one VIN per line: still a single valid JSON document, but a
 *  commit that adds 200 VINs is a 200-line diff rather than the whole file. */
export function stringifyRows(cache) {
  const { rows, vins } = packRows(cache);
  return (
    `{"format":${JSON.stringify(ROWS_FORMAT)},"rows":[\n` +
    rows.map((r) => JSON.stringify(r)).join(",\n") +
    `\n],"vins":{\n` +
    Object.entries(vins).map(([v, a]) => `${JSON.stringify(v)}:${JSON.stringify(a)}`).join(",\n") +
    `\n}}\n`
  );
}

// ── "shards" ───────────────────────────────────────────────────────────────

/** The shard a VIN lives in: its last character. Position 17 is a digit on
 *  every North American VIN; the rare key that ends in anything else goes
 *  to 0 (3 of 69,237 when this was written). */
export const shardOfVin = (vin) => {
  const c = String(vin).slice(-1);
  return c >= "0" && c <= "9" ? c : "0";
};

// ── read / write ───────────────────────────────────────────────────────────

/**
 * Read a VIN-keyed cache as a plain `{ VIN: entry }` object, whatever shape
 * it is stored in. A file is read by what it CONTAINS, not by its name, so a
 * copy saved under another name (the workflows' "mine" copies) and a
 * vpic-cache.json still in the old one-object-per-VIN shape both read
 * correctly. Throws ENOENT when there is nothing there, like readFile.
 */
export async function readVinCache(p) {
  const file = toPath(p);
  const st = await stat(file);
  if (st.isDirectory()) {
    const out = {};
    for (const name of (await readdir(file)).filter((n) => n.endsWith(".json")).sort()) {
      Object.assign(out, JSON.parse(await readFile(path.join(file, name), "utf-8")));
    }
    return out;
  }
  const parsed = JSON.parse(await readFile(file, "utf-8"));
  return isPackedRows(parsed) ? unpackRows(parsed) : parsed;
}

/**
 * Write a VIN-keyed cache in the shape its path calls for (formatOf).
 * `indent` applies to the plain and sharded shapes; "rows" has its own
 * line-per-entry layout. Returns the largest file written, in bytes.
 */
export async function writeVinCache(p, cache, { indent = 0 } = {}) {
  const file = toPath(p);
  const format = formatOf(file);
  if (format === "rows") {
    const text = stringifyRows(cache);
    await writeFile(file, text);
    return Buffer.byteLength(text);
  }
  if (format === "shards") {
    const parts = Object.fromEntries(SHARD_NAMES.map((n) => [n, {}]));
    for (const [vin, entry] of Object.entries(cache ?? {})) parts[shardOfVin(vin)][vin] = entry;
    await mkdir(file, { recursive: true });
    let largest = 0;
    for (const n of SHARD_NAMES) {
      const text = JSON.stringify(parts[n], null, indent || undefined) + "\n";
      await writeFile(path.join(file, `${n}.json`), text);
      largest = Math.max(largest, Buffer.byteLength(text));
    }
    return largest;
  }
  const text = JSON.stringify(cache, null, indent || undefined);
  await writeFile(file, text);
  return Buffer.byteLength(text);
}
