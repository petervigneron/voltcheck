// Dealer Inspire (Cars Commerce) — the largest dealer-website vendor in the
// 2026-09-02 walled pile: 1,496 rooftops, 60% of it. Rooftops CNAME to
// pod{N}.dealerinspire.com (or sit as bare A records in Cars Commerce's
// 74.119.99.0/24), and every path — homepage, SRP, sitemap, wp-json —
// answers our plain fetcher with Cloudflare's "Attention Required" firewall
// page. That page is a verdict on the CLIENT: their robots.txt allows
// every crawler with a one-second delay, and a real Chrome (lib/browser.mjs,
// plain headless) loaded the same SRP at 200 with 20 VINs in it.
//
// WHERE THE CARS ARE, MEASURED 2026-09-02 (faricykia.com, kendall stores)
//
// The SRP is /used-vehicles/ and /new-vehicles/, paged by ?_p=N (the next
// link is the only pager mark; a page with no `_p=N+1` link is the last).
// It is server-rendered — no inventory XHR at all; the Algolia plugin loads
// and never calls out — and every card carries the VIN as a `data-vin`
// attribute (div.vin-row, data-testid="vin-number") plus a VDP link whose
// slug ends in the VIN: /inventory/{used|new}-{year}-{make}-{model}-{trim}-{vin}/.
// The card's price rows are dealer-configured prose ("Selling Price
// $5,303 / Delivery & Handling $695 / Faricy Sales Price $5,998") and are
// not read. The VDP publishes a schema.org Product+Car node: VIN, fuelType,
// mileageFromOdometer, itemCondition, offers.price — and that price is the
// fee-inclusive one on rooftops that fold their D&H in (5,998 above), which
// errs toward OVER, the direction this house tolerates (a false bargain is
// the expensive error). It carries the JSONLD provenance like any other
// dealer page's own offer.
//
// COST SHAPE
//
// Browser loads are ~30x a fetch, so the lane spends them where the cars are:
// one load per SRP page (20 cards each), then one per EV CANDIDATE — VIN in
// an EV-only WMI or an EV/PHEV word in the card's title/slug, the same net
// the HTML crawl throws — and never on the rest of the lot. A typical
// franchise rooftop is 2–8 SRP pages and 5–30 candidates.
import { browserFetch } from "../browser.mjs";
import { extractVehicles } from "../jsonld.mjs";
import { EVISH_RE } from "../sitemap.mjs";
import { EV_ONLY_WMIS } from "../ev.mjs";
import { decodeEntities } from "../normalize.mjs";

// The vendor's own hosts and theme names on a served page. Never the bare
// word: fingerprint.mjs's /dealerinspire/i is for pages we already read.
const DI_RE = /\b(?:assets|ref|di-uploads-[a-z0-9]+|di-shared-assets|vehicle-sprites|gtmassets)\.dealerinspire\.com\b|DealerInspire(?:Dealer|Common)Theme|\bvehicle-images\.carscommerce\.inc\b/i;
const VIN_RE = /^[A-HJ-NPR-Z0-9]{17}$/;

export function isDealerInspire(html) {
  return typeof html === "string" && DI_RE.test(html);
}

export const DEALERINSPIRE_SRPS = ["/used-vehicles/", "/new-vehicles/"];
export const DEALERINSPIRE_MAX_PAGES = 40; // 800 cards; a runaway guard, not a budget

export function dealerInspireSrpUrl(origin, path, page = 1) {
  return `${origin.replace(/\/$/, "")}${path}${page > 1 ? `?_p=${page}` : ""}`;
}

/** Cards on an SRP: VIN from data-vin, the VDP href whose slug ends in that
 *  VIN, and the title text near it (for candidacy only). */
