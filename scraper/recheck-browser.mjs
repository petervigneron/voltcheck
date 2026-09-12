#!/usr/bin/env node
// The cars recheck cannot read at all, looked at in a real browser.
//
//   node recheck-browser.mjs [--limit 600] [--concurrency 2] [--stale-days 7]
//                            [--deadline-min N] [--vin V[,V…]] [--dry-run]
//
// WHY THIS EXISTS (measured 2026-09-12)
//
// recheck.mjs asks each live listing's own dealer page whether the car is
// still for sale. ~19,700 of ~106,000 pages a night answer 403 or time out to
// the plain fetch — the client is rejected, not the visitor (lib/browser.mjs's
// header has the measurement) — and a page that proves nothing leaves the car
// with no verdict, every night, for ever.
//
// For the four marketplace-fed lanes that is not an abstract problem, because
// their rows have NO other delisting path: db-sync's completeness guard can
// never retire them (the lanes are truncated by design) and recheck is all
// there is. lib/recheck-oem-crosscheck.mjs closed most of the hole today by
// striking a car the lane's OWN national sweep has stopped listing. What it
// cannot touch is the residue: the marketplace still lists the car, the
// dealer's page answers 403 to us, and in a real browser the page is a
// "missing vehicle" redirect. 18 of 24 sampled were gone that way — including
// the owner's example, 1FT6W1EV2PWG58901, whose Boniface Hiers Chevrolet page
// answers 403 to fetch and does not exist on the real site.
//
// 2,179 live rows were in that position when this was written (ford-blue-
// advantage 384, honda-prologue 1,169, hyundai-cpo 554, audi-network 72 —
// rows on those domains whose sourceUrl is a page about the car and which
// recheck has never confirmed, or not in a week).
//
// WHAT IT IS ALLOWED TO SAY
//
// lib/recheck-browser-verdict.mjs is the whole judgment and its header is the
// argument. In one line: only the site's own statement counts — a redirect to
// a missing-vehicle handler, an inventory index or the homepage, or a 404 —
// and it is always a SOFT strike, so 0004's two-consecutive-nights rule still
// stands between a browser reading and a delisting. "200 at the VDP and the
// VIN is not in the body" is the fetch rule that the cross-check exists to
// outvote on exactly these domains, and it concludes nothing here.
//
// WHAT IT COSTS, AND THE SHAPE THAT KEEPS IT AFFORDABLE
//
// A Chrome page load is ~30x the CPU and ~10x the wall time of a fetch, so
// this is capped at 600 pages a night and runs two at a time. It is not a
// second recheck and must never grow into one: it visits only the residue,
// oldest first, dealt round-robin across hosts (lib/http.mjs paces one request
// per host per 1.1s, so two workers on one rooftop wait on each other). Same
// browser, same robots gate, same x-crawler declaration, same refusal to solve
// a challenge as every other browser lane; a host that answers with a wall
// twice is dropped for the rest of the run rather than asked a third time.
import { readFile } from "node:fs/promises";
import { readSnapshot } from "./lib/snapshot.mjs";
import { fetchWithRetry } from "./lib/retry.mjs";
import { browserFetch, browserUnavailable, closeBrowser } from "./lib/browser.mjs";
import { classifyBrowserRecheck, selectResidue, normalizeUrl } from "./lib/recheck-browser-verdict.mjs";
import { RECHECK_CROSSCHECK_DOMAINS, oemAliveVins, oemSweepCounts, sweepSaysGone } from "./lib/recheck-oem-crosscheck.mjs";

