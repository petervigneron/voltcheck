#!/usr/bin/env node
// Read the dealer's own notes off a used car's VDP, for the lanes whose
// inventory API does not carry them.
//
// The reasoning — why the fetch is worth it, and why the VDP's schema.org
// description is deliberately NOT used — is in lib/dealer-notes.mjs. This file
// is the target selection, the pacing and the cache, in the shape gm-warranty.mjs
// and ford-sticker.mjs already established.
//
// ── What it is for ─────────────────────────────────────────────────────────
//
// migration 0024's buyback_disclosed is computed from payload->>'description'.
// Measured 2026-08-27: of 48,783 live used/CPO listings only 6,745 (13.8%)
// carry a description, so 42,038 cannot be checked for a disclosed
// manufacturer buyback at all. 17,894 of those are OEM CPO lanes, where the
// programmes exclude branded titles; the real exposure is the 24,144 on dealer
// lots. This lane is how those get read.
//
// ── Scope, and why it is not "every car" ───────────────────────────────────
//
// NEW CARS ARE SKIPPED. A new car cannot be a manufacturer buyback, and new is
// 88,633 of the 137,612 live rows — including it would triple the cost of this
// lane to learn nothing about the thing it exists for.
//
// OEM LOCATOR LANES ARE SKIPPED. Their `sourceUrl` is a maker's search page,
// not a dealer's VDP, and the maker's CPO programme excludes branded titles.
//
// ── Order of work ──────────────────────────────────────────────────────────
//
// registry/buyback-dealers.json (buyback-dealers.mjs) puts rooftops that
// ADVERTISE a buyback programme first. That list is a prioritiser and nothing
// else: it never marks a car, and every other used car is still read, just
// later. A dealer running a buyback section is where the piles are — Dennis
// Sneed Ford had 210 of 260 — so reading those lots first is the difference
// between finding a pile this week and next month.

import { readFile, writeFile } from "node:fs/promises";
import { fetchPage } from "./lib/http.mjs";
import { extractDealerNotes } from "./lib/dealer-notes.mjs";

const LISTINGS = new URL("./out/listings.json", import.meta.url);
const CACHE = new URL("./registry/vdp-notes.json", import.meta.url);
const BUYBACK_DEALERS = new URL("./registry/buyback-dealers.json", import.meta.url);

// Notes are edited — a price is quoted in them, "Recent Arrival!" ages — so
// unlike a window sticker this is refreshed rather than cached forever. 30
// days keeps a steady state near a few hundred fetches a night once the first
// pass has drained, against ~8.5k for re-reading every car every time.
const REFRESH_DAYS = 30;
// A page that had no notes widget is asked again sooner: the widget is often
// simply empty on a car the dealer has not written up yet.
const RETRY_EMPTY_DAYS = 14;

const arg = (name, dflt) => {
  const i = process.argv.indexOf(name);
  return i > -1 ? Number(process.argv[i + 1]) : dflt;
};
const LIMIT = arg("--limit", Infinity);
const CONCURRENCY = Math.max(1, arg("--concurrency", 6));

const listings = JSON.parse(await readFile(LISTINGS, "utf-8"));
let cache = {};
try {
  cache = JSON.parse(await readFile(CACHE, "utf-8"));
} catch {
  /* first run */
}
let priority = new Set();
try {
  const bb = JSON.parse(await readFile(BUYBACK_DEALERS, "utf-8"));
  priority = new Set(Object.entries(bb).filter(([, v]) => v?.hit).map(([d]) => d));
} catch {
  /* sweep not run yet — everything is equal priority */
}

const today = new Date().toISOString().slice(0, 10);
const dayStr = (n) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);

// A per-VIN VDP on the seller's own site. An OEM lane's sourceUrl is a maker
// search page and never contains the VIN, which is the cheap way to tell them
// apart without re-deriving each lane's identity here.
const isVdp = (l) =>
  typeof l.sourceUrl === "string" &&
  /^https?:\/\//i.test(l.sourceUrl) &&
  (l.sourceUrl.toUpperCase().includes(String(l.vin ?? "").toUpperCase()) || /\.htm[l]?$/i.test(l.sourceUrl));

const targets = [];
for (const l of listings) {
  const cond = String(l.condition ?? "").toLowerCase();
  if (cond !== "used" && cond !== "certified") continue;
  if (typeof l.description === "string" && l.description.trim()) continue;
  const vin = String(l.vin ?? "").toUpperCase();
  if (vin.length !== 17 || !isVdp(l)) continue;
  const hit = cache[vin];
  if (hit) {
    const cutoff = hit.notes ? dayStr(REFRESH_DAYS) : dayStr(RETRY_EMPTY_DAYS);
    if (String(hit.checkedAt ?? "") >= cutoff) continue;
  }
  targets.push(l);
}
// Advertised buyback lots first; the rest in feed order.
targets.sort((a, b) => (priority.has(b.dealerDomain) ? 1 : 0) - (priority.has(a.dealerDomain) ? 1 : 0));

