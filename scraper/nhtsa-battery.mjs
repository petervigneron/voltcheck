#!/usr/bin/env node
// NHTSA battery record per cohort -> web/data/nhtsa-battery.json
//
// Monthly, by hand. Deliberately NOT in .github/workflows/nightly.yml: recall
// campaigns and complaint filings move on a scale of weeks, the run costs
// ~1,300 requests against a public API that answers a fifth of them with a
// gateway timeout, and nothing downstream needs it fresher. The night has
// enough to lose already.
//
//   node scraper/nhtsa-battery.mjs [--floor 5] [--limit N] [--resume]
//                                  [--concurrency 3] [--out PATH]
//
// --resume keeps every cohort already in the output file and fetches only the
// rest, which is how a run interrupted by NHTSA's timeouts is finished. The
// file is rewritten in full and key-sorted on every save, so a re-run with no
// arguments is a no-op on the diff apart from fetchedAt.
//
// What this does NOT do is guess. Every model name is resolved against
// NHTSA's own vocabulary first; a cohort whose name we cannot place is
// written with resolved: null and no counts, and the site renders nothing for
// it. The long version of why is at the top of lib/nhtsa.mjs.
import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { fetchWithRetry } from "./lib/retry.mjs";
import {
  API,
  cohortKey,
  classifyComplaint,
  isBatteryRecall,
  normName,
  recallCandidates,
  resolveModels,
  verifyRecall,
} from "./lib/nhtsa.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const FEED = resolve(HERE, "../web/data/scraped-listings.json");

function opt(name, fallback) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : fallback;
}
const flag = (name) => process.argv.includes(name);

const FLOOR = Number(opt("--floor", 5));
const LIMIT = Number(opt("--limit", 0)) || Infinity;
const CONCURRENCY = Number(opt("--concurrency", 3));
const OUT = resolve(opt("--out", resolve(HERE, "../web/data/nhtsa-battery.json")));
const RESUME = flag("--resume");

// NHTSA's gateway answers a large minority of requests with 504 "Endpoint
// request timed out" and recovers immediately, so the ladder is short and
// starts short — nothing like the two-minute database-recovery waits
// retry.mjs was written for. 400 is not in TRANSIENT and is not retried,
// which is what we want: recallsByVehicle uses 400 to mean "no recalls".
const WAITS = [2, 5, 10, 20, 45];

async function getJson(label, url) {
  const res = await fetchWithRetry(
    label,
    () => fetch(url, { signal: AbortSignal.timeout(45_000), headers: { accept: "application/json" } }),
    { waits: WAITS }
  );
  let body = null;
  try {
    body = JSON.parse(await res.text());
  } catch {
    body = null;
  }
  return { status: res.status, body };
}

// --- cohorts -----------------------------------------------------------

/** Distinct make/model/year of the used and certified cars we actually list,
 *  above a count floor. New cars are excluded on purpose: a shopper buying
 *  new gets the recall notice from the dealer, and this page is about the
 *  used one. */
async function cohorts() {
  const rows = JSON.parse(await readFile(FEED, "utf8"));
  const counts = new Map();
  const labels = new Map();
  for (const r of rows) {
    if (r.condition !== "used" && r.condition !== "certified") continue;
    if (!r.make || !r.model || !r.year) continue;
    const key = cohortKey(r.make, r.model, r.year);
    counts.set(key, (counts.get(key) ?? 0) + 1);
    if (!labels.has(key)) labels.set(key, { make: r.make, model: r.model, year: Number(r.year) });
  }
  return [...counts.entries()]
    .filter(([, n]) => n >= FLOOR)
    .sort((a, b) => b[1] - a[1])
    .map(([key, n]) => ({ key, n, ...labels.get(key) }));
}

// --- vocabulary --------------------------------------------------------

// Per make, per model year, per issue type — Ford's 2022 recall vocabulary
// and its 2023 one disagree about whether the Mach-E is spelled with "BEV".
// Cached as promises so the workers running in parallel share one fetch.
const vocabCache = new Map();
function vocabulary(make, year, issueType) {
  const key = `${normName(make)}|${year}|${issueType}`;
  if (!vocabCache.has(key)) {
    const url = `${API}/products/vehicle/models?modelYear=${year}&make=${encodeURIComponent(make)}&issueType=${issueType}`;
    vocabCache.set(
      key,
      getJson(`vocab ${key}`, url).then(({ body }) => (body?.results ?? []).map((r) => r.model).filter(Boolean))
    );
  }
  return vocabCache.get(key);
}

// --- one cohort --------------------------------------------------------