function flag(name, fallback) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? Number(process.argv[i + 1]) : fallback;
}
const LIMIT = flag("--limit", 600);
const CONCURRENCY = Math.max(1, flag("--concurrency", 2));
const STALE_DAYS = flag("--stale-days", 7);
const DEADLINE_MIN = flag("--deadline-min", 0);
const DEADLINE_AT = DEADLINE_MIN > 0 ? Date.now() + DEADLINE_MIN * 60_000 : Infinity;
const DRY = process.argv.includes("--dry-run");
// --vin V[,V…]: visit exactly these, same verdict rules and same write path.
// The operator's tool — and the only mode that does not need the service key,
// since the list itself replaces the never/stale-confirmed filter.
const ONLY_VINS = new Set(
  (process.argv[process.argv.indexOf("--vin") + 1] ?? "")
    .split(",").map((v) => v.trim().toUpperCase()).filter(Boolean)
    .filter(() => process.argv.includes("--vin"))
);
// Validated here rather than where they are used, for recheck's reason: a
// mistyped number fails SILENTLY. `slice(0, NaN)` is an empty list and
// `Math.min(NaN, n)` workers is no workers, so a typo would spend the night
// visiting nothing and exit 0.
for (const [name, value] of [["--limit", LIMIT], ["--concurrency", CONCURRENCY], ["--stale-days", STALE_DAYS], ["--deadline-min", DEADLINE_MIN]]) {
  if (!Number.isFinite(value) || value < 0) {
    console.error(`recheck-browser: ${name} must be a non-negative number, got ${JSON.stringify(process.argv[process.argv.indexOf(name) + 1])}`);
    process.exit(1);
  }
}

async function loadEnv(url) {
  try {
    const text = await readFile(url, "utf-8");
    for (const line of text.split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (m && !line.trimStart().startsWith("#") && !(m[1] in process.env)) {
        process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
      }
    }
  } catch {}
}
await loadEnv(new URL("./.env", import.meta.url));

const {
  SUPABASE_URL,
  SUPABASE_ANON_KEY: ANON,
  SUPABASE_INGEST_TOKEN: TOKEN,
  SUPABASE_SERVICE_ROLE_KEY: SERVICE,
} = process.env;
if (!SUPABASE_URL || !ANON) {
  console.error("recheck-browser: no Supabase credentials (scraper/.env) — nothing to check.");
  process.exit(0);
}

// THE SERVICE KEY, and why this job needs one where recheck does not.
//
// "Never confirmed, or not in a week" is what separates the residue from the
// 14,000 cars on these lanes whose pages recheck reads fine every night, and
// that fact lives in listing_seen.last_confirmed_at. 0026 revoked anon's
// select on listing_seen (the sighting history of delisted cars is archive,
// and the live half is already in the feed view), so anon cannot ask.
//
// Without the filter this job would spend its 600 browser loads on whatever
// sorted first, which is worse than not running: it is the same cost with
// none of the point. So it declines instead, out loud. --vin is unaffected —
// an operator naming VINs has already done the selecting.
const READ_KEY = SERVICE ?? ANON;
if (!SERVICE && !ONLY_VINS.size) {
  console.error(
    "recheck-browser: SUPABASE_SERVICE_ROLE_KEY unset, so listing_seen.last_confirmed_at " +
      "cannot be read (0026 revoked anon's select) and the residue cannot be told from the " +
      "rest of these lanes. Declining rather than spending 600 browser loads on the wrong cars. " +
      "Use --vin to check named VINs without it."
  );
  process.exit(0);
}

