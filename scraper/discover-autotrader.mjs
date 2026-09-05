#!/usr/bin/env node
// Autotrader's used-EV search, read as a DEALER DISCOVERY index.
//
//   VOLTCHECK_PLAYWRIGHT=/path/to/dir-with-node_modules/playwright \
//   node discover-autotrader.mjs [--delay-ms 8000] [--cap 1000] [--fuel ELE,PIH]
//                                [--records 100] [--listing-types USED,CERTIFIED]
//                                [--filters makeCode=TESLA] [--max-pages N]
//                                [--fresh] [--diff-only]
//
// What this is. Every dealer with a used BEV or PHEV listed on Autotrader is
// a rooftop that sells electrified cars, and the search results name it and
// link its own website. That identity — name, website domain, city, state —
// diffed against scraper/registry/registry.json is the coverage gap this
// lane exists to find. It harvests DEALER IDENTITY ONLY: no listing fields
// are persisted (VINs are held in memory to count distinct cars per dealer
// and are never written), and nothing here feeds the site.
//
// The posture, and why it is a condition rather than a courtesy. Autotrader's
// Visitor Agreement (autotrader.com/legal/visitor-agreement, effective
// 2026-03-03) prohibits systematic automated extraction "except in strict
// conformance with the Robots Exclusion Protocol". The owner approved this
// lane on condition it stays inside those terms, so robots conformance is
// the contract: robots.txt is fetched first, through the same browser, and
// every URL is checked against the `*` group on pathname PLUS query (two of
// the live rules — `*keyword=`, `*lastExec*` — live in the query string; a
// path-only match would wave them through). A disallowed URL is refused,
// never fetched. The `/rest/` JSON endpoints are never called, by policy:
// only the HTML search pages are read, and the inline Next.js state on them
// is what is parsed.
//
// Identity. Chromium's own user agent — no override — plus the header
// `x-crawler: VoltcheckBot/0.1 (+https://voltcheck.net/bot)` on every
// request, the identical declaration the crawl lane sends (imported from
// lib/http.mjs so the two cannot drift). Measured 2026-08-23: Akamai serves
// its block page (`/akamai-block/`) to anything whose UA carries the
// `HeadlessChrome` token — the headless shell and full Chromium's headless
// mode alike, with or without our declaration — while the real Chromium
// binary sending its own UA WITH the declaration is answered. So this runs
// a headed Chromium (window parked off-screen), which is what the edge
// admits, declared as what it is. One context, one page, strictly serial,
// a fixed delay between loads, back-off on any non-200, and a HARD STOP on
// the first block page: nothing is retried under a different identity,
// nothing is rotated, no challenge is answered. A stop leaves the checkpoint
// intact so a later run resumes.
//
// Pagination and partitioning. `numRecords=100` is honoured, and the site
// refuses offsets past 1,000 whatever the page size: measured 2026-09-05,
// firstRecord=900 is the last honoured offset and 1000, 2000 and 5000 all
// re-serve page 1 — same leading VINs, firstRecord stripped from the echoed
// query. So a partition is walkable only if it holds at most 1,000 cars, and
// the national searches (~47k used BEV, ~21k used PHEV) have to be
// partitioned into searches small enough to walk.
// Partitions are filter dimensions the site applies server-side and every
// listing has exactly one value of: make, then model year, then model, then
// a price band bisected until the count fits under --cap. The plan is
// recorded with each partition's `count` so completeness is provable: a
// partition is done only when its walk reached a short page AND the distinct
// VINs seen match its count; children's counts are summed against their
// parent's. Disagreements are recorded, not hidden.
//
// Outputs (scraper/out/): autotrader-discovery.checkpoint.json (resumable
// state, rewritten after every page), autotrader-dealers.json (every seller
// seen), autotrader-new-sites.json (registry-shaped rows for sellers whose
// domain is not in the registry; registry.json itself is NEVER written —
// import-dealers / a human decide what joins it).
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { parseRobots, robotsRulesAllow, CRAWLER_DECLARATION } from "./lib/http.mjs";

const args = process.argv.slice(2);
const opt = (name, dflt) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] !== undefined && !args[i + 1].startsWith("--") ? args[i + 1] : dflt;
};
const flag = (name) => args.includes(`--${name}`);

