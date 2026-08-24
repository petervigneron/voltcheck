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
import { extractVehicles } from "./lib/jsonld.mjs";
import { extractDdcVehicles } from "./lib/platforms/dealercom.mjs";
import { priceFloor } from "./lib/price-floor.mjs";
import { extractDcsVehicles } from "./lib/platforms/dealercarsearch.mjs";
import { dealrVehicles } from "./lib/platforms/dealrcloud.mjs";
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
import { JSONLD, DCS_TILE, DEALR_ENTRY, DDC_INTERNET } from "./lib/price-provenance.mjs";

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
const listings = [];
for (let after = ""; ; ) {
  const res = await fetchWithRetry(`recheck: listing fetch after ${after || "start"}`, () =>
    fetch(
      `${SUPABASE_URL}/rest/v1/listings?select=vin,price_usd,payload&delisted_at=is.null` +
        (after ? `&vin=gt.${encodeURIComponent(after)}` : "") +
        `&order=vin.asc&limit=1000`,
      { headers: { apikey: ANON, Authorization: `Bearer ${ANON}` } }
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
  (l) => l.payload?.sourceUrl && !OEM_LOCATOR_DOMAINS.has(l.payload.dealerDomain)
);
const skippedOem = listings.filter((l) => OEM_LOCATOR_DOMAINS.has(l.payload?.dealerDomain)).length;
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

// MUST mirror the precedence in lib/normalize.mjs + platforms/dealercom.mjs:
// the JSON-LD offer price wins, and the platform's own fields are only a
// fallback. Reversing this makes every dealer.com car look like it changed
// price on the first run and writes fiction into listing_price_history.
//
// `floor` is the plausibility gate from lib/price-floor.mjs, computed from
// the listing we're rechecking. dealer.com intermittently serves a finance
// payment as the JSON-LD offer price ($1,996 dips on hyundaioflasvegas.com
// that recovered days later, 2026-08-19) — a sub-floor reading here proves
// nothing about the price, so it returns null (leave the stored price alone)
// rather than writing a false cut into listing_price_history.
//
// Returns { price, provenance } — the number AND which served field gave it
// (migration 0041). Naming the field is what makes this lane's readings
// comparable with the crawl's instead of merely suspicious: 0040 had to
// suppress every nightly↔recheck pair on principle (27,139 steps, most of them
// real dealer moves) because a run source cannot distinguish "recheck saw a
// genuine markdown first" from "recheck read a different field". Each leg
// below tags itself with the SAME constant the crawl-side extractor uses for
// that field, so the first pair matches and the second still does not.
const priceOf = (body, vin, url, floor) => {
  const none = { price: null, provenance: undefined };
  // Dealer Car Search publishes no JSON-LD, so without this its rows would
  // hold whatever price the last crawl saw and never move. The VDP's own data
  // layer is the same field lib/platforms/dealercarsearch.mjs reads into the
  // offer, so the precedence above is preserved rather than bypassed — and it
  // carries that file's tag for the same reason.
  for (const v of extractDcsVehicles(body, url)) {
    if (String(v.vehicleIdentificationNumber ?? "").toUpperCase() !== vin) continue;
    const p = Number(v.offers?.price);
    if (Number.isFinite(p) && p >= floor) return { price: Math.round(p), provenance: DCS_TILE };
  }
  // dealr.cloud's JSON-LD Car has no VIN (and on some templates doesn't
  // parse), so like DCS its price is read from the platform's own markup —
  // the same entry-price field lib/platforms/dealrcloud.mjs builds the offer
  // from, so JSON-LD-first precedence is preserved, not bypassed.
  for (const v of dealrVehicles(body, url)) {
    if (String(v.vehicleIdentificationNumber ?? "").toUpperCase() !== vin) continue;
    const p = Number(v.offers?.price);
    if (Number.isFinite(p) && p >= floor) return { price: Math.round(p), provenance: DEALR_ENTRY };
  }
  // The page's own schema.org offer — the same node lib/normalize.mjs reads,
  // hence the same tag. This is the leg that carries most of the win: a car
  // the nightly crawl priced from JSON-LD and recheck re-prices from JSON-LD
  // now pairs, and a real cut between them is claimable for the first time.
  for (const v of extractVehicles(body)) {
    if (String(v.vehicleIdentificationNumber ?? "").toUpperCase() !== vin) continue;
    const offer = Array.isArray(v.offers) ? v.offers[0] : v.offers;
    const p = Number(String(offer?.price ?? "").replace(/[^0-9.]/g, ""));
    if (Number.isFinite(p) && p >= floor) return { price: Math.round(p), provenance: JSONLD };
  }
  // askingPrice is NOT a price on these feeds — observed values of 595/695/999
  // are dealer fees. Only internetPrice is trustworthy, and a car under
  // $3,000 is a data error rather than a listing, so we decline to guess.
  //
  // This leg is the original incident in miniature and stays quarantined by
  // its tag: the crawl's dealer.com resolver mostly publishes the JSON-LD
  // offer, so a jsonld↔ddc-internet pair is the field flip that printed
  // "$53,770→$29,495" on a car whose page showed both numbers at once. Tagged
  // honestly, it simply never pairs with the resolver's — which is the point.
  const ddc = extractDdcVehicles(body).find((d) => String(d.vin).toUpperCase() === vin);
  const ddcPrice = Number(String(ddc?.internetPrice ?? "").replace(/[^0-9.]/g, ""));
  return Number.isFinite(ddcPrice) && ddcPrice >= Math.max(3000, floor)
    ? { price: Math.round(ddcPrice), provenance: DDC_INTERNET }
    : none;
};

const alive = [], hardGone = [], softGone = [];
let errors = 0, cursor = 0;

async function worker() {
  while (cursor < work.length && Date.now() < DEADLINE_AT) {
    const l = work[cursor++];
    const vin = l.vin.toUpperCase();
    let res;
    try {
      res = await fetchRaw(l.payload.sourceUrl, { timeoutMs: 20000 });
    } catch {
      errors++;
      continue;
    }
    const domain = l.payload.dealerDomain;
    if (res.status === 404 || res.status === 410) {
      if (trustGoneVerdict(vin, domain, oemAlive)) {
        hardGone.push(vin);
      } else {
        crossChecked++;
        alive.push({ vin }); // tonight's own OEM-locator sweep still lists it
      }
    } else if (res.status === 200 && res.body) {
      if (res.body.toUpperCase().includes(vin)) {
        const { price, provenance } = priceOf(res.body, vin, res.finalUrl ?? l.payload.sourceUrl, priceFloor({
          isNew: l.payload.condition === "new",
          year: l.payload.year,
        }));
        // recheck_listings reads `provenance` off each alive row and carries it
        // into listing_price_history alongside the price (0041). No price read,
        // no tag: a row that only confirms the car is still listed makes no
        // claim about what it costs.
        alive.push({ vin, priceUsd: price ?? undefined, provenance: price != null ? provenance : undefined });
      } else if (trustGoneVerdict(vin, domain, oemAlive)) {
        softGone.push(vin);
      } else {
        crossChecked++;
        alive.push({ vin }); // tonight's own OEM-locator sweep still lists it
      }
    } else {
      // 403, 5xx, redirect loop, or fetchRaw's "challenge" (a bot wall served
      // with a 200 that its own backed-off retries couldn't clear — Motive's
      // rate challenge, lib/http.mjs). Proves nothing. The challenge case is
      // load-bearing: as a raw body it would read "200 without the VIN" and
      // hand a live car a soft-gone strike.
      errors++;
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

// Hours of polite per-listing fetches sit behind this one request; losing it
// to a gateway blip would forfeit all of them. Replay caveat: alive, hard-gone
// and price-history converge on replay, but soft-gone strikes count per call
// (0004), so a request that committed and then lost its response would, when
// retried, hand soft-gone cars their second strike a night early. That is a
// rare, conservative-direction error (a car goes quiet one night sooner);
// losing the whole night's sold-signal to a blip was the common one.
const res = await fetchWithRetry("recheck: result write", () =>
  fetch(`${SUPABASE_URL}/functions/v1/ingest`, {
    method: "POST",
    headers: {
      apikey: ANON,
      Authorization: `Bearer ${ANON}`,
      "x-ingest-token": TOKEN,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ dataset: "recheck", alive, hardGone, softGone, rows: [] }),
  })
);
if (!res.ok) {
  console.error(`recheck: FAILED HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  process.exit(1);
}
console.error(`recheck: ${JSON.stringify(await res.json())}`);
