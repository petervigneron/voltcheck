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
import { fetchRaw } from "./lib/http.mjs";
import { extractVehicles } from "./lib/jsonld.mjs";
import { extractDdcVehicles } from "./lib/platforms/dealercom.mjs";
import { extractDcsVehicles } from "./lib/platforms/dealercarsearch.mjs";
import { OEM_LOCATOR_DOMAINS as GM_LOCATOR_DOMAINS } from "./lib/oem/gm.mjs";
import { HYUNDAI } from "./lib/oem/hyundai.mjs";
import { KIA } from "./lib/oem/kia.mjs";
import { OEM_LOCATOR_DOMAINS as NISSAN_LOCATOR_DOMAINS } from "./lib/oem/nissan.mjs";
import { OEM_LOCATOR_DOMAINS as BMW_LOCATOR_DOMAINS } from "./lib/oem/bmw.mjs";
import { OEM_LOCATOR_DOMAINS as MERCEDES_LOCATOR_DOMAINS } from "./lib/oem/mercedes.mjs";
import { OEM_LOCATOR_DOMAINS as STELLANTIS_LOCATOR_DOMAINS } from "./lib/oem/stellantis.mjs";
import { OEM_LOCATOR_DOMAINS as GENESIS_LOCATOR_DOMAINS } from "./lib/oem/genesis.mjs";
import { OEM_LOCATOR_DOMAINS as VW_LOCATOR_DOMAINS } from "./lib/oem/vw.mjs";
import { OEM_LOCATOR_DOMAINS as ENTERPRISE_LOCATOR_DOMAINS } from "./lib/oem/enterprise.mjs";

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
const OEM_LOCATOR_DOMAINS = new Set([...GM_LOCATOR_DOMAINS, HYUNDAI.domain, KIA.domain, ...NISSAN_LOCATOR_DOMAINS, ...BMW_LOCATOR_DOMAINS, ...MERCEDES_LOCATOR_DOMAINS, ...STELLANTIS_LOCATOR_DOMAINS, ...GENESIS_LOCATOR_DOMAINS, ...VW_LOCATOR_DOMAINS, ...ENTERPRISE_LOCATOR_DOMAINS]);

function flag(name, fallback) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? Number(process.argv[i + 1]) : fallback;
}
const CONCURRENCY = flag("--concurrency", 8);
const LIMIT = flag("--limit", 0);
const DRY = process.argv.includes("--dry-run");

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

// Same transient statuses and waits as db-sync.mjs, for the reason diagnosed
// there on 2026-08-16: the Nano database walks into its memory ceiling under
// the night's churn, the OOM killer takes Postgres down, and recovery holds
// the door shut for ~2 minutes of 5xx. Recheck runs right after the sync and
// the price audit — it reads through the same door they just leaned on — and
// both nights it failed (HTTP 521 on 08-15, HTTP 500 on 08-17) it died inside
// that window with no retry at all, forfeiting the night's only sold-signal.
// The waits must outlast a full recovery cycle, hence 30/120/240 and not
// something politer-looking.
const TRANSIENT = new Set([429, 500, 502, 503, 504, 520, 521, 522, 523, 524]);
async function fetchRetry(label, url, opts) {
  // A dying database resets connections mid-request, which fetch() surfaces
  // as a throw rather than a status — same transient event, same retry.
  const attempt = async () => {
    try {
      return await fetch(url, opts);
    } catch (e) {
      return { ok: false, status: 0, text: async () => String(e?.cause?.code ?? e?.message ?? e) };
    }
  };
  let res = await attempt();
  for (const waitS of [30, 120, 240]) {
    if (res.ok || !(res.status === 0 || TRANSIENT.has(res.status))) break;
    const why = res.status === 0 ? `network error (${(await res.text()).slice(0, 120)})` : `HTTP ${res.status}`;
    console.error(`recheck: ${label} ${why} — retrying in ${waitS}s`);
    await new Promise((r) => setTimeout(r, waitS * 1000));
    res = await attempt();
  }
  return res;
}