const DELAY_MS = Number(opt("delay-ms", 8000));
const PAGE = Number(opt("records", 100)); // measured 2026-09-05: numRecords=100 is honoured — 100 ids and up to ~91 owners per load, where the default 24 needed four times the requests for the same dealers
const OFFSET_CEILING = Number(opt("ceiling", 1000)); // measured 2026-09-05: firstRecord=900 is the last honoured offset; 1000, 2000 and 5000 all re-serve page 1 (identical leading VINs) with firstRecord stripped from the echo
const CAP = Number(opt("cap", OFFSET_CEILING)); // largest partition a walk can finish under that ceiling
const FUELS = opt("fuel", "ELE,PIH").split(",");
// Used AND certified: CPO cars are used cars a shopper can buy, and the
// registry does not care which bucket a rooftop's stock sits in. Measured
// 2026-09-05: `listingTypes=USED,CERTIFIED` is echoed back as the array
// ["CERTIFIED","USED"], which is why filtersHonoured compares as a set.
const LISTING_TYPES = opt("listing-types", "USED,CERTIFIED").split(",");
// Where the partition tree is rooted. The default root is the national search,
// which spends its first requests on count probes; `--filters makeCode=TESLA`
// roots it at one make instead, so a run with a small budget spends it on
// pages that carry ~90 dealers each rather than on planning. Repeated runs
// with different makes accumulate in the one checkpoint.
const ROOT = Object.fromEntries(
  opt("filters", "").split(",").filter(Boolean).map((kv) => {
    const i = kv.indexOf("=");
    if (i < 0) throw new Error(`--filters wants k=v pairs, got ${kv}`);
    return [kv.slice(0, i), kv.slice(i + 1)];
  })
);
const MAX_PAGES = Number(opt("max-pages", Infinity)); // smoke-test budget; the run stops cleanly when spent
const PW_DIR = opt("playwright", process.env.VOLTCHECK_PLAYWRIGHT);
const SORT = opt("sort", ""); // e.g. derivedpriceASC; measured 23/page under a sort vs 24 by default, so off unless asked
const ORIGIN = "https://www.autotrader.com";
const TODAY = new Date().toISOString().slice(0, 10);

const OUT = new URL("./out/", import.meta.url);
const CKPT = new URL("./out/autotrader-discovery.checkpoint.json", import.meta.url);
const DEALERS_OUT = new URL("./out/autotrader-dealers.json", import.meta.url);
const NEW_OUT = new URL("./out/autotrader-new-sites.json", import.meta.url);
const REGISTRY = new URL("./registry/registry.json", import.meta.url);

// ── checkpoint ──────────────────────────────────────────────────────────────
// partitions[key] = { fuel, filters, count, pages, vinsSeen, done, short,
//   dealers: { ownerId: { vins, listingTypes: {} } }, children?: [keys] }
// owners[ownerId] = { name, website, city, state, zip, privateSeller }
let ck = {
  startedAt: new Date().toISOString(),
  robots: null,
  stopped: null,
  requests: 0,
  blocked: 0,
  partitions: {},
  owners: {},
};
if (!flag("fresh")) {
  try {
    ck = JSON.parse(await readFile(CKPT, "utf-8"));
    ck.stopped = null;
    console.error(`resuming checkpoint: ${Object.keys(ck.partitions).length} partitions, ${ck.requests} requests so far`);
  } catch {}
}
async function save() {
  await mkdir(OUT, { recursive: true });
  ck.savedAt = new Date().toISOString();
  await writeFile(CKPT, JSON.stringify(ck, null, 1));
}

// ── browser ─────────────────────────────────────────────────────────────────
let browser, page;
async function openBrowser() {
  if (!PW_DIR) throw new Error("give --playwright <dir containing node_modules/playwright> or VOLTCHECK_PLAYWRIGHT (installed outside the repo)");
  const req = createRequire(path.join(path.resolve(PW_DIR), "noop.js"));
  const { chromium } = req("playwright");
  browser = await chromium.launch({
    headless: false, // see header: the edge blocks the HeadlessChrome UA token; we run what it admits, declared
    channel: "chromium",
    args: ["--window-position=-3000,-3000", "--window-size=1200,900"],
  });
  const ctx = await browser.newContext({ extraHTTPHeaders: { "x-crawler": CRAWLER_DECLARATION } });
  page = await ctx.newPage();
  console.error(`browser UA: ${await page.evaluate(() => navigator.userAgent)}  x-crawler: ${CRAWLER_DECLARATION}`);
}

