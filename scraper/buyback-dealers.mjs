#!/usr/bin/env node
// Sweeps every working rooftop's homepage for a buyback-programme
// advertisement, and caches the answer. The detector, the measurements behind
// it, and the rule that this list never flags a car live in
// lib/buyback-dealer-signals.mjs.
//
// Bounded with --limit and cached like the other per-target lanes
// (gm-warranty.mjs, ford-sticker.mjs): a positive is a standing fact about the
// business and is kept; a negative is re-asked after RECHECK_DAYS, because a
// dealer can add a programme.

import { readFile, writeFile } from "node:fs/promises";
import { fetchPage } from "./lib/http.mjs";
import { readBrandedTitleSignals, readBuybackSignals, RECHECK_DAYS } from "./lib/buyback-dealer-signals.mjs";

const REGISTRY = new URL("./registry/registry.json", import.meta.url);
const CACHE = new URL("./registry/buyback-dealers.json", import.meta.url);

const sites = JSON.parse(await readFile(REGISTRY, "utf-8")).sites.filter((s) => s.status === "working");
let cache = {};
try {
  cache = JSON.parse(await readFile(CACHE, "utf-8"));
} catch {
  /* first run */
}

const today = new Date().toISOString().slice(0, 10);
const staleBefore = new Date(Date.now() - RECHECK_DAYS * 86_400_000).toISOString().slice(0, 10);

const due = sites
  .map((s) => s.domain)
  .filter((d) => {
    const hit = cache[d];
    if (!hit) return true;
    return !hit.hit && String(hit.checkedAt ?? "") < staleBefore;
  });

const limitArg = process.argv.indexOf("--limit");
const LIMIT = limitArg > -1 ? Number(process.argv[limitArg + 1]) : Infinity;
// A rooftop the sweep has never seen goes first. rebuiltdeals.com was added
// from the Oregon licence roll on 2026-09-09, crawled within hours, and its
// three rebuilt-title EVs were on the site before this sweep — which walks
// 1,500 of ~19,000 rooftops a day in registry order — would have reached it
// in weeks. New lots are where the unread disclosures are.
due.sort((a, b) => Number(Boolean(cache[a])) - Number(Boolean(cache[b])));
const work = due.slice(0, LIMIT);
console.error(`buyback-dealers: ${sites.length} working rooftops, ${due.length} due, doing ${work.length} this run`);

// Concurrency is across DISTINCT rooftops, never within one: lib/http.mjs
// keeps its own per-host interval and honours Crawl-delay, so N workers on N
// different dealers costs each of them exactly one visitor. Same argument the
// nightly crawl runs under.
const concArg = process.argv.indexOf("--concurrency");
const CONCURRENCY = concArg > -1 ? Math.max(1, Number(process.argv[concArg + 1])) : 8;

let found = 0;
let errors = 0;
let cursor = 0;
let done = 0;

async function worker() {
  while (cursor < work.length) {
    const domain = work[cursor++];
    try {
      const res = await fetchPage(`https://www.${domain}/`);
      if (res.status !== 200 || !res.body) {
        // Not an answer about the dealer — left uncached so it is retried.
        errors++;
      } else {
        const { hit, evidence } = readBuybackSignals(res.body);
        cache[domain] = hit ? { hit: true, evidence, checkedAt: today } : { hit: false, checkedAt: today };
        // A lot that presents itself as branded-title stock — a CANDIDATE for
        // registry/branded-title-dealers.json, reviewed by a person; see
        // lib/branded-title-dealers.mjs on why it is not applied from here.
        const bt = readBrandedTitleSignals(res.body, domain);
        if (bt.hit) cache[domain].brandedTitleLot = bt.evidence;
        if (hit) {
          found++;
          console.error(`  ${domain}: ${evidence.map((e) => e.href ?? e.text).join(" | ").slice(0, 100)}`);
        }
      }
    } catch {
      errors++;
    }
    if (++done % 200 === 0) {
      console.error(`buyback-dealers: ${done}/${work.length} (${found} found)`);
      await writeFile(CACHE, JSON.stringify(cache, null, 1));
    }
  }
}

await Promise.all(Array.from({ length: Math.min(CONCURRENCY, work.length) }, worker));

await writeFile(CACHE, JSON.stringify(cache, null, 1));
const total = Object.values(cache).filter((v) => v.hit).length;
{
  const { brandedTitleDealers } = await import("./lib/branded-title-dealers.mjs");
  const known = brandedTitleDealers();
  const candidates = Object.entries(cache).filter(([d, v]) => v.brandedTitleLot && !known.has(d));
  if (candidates.length) {
    console.error(`buyback-dealers: ${candidates.length} rooftop(s) present themselves as branded-title lots and are NOT in registry/branded-title-dealers.json — REVIEW each page and add the ones whose seller says it of every car:`);
    for (const [d, v] of candidates.slice(0, 20)) console.error(`    ${d}: ${v.brandedTitleLot[0]?.text ?? ""}`);
  }
}
console.error(
  `buyback-dealers: ${found} advertised a buyback programme this run (${total} known), ${errors} unreachable. ` +
    `This list only PRIORITISES vdp-notes.mjs; it flags no car.`
);
