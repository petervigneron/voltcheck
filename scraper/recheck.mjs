#!/usr/bin/env node
// Ask every live listing's own page whether it is still for sale.
//
// The nightly crawl discovers inventory but is page-budgeted, so absence
// from a crawl never proved a car sold. Each listing stores its own
// sourceUrl, so we can check directly — one request per car, which is both
// cheaper and far better evidence than re-crawling a whole site.
//
//   node recheck.mjs [--concurrency 8] [--limit N] [--dry-run]
//
// Verdicts (see supabase/migrations/0004):
//   alive      200 and the VIN appears on the page  -> confirm + refresh price
//   hard gone  404/410                              -> delist now
//   soft gone  200 but no VIN                       -> strike; delist on 2nd
//   anything else (403, timeout, 5xx)               -> no conclusion
import { readFile } from "node:fs/promises";
import { readSnapshot } from "./lib/snapshot.mjs";
import { fetchRaw } from "./lib/http.mjs";
import { fetchWithRetry } from "./lib/retry.mjs";
import { OEM_LOCATOR_DOMAINS as GM_LOCATOR_DOMAINS } from "./lib/oem/gm.mjs";
import { HYUNDAI } from "./lib/oem/hyundai.mjs";
import { KIA } from "./lib/oem/kia.mjs";
import { OEM_LOCATOR_DOMAINS as NISSAN_LOCATOR_DOMAINS } from "./lib/oem/nissan.mjs";
import { OEM_LOCATOR_DOMAINS as BMW_LOCATOR_DOMAINS } from "./lib/oem/bmw.mjs";
import { OEM_LOCATOR_DOMAINS as MERCEDES_LOCATOR_DOMAINS } from "./lib/oem/mercedes.mjs";
import { OEM_LOCATOR_DOMAINS as STELLANTIS_LOCATOR_DOMAINS } from "./lib/oem/stellantis.mjs";
import { OEM_LOCATOR_DOMAINS as GENESIS_LOCATOR_DOMAINS } from "./lib/oem/genesis.mjs";
import { OEM_LOCATOR_DOMAINS as SUBARU_LOCATOR_DOMAINS } from "./lib/oem/subaru.mjs";
import { OEM_LOCATOR_DOMAINS as VW_LOCATOR_DOMAINS } from "./lib/oem/vw.mjs";
import { OEM_LOCATOR_DOMAINS as POLESTAR_LOCATOR_DOMAINS } from "./lib/oem/polestar.mjs";
import { OEM_LOCATOR_DOMAINS as ENTERPRISE_LOCATOR_DOMAINS } from "./lib/oem/enterprise.mjs";
import { OEM_LOCATOR_DOMAINS as LEXUS_LOCATOR_DOMAINS } from "./lib/oem/toyota.mjs";
import { OEM_LOCATOR_DOMAINS as LUCID_LOCATOR_DOMAINS } from "./lib/oem/lucid.mjs";
import { OEM_LOCATOR_DOMAINS as DRIVEWAY_LOCATOR_DOMAINS } from "./lib/oem/driveway.mjs";
import { OEM_LOCATOR_DOMAINS as ECHOPARK_LOCATOR_DOMAINS } from "./lib/oem/echopark.mjs";
import { OEM_LOCATOR_DOMAINS as ACURA_CPO_LOCATOR_DOMAINS } from "./lib/oem/acura-cpo.mjs";
import { OEM_LOCATOR_DOMAINS as MAZDA_LOCATOR_DOMAINS } from "./lib/oem/mazda.mjs";
import { OEM_LOCATOR_DOMAINS as MITSUBISHI_LOCATOR_DOMAINS } from "./lib/oem/mitsubishi.mjs";
import { oemAliveVins, trustGoneVerdict } from "./lib/recheck-oem-crosscheck.mjs";
import { priceOf } from "./lib/recheck-price.mjs";