class Stop extends Error {}
let lastLoad = 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function load(url) {
  const u = new URL(url, ORIGIN);
  if (ck.robots && !robotsRulesAllow(ck.robots, u.pathname + u.search)) {
    throw new Stop(`robots disallows ${u.pathname + u.search} — refusing`);
  }
  const wait = lastLoad + DELAY_MS - Date.now();
  if (wait > 0) await sleep(wait);
  lastLoad = Date.now();
  ck.requests++;
  const r = await page.goto(u.href, { waitUntil: "domcontentloaded", timeout: 60000 });
  const status = r?.status() ?? 0;
  const html = await page.content();
  const transient = await refuseIfBlocked(u, status, html);
  if (status !== 200 || transient) {
    // Back off once, hard; a second failure on the same URL ends the run.
    ck.transients = (ck.transients ?? 0) + 1;
    console.error(`  ${transient ? "empty/unavailable page" : status} on ${u.href}; backing off 120s`);
    await sleep(120000);
    lastLoad = Date.now();
    ck.requests++;
    const r2 = await page.goto(u.href, { waitUntil: "domcontentloaded", timeout: 60000 });
    const html2 = await page.content();
    const transient2 = await refuseIfBlocked(u, r2?.status() ?? 0, html2);
    if ((r2?.status() ?? 0) !== 200) throw new Stop(`${r2?.status()} again on ${u.href}`);
    if (transient2) throw new Stop(`page still unavailable on the second load of ${u.href} — stopping`);
    return { status: 200, html: html2, finalUrl: r2.url() };
  }
  return { status, html, finalUrl: r.url() };
}

// The block page answers 200 (`/akamai-block/` assets, title "page
// unavailable"), so status alone cannot see it. First sighting ends the run.
//
// The title on its own is NOT that signal, which cost this lane its first
// real run. On 2026-09-05 request no 3 of a fresh checkpoint came back titled
// "Autotrader - page unavailable" and the run hard-stopped as a block; the
// identical URL, reloaded under the identical identity a minute later, served
// a normal 1.5 MB result page with 139 cars on it. The block page carries the
// `/akamai-block/` asset and the transient one does not, so that asset is
// what ends a run. A titled-but-unblocked page gets ONE back-off and reload
// under the SAME identity, and a second one on the same URL still stops:
// nothing is retried under another identity, nothing is rotated.
async function refuseIfBlocked(u, status, html) {
  const title = await page.title();
  if (html.includes("/akamai-block/") || /Access Denied/i.test(title)) {
    ck.blocked++;
    ck.blockedAt = { url: u.href, status, title, at: new Date().toISOString(), requestNo: ck.requests };
    throw new Stop(`edge served the block page for ${u.href} (status ${status}, request #${ck.requests} of this checkpoint) — stopping, not retrying`);
  }
  return /page unavailable/i.test(title) || !html.includes('id="__NEXT_DATA__"');
}

// ── page parsing ────────────────────────────────────────────────────────────
function parseSrp(html) {
  const m = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) return null;
  const j = JSON.parse(m[1]);
  const e = j.props?.pageProps?.__eggsState;
  if (!e) return null;
  const sr = e.srp_results ?? {};
  const inv = e.inventory ?? {};
  const ids = sr.activeResults ?? [];
  const listings = ids.map((id) => inv[id]).filter(Boolean);
  return {
    query: j.props.pageProps.query ?? {},
    count: sr.count,
    ids,
    listings: listings.map((l) => ({ vin: l.vin, ownerId: l.ownerId, ownerName: l.ownerName, listingType: l.listingType })),
    owners: e.owners ?? {},
    modelOptions: (e.srp_filters?.options?.modelCode?.options ?? []).map((o) => o.value).filter(Boolean),
    makeOptions: (e.srp_filters?.options?.makeCode?.options ?? []).map((o) => o.value).filter(Boolean),
    priceStats: sr.stats?.derivedprice,
    yearStats: sr.stats?.year,
  };
}

// The fuel and the listing type ride in the query string, not the path.
// Measured 2026-09-05: /cars-for-sale/used-cars/<fuel> reads its filters from
// the query anyway, and the path has no way to say "certified as well as
// used" — so /cars-for-sale/all-cars with everything stated explicitly is the
// URL whose echo can be checked against what was asked.
function srpUrl(fuel, filters, firstRecord = 0) {
  const q = new URLSearchParams({ searchRadius: "0", fuelTypeGroup: fuel, numRecords: String(PAGE) });
  for (const t of LISTING_TYPES) q.append("listingTypes", t);
  if (SORT) q.set("sortBy", SORT);
  for (const [k, v] of Object.entries(filters)) q.set(k, String(v));
  if (firstRecord) q.set("firstRecord", String(firstRecord));
  return `${ORIGIN}/cars-for-sale/all-cars?${q}`;
}

