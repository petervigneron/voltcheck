// PARKED 2026-09-02, NOT WIRED. Read the measurement before un-parking:
// with lib/browser.mjs (plain headless Chrome, no patches) the first VDP of
// a session answered 200 with full JSON-LD and the next NINE answered 403
// "Just a moment…" — Cloudflare's JavaScript challenge, which plain headless
// Chrome does not clear even with an 8-second settle. Clearing it takes the
// browser pretending not to be automated, and that is the line the owner
// drew (lib/browser.mjs header). The sitemap-by-fetch + VDP-by-browser shape
// below is complete and tested; it is off because the door is not open, not
// because the code is unfinished. If Cloudflare's rule on these rooftops
// ever changes, wire countDealerEProcess/pullDealerEProcess back into the
// BROWSER_* tables in probe.mjs and crawl.mjs and re-measure.
//
// DealerEProcess — a franchise-dealer website vendor (213 rooftops in the
// 2026-09-02 walled pile, themountainhyundai.com, groovetoyota.com,
// kiamedford.com …). Rooftops CNAME to {slug}.dealereprocess.org behind
// Cloudflare, and every HTML path answers our plain fetcher with the
// "Just a moment…" JavaScript challenge.
//
// WHAT IS OPEN, MEASURED 2026-09-02
//
// Two things are not behind the challenge, and together they are the lane:
//
//   1. The sitemap index, /resrc/xmlsitemap/xml-sitemaps/, answers a plain
//      GET (200, 1.3 KB) and names one inventory sitemap per served city,
//      /resrc/xmlsitemap/sitemap-inventory-search/[{city}-{zip}/]. The bare
//      one lists the whole lot: 448 locs on themountainhyundai.com, 446 of
//      them VDPs shaped /auto/{new|used}-{year}-{make}-{model}-{trim}-{city}-{st}/{id}/.
//      No VIN in the slug — the id is the vendor's — so the slug is only
//      good for CANDIDACY (year, make, model, trim words), never identity.
//   2. The VDP itself, read by a real Chrome (lib/browser.mjs; plain
//      headless, no patches, status 200 on the first try), publishes a
//      complete schema.org Vehicle: vehicleIdentificationNumber, fuelType
//      ("Electric"), vehicleModelDate, mileageFromOdometer, itemCondition,
//      and offers[0] with price, url and serialNumber (= VIN again). The
//      generic JSON-LD reader takes it from there; the price is the page's
//      own offer, so it carries the JSONLD provenance like every other
//      dealer page's.
//
// What is NOT used: /resrc/inventory/results/ answers 401 "Invalid
// authorization credentials" without a key the page never showed us —
// credentialed is closed, not open. /resrc/searchabledata/ and
// /resrc/vehicleviews/ are robots-disallowed on every rooftop and are never
// asked. /auto/ and /resrc/xmlsitemap/ are not in any Disallow.
//
// THE REPLACED-VDP TRAP
//
// A sitemap url can 200 with a DIFFERENT car: /auto/new-2025-hyundai-ioniq-5-
// limited-…/102972877/ landed on the JSON-LD of a 2026 IONIQ 5 XRT, id
// 116442326 (the dealer reused the slot). Slugs carry no VIN to check, so
// the check is the id: the Vehicle node's own url must carry the id we
// asked for, or the page is a replacement and is skipped as unread. The
// autocorner lane has the VIN-flavoured version of the same rule.
import { fetchPage } from "../http.mjs";
import { browserFetch } from "../browser.mjs";
import { extractVehicles } from "../jsonld.mjs";
import { LOC_RE, EVISH_RE, decodeEntities } from "../sitemap.mjs";

// The vendor's own hosts on a served page (image CDN, the platform's job
// board that the pages call home to). Never the word alone in prose.
const DEP_RE = /\b(?:cloudflareimages|jobs|www)\.dealereprocess\.(?:com|org)\b/i;

export function isDealerEProcess(html) {
  return typeof html === "string" && DEP_RE.test(html);
}

export const DEP_SITEMAP_INDEX = "/resrc/xmlsitemap/xml-sitemaps/";
export const DEP_VDP_PATH_RE = /\/auto\/([a-z0-9-]+)\/(\d+)\/?$/i;

export function dealerEProcessSitemapIndexUrl(origin) {
  return `${origin.replace(/\/$/, "")}${DEP_SITEMAP_INDEX}`;
}

/** The whole-lot inventory sitemap from the index: the bare
 *  sitemap-inventory-search/ entry (per-city ones repeat it under a suffix). */
export function dealerEProcessInventorySitemap(indexXml) {
  const locs = [...String(indexXml ?? "").matchAll(LOC_RE)].map((m) => decodeEntities(m[1]));
  return locs.find((u) => /\/resrc\/xmlsitemap\/sitemap-inventory-search\/?$/i.test(u)) ?? locs.find((u) => /sitemap-inventory-search/i.test(u)) ?? null;
}