// Live listings straight from the DB — the recheck is about what the site
// is currently showing, not what last night's crawl happened to find.
const listings = [];
for (let from = 0; ; from += 1000) {
  const res = await fetchRetry(
    `listing fetch rows ${from}+`,
    `${SUPABASE_URL}/rest/v1/listings?select=vin,price_usd,payload&delisted_at=is.null&order=vin.asc`,
    { headers: { apikey: ANON, Authorization: `Bearer ${ANON}`, Range: `${from}-${from + 999}` } }
  );
  if (!res.ok) {
    console.error(`recheck: listing fetch failed HTTP ${res.status}`);
    process.exit(1);
  }
  const page = await res.json();
  listings.push(...page);
  if (page.length < 1000) break;
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

// MUST mirror the precedence in lib/normalize.mjs + platforms/dealercom.mjs:
// the JSON-LD offer price wins, and the platform's own fields are only a
// fallback. Reversing this makes every dealer.com car look like it changed
// price on the first run and writes fiction into listing_price_history.
const priceOf = (body, vin, url) => {
  // Dealer Car Search publishes no JSON-LD, so without this its rows would
  // hold whatever price the last crawl saw and never move. The VDP's own data
  // layer is the same field lib/platforms/dealercarsearch.mjs reads into the
  // offer, so the precedence above is preserved rather than bypassed.
  for (const v of extractDcsVehicles(body, url)) {
    if (String(v.vehicleIdentificationNumber ?? "").toUpperCase() !== vin) continue;
    const p = Number(v.offers?.price);
    if (Number.isFinite(p) && p > 500) return Math.round(p);
  }
  for (const v of extractVehicles(body)) {
    if (String(v.vehicleIdentificationNumber ?? "").toUpperCase() !== vin) continue;
    const offer = Array.isArray(v.offers) ? v.offers[0] : v.offers;
    const p = Number(String(offer?.price ?? "").replace(/[^0-9.]/g, ""));
    if (Number.isFinite(p) && p > 500) return Math.round(p);
  }
  // askingPrice is NOT a price on these feeds — observed values of 595/695/999
  // are dealer fees. Only internetPrice is trustworthy, and a car under
  // $3,000 is a data error rather than a listing, so we decline to guess.
  const ddc = extractDdcVehicles(body).find((d) => String(d.vin).toUpperCase() === vin);
  const ddcPrice = Number(String(ddc?.internetPrice ?? "").replace(/[^0-9.]/g, ""));
  return Number.isFinite(ddcPrice) && ddcPrice > 3000 ? Math.round(ddcPrice) : null;
};

const alive = [], hardGone = [], softGone = [];
let errors = 0, cursor = 0;

async function worker() {
  while (cursor < work.length) {
    const l = work[cursor++];
    const vin = l.vin.toUpperCase();
    let res;
    try {
      res = await fetchRaw(l.payload.sourceUrl, { timeoutMs: 20000 });
    } catch {
      errors++;
      continue;
    }
    if (res.status === 404 || res.status === 410) {
      hardGone.push(vin);
    } else if (res.status === 200 && res.body) {
      if (res.body.toUpperCase().includes(vin)) {
        const price = priceOf(res.body, vin, res.finalUrl ?? l.payload.sourceUrl);
        alive.push({ vin, priceUsd: price ?? undefined });
      } else {
        softGone.push(vin);
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
console.error(
  `recheck: ${alive.length} still listed (${changed} price changes), ` +
  `${hardGone.length} pages gone, ${softGone.length} VIN missing, ${errors} inconclusive`
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
const res = await fetchRetry("result write", `${SUPABASE_URL}/functions/v1/ingest`, {
  method: "POST",
  headers: {
    apikey: ANON,
    Authorization: `Bearer ${ANON}`,
    "x-ingest-token": TOKEN,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ dataset: "recheck", alive, hardGone, softGone, rows: [] }),
});
if (!res.ok) {
  console.error(`recheck: FAILED HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  process.exit(1);
}
console.error(`recheck: ${JSON.stringify(await res.json())}`);