// The site silently drops a filter it does not understand (the page then
// answers the national query). Compare what came back with what was asked,
// so a dropped filter can never masquerade as a small partition.
function filtersHonoured(fuel, filters, got) {
  const gotTypes = [got.listingType ?? []].flat().map(String).sort();
  if (gotTypes.join(",") !== [...LISTING_TYPES].sort().join(",")) return false;
  const asked = { ...filters, fuelTypeGroup: fuel };
  for (const [k, v] of Object.entries(asked)) if (String(got[k] ?? "") !== String(v)) return false;
  return true;
}

// ── partition tree ──────────────────────────────────────────────────────────
const firstPages = new Map(); // partition key -> parsed probe page, in memory only
const keyOf = (fuel, filters) => fuel + "|" + Object.entries(filters).map(([k, v]) => `${k}=${v}`).join("&");

async function probe(fuel, filters) {
  const key = keyOf(fuel, filters);
  let p = ck.partitions[key];
  if (p && p.count !== undefined) return p;
  const { html } = await load(srpUrl(fuel, filters));
  const s = parseSrp(html);
  if (!s) throw new Stop(`no __NEXT_DATA__ on ${key}`);
  if (!filtersHonoured(fuel, filters, s.query)) throw new Stop(`site dropped a filter on ${key}: asked ${JSON.stringify(filters)} got ${JSON.stringify(s.query)}`);
  p = ck.partitions[key] = {
    fuel,
    filters,
    count: s.count ?? 0,
    pages: 0,
    vinsSeen: 0,
    done: false,
    short: false,
    dealers: {},
    modelOptions: s.modelOptions.length ? s.modelOptions : undefined,
    makeOptions: s.makeOptions.length ? s.makeOptions : undefined,
    priceStats: s.priceStats,
    yearStats: s.yearStats,
  };
  // The probe page is kept in memory only, never in the checkpoint: it holds
  // listing rows, and the checkpoint must stay dealer-level. walk() consumes
  // it so the probe request is not repeated.
  firstPages.set(key, s);
  console.error(`  ${key}: ${p.count}`);
  await save();
  return p;
}

// Dimension order. Each level must be a value every listing has exactly one
// of, or the children's counts will not sum to the parent's — and the sum
// check below will say so.
function childrenOf(p) {
  const f = p.filters;
  if (!f.makeCode) return (p.makeOptions ?? []).map((m) => ({ ...f, makeCode: m }));
  if (!f.startYear) {
    const { min, max } = p.yearStats ?? {};
    if (!Number.isFinite(min) || !Number.isFinite(max)) return [];
    const out = [];
    for (let y = min; y <= max; y++) out.push({ ...f, startYear: y, endYear: y });
    return out;
  }
  if (!f.modelCode && (p.modelOptions ?? []).length > 1) return p.modelOptions.map((m) => ({ ...f, modelCode: m }));
  // Price bisection. Bounds are inclusive on the site; split at the midpoint
  // of the partition's own observed price range.
  const lo = f.minPrice ?? Math.max(0, Math.floor(p.priceStats?.min ?? 0));
  const hi = f.maxPrice ?? Math.ceil(p.priceStats?.max ?? 0);
  if (!(hi > lo)) return [];
  const mid = Math.floor((lo + hi) / 2);
  return [
    { ...f, minPrice: lo, maxPrice: mid },
    { ...f, minPrice: mid + 1, maxPrice: hi },
  ];
}

async function plan(fuel, filters, depth = 0) {
  const p = await probe(fuel, filters);
  const key = keyOf(fuel, filters);
  if (p.count <= CAP) return [key];
  if (p.children) {
    const leaves = [];
    for (const ck2 of p.children) leaves.push(...(await plan(fuel, ck.partitions[ck2].filters, depth + 1)));
    return leaves;
  }
  const kids = childrenOf(p);
  if (!kids.length) {
    console.error(`  ${key}: ${p.count} > cap and no dimension left — walking what the ceiling allows`);
    p.unsplittable = true;
    return [key];
  }
  const leaves = [];
  let sum = 0;
  const childKeys = [];
  for (const kf of kids) {
    const c = await probe(fuel, kf);
    sum += c.count;
    childKeys.push(keyOf(fuel, kf));
  }
  p.children = childKeys;
  p.childSum = sum;
  if (sum !== p.count) console.error(`  ${key}: children sum ${sum} vs parent ${p.count} (${sum - p.count})`);
  await save();
  for (const kf of kids) leaves.push(...(await plan(fuel, kf, depth + 1)));
  return leaves;
}