/** Every VDP the inventory sitemap lists, one per vendor id. */
export function dealerEProcessEntries(xml) {
  const seen = new Set();
  const out = [];
  for (const m of String(xml ?? "").matchAll(LOC_RE)) {
    const url = decodeEntities(m[1]);
    const p = DEP_VDP_PATH_RE.exec(url);
    if (!p) continue;
    const [, slug, id] = p;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({ url, id, slug, name: slug.replace(/-/g, " ") });
  }
  return out;
}

/** Slug words that could be an EV or PHEV — the same net the HTML crawl
 *  throws over sitemap urls. Everything else is left unread on purpose. */
export function dealerEProcessCandidates(entries) {
  return entries.filter((e) => EVISH_RE.test(e.slug));
}

/** The Vehicle node for the id we asked for, offer url absolute, or null
 *  when the page is a replacement (its own url names a different id). */
export function dealerEProcessVdpVehicle(html, { id, origin }) {
  const nodes = extractVehicles(html ?? "");
  for (const v of nodes) {
    const offers = (Array.isArray(v.offers) ? v.offers : [v.offers]).filter(Boolean);
    const url = offers[0]?.url ?? v.url;
    if (!url) continue;
    const p = DEP_VDP_PATH_RE.exec(url);
    if (!p || p[2] !== String(id)) continue;
    let abs;
    try {
      abs = new URL(url, origin).toString();
    } catch {
      continue;
    }
    const node = { ...v, url: abs, offers: offers.map((o, i) => (i === 0 ? { ...o, url: abs } : o)) };
    return node;
  }
  return null;
}

async function readSitemap(origin) {
  const idx = await fetchPage(dealerEProcessSitemapIndexUrl(origin));
  if (idx.status !== 200 || !idx.body) return { ok: false, requests: 1, entries: [] };
  const inv = dealerEProcessInventorySitemap(idx.body);
  if (!inv) return { ok: false, requests: 1, entries: [] };
  const sm = await fetchPage(inv);
  if (sm.status !== 200 || !sm.body) return { ok: false, requests: 2, entries: [] };
  return { ok: true, requests: 2, entries: dealerEProcessEntries(sm.body) };
}

/** Whole lot: sitemap by plain fetch, candidate VDPs by browser. Returns raw
 *  JSON-LD Vehicle nodes; crawl.mjs classifies and normalizes them exactly as
 *  it does a page's own JSON-LD. `complete` is true only when every candidate
 *  VDP was read: an unread VDP is a car this walk did not see. */
export async function pullDealerEProcess(origin) {
  const sm = await readSitemap(origin);
  let requests = sm.requests;
  if (!sm.ok) return { ok: false, complete: false, found: 0, candidates: 0, vehicles: [], requests, vdpFailures: 0 };
  const cands = dealerEProcessCandidates(sm.entries);
  const vehicles = [];
  let vdpFailures = 0;
  let unavailable = false;
  for (const c of cands) {
    const res = await browserFetch(c.url);
    requests++;
    if (res.status === "browser_unavailable") {
      unavailable = true;
      break;
    }
    if (res.status !== 200 || !res.body) {
      vdpFailures++;
      continue;
    }
    const v = dealerEProcessVdpVehicle(res.body, { id: c.id, origin });
    if (!v) {
      vdpFailures++;
      continue;
    }
    vehicles.push(v);
  }
  return {
    ok: !unavailable,
    complete: !unavailable && vdpFailures === 0,
    found: sm.entries.length,
    candidates: cands.length,
    vehicles,
    requests,
    vdpFailures,
    ...(unavailable ? { why: "browser_unavailable" } : {}),
  };
}

/** For probe: the lot size from the sitemap alone, and one candidate VDP
 *  read by browser to prove a VIN comes back. */
export async function countDealerEProcess(origin) {
  const sm = await readSitemap(origin);
  if (!sm.ok) return { ok: false, found: 0, hasVin: false, requests: sm.requests };
  const cands = dealerEProcessCandidates(sm.entries);
  // Up to three VDPs, because the first sitemap slot can be a replaced one
  // (the 102972877 → 116442326 case above): one miss says nothing about the
  // lot, three in a row does.
  const tries = (cands.length ? cands : sm.entries).slice(0, 3);
  if (!tries.length) return { ok: true, found: 0, hasVin: false, requests: sm.requests };
  let requests = sm.requests;
  for (const t of tries) {
    const res = await browserFetch(t.url);
    requests++;
    if (res.status === "browser_unavailable") return { ok: false, found: sm.entries.length, hasVin: false, requests, why: "browser_unavailable" };
    const v = res.status === 200 && res.body ? dealerEProcessVdpVehicle(res.body, { id: t.id, origin }) : null;
    if (v?.vehicleIdentificationNumber) return { ok: true, found: sm.entries.length, candidates: cands.length, hasVin: true, requests };
  }
  return { ok: true, found: sm.entries.length, candidates: cands.length, hasVin: false, requests };
}
