import { gunzipSync } from "node:zlib";
import type { Listing } from "./types";

// Decodes the bundled fallback snapshot, web/data/scraped-listings.json.
//
// The file is gzipped and base64'd inside a JSON envelope since 2026-08-22.
// scraper/lib/snapshot.mjs is the producer and carries the full reasoning; the
// short version is that this file is committed to git, GitHub refuses any push
// containing a file over 100 MB, and at 727 bytes a row uncompressed the
// snapshot reached that ceiling at ~144,000 cars — a number coverage was going
// to reach. Compressed it is 97 bytes a row, so the ceiling moves to roughly a
// million. Measured on the 58,730-row snapshot: 40.7 MB → 5.4 MB, and decoding
// is FASTER than parsing the JSON it replaces (174 ms against 221 ms), because
// a seventh of the bytes come off the disk and gunzip is cheaper than the
// parsing it saves.
//
// WHY IT IS BASE64 IN A JSON FILE rather than a plain .json.gz: everything in
// web/ loads its data with `await import()` — this file and
// data/nhtsa-battery.json both — and web/next.config.ts is empty, so there is
// no outputFileTracingIncludes and no precedent for tracing a runtime asset
// onto the lambda. Reading a .gz would need that config to be right, and when
// it is wrong the failure is silent: the fallback is simply absent, and the
// detail page 404s during exactly the outage it exists for. The envelope keeps
// the import unchanged, so there is no new way for the fallback to go missing.
//
// This is deliberately a SECOND copy of the codec — scraper/ is .mjs and web/
// is TypeScript, the lane boundary CLAUDE.md keeps clean, and
// scraper/refresh-fallback.mjs already duplicates db.ts's walk shape for the
// same reason. It is not left to drift on trust: web/tests/find-listing.test.ts
// decodes the REAL committed file, so a snapshot this decoder cannot read is a
// red CI run rather than a quiet 404 during an outage.
const SNAPSHOT_FORMAT = "gzip+base64";

interface SnapshotEnvelope {
  format?: string;
  rows?: number;
  data?: string;
}

/** Rows out of whatever the file holds.
 *
 *  A plain array is the pre-2026-08-22 format and is still accepted. That is
 *  not politeness: three lanes write this path and they do not deploy
 *  together, so a checkout mid-migration or a revert legitimately produces an
 *  array — and a reader that threw on it would turn a format change into an
 *  outage inside the code whose only job is surviving outages. */
export function decodeSnapshot(parsed: unknown): Listing[] {
  if (Array.isArray(parsed)) return parsed as Listing[];
  const env = parsed as SnapshotEnvelope | null;
  if (env?.format !== SNAPSHOT_FORMAT || typeof env.data !== "string") {
    throw new Error(
      `unrecognised snapshot envelope (format=${JSON.stringify(env?.format)}) — refusing to guess at its contents`
    );
  }
  const rows = JSON.parse(gunzipSync(Buffer.from(env.data, "base64")).toString("utf-8")) as Listing[];
  if (!Array.isArray(rows)) throw new Error("snapshot envelope did not decode to an array");
  // The envelope carries its own count, so a truncated file fails here rather
  // than downstream as a mysteriously short feed. Every incident in this
  // file's history looked like a short read that answered 200.
  if (typeof env.rows === "number" && env.rows !== rows.length) {
    throw new Error(`snapshot envelope claims ${env.rows} rows but decoded ${rows.length}`);
  }
  return rows;
}