// One request per 1,000 rows, keyset on vin exactly as recheck walks (the
// long note above recheck.mjs's own loop is why it is not Range/OFFSET), and
// narrowed to the four marketplace-fed domains at the database rather than
// here: `listings_live_domain` makes that filter nearly free, and it takes the
// walk from ~106,000 rows to 16,529. Measured 2026-09-12 at limit=500 over
// anon: 34 pages, 6.8s, 3.54 MB. Pages of 1,000 blew anon's 3s statement
// timeout on a cold cache, which is why the page is 500 — service_role's
// budget is 60s, but a page that needs three of them is a page that will fail
// some night on a busy box.
//
// The dealer_domain COLUMN is the filter and payload->>dealerDomain is what
// the rest of this script reads, because the column is last-writer-wins across
// lanes (0001) while the payload is the row's own lane. On these four they
// agreed on every one of 16,529 live rows when this was written; the payload
// stays the authority all the same, and selectResidue re-checks it.
//
// listing_seen rides along as an embed rather than as its own pass: the FK is
// PK-to-PK, so it plans as one index lookup per row (EXPLAIN of the equivalent
// lateral on prod, 2026-09-12: 0.05 ms × 500, 675 ms for the page, ~23 s for
// the whole walk). The relationship resolves for anon too — it answers 42501
// permission-denied, not "could not find a relationship", which is the control
// test that this select is well-formed and only the grant is missing.
async function fetchRows() {
  const rows = [];
  const embed = SERVICE ? ",listing_seen(last_confirmed_at)" : "";
  for (let after = ""; ; ) {
    const url =
      `${SUPABASE_URL}/rest/v1/listings?select=vin,sourceUrl:payload->>sourceUrl` +
      `,dealerDomain:payload->>dealerDomain${embed}` +
      `&delisted_at=is.null` +
      (ONLY_VINS.size
        ? `&vin=in.(${[...ONLY_VINS].join(",")})`
        : `&dealer_domain=in.(${[...RECHECK_CROSSCHECK_DOMAINS].join(",")})`) +
      (after ? `&vin=gt.${encodeURIComponent(after)}` : "") +
      `&order=vin.asc&limit=500`;
    const res = await fetchWithRetry(`recheck-browser: listing fetch after ${after || "start"}`, () =>
      fetch(url, { headers: { apikey: READ_KEY, Authorization: `Bearer ${READ_KEY}`, "Accept-Encoding": "gzip" } })
    );
    if (!res.ok) {
      console.error(`recheck-browser: listing fetch failed HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
      process.exit(1);
    }
    const page = await res.json();
    for (const r of page) {
      const seen = Array.isArray(r.listing_seen) ? r.listing_seen[0] : r.listing_seen;
      rows.push({
        vin: String(r.vin ?? "").toUpperCase(),
        sourceUrl: r.sourceUrl,
        dealerDomain: r.dealerDomain,
        lastConfirmedAt: seen?.last_confirmed_at ?? null,
      });
    }
    if (page.length < 500) break;
    after = page[page.length - 1].vin;
  }
  return rows;
}

const rows = await fetchRows();

// Tonight's own sweep, read from the merged nightly feed the same way
// recheck.mjs reads it (nightly.yml hands this job the same finalize-ingest
// artifact). It is used here only to SKIP work: a VIN the sweep has already
// dropped is being struck by recheck tonight anyway, so a browser load on it
// buys nothing. A missing or short sweep skips nothing — absence of evidence.
let oemAlive = new Set();
let oemCounts = new Map();
try {
  const feed = await readSnapshot(new URL("../web/data/scraped-listings.json", import.meta.url));
  oemAlive = oemAliveVins(feed);
  oemCounts = oemSweepCounts(feed);
  console.error(`recheck-browser: ${oemAlive.size} VINs from tonight's own sweep loaded`);
} catch {
  console.error("recheck-browser: no nightly feed to read tonight's sweep from — nothing is skipped on its account");
}

const work = selectResidue(rows, {
  staleDays: STALE_DAYS,
  limit: ONLY_VINS.size ? 0 : LIMIT,
  // An operator naming VINs gets them visited; the sweep only prunes the
  // nightly's own selection.
  sweepSaysGone: ONLY_VINS.size ? () => false : (vin, domain) => sweepSaysGone(vin, domain, oemAlive, oemCounts),
});
console.error(
  `recheck-browser: ${work.length} residue pages to visit ` +
    `(of ${rows.length} live rows on the four marketplace-fed lanes, ` +
    `never confirmed or not in ${STALE_DAYS} days, cap ${ONLY_VINS.size ? "none" : LIMIT}, ` +
    `${CONCURRENCY} at a time)`
);
const why = await browserUnavailable();
if (why) {
  console.error(`recheck-browser: no browser on this machine (${why}) — nothing to do.`);
  process.exit(0);
}

const alive = [], softGone = [];
const reasons = new Map();
// A host that answers with a wall twice is done for the night: we do not solve
// challenges and asking again is just load on someone who has said no.
const strikes = new Map(), walled = new Set();
let cursor = 0, none = 0, skippedWalled = 0;

async function worker() {
  while (cursor < work.length && Date.now() < DEADLINE_AT) {
    const l = work[cursor++];
    const host = normalizeUrl(l.sourceUrl)?.host ?? "";
    if (walled.has(host)) {
      skippedWalled++;
      continue;
    }
    const res = await browserFetch(l.sourceUrl, {
      // Wait for the string the verdict is about, not for a page that may
      // never stop loading (lib/browser.mjs's own note). A VDP that carries
      // the car answers in a second or two; a missing-vehicle handler has
      // already redirected by then and is judged on where it landed.
      waitForText: l.vin,
      waitForMs: 6000,
      settleMs: 800,
      timeoutMs: 30000,
    });
    const { verdict, reason } = classifyBrowserRecheck({
      vin: l.vin,
      url: l.sourceUrl,
      status: res.status,
      finalUrl: res.finalUrl,
      body: res.body,
    });
    reasons.set(reason, (reasons.get(reason) ?? 0) + 1);
    if (reason.startsWith("challenge") || reason === "http-403" || reason === "http-429") {
      const n = (strikes.get(host) ?? 0) + 1;
      strikes.set(host, n);
      if (n >= 2) walled.add(host);
    } else {
      strikes.delete(host);
    }
    if (verdict === "alive") alive.push(l.vin);
    else if (verdict === "softGone") softGone.push(l.vin);
    else none++;
    if (verdict !== "alive") {
      console.error(
        `recheck-browser: ${l.vin} ${l.dealerDomain} ${verdict} (${reason}) ${res.status} ${l.sourceUrl}` +
          (res.finalUrl && res.finalUrl !== l.sourceUrl ? ` → ${res.finalUrl}` : "")
      );
    }
  }
}
await Promise.all(Array.from({ length: Math.min(CONCURRENCY, work.length) }, worker));
await closeBrowser();

const unvisited = work.length - (alive.length + softGone.length + none + skippedWalled);
console.error(
  `recheck-browser: ${alive.length} still listed, ${softGone.length} struck (the site's own page says the car is gone), ` +
    `${none} no conclusion` +
    (skippedWalled ? `, ${skippedWalled} skipped on ${walled.size} walled host${walled.size === 1 ? "" : "s"}` : "") +
    (unvisited > 0 ? `, ${unvisited} left for the next run (${DEADLINE_MIN}-minute deadline)` : "")
);
console.error(
  `recheck-browser: reasons — ${[...reasons].sort((a, b) => b[1] - a[1]).map(([r, n]) => `${r} ${n}`).join(", ") || "none"}`
);

if (DRY) {
  console.error("[dry run — nothing written]");
  process.exit(0);
}
if (!TOKEN) {
  console.error("recheck-browser: no ingest token — cannot write results.");
  process.exit(0);
}

async function write(label, payload) {
  const res = await fetchWithRetry(label, () =>
    fetch(`${SUPABASE_URL}/functions/v1/ingest`, {
      method: "POST",
      headers: {
        apikey: ANON,
        Authorization: `Bearer ${ANON}`,
        "x-ingest-token": TOKEN,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ dataset: "recheck", rows: [], alive: [], hardGone: [], softGone: [], ...payload }),
    })
  );
  if (!res.ok) {
    console.error(`recheck-browser: FAILED HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
    process.exit(1);
  }
  return res.json();
}

// The strikes go first and in exactly ONE request, for the reason recheck's
// own write says at length: 0004 counts misses PER CALL, so a VIN that landed
// in two requests would take two strikes in one night and delist a night
// early. This job's whole output fits in one request either way — it is capped
// at 600 rows — but the rule is the rule, and a cap is not an invariant.
const gone = softGone.length ? await write("recheck-browser: result write (strikes)", { softGone }) : {};
// Alive rows carry the VIN and nothing else. A rendered page is a different
// price surface from the fetched HTML lib/recheck-price.mjs was measured on,
// and a confirmation that the car is still listed makes no claim about what
// it costs. What this write does buy is real: it clears the car's strike
// count and stamps last_confirmed_at, which is what takes it out of tomorrow
// night's residue.
const live = alive.length ? await write("recheck-browser: result write (alive)", { alive: alive.map((vin) => ({ vin })) }) : {};
console.error(
  `recheck-browser: wrote ${live.confirmed ?? 0} confirmations, ${gone.struck ?? 0} strikes, ${gone.delisted ?? 0} delisted`
);