async function fetchCohort(c) {
  const vocabC = await vocabulary(c.make, c.year, "c");
  const resolved = resolveModels(c.make, c.model, vocabC);
  const fetchedAt = new Date().toISOString().slice(0, 10);
  if (!resolved) return { resolved: null, fetchedAt };

  // Complaints. Several NHTSA names can be one car ("EQE 350" and "EQE 350+"),
  // so the union is taken by ODI number rather than by adding counts up.
  const seen = new Map();
  for (const name of resolved) {
    const url = `${API}/complaints/complaintsByVehicle?make=${encodeURIComponent(c.make)}&model=${encodeURIComponent(name)}&modelYear=${c.year}`;
    const { status, body } = await getJson(`complaints ${c.key}`, url);
    if (status !== 200 || !Array.isArray(body?.results)) {
      // A name we resolved but could not read is not a zero. Bail rather than
      // publish an undercount that looks like a clean record.
      return { resolved, fetchedAt, error: `complaints HTTP ${status}` };
    }
    for (const r of body.results) seen.set(r.odiNumber, r);
  }
  let complaintsBattery = 0;
  let complaintsPack = 0;
  let fires = 0;
  for (const r of seen.values()) {
    const k = classifyComplaint(r);
    if (!k.battery) continue;
    complaintsBattery++;
    if (k.pack) complaintsPack++;
    if (r.fire === true) fires++;
  }

  // Recalls, through their own vocabulary problem (lib/nhtsa.mjs note 3).
  // recallsAsked records that at least one candidate name was answered, which
  // is the difference between "no battery recalls on file" and "we could not
  // ask" — the page treats those differently.
  const campaigns = new Map();
  let recallsAsked = false;
  const candidates = recallCandidates(c.make, c.model, await vocabulary(c.make, c.year, "r"));
  for (const name of candidates) {
    const url = `${API}/recalls/recallsByVehicle?make=${encodeURIComponent(c.make)}&model=${encodeURIComponent(name)}&modelYear=${c.year}`;
    const { status, body } = await getJson(`recalls ${c.key}`, url);
    // 400 with a "Results returned successfully" body is NHTSA's way of
    // saying zero; it is an answer, not a failure.
    if (status === 400 && body?.Message) {
      recallsAsked = true;
      continue;
    }
    if (status !== 200 || !Array.isArray(body?.results)) continue;
    recallsAsked = true;
    for (const r of body.results) {
      if (!verifyRecall(candidates, r)) continue;
      campaigns.set(r.NHTSACampaignNumber, r);
    }
  }

  const recallsBattery = [...campaigns.values()]
    .filter(isBatteryRecall)
    .sort((a, b) => String(a.NHTSACampaignNumber).localeCompare(String(b.NHTSACampaignNumber)))
    .map((r) => ({
      campaign: r.NHTSACampaignNumber,
      component: r.Component,
      summary: r.Summary,
    }));

  return {
    resolved,
    complaintsTotal: seen.size,
    complaintsBattery,
    complaintsPack,
    fires,
    recallsTotal: recallsAsked ? campaigns.size : null,
    recallsBattery: recallsAsked ? recallsBattery : null,
    fetchedAt,
  };
}

// --- run ---------------------------------------------------------------

async function main() {
  const list = (await cohorts()).slice(0, LIMIT);
  const out = {};
  if (RESUME && existsSync(OUT)) {
    Object.assign(out, JSON.parse(await readFile(OUT, "utf8")));
    console.error(`resuming: ${Object.keys(out).length} cohorts already on file`);
  }
  const todo = list.filter((c) => !(c.key in out));
  console.error(
    `${list.length} cohorts at floor ${FLOOR} (${todo.length} to fetch), concurrency ${CONCURRENCY} -> ${OUT}`
  );

  const save = async () => {
    const sorted = Object.fromEntries(Object.keys(out).sort().map((k) => [k, out[k]]));
    await writeFile(OUT, `${JSON.stringify(sorted, null, 1)}\n`);
  };

  let done = 0;
  let cursor = 0;
  const worker = async () => {
    while (cursor < todo.length) {
      const c = todo[cursor++];
      try {
        out[c.key] = await fetchCohort(c);
      } catch (e) {
        console.error(`${c.key}: ${e?.message ?? e}`);
      }
      done++;
      const r = out[c.key];
      console.error(
        `[${done}/${todo.length}] ${c.key} (${c.n}) ${
          r?.resolved
            ? `-> ${r.resolved.join(" / ")} | complaints ${r.complaintsBattery}/${r.complaintsTotal} battery, ${r.complaintsPack} pack | recalls ${r.recallsBattery?.length ?? "?"}/${r.recallsTotal ?? "?"}${r.error ? ` | ${r.error}` : ""}`
            : "UNRESOLVED"
        }`
      );
      // Checkpoint often: the run is long and NHTSA is not reliable enough to
      // bet an hour of it on finishing.
      if (done % 10 === 0) await save();
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, CONCURRENCY) }, worker));
  await save();

  const vals = Object.values(out);
  const resolved = vals.filter((v) => v.resolved).length;
  const withRecalls = vals.filter((v) => v.recallsBattery?.length).length;
  console.error(
    `wrote ${vals.length} cohorts: ${resolved} resolved, ${vals.length - resolved} unresolved, ${withRecalls} with battery recalls`
  );
}

await main();