// ── walking a leaf ──────────────────────────────────────────────────────────
let pagesThisRun = 0;
function absorb(p, s, vins) {
  for (const l of s.listings) {
    if (!l.vin || vins.has(l.vin)) continue;
    vins.add(l.vin);
    const o = s.owners[l.ownerId];
    const id = String(l.ownerId);
    if (!ck.owners[id] && o) {
      ck.owners[id] = {
        name: o.name ?? l.ownerName ?? null,
        website: o.website?.href ?? null,
        city: o.location?.address?.city ?? null,
        state: o.location?.address?.state ?? null,
        zip: o.location?.address?.zip ?? null,
        privateSeller: !!o.privateSeller,
        isVirtual: !!o.isVirtual,
      };
    } else if (!ck.owners[id]) {
      ck.owners[id] = { name: l.ownerName ?? null, website: null, city: null, state: null, zip: null, privateSeller: null, isVirtual: null, noOwnerRecord: true };
    }
    const d = (p.dealers[id] ??= { vins: 0, listingTypes: {} });
    d.vins++;
    d.listingTypes[l.listingType ?? "?"] = (d.listingTypes[l.listingType ?? "?"] ?? 0) + 1;
  }
}

async function walk(key) {
  const p = ck.partitions[key];
  if (p.done) return;
  // A partition interrupted mid-walk restarts from its first page with its
  // contributions reset: per-partition contributions are what make the
  // final aggregation exact, and a half-counted partition is not exact.
  p.dealers = {};
  p.pages = 0;
  const vins = new Set();
  let first = firstPages.get(key);
  firstPages.delete(key);
  // Walk every page the site's own count implies; then, if distinct VINs
  // still fall short of the count (relevance order can shuffle a car across
  // a page boundary between two loads), keep reading non-empty pages up to
  // the offset ceiling. An empty page is the end whatever the count says.
  for (let offset = 0; offset < OFFSET_CEILING; offset += PAGE) {
    if (pagesThisRun >= MAX_PAGES) throw new Stop(`--max-pages ${MAX_PAGES} spent`);
    let s = first;
    first = null;
    if (!s) {
      const { html } = await load(srpUrl(p.fuel, p.filters, offset));
      s = parseSrp(html);
      if (!s) throw new Stop(`no __NEXT_DATA__ on ${key} @${offset}`);
      if (!filtersHonoured(p.fuel, p.filters, s.query)) throw new Stop(`site dropped a filter on ${key} @${offset}`);
      // The offset ceiling shows up as the site re-serving page 1 with
      // firstRecord stripped from the echoed query. Treat it as the wall.
      if (offset && String(s.query.firstRecord ?? "") !== String(offset)) {
        p.ceiling = offset;
        console.error(`  ${key}: offset ${offset} not honoured (ceiling); stopping walk`);
        break;
      }
    }
    pagesThisRun++;
    p.pages++;
    absorb(p, s, vins);
    p.vinsSeen = vins.size;
    if (s.ids.length === 0) {
      p.short = true;
      break;
    }
    if (offset + PAGE >= p.count && vins.size >= p.count) break;
    await save();
  }
  p.done = true;
  p.complete = vins.size >= p.count;
  p.finishedAt = new Date().toISOString();
  console.error(`  walked ${key}: ${p.vinsSeen}/${p.count} vins, ${p.pages} pages, short=${p.short}`);
  await save();
}