// Every OEM-locator source domain: recheck skips these (see the filter below).
// (Ford Blue Advantage, Honda and Audi are intentionally NOT here — their rows
// carry real dealer VDPs, so recheck verifies them per the normal path.
// enterprisecarsales.com IS here: Enterprise is the merchant itself and its
// pull is the complete index nightly, so the sweep is the liveness check.)
//
// vw.com IS here, and for a sharper reason than the rest: its per-car page is
// a client-rendered shell that returns byte-identical 200s for a real and a
// fabricated car key and never contains the VIN. Rechecking it would not just
// be useless, it would trip the "200 but no VIN" soft-gone rule on every VW
// row and delist the entire lane. vw.mjs certifies its pull complete instead.
// polestar-preowned IS here for exactly the same measured reason (a real ad id
// and an all-zeroes one both return the same 3,715-byte shell); volvo-cpo is
// deliberately NOT, because its rows carry real dealer VDPs that drop the VIN
// when the car is gone, which is evidence recheck can act on.
//
// lexus.com IS here for exactly the vw.com reason, established the same way:
// /search-inventory/{details,vehicle}/{vin} returns byte-identical 31,591-byte
// HTML for a real VIN and a fabricated one, with the VIN nowhere in the body,
// and the payload carries no per-VIN dealer VDP to fall back on. toyota.mjs
// certifies its pull complete instead — off a covering proof over Lexus's own
// national dealer directory, not a sample.
//
// echopark.com IS here, and for the bluntest reason of the lot: its /car/{VIN}
// pages answer 403 to us outright (Akamai, measured on 7 sampled VINs
// 2026-08-23, while /used-cars answered 200 thirteen times in the same
// session). A recheck of one could never say "alive" — only "gone" — so
// letting recheck near this domain would delist the whole lane. echopark.mjs
// certifies its own sweep complete instead.
//
// mazdausa.com IS here, for the mirror image of the vw.com problem: its
// per-VIN page answers 200 with the VIN echoed for a VIN that does not exist
// (measured 2026-08-23 against JM3KKCHA8T1000000, alongside a real one), so a
// VIN-present reading would call a sold car alive and the page can never say
// "gone". mazda.mjs certifies its own national sweep complete instead.
//
// mitsubishicars.com IS here for exactly the vw.com reason, established the
// same way: /vehicle/{id}/{age}/{year}/… returns a BYTE-IDENTICAL 10,517-byte
// shell for a real car and for a fabricated id+VIN, and the VIN appears in it
// only because it is in the URL. mitsubishi.mjs certifies its own sweep too.
const OEM_LOCATOR_DOMAINS = new Set([...GM_LOCATOR_DOMAINS, HYUNDAI.domain, KIA.domain, ...NISSAN_LOCATOR_DOMAINS, ...BMW_LOCATOR_DOMAINS, ...MERCEDES_LOCATOR_DOMAINS, ...STELLANTIS_LOCATOR_DOMAINS, ...GENESIS_LOCATOR_DOMAINS, ...VW_LOCATOR_DOMAINS, ...POLESTAR_LOCATOR_DOMAINS, ...ENTERPRISE_LOCATOR_DOMAINS, ...LEXUS_LOCATOR_DOMAINS, ...LUCID_LOCATOR_DOMAINS, ...SUBARU_LOCATOR_DOMAINS, ...DRIVEWAY_LOCATOR_DOMAINS, ...ECHOPARK_LOCATOR_DOMAINS, ...ACURA_CPO_LOCATOR_DOMAINS, ...MAZDA_LOCATOR_DOMAINS, ...MITSUBISHI_LOCATOR_DOMAINS]);