export function dealerInspireCards(html, base) {
  const out = [];
  const seen = new Set();
  const src = String(html ?? "");
  for (const m of src.matchAll(/data-vin=["']([A-HJ-NPR-Z0-9]{17})["']/gi)) {
    const vin = m[1].toUpperCase();
    if (seen.has(vin)) continue;
    seen.add(vin);
    const hrefRe = new RegExp(`href=["']([^"']*?/inventory/[^"']*?${vin}/?)["']`, "i");
    const h = hrefRe.exec(src);
    let url = null;
    if (h) {
      try {
        url = new URL(decodeEntities(h[1]), base).toString();
      } catch {}
    }
    // The card's title sits in the VDP slug ("used-2010-ford-focus-se-…"),
    // which is the most stable place to read it from — the visible heading
    // markup varies by theme.
    const slug = url ? url.replace(/^.*\/inventory\//, "").replace(new RegExp(`-?${vin}/?$`, "i"), "") : "";
    out.push({ vin, url, title: slug.replace(/-/g, " ") });
  }
  return out;
}

/** The next SRP page, or null on the last one. DI's only pager mark is the
 *  `?_p=N+1` link; the page number is in the current url. */
export function dealerInspireNextUrl(html, currentUrl) {
  let page = 1;
  try {
    page = Number(new URL(currentUrl).searchParams.get("_p") ?? 1) || 1;
  } catch {}
  const next = page + 1;
  if (!new RegExp(`[?&]_p=${next}\\b`).test(String(html ?? ""))) return null;
  try {
    const u = new URL(currentUrl);
    u.searchParams.set("_p", String(next));
    return u.toString();
  } catch {
    return null;
  }
}

/** Same net as the HTML crawl's evishEntry: an EV-only WMI, or an EV/PHEV word. */
export function dealerInspireIsCandidate(card) {
  if (card.vin && VIN_RE.test(card.vin) && EV_ONLY_WMIS.has(card.vin.slice(0, 3).toUpperCase())) return true;
  return EVISH_RE.test(`${card.title ?? ""} ${card.url ?? ""}`);
}

/** The VDP's own Vehicle node for this VIN, or null. */
export function dealerInspireVdpVehicle(html, vin) {
  for (const v of extractVehicles(html ?? "")) {
    if (String(v.vehicleIdentificationNumber ?? "").toUpperCase() === vin) return v;
  }
  return null;
}

async function readSrp(origin, path, { maxPages = DEALERINSPIRE_MAX_PAGES } = {}) {
  const cards = [];
  const seen = new Set();
  let url = dealerInspireSrpUrl(origin, path);
  let requests = 0;
  let pages = 0;
  let status = null;
  while (url && pages < maxPages) {
    const res = await browserFetch(url);
    requests++;
    status = res.status;
    if (res.status !== 200 || !res.body) break;
    pages++;
    const page = dealerInspireCards(res.body, res.finalUrl || url);
    let fresh = 0;
    for (const c of page) {
      if (seen.has(c.vin)) continue;
      seen.add(c.vin);
      cards.push(c);
      fresh++;
    }
    if (!fresh) break; // a pager that loops back serves the same cards again
    url = dealerInspireNextUrl(res.body, res.finalUrl || url);
  }
  return { cards, requests, pages, status, complete: pages > 0 && !url };
}

/** Whole lot across both SRPs, candidate VDPs by browser. Raw JSON-LD nodes
 *  out; crawl.mjs classifies and normalizes. */
export async function pullDealerInspire(origin, { srps = DEALERINSPIRE_SRPS } = {}) {
  const cards = [];
  const seen = new Set();
  let requests = 0;
  let complete = true;
  let anySrp = false;
  for (const path of srps) {
    const r = await readSrp(origin, path);
    requests += r.requests;
    if (r.status === "browser_unavailable") return { ok: false, complete: false, found: 0, candidates: 0, vehicles: [], requests, vdpFailures: 0, why: "browser_unavailable" };
    if (r.pages === 0) {
      // A rooftop with no /new-vehicles/ (independents on DI exist) is not a
      // failure; a rooftop with NO SRP at all is.
      continue;
    }
    anySrp = true;
    if (!r.complete) complete = false;
    for (const c of r.cards) {
      if (seen.has(c.vin)) continue;
      seen.add(c.vin);
      cards.push(c);
    }
  }
  if (!anySrp) return { ok: false, complete: false, found: 0, candidates: 0, vehicles: [], requests, vdpFailures: 0 };
  const cands = cards.filter(dealerInspireIsCandidate);
  const vehicles = [];
  let vdpFailures = 0;
  for (const c of cands) {
    if (!c.url) {
      vdpFailures++;
      continue;
    }
    const res = await browserFetch(c.url);
    requests++;
    if (res.status === "browser_unavailable") return { ok: false, complete: false, found: cards.length, candidates: cands.length, vehicles, requests, vdpFailures, why: "browser_unavailable" };
    const v = res.status === 200 && res.body ? dealerInspireVdpVehicle(res.body, c.vin) : null;
    if (!v) {
      vdpFailures++;
      continue;
    }
    vehicles.push(v);
  }
  return { ok: true, complete: complete && vdpFailures === 0, found: cards.length, candidates: cands.length, vehicles, requests, vdpFailures };
}

/** For probe: the first used SRP page by browser. `found` is that page's
 *  card count (a floor, not the lot), hasVin is what the cards carry. */
export async function countDealerInspire(origin) {
  const res = await browserFetch(dealerInspireSrpUrl(origin, DEALERINSPIRE_SRPS[0]));
  if (res.status === "browser_unavailable") return { ok: false, found: 0, hasVin: false, why: "browser_unavailable" };
  if (res.status !== 200 || !res.body) return { ok: false, found: 0, hasVin: false, status: res.status };
  const cards = dealerInspireCards(res.body, res.finalUrl || origin);
  return { ok: true, found: cards.length, hasVin: cards.length > 0, candidates: cards.filter(dealerInspireIsCandidate).length };
}