// ── aggregation + diff ──────────────────────────────────────────────────────
function normDomain(href) {
  if (!href) return null;
  try {
    const u = new URL(href.includes("://") ? href : `http://${href}`);
    return u.hostname.toLowerCase().replace(/^www\./, "").replace(/\.$/, "") || null;
  } catch {
    return null;
  }
}
// Sellers whose "website" is a marketplace or OEM storefront, not a rooftop
// of their own: the private-seller exchange links back to Autotrader itself,
// and OEM/aggregator hosts already have lanes. Kept in dealers.json, kept out
// of the registry rows.
const NOT_A_ROOFTOP =
  /^(autotrader|kbb|cars|cargurus|carvana|carmax|vroom|shift|driveway|truecar|edmunds|tesla|ford|chevrolet|cadillac|gmc|buick|carbravo|kia|hyundaiusa|honda|toyota|nissanusa|bmwusa|mbusa|audiusa|vw|porsche|volvocars|polestar|rivian|lucidmotors)\.(com|net|us)$/i;

// Website hosts that belong to a dealer's WEBSITE VENDOR, not to the dealer.
// A rooftop served at nissanofhendersonville.cms.dealer.com or
// sed.balisehyundaifairfield.netlook.com is a real rooftop, but its apex is
// the vendor's — so folding it to two labels both invents a rooftop called
// "dealer.com" and merges every one of that vendor's dealers into it. On a
// vendor apex the FULL hostname is the identity; the bare apex is never one.
const VENDOR_APEX = new Set([
  "dealer.com", "dealeron.com", "dealerinspire.com", "dealercarsearch.com",
  "dealerfire.com", "dealereprocess.com", "dealercenter.net", "carsforsale.com",
  "teamvelocitymarketing.com", "overfuel.com", "dealrcloud.com", "autofunds.com",
  "dealersync.com", "ridemotive.com", "automanager.com", "netlook.com",
  "ebizautos.com", "fusionzone.com", "sincrod.com", "autorevo.com",
  "porschedealer.com", "mycarsonline.com", "dealerspike.com", "dealervenom.com",
  "waynereeves.com", "autodealersdigital.com", "dealerclick.com",
]);
const apex2 = (host) => (host ? host.split(".").slice(-2).join(".") : null);
// The registry key for a seller: its apex normally, its full hostname when the
// apex is a vendor's, and null for the bare vendor apex itself.
function rooftopKey(host) {
  if (!host) return null;
  const a = apex2(host);
  if (!VENDOR_APEX.has(a)) return a;
  return host === a ? null : host;
}
const apexOf = rooftopKey;