function flag(name, fallback) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? Number(process.argv[i + 1]) : fallback;
}
const CONCURRENCY = flag("--concurrency", 8);
const LIMIT = flag("--limit", 0);
const DRY = process.argv.includes("--dry-run");
// Stop fetching after this many minutes and write what we have. recheck's
// whole night rides on the single terminal ingest POST below, so being killed
// mid-run (finalize's job timeout did this every night from 08-17, discarding
// the entire sold-signal — delistings fell to zero) forfeits everything. With
// a deadline the loop bails early and still reaches the write: a slow night
// lands the delistings it found and leaves the rest for tomorrow, which is the
// conservative direction. Anchored at process start (≈ job start). 0 = no cap.
const DEADLINE_MIN = flag("--deadline-min", 0);
const DEADLINE_AT = DEADLINE_MIN > 0 ? Date.now() + DEADLINE_MIN * 60_000 : Infinity;
// How many alive rows go in one write request. See the long note above the
// write itself for why this number is the whole fix. Parsed and validated HERE
// rather than down there because the failure mode is silent — `i += NaN` makes
// the write loop exit on its first test, so a typo would spend the night
// fetching and then write nothing at all, exiting 0.
const ALIVE_CHUNK = flag("--alive-chunk", 5000);
if (!Number.isInteger(ALIVE_CHUNK) || ALIVE_CHUNK < 1) {
  console.error(`recheck: --alive-chunk must be a positive integer, got ${JSON.stringify(process.argv[process.argv.indexOf("--alive-chunk") + 1])}`);
  process.exit(1);
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

const { SUPABASE_URL, SUPABASE_ANON_KEY: ANON, SUPABASE_INGEST_TOKEN: TOKEN } = process.env;
if (!SUPABASE_URL || !ANON) {
  console.error("recheck: no Supabase credentials (scraper/.env) — nothing to check.");
  process.exit(0);
}

// Recheck reads through the same door db-sync and the price audit just
// leaned on, and both nights it failed (HTTP 521 on 08-15, HTTP 500 on
// 08-17) it died inside the database's post-OOM recovery window with no
// retry at all, forfeiting the night's only sold-signal. See lib/retry.mjs
// for why the waits are what they are.

// Live listings straight from the DB — the recheck is about what the site
// is currently showing, not what last night's crawl happened to find.
//
// KEYSET, not Range/OFFSET, and the difference is the whole job. This loop
// used to ask for `Range: <from>-<from+999>`, which PostgREST turns into
// OFFSET — so the database had to produce and throw away every row before the
// one asked for. The cost grew with the offset, and on 2026-08-23 it finally
// crossed anon's 3s statement_timeout partway down the feed:
//
//   recheck: listing fetch rows 96000+: HTTP 500 — retrying in 30s
//   recheck: listing fetch rows 96000+: HTTP 500 — retrying in 120s
//   recheck: listing fetch rows 96000+: HTTP 500 — retrying in 240s
//   recheck: listing fetch failed HTTP 500
//
// The retries could not help: nothing about the query gets cheaper on a
// second attempt. Measured on a healthy idle instance the same day —
//
//   OFFSET 96000 LIMIT 1000  ->  18,538 ms, 87,193 buffers, 97,000 rows read
//   WHERE vin > '<last>'     ->      17.9 ms,    938 buffers,  1,000 rows read
//
// — a thousandfold, and more to the point a CONSTANT: the keyset form costs
// the same at row 96,000 as at row 0, so it does not quietly re-break the
// night coverage grows past some new threshold. That is exactly how this one
// arrived; the same loop was fine at 58k rows and fine at 87k.
//
// This is the shape web/lib/listings/db.ts has walked the feed with all
// along (`vin=gt.`), for the same reason. The two lanes now agree.
//
// NARROW, not `payload` — a separate fix to the same read. Keyset above fixed
// what the database has to COMPUTE; this fixes what crosses the WIRE, which is
// what Supabase actually bills. Selecting the whole payload dragged every
// listing's description, image list and enrichment across the network nightly
// when the only fields anything downstream of this read touches are the four
// named below.
//
// Measured on one 1000-row page, wire bytes, 2026-08-24:
//
//   select=…narrow…  + Accept-Encoding      46,777
//   select=…,payload + Accept-Encoding     265,922   (5.7x)
//   select=…,payload, no Accept-Encoding 1,183,148  (25.3x)
//
// At 132,147 live rows that is ~6 MB a night instead of ~35, or ~157 —
// the last of which is ~4.7 GB/month, essentially the entire 5 GB quota on
// this one read. (Egress hit 661% of quota on 2026-08-17, which is what sent
// anyone looking at this line.)
//
// The Accept-Encoding header is deliberate but no longer load-bearing on its
// own: when this fix was first written Node's fetch sent no Accept-Encoding
// at all and Supabase answered uncompressed, which was the bigger half of the
// 25x. On Node 24 undici sends it by default — the middle row above is already
// gzipped without us asking — so today's realized win is the 5.7x from the
// narrowing. Setting it explicitly keeps the other 4.4x from silently
// re-opening if the runtime's default changes again, and matches what
// web/lib/listings/db.ts does for the same reason. undici decompresses
// transparently either way, so res.json() below is unchanged.
//
// All four aliases read `payload`, deliberately: `listings` also has its own
// `year`, `condition` and `dealer_domain` columns, but those are written by a
// different path (dealer_domain is last-writer-wins across lanes), and the
// point of this change is to shrink the wire without changing which value any
// line below reads. Verified field-by-field against the wide select on live
// rows before the swap. Adding a field to this script means adding it here
// too — a missing alias reads `undefined`, which is silent.
const listings = [];
for (let after = ""; ; ) {
  const res = await fetchWithRetry(`recheck: listing fetch after ${after || "start"}`, () =>
    fetch(
      `${SUPABASE_URL}/rest/v1/listings?select=vin,price_usd` +
        `,sourceUrl:payload->>sourceUrl,dealerDomain:payload->>dealerDomain` +
        `,condition:payload->>condition,year:payload->>year` +
        `&delisted_at=is.null` +
        (after ? `&vin=gt.${encodeURIComponent(after)}` : "") +
        `&order=vin.asc&limit=1000`,
      {
        headers: {
          apikey: ANON,
          Authorization: `Bearer ${ANON}`,
          "Accept-Encoding": "gzip",
        },
      }
    )
  );
  if (!res.ok) {
    console.error(`recheck: listing fetch failed HTTP ${res.status}`);
    process.exit(1);
  }
  const page = await res.json();
  listings.push(...page);
  if (page.length < 1000) break;
  after = page[page.length - 1].vin;
}
// OEM-locator listings are excluded on two grounds: the locator pull is
// complete national coverage nightly (its truncated:false already retires
// gone VINs via db-sync — recheck exists for page-budgeted crawls that can't
// prove absence), and their VDP pages are client-rendered shells that echo
// the VIN from the URL, which would read as "alive" forever. They would also
// be tens of thousands of same-host fetches at the polite rate.
const targets = listings.filter(
  (l) => l.sourceUrl && !OEM_LOCATOR_DOMAINS.has(l.dealerDomain)
);
const skippedOem = listings.filter((l) => OEM_LOCATOR_DOMAINS.has(l.dealerDomain)).length;
const work = LIMIT ? targets.slice(0, LIMIT) : targets;
console.error(
  `recheck: ${work.length} live listings with a source URL ` +
  `(${listings.length - targets.length - skippedOem} without, ${skippedOem} OEM-locator rows skipped)`
);

// Four domains (hyundai-cpo, ford-blue-advantage, honda-prologue,
// audi-network) are always-truncated by design, so db-sync's completeness
// guard can never delist them — recheck's per-VDP check above is their ONLY
// delisting path, and it has a measured false-negative rate on exactly these
// domains (docs/agents/relist-churn-2026-08-21.md: a daily delist/relist
// drumbeat since tracking began, 94-100% of it via recheck). Their own
// locator sweep, by contrast, has good national coverage — that's why
// db-sync already trusts it enough to relist a VIN the moment it reappears
// there. So before delisting on these four domains, cross-check the verdict
// against tonight's own sweep: if it still lists the VIN, one dealer VDP's
// rendering quirk doesn't outvote a national inventory pull. (Nissan's two
// synthetic domains are a different case, already excluded from recheck
// entirely above via OEM_LOCATOR_DOMAINS — see lib/recheck-oem-crosscheck.mjs
// for why they don't belong here too.) Read from the same merged feed
// db-sync just wrote to Supabase (this job's own checkout, already fresh
// from tonight's commit) — no extra fetches, no DB read. Missing/unreadable
// feed degrades to the unchanged behavior (every verdict trusted), never
// the reverse.
let oemAlive = new Set();
try {
  const feedUrl = new URL("../web/data/scraped-listings.json", import.meta.url);
  const feed = await readSnapshot(feedUrl);
  oemAlive = oemAliveVins(feed);
  console.error(`recheck: ${oemAlive.size} VINs from tonight's own OEM-locator sweep loaded for cross-check`);
} catch {
  console.error("recheck: no nightly feed to cross-check OEM-locator domains against — verdicts pass through unchanged");
}
let crossChecked = 0;

const alive = [], hardGone = [], softGone = [];
let errors = 0, cursor = 0;

async function worker() {
  while (cursor < work.length && Date.now() < DEADLINE_AT) {
    const l = work[cursor++];
    const vin = l.vin.toUpperCase();
    let res;
    try {
      res = await fetchRaw(l.sourceUrl, { timeoutMs: 20000 });
    } catch {
      errors++;
      continue;
    }
    const domain = l.dealerDomain;
    if (res.status === 404 || res.status === 410) {
      if (trustGoneVerdict(vin, domain, oemAlive)) {
        hardGone.push(vin);
      } else {
        crossChecked++;
        alive.push({ vin }); // tonight's own OEM-locator sweep still lists it
      }
    } else if (res.status === 200 && res.body) {
      if (res.body.toUpperCase().includes(vin)) {
        const { price, provenance } = priceOf(res.body, vin, res.finalUrl ?? l.sourceUrl, l);
        // recheck_listings reads `provenance` off each alive row and carries it
        // into listing_price_history alongside the price (0041), and
        // `dealerDomain` says whose page this reading came from (0048) — the
        // domain of the payload whose sourceUrl was fetched, so a co-listed
        // VIN's readings from two sites can never pair up as a price "step".
        // No price read, no tags: a row that only confirms the car is still
        // listed makes no claim about what it costs.
        alive.push({
          vin,
          priceUsd: price ?? undefined,
          provenance: price != null ? provenance : undefined,
          dealerDomain: price != null ? domain : undefined,
        });
      } else if (trustGoneVerdict(vin, domain, oemAlive)) {
        softGone.push(vin);
      } else {
        crossChecked++;
        alive.push({ vin }); // tonight's own OEM-locator sweep still lists it
      }
    } else {
      errors++; // 403, 5xx, redirect loop — proves nothing
    }
  }
}
await Promise.all(Array.from({ length: Math.min(CONCURRENCY, work.length) }, worker));

const changed = alive.filter((a) => {
  const prev = work.find((l) => l.vin.toUpperCase() === a.vin)?.price_usd;
  return a.priceUsd != null && a.priceUsd !== prev;
}).length;
const unchecked = work.length - (alive.length + hardGone.length + softGone.length + errors);
if (unchecked > 0 && Number.isFinite(DEADLINE_AT)) {
  console.error(
    `recheck: hit the ${DEADLINE_MIN}-minute deadline with ${unchecked} listings unchecked — ` +
    `writing what we have; the rest are rechecked next run`
  );
}
console.error(
  `recheck: ${alive.length} still listed (${changed} price changes), ` +
  `${hardGone.length} pages gone, ${softGone.length} VIN missing, ${errors} inconclusive` +
  (crossChecked ? `, ${crossChecked} OEM-locator gone verdicts overridden by tonight's own sweep` : "")
);

if (DRY) {
  console.error("[dry run — nothing written]");
  process.exit(0);
}
if (!TOKEN) {
  console.error("recheck: no ingest token — cannot write results.");
  process.exit(0);
}

// Hours of polite per-listing fetches sit behind these requests; losing them
// to a gateway blip would forfeit all of them.
//
// WHY THIS IS CHUNKED, and why the chunk SIZE is the entire fix (2026-08-25).
// It used to be one POST carrying the whole night. On 2026-08-24 (run
// 32719571812) that was 58,192 alive rows, and all four attempts died the
// same way after ~60s each:
//
//   recheck: result write: HTTP 500 — retrying in 30s
//   recheck: result write: HTTP 500 — retrying in 120s
//   recheck: result write: HTTP 500 — retrying in 240s
//   recheck: FAILED HTTP 500: {"code":"57014", ...statement timeout}
//
// Note the budget it blew. This is NOT the anon 3s class it looks like: the
// ingest gateway forwards with the SERVICE key, so recheck_listings runs as
// service_role, whose statement_timeout is 60 SECONDS. The night's whole
// sold-signal was forfeited to a query that needed more than a minute.
//
// And the cost is not the row count, it is the PLAN the row count provokes.
// recheck_listings joins its _alive_rows temp table to `listings` in six
// statements. Measured against prod with EXPLAIN, driving-set size vs plan:
//
//    2,000 rows  ->  Nested Loop, Index Scan using listings_pkey (rows=1)
//    5,000 rows  ->  Nested Loop, Index Scan using listings_pkey (rows=1)
//   10,000 rows  ->  Nested Loop, Index Scan using listings_pkey (rows=1)
//   20,000 rows  ->  Nested Loop, Index Scan using listings_pkey (rows=1)
//   30,000 rows  ->  Nested Loop, Index Scan using listings_pkey (rows=1)
//   58,192 rows  ->  Merge Join,  Index Scan using listings_pkey rows=154,905
//
// Past some fraction of the table the planner stops looking rows up one at a
// time and reads ALL of `listings` instead — 200 MB, and on this instance a
// bare `select count(price_usd) from listings` was measured at 22.2s. Six of
// those cannot fit in 60s. Under the flip it is index lookups and the cost is
// proportional to the chunk, not the table. Measured on prod, the whole RPC
// body against one 5,000-row chunk: 8.6s (price_history 1.8s, update 5.4s,
// listing_seen upsert 1.0s, everything else under 200ms).
//
// So 5,000 is chosen to sit ~6x under the lowest size that still planned as
// index lookups, and that margin GROWS as `listings` grows, because the flip
// is about the driving set's size RELATIVE to the table.
//
// REJECTED: rewriting the RPC to take one narrow pass over `listings` and
// feed the other five statements from a temp snapshot. Measured — the narrow
// pass is still a full scan (9.7s), and the rewritten body still blew a 55s
// bound at 58,192 rows. It treats the symptom (six scans) instead of the
// cause (a driving set large enough to force a scan at all), and it would
// have needed a migration to a function two ingest paths depend on.
// REJECTED: a bigger statement_timeout. 0046 turned this down for the same
// class of read, and the reasoning holds: a query that needs more than its
// budget on a healthy box is not one to hand a bigger budget.
//
// ALIVE_CHUNK itself is parsed and validated at the top, with the other flags.
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
    console.error(`recheck: FAILED HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
    process.exit(1);
  }
  return res.json();
}

// The gone verdicts go FIRST, and in exactly ONE request.
//
// First, because they are the night's scarce signal — the delistings are what
// recheck exists to produce, they are the smallest and fastest request of the
// set, and if a later alive chunk fails they are already banked. (Same
// priority the --deadline-min logic above takes: land the delistings, leave
// the rest for tomorrow.)
//
// One request, because the soft-gone strike is the one thing here that is NOT
// replay-safe: 0004 counts misses PER CALL, so spreading soft-gone VINs over
// several requests — or letting a chunk boundary re-send one — would hand a
// car two strikes in a single night and delist it early. The pre-existing
// caveat is unchanged and no worse: a request that commits and then loses its
// response will, when retried, strike its soft-gone cars a night early. That
// is rare and conservative (a car goes quiet one night sooner); losing the
// whole night's sold-signal was the common failure.
const goneResult = await write("recheck: result write (gone verdicts)", { hardGone, softGone });

// The alive chunks, by contrast, are replay-safe by construction, so a retried
// chunk is a no-op rather than a double-write: price history is only inserted
// where the incoming price is distinct from the stored one and the update in
// the same call makes that false; listing_seen is an upsert; and the 'relisted'
// event is guarded on delisted_at being non-null, which that same update has
// already cleared.
let confirmed = 0, priceChanged = 0, chunks = 0;
for (let i = 0; i < alive.length; i += ALIVE_CHUNK) {
  const chunk = alive.slice(i, i + ALIVE_CHUNK);
  const r = await write(
    `recheck: result write (alive ${i + 1}-${i + chunk.length} of ${alive.length})`,
    { alive: chunk }
  );
  confirmed += r.confirmed ?? 0;
  priceChanged += r.price_changed ?? 0;
  chunks++;
}
console.error(
  `recheck: wrote ${confirmed} confirmations (${priceChanged} price changes) in ${chunks} chunk${chunks === 1 ? "" : "s"} of ${ALIVE_CHUNK}, ` +
  `${goneResult.delisted ?? 0} delisted, ${goneResult.struck ?? 0} struck`
);
