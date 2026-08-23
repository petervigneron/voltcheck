// The bundled fallback snapshot's on-disk format — web/data/scraped-listings.json.
//
// WHAT CHANGED, AND WHY IT HAD TO
//
// That file is committed to git, it is the snapshot the site serves when
// Supabase cannot answer, and it grows with inventory. GitHub refuses ANY push
// containing a file over 100 MB — a hard block, not a warning — so the file was
// on a collision course with the mission. Measured 2026-08-22 on the 58,730-row
// snapshot: 850 bytes/row pretty-printed, 727 compact. At the live feed's
// 100,446 rows that is ~70 MB, and the ceiling arrived at ~144,000 cars.
// Coverage is the whole point of this site, so that day was coming.
//
// It is now stored gzipped, base64'd, inside a JSON envelope. Measured on the
// same 58,730 rows:
//
//   pretty JSON (what shipped)   47.6 MB   850 B/row   ceiling  123,000 cars
//   compact JSON                 40.7 MB   727 B/row   ceiling  144,000 cars
//   gzip -9 + base64 envelope     5.4 MB    97 B/row   ceiling 1,083,000 cars
//
// At the live feed that is 9.3 MB instead of 70 MB, and the ceiling moves to
// roughly a million cars — past any plausible US EV+PHEV inventory, so this is
// a fix rather than a postponement. Nothing is dropped: the rows that come back
// out are byte-identical to the rows that went in (asserted below, and by
// round-trip in the workflows that write it).
//
// WHY NOT THE OTHER THREE OPTIONS
//
//   NARROW THE SHAPE. Measured what the readers actually touch, field by field,
//   and the honest saving is 3%. Every one of the snapshot's 25 keys has a real
//   consumer in web/ — app/listing/[id]/page.tsx alone renders sourceUrl,
//   imageUrl, images, dealerName, sellerType, exteriorColor, interiorColor,
//   stockNumber, previousOwners, drive, condition, city/state and the VIN, and
//   zip is what the distance filter is built on. The ONE provably redundant
//   field is `id`, which is vin.toLowerCase() on 58,730 of 58,730 rows with
//   zero exceptions — dropping it buys 3% and moves the ceiling 144k → 149k.
//   To get a real saving you have to delete the photo: id+images+imageUrl is
//   62% of base and a ceiling of 233,000 — bought by showing a shopper a
//   listing page with no picture during an outage, and still not permanent.
//
//   CAP AT N ROWS. Bounds the file, but the car that misses the cut 404s during
//   an outage. A 404 on a car that is genuinely for sale is a false negative
//   about the world, which is the side of the house rule this repo does not
//   take: matching nothing is honest, but only when there is nothing to match.
//
//   MOVE IT OUT OF GIT. web/ has no filesystem reader — both data files
//   (scraped-listings.json, nhtsa-battery.json) are loaded with
//   `await import()`, and web/next.config.ts is empty, so there is no
//   outputFileTracingIncludes and no precedent for tracing a runtime asset onto
//   the lambda. A release asset or LFS pointer would need that config to be
//   right, and when it is wrong the failure is SILENT: the fallback simply
//   isn't there, and the detail page 404s during exactly the outage it exists
//   for. It also puts a network fetch inside `next build`, and CLAUDE.md is a
//   long record of how little this build can afford new ways to fail. Git LFS
//   separately does not fit: this is a public repo on the free tier, 1 GB of
//   LFS storage, and a weekly 70 MB push exhausts it inside a month.
//
// The envelope keeps `await import()` working unchanged, which is the whole
// reason it is base64-in-JSON rather than a plain .json.gz — no Next config, no
// tracing, no new failure mode, and the same loader both data files already
// use. The 33% base64 overhead over raw gzip (5.4 MB vs 4.1 MB) is the price of
// that, and at these sizes it buys far more than it costs.
//
// It is also FASTER than what it replaces, which was not the goal but settles
// the one real objection. Measured cold, same machine, same rows:
//
//   read + parse 47.6 MB pretty JSON      221 ms
//   read envelope + gunzip + parse        174 ms
//
// — because 5.4 MB comes off the disk instead of 47.6 MB, and gunzip is faster
// than the JSON parsing it saves. The site pays this once per instance on the
// outage path only (source.ts caches it in the module registry).
import { readFile, writeFile } from "node:fs/promises";
import { gzipSync, gunzipSync } from "node:zlib";