async function writeOutputs() {
  const byOwner = new Map();
  for (const p of Object.values(ck.partitions)) {
    if (p.children) continue; // leaves only; an internal node's pages were never walked. A leaf
    // interrupted mid-walk still counts: its dealers were seen, and a resumed
    // walk resets its contributions before re-reading, so nothing doubles.
    for (const [id, d] of Object.entries(p.dealers)) {
      const a = byOwner.get(id) ?? { vins: 0, bev: 0, phev: 0, listingTypes: {} };
      a.vins += d.vins;
      if (p.fuel === "ELE") a.bev += d.vins;
      else a.phev += d.vins;
      for (const [t, n] of Object.entries(d.listingTypes)) a.listingTypes[t] = (a.listingTypes[t] ?? 0) + n;
      byOwner.set(id, a);
    }
  }
  const dealers = [];
  for (const [id, a] of byOwner) {
    const o = ck.owners[id] ?? {};
    const domain = normDomain(o.website);
    dealers.push({
      ownerId: Number(id),
      name: o.name,
      domain,
      apex: apexOf(domain),
      websiteHref: o.website,
      city: o.city,
      state: o.state,
      zip: o.zip,
      privateSeller: o.privateSeller,
      evListings: a.vins,
      bev: a.bev,
      phev: a.phev,
      listingTypes: a.listingTypes,
    });
  }
  dealers.sort((x, y) => y.evListings - x.evListings || String(x.name).localeCompare(String(y.name)));

  const registry = JSON.parse(await readFile(REGISTRY, "utf-8"));
  const known = new Map(); // host or apex -> status
  for (const s of registry.sites) {
    const d = s.domain.toLowerCase().replace(/^www\./, "");
    known.set(d, s.status);
    if (!known.has(apexOf(d))) known.set(apexOf(d), s.status);
  }
  const inRegistry = {};
  const fresh = [];
  const seenNew = new Map();
  for (const d of dealers) {
    // apex is null when the seller's "website" is a bare vendor host — that
    // names the vendor, not a rooftop, so there is nothing to add.
    if (!d.domain || !d.apex || d.privateSeller || NOT_A_ROOFTOP.test(d.apex)) continue;
    const st = known.get(d.domain) ?? known.get(d.apex);
    if (st) {
      d.registryStatus = st;
      inRegistry[st] = (inRegistry[st] ?? 0) + 1;
      continue;
    }
    const prev = seenNew.get(d.apex);
    if (prev) {
      prev.bev += d.bev;
      prev.phev += d.phev;
      prev.evListings += d.evListings;
      continue;
    }
    seenNew.set(d.apex, { ...d });
  }
  for (const d of seenNew.values()) {
    fresh.push({
      domain: d.apex,
      name: d.name ?? "Dealership Website",
      kind: "rooftop",
      platform: "unknown",
      robots: "unknown",
      status: "discovered",
      ...(d.city || d.state ? { location: { city: d.city ?? undefined, state: d.state ?? undefined, ...(d.zip ? { zip: d.zip } : {}) } } : {}),
      notes: `Discovered via Autotrader used-EV seller index ${TODAY}; ${d.evListings} used EVs listed there (${d.bev} BEV / ${d.phev} PHEV)`,
    });
  }
  fresh.sort((a, b) => a.domain.localeCompare(b.domain));

  const leaves = Object.values(ck.partitions).filter((p) => !p.children);
  const summary = {
    generatedAt: new Date().toISOString(),
    requests: ck.requests,
    partitions: { total: Object.keys(ck.partitions).length, leaves: leaves.length, done: leaves.filter((p) => p.done).length, complete: leaves.filter((p) => p.complete).length },
    listingsByFuel: Object.fromEntries(FUELS.map((f) => [f, { siteCount: ck.partitions[keyOf(f, ROOT)]?.count ?? null, vinsSeen: leaves.filter((p) => p.fuel === f).reduce((n, p) => n + (p.vinsSeen ?? 0), 0), pagesRead: leaves.filter((p) => p.fuel === f).reduce((n, p) => n + (p.pages ?? 0), 0) }])),
    dealersSeen: dealers.length,
    withWebsite: dealers.filter((d) => d.domain).length,
    privateSellers: dealers.filter((d) => d.privateSeller).length,
    privateSellerListings: dealers.filter((d) => d.privateSeller).reduce((n, d) => n + d.evListings, 0),
    inRegistryByStatus: inRegistry,
    newSites: fresh.length,
    stopped: ck.stopped ?? null,
    blockedAt: ck.blockedAt ?? null,
  };
  await writeFile(DEALERS_OUT, JSON.stringify({ summary, dealers }, null, 1));
  await writeFile(NEW_OUT, JSON.stringify(fresh, null, 1));
  console.error(JSON.stringify(summary, null, 1));
}

// ── main ────────────────────────────────────────────────────────────────────
if (flag("diff-only")) {
  await writeOutputs();
  process.exit(0);
}

await openBrowser();
try {
  // robots first, through the same client, every run (the rules can change
  // between runs and the contract is what they say NOW).
  const r = await page.goto(`${ORIGIN}/robots.txt`, { waitUntil: "domcontentloaded", timeout: 60000 });
  lastLoad = Date.now();
  ck.requests++;
  if (r.status() !== 200) throw new Stop(`robots.txt answered ${r.status()}`);
  const txt = await page.evaluate(() => document.body.innerText);
  ck.robots = parseRobots(txt);
  ck.robotsFetchedAt = new Date().toISOString();
  ck.robotsHeader = txt.split("\n")[0];
  console.error(`robots.txt: ${ck.robots.disallow.length} disallow / ${ck.robots.allow.length} allow rules in the * group (${ck.robotsHeader})`);
  for (const f of FUELS) {
    const probeUrl = new URL(srpUrl(f, ROOT));
    if (!robotsRulesAllow(ck.robots, probeUrl.pathname + probeUrl.search)) throw new Stop(`robots disallows the ${f} search page itself — nothing to do`);
  }
  await save();

  for (const fuel of FUELS) {
    console.error(`planning ${fuel}`);
    const leaves = await plan(fuel, ROOT);
    console.error(`${fuel}: ${leaves.length} leaf partitions`);
    for (const key of leaves) await walk(key);
  }
  ck.finishedAt = new Date().toISOString();
  await save();
} catch (e) {
  ck.stopped = { at: new Date().toISOString(), reason: e.message, stack: e instanceof Stop ? undefined : e.stack };
  await save();
  console.error(`STOPPED: ${e.message}`);
} finally {
  await browser?.close();
}
await writeOutputs();
process.exit(ck.stopped ? 2 : 0);