const work = targets.slice(0, LIMIT);
const prioritised = work.filter((l) => priority.has(l.dealerDomain)).length;
console.error(
  `vdp-notes: ${targets.length} used/CPO cars with no notes on file, doing ${work.length} this run ` +
    `(${prioritised} on rooftops that advertise a buyback programme, ${priority.size} such rooftops known)`,
);

let read = 0;
let empty = 0;
let errors = 0;
let cursor = 0;
let done = 0;

async function worker() {
  while (cursor < work.length) {
    const l = work[cursor++];
    const vin = String(l.vin).toUpperCase();
    try {
      const res = await fetchPage(l.sourceUrl);
      if (res.status !== 200 || !res.body) {
        // 403/404/timeout says nothing about the car's notes. Left uncached so
        // it is retried rather than recorded as "no notes".
        errors++;
      } else if (!res.body.toUpperCase().includes(vin)) {
        // The page we got is not this car's — a redirect to a search page on a
        // sold car is the common shape. Not an answer.
        errors++;
      } else {
        const notes = extractDealerNotes(res.body);
        cache[vin] = notes ? { notes, checkedAt: today } : { checkedAt: today };
        if (notes) read++;
        else empty++;
      }
    } catch {
      errors++;
    }
    if (++done % 200 === 0) {
      console.error(`vdp-notes: ${done}/${work.length} (${read} with notes)`);
      await writeFile(CACHE, JSON.stringify(cache, null, 1));
    }
  }
}

await Promise.all(Array.from({ length: Math.min(CONCURRENCY, work.length) }, worker));
await writeFile(CACHE, JSON.stringify(cache, null, 1));

// ── The review queue ───────────────────────────────────────────────────────
//
// Every lot read so far has disclosed buybacks in words the previous pattern
// set did not know. Sneed writes "PART OF FORDS REACQUIRED VEHICLE BRANDED
// PROGRAM"; highlineautosales writes "lemon law permanently branded title";
// bostonforeignmotor writes "THIS VEHICLE WAS REAQUIRED BY MANUFACTURER ...
// ( BUY BACK/LEMON LAW)" — misspelled, and with the two terms in a
// parenthetical. Three lots, three templates, three migrations.
//
// So this prints what the run SAW but did not necessarily flag, instead of
// waiting for someone to open a listing and notice. The word list here is
// deliberately BROADER than the column's patterns and decides nothing: it is a
// net for review, and its false positives are the point. The narrow, audited
// patterns that actually set buyback_disclosed live in the migrations, where a
// false positive would be a false claim about a real car.
const BUYBACK_WORDS = /\b(buy[\s-]?back|lemon[\s-]?law|rea?c?quired|repurchase[ds]?|branded title)\b/i;
const flagged = [];
for (const l of listings) {
  const hit = cache[String(l.vin ?? "").toUpperCase()];
  if (!hit?.notes || !BUYBACK_WORDS.test(hit.notes)) continue;
  const m = hit.notes.match(/[^.!]{0,70}(buy[\s-]?back|lemon[\s-]?law|rea?c?quired|repurchase|branded title)[^.!]{0,90}/i);
  flagged.push({ vin: l.vin, domain: l.dealerDomain, quote: m ? m[0].trim() : "" });
}
if (flagged.length) {
  console.error(`vdp-notes: ${flagged.length} car(s) whose notes use buyback language — REVIEW, and extend the patterns if a template here is new:`);
  const seen = new Set();
  for (const f of flagged) {
    const key = f.quote.toLowerCase().replace(/[^a-z ]/g, "").slice(0, 60);
    if (seen.has(key)) continue;
    seen.add(key);
    console.error(`    ${f.vin} ${f.domain}: ${f.quote.slice(0, 150)}`);
    if (seen.size >= 15) break;
  }
}

// Re-apply the whole cache, not just this run's fetches, so a car keeps its
// notes on every run without being asked again. Never overwrites a description
// a lane already supplied — that one came from the car's own feed record and
// is the fresher of the two.
let applied = 0;
for (const l of listings) {
  if (typeof l.description === "string" && l.description.trim()) continue;
  const hit = cache[String(l.vin ?? "").toUpperCase()];
  if (!hit?.notes) continue;
  l.description = hit.notes;
  applied++;
}
await writeFile(LISTINGS, JSON.stringify(listings, null, 1));
console.error(
  `vdp-notes: ${read} read, ${empty} with an empty notes widget, ${errors} unanswered; ` +
    `${applied} listings now carry the dealer's own notes. buyback_disclosed (0024) reads them at write time.`,
);