export const SNAPSHOT_FORMAT = "gzip+base64";

/** Rows out of whatever the file holds.
 *
 *  BOTH FORMATS ARE ACCEPTED, and that is load-bearing rather than politeness.
 *  Three lanes write this path — ingest.mjs (48+ times a day from
 *  rolling-crawl.yml), price-audit.mjs, and refresh-fallback.mjs weekly — and
 *  they do not deploy together. A checkout mid-migration, an artifact carried
 *  forward from a run that started before this landed, or a `git revert` all
 *  produce a plain array, and every one of those must keep working: a reader
 *  that threw on the legacy shape would turn a format change into an outage in
 *  the code whose only job is surviving outages. A legacy array is not an
 *  error, it is simply an older file. */
export function decodeSnapshot(text) {
  const parsed = JSON.parse(text);
  if (Array.isArray(parsed)) return parsed; // the pre-2026-08-22 plain array
  if (parsed?.format !== SNAPSHOT_FORMAT || typeof parsed.data !== "string") {
    throw new Error(
      `unrecognised snapshot envelope (format=${JSON.stringify(parsed?.format)}) — refusing to guess at its contents`
    );
  }
  const rows = JSON.parse(gunzipSync(Buffer.from(parsed.data, "base64")).toString("utf-8"));
  if (!Array.isArray(rows)) throw new Error("snapshot envelope did not decode to an array");
  // The envelope carries its own row count so a truncated or half-written file
  // fails HERE, loudly, rather than downstream as a mysteriously short feed —
  // the silent short read is this file's recurring incident shape.
  if (typeof parsed.rows === "number" && parsed.rows !== rows.length) {
    throw new Error(`snapshot envelope claims ${parsed.rows} rows but decoded ${rows.length}`);
  }
  return rows;
}

/** The envelope for these rows. Level 9 on purpose: this is written weekly (or
 *  per rolling slice, where the array is ~2,000 rows) and read on an outage
 *  path, so compression time is the cheapest thing in the exchange — level 9
 *  cost 754 ms for 58,730 rows and bought 300 KB over level 6. */
export function encodeSnapshot(rows) {
  if (!Array.isArray(rows)) throw new Error("encodeSnapshot needs an array of listings");
  const body = JSON.stringify(rows);
  const envelope = JSON.stringify({
    format: SNAPSHOT_FORMAT,
    rows: rows.length,
    // Uncompressed size, for the size guard's arithmetic and for anyone asking
    // what this file would weigh in the clear. Not read back by the decoder.
    uncompressedBytes: Buffer.byteLength(body),
    data: gzipSync(Buffer.from(body), { level: 9 }).toString("base64"),
  });
  // Round-trip before anyone can commit it. This file's whole history is
  // "every request answered 200 and the cars were not there", so the codec
  // proves itself on the real rows every single time it runs rather than
  // trusting a test that ran on someone else's data.
  const back = decodeSnapshot(envelope);
  if (back.length !== rows.length) {
    throw new Error(`snapshot round-trip lost rows: ${rows.length} in, ${back.length} out`);
  }
  return envelope;
}

export async function readSnapshot(url) {
  return decodeSnapshot(await readFile(url, "utf-8"));
}

/** Writes the envelope and returns what it weighed. Every producer goes through
 *  here so the file cannot drift back to an uncompressed form by way of some
 *  lane nobody remembered — which is how it got to 70 MB in the first place. */
export async function writeSnapshot(url, rows) {
  const text = encodeSnapshot(rows);
  await writeFile(url, text);
  return { rows: rows.length, bytes: Buffer.byteLength(text) };
}
