#!/usr/bin/env node
// Ask Ford what version THIS car actually is, and cache the answer.
//
// The reasoning — what this closes, and why it only ever suppresses a trim
// rather than replacing one — lives in lib/ford-sticker-trim.mjs, which also
// owns the parse and the comparison. This file is only the fetch and the
// cache, the way gm-warranty.mjs is.
//
// ── Why it's cheap ─────────────────────────────────────────────────────────
//
// windowsticker.forddirect.com serves the Monroney label per VIN to a plain
// GET — no sign-in, no token, no challenge (verified from Node). A VIN's label
// is fixed at build, so the cache is permanent and only newly seen cars are
// ever asked, the same shape as gm-warranty.mjs and bounded the same way with
// --limit so a first pass spreads over nights instead of holding the pipeline.
//
// The one thing that is not permanent is the "not yet released" placeholder
// Ford serves for a car it has no label for. It says "Please check back
// later", and for a just-built car that is true, so those are re-asked after
// RECHECK_DAYS rather than cached as a permanent no.
//
// Control test, 2026-08-26: a Tesla VIN returns the SAME placeholder as an
// unreleased Ford, not an error. So the placeholder means "no answer", it
// does not mean "not a Ford" — which is why the WMI gate below exists rather
// than letting the endpoint sort it out.

import { readFile, writeFile, unlink } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { stickerTrim } from "./lib/ford-sticker-trim.mjs";

const execFileAsync = promisify(execFile);

const LISTINGS = new URL("./out/listings.json", import.meta.url);
const CACHE = new URL("./registry/ford-sticker.json", import.meta.url);

const BASE = "https://www.windowsticker.forddirect.com/windowsticker.pdf";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36";
// Serial, one request per 1.2s — the same politeness gm-warranty.mjs runs
// under against GM's owner centre.
const PACE_MS = 1200;
// A car Ford has no label for yet is asked again after this long. Anything
// answered is answered forever.
const RECHECK_DAYS = 45;

// Ford's own world manufacturer identifiers, as they appear in our feed (3FM
// Mach-E, 1FT Lightning/E-Transit, 1FM Escape, 3FA/1FA Fusion/Focus, 1FD
// E-Transit chassis), plus the Ford prefixes we don't hold today. No other
// make in the feed shares any of them — checked against all 136,597 live rows,
// 2026-08-26.
const FORD_WMI = /^(1FA|1FB|1FC|1FD|1FM|1FT|2FA|2FM|2FT|3FA|3FE|3FM|3FT)/;

// What Ford serves when it has no label for a VIN.
const NOT_RELEASED = /window sticker has not yet been released/i;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function pdfText(buf) {
  const path = join(tmpdir(), `ws-${process.pid}-${Math.random().toString(36).slice(2)}.pdf`);
  await writeFile(path, buf);
  try {
    // Page 1 only: everything read is on the label itself, and the addenda
    // pages are most of the file.
    const { stdout } = await execFileAsync("pdftotext", ["-layout", "-f", "1", "-l", "1", path, "-"], {
      maxBuffer: 1 << 24,
    });
    return stdout;
  } finally {
    await unlink(path).catch(() => {});
  }
}

// pdftotext (poppler-utils) does the extraction: the label's fonts carry a
// custom encoding, so the text is NOT readable by inflating the PDF's own
// streams — tried, and "EQUIPMENT" appears in none of the 157 streams. If the
// tool is missing we say so and change nothing. Reporting "no contradictions"
// because the extractor was absent is the quiet kind of wrong this pipeline
// keeps getting bitten by.
try {
  await execFileAsync("pdftotext", ["-v"]);
} catch {
  console.error("ford-sticker: pdftotext (poppler-utils) not installed — skipping, nothing cached");
  process.exit(0);
}

const listings = JSON.parse(await readFile(LISTINGS, "utf-8"));
let cache = {};
try {
  cache = JSON.parse(await readFile(CACHE, "utf-8"));
} catch {
  /* first run */
}

const today = new Date().toISOString().slice(0, 10);
const staleBefore = new Date(Date.now() - RECHECK_DAYS * 86_400_000).toISOString().slice(0, 10);

// Only cars whose feed actually claims a trim: with nothing claimed there is
// nothing to contradict, and asking would spend a request to learn nothing.
const targets = new Set();
for (const l of listings) {
  const vin = String(l.vin ?? "").toUpperCase();
  if (vin.length !== 17 || !FORD_WMI.test(vin)) continue;
  if (!String(l.trim ?? "").trim()) continue;
  targets.add(vin);
}

const needed = [...targets].filter((v) => {
  const hit = cache[v];
  if (!hit) return true;
  return Boolean(hit.unavailable) && String(hit.checkedAt ?? "") < staleBefore;
});

const limitArg = process.argv.indexOf("--limit");
const LIMIT = limitArg > -1 ? Number(process.argv[limitArg + 1]) : Infinity;
const fresh = needed.slice(0, LIMIT);
console.error(
  `ford-sticker: ${targets.size} Ford VINs carrying a trim, ${needed.length} to ask, doing ${fresh.length} this run`
);

let read = 0;
let none = 0;
for (const [i, vin] of fresh.entries()) {
  try {
    const res = await fetch(`${BASE}?vin=${vin}`, {
      headers: {
        "User-Agent": UA,
        Accept: "application/pdf",
        "X-Crawler": "VoltcheckBot (+https://voltcheck.net/crawler)",
      },
      signal: AbortSignal.timeout(45_000),
      redirect: "follow",
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const txt = await pdfText(Buffer.from(await res.arrayBuffer()));
    const st = NOT_RELEASED.test(txt) ? null : stickerTrim(txt);
    // A label we fetched but could not read a series off is not a fact about
    // the car; it is a parse to retry. Cached as unavailable so it is asked
    // again later, never treated as agreement with the feed.
    if (st?.series) {
      cache[vin] = { group: st.group, series: st.series, checkedAt: today };
      read++;
    } else {
      cache[vin] = { unavailable: true, checkedAt: today };
      none++;
    }
  } catch (err) {
    // Left uncached so the next run retries it: an error is not an answer.
    console.error(`ford-sticker: ${vin} failed: ${err.message}`);
  }
  if ((i + 1) % 100 === 0) {
    console.error(`ford-sticker: ${i + 1}/${fresh.length}`);
    await writeFile(CACHE, JSON.stringify(cache, null, 1));
  }
  await sleep(PACE_MS);
}

await writeFile(CACHE, JSON.stringify(cache, null, 1));
console.error(
  `ford-sticker: ${read} labels read, ${none} with no label on file. db-sync applies them (lib/ford-sticker-trim.mjs).`
);
