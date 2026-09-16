// DealerEProcess — a franchise-dealer website vendor. 745 registry rooftops
// CNAME to saas.www.dealereprocess.org (measured by DNS across the whole
// registry on 2026-09-16; the 2026-09-02 walled-independents recon saw 213
// because its input was that pile, not the registry). Honda, Hyundai, Kia,
// Nissan, Toyota, Stellantis, Mazda, Subaru, Lexus… and every HTML path
// answers lib/http.mjs's plain client with Cloudflare's "Just a moment…".
//
// THE LANE IS ONE PAGE PER ROOFTOP PER PROCESS, AND WHY (2026-09-16)
//
// The vendor's SRP takes fuel facets by canonical id — 15 Electric, 835
// Plug-in Hybrid, 3988 Battery Electric (Toyota/Lexus rooftops file their
// BEVs under 3988) — and a page size up to 60. That one page,
// /search/electric/?fl=15&fl=835&fl=3988&ct=60, is server-rendered and
// carries the rooftop's own "N vehicles found", the fuel panel with a count
// per fuel, and one schema.org Vehicle per card: VIN, model year, fuelType,
// mileage, VDP url, and offers[0] with price and itemCondition. The page
// size is honoured on a direct load by only some templates: of the 199
// rooftops counting more than 12 EVs, 29 rendered more than 12 cards at
// ct=60 and 170 rendered exactly 12 (their per-page select still reads
// "12" — the size is a session preference the select's own navigation
// sets, i.e. a second load). So the one page is 12 cards on most rooftops,
// and across the cluster it carried 4,706 of the 9,326 listings it counted
// (558 rooftops complete on one load, 176 partial). Plain headless Chrome
// (lib/browser.mjs, nothing patched) loaded it at 200 on 744 of 745
// rooftops on 2026-09-16 — the 745th answered 500 twice.
// Together those pages counted 9,326 electrified listings, 1,575 of the
// 3,167 distinct first-page VINs not in the database at all.
//
// The SECOND load on the same host in the same browser session is the
// challenge: 6 of 6 rooftops on 2026-09-16, and the 2026-09-02 measurement
// (first VDP 200, next nine 403) was the same rule seen from the VDP side.
// Measured with the raw Playwright API on kiamedford.com: context A page 1
// → 200, a FRESH context page 2 → 200, context A page 2 → 403. The
// challenge follows Cloudflare's bot-management cookie, not the address.
// Opening a fresh context per page would therefore defeat that check, which
// is the line lib/browser.mjs draws (no challenge solving, no disguise), so
// this lane never does it: one load per rooftop per crawl process, and a
// 403 is an answer, never retried. A page that counts more cars than it
// rendered (176 of 744 rooftops on 2026-09-16) is reported partial so
// db-sync never reads the unseen cars as delisted; the count is exact on
// every page.
//
// What is NOT used, and why:
//   - /resrc/inventory/search_filters/ and /results/ answer 401 to a plain
//     client since some time between 09-02 and 09-16. The page's own filter
//     script (cdn.dealereprocess.org/cdn/js/search/filter_search.min.js)
//     sends a static Basic credential for them — a vendor password, not an
//     account id, and whether Voltcheck sends it is the owner's call
//     (docs/dealereprocess-gap-2026-09.md §4b). The lane does not.
//   - The sitemap + VDP-by-browser shape this file had until 2026-09-16
//     needed N+1 loads per rooftop; every load after the first is walled.
//   - Sorted SRP variants (/search/*s:pr …) are robots-disallowed; only the
//     default order is asked. /resrc/searchabledata/ and /resrc/vehicleviews/
//     are disallowed and never asked.
import { browserFetch } from "../browser.mjs";
import { extractVehicles } from "../jsonld.mjs";

// The vendor's own hosts on a served page (image CDN, the platform's job
// board that the pages call home to). Never the word alone in prose.
const DEP_RE = /\b(?:cloudflareimages|jobs|www|cdn)\.dealereprocess\.(?:com|org)\b/i;

export function isDealerEProcess(html) {
  return typeof html === "string" && DEP_RE.test(html);
}

export const DEP_VDP_PATH_RE = /\/auto\/([a-z0-9-]+)\/(\d+)\/?$/i;
export const DEP_FUEL_IDS = { electric: 15, plugInHybrid: 835, batteryElectric: 3988 };
export const DEP_PAGE_SIZE = 60; // the largest option the page's own per-page control offers (12/24/30/36/48/60); most templates render 12 regardless on a direct load
export const DEP_EV_SRP_PATH = `/search/electric/?fl=${DEP_FUEL_IDS.electric}&fl=${DEP_FUEL_IDS.plugInHybrid}&fl=${DEP_FUEL_IDS.batteryElectric}&ct=${DEP_PAGE_SIZE}`;

export function dealerEProcessEvSrpUrl(origin) {
  return `${String(origin).replace(/\/$/, "")}${DEP_EV_SRP_PATH}`;
}

/** The Cloudflare interstitial, which answers 403 with a page of its own. */
export function dealerEProcessChallenged(status, html) {
  return status === 403 || /<title>\s*Just a moment/i.test(String(html ?? "").slice(0, 4000));
}

/** The page's own count of cars under the facets asked for, or null when the
 *  page does not say (a challenge page, a template without the line). */
export function dealerEProcessSrpFound(html) {
  const text = String(html ?? "")
    .replace(/<script[\s\S]*?<\/script>/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ");
  const m = /\b(\d[\d,]*)\s*(?:results?|vehicles?)\s*found\b/i.exec(text);
  return m ? Number(m[1].replace(/,/g, "")) : null;
}

/** The fuel panel: { "Electric": 20, "Gasoline": 116, … } by the vendor's
 *  own labels. The panel is the whole lot's fuel split, not the filtered
 *  result's (measured: kiamedford.com "20 vehicles found" = Electric 19 +
 *  Plug-in Hybrid 1). Empty when the template carries no panel. */
export function dealerEProcessFuelPanel(html) {
  const h = String(html ?? "");
  const i = h.indexOf("srp_filter_panel__fuel_type");
  const out = {};
  if (i < 0) return out;
  const panel = h.slice(i, i + 12000);
  for (const m of panel.matchAll(/data-canonical-id="(\d+)"\s+data-filter-label="([^"]+)"[\s\S]*?srp_filter_option_count">\(?(\d+)\)?/g)) {
    if (!/^(?:Battery Electric|Electric|Plug-?in Hybrid|Hybrid|Gasoline|Diesel|Flex Fuel|Hydrogen)$/i.test(m[2])) continue;
    out[m[2]] = Number(m[3]);
  }
  return out;
}

/** Every Vehicle node the SRP carries that names a VIN, urls made absolute,
 *  one per VIN. These are the cards' own nodes (not a VDP's), so crawl.mjs
 *  scores them as SRP records. */
export function dealerEProcessSrpVehicles(html, origin) {
  const seen = new Set();
  const out = [];
  for (const v of extractVehicles(html ?? "")) {
    const offers = (Array.isArray(v.offers) ? v.offers : [v.offers]).filter(Boolean);
    const vin = String(v.vehicleIdentificationNumber ?? offers[0]?.serialNumber ?? "").toUpperCase();
    if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(vin) || seen.has(vin)) continue;
    seen.add(vin);
    const rel = offers[0]?.url ?? v.url;
    let abs = null;
    if (rel) {
      try {
        abs = new URL(rel, origin).toString();
      } catch {}
    }
    out.push({
      ...v,
      vehicleIdentificationNumber: vin,
      ...(abs ? { url: abs } : {}),
      offers: offers.map((o, i) => (i === 0 && abs ? { ...o, url: abs } : o)),
    });
  }
  return out;
}

/**
 * The lane: ONE browser load. Returns the crawl's lane shape — raw JSON-LD
 * Vehicle nodes for crawl.mjs to classify and normalize like a page's own —
 * and certifies `complete` only when the page said how many cars there are
 * and carried every one of them (found ≤ the page size, and as many VIN
 * nodes as the count). A page that says 87 and shows 60 is partial: the 27
 * are cars this visit did not see, and a partial report keeps db-sync from
 * reading their absence as a delisting.
 */
export async function pullDealerEProcess(origin, { deadlineAt = 0, fetch = browserFetch } = {}) {
  const empty = (why, extra = {}) => ({ ok: false, complete: false, found: 0, candidates: 0, vehicles: [], requests: 0, vdpFailures: 0, why, ...extra });
  if (deadlineAt && Date.now() >= deadlineAt) return empty("stopped at the crawl's time cap");
  const res = await fetch(dealerEProcessEvSrpUrl(origin), { settleMs: 2500 });
  if (res.status === "browser_unavailable") return empty("browser_unavailable");
  if (res.status === "robots_disallowed") return empty("robots_disallowed");
  if (dealerEProcessChallenged(res.status, res.body)) return empty("challenged on the first load", { requests: 1 });
  if (res.status !== 200 || !res.body) return empty(`SRP ${res.status}`, { requests: 1 });
  const found = dealerEProcessSrpFound(res.body);
  const fuel = dealerEProcessFuelPanel(res.body);
  const vehicles = dealerEProcessSrpVehicles(res.body, res.finalUrl || origin);
  const notes = [];
  const fuelLine = Object.entries(fuel)
    .filter(([k]) => /electric|plug/i.test(k))
    .map(([k, n]) => `${k} ${n}`)
    .join(", ");
  if (fuelLine) notes.push(`fuel panel: ${fuelLine}`);
  let complete;
  let why;
  if (found == null) {
    // The template did not print its count (9 of 744 on 2026-09-16); the
    // cards are all the page has to say, and it cannot certify the lot.
    complete = false;
    why = "page did not print its count";
  } else if (found > DEP_PAGE_SIZE) {
    complete = false;
    why = `${found} EVs, page carries ${DEP_PAGE_SIZE}; the rest is behind the challenge`;
  } else {
    complete = vehicles.length >= found;
    if (!complete) why = `${found} EVs counted, ${vehicles.length} card(s) rendered; the rest is behind the challenge`;
  }
  return {
    ok: true,
    complete,
    found: found ?? vehicles.length,
    candidates: vehicles.length,
    vehicles,
    requests: 1,
    vdpFailures: 0,
    notes,
    ...(why ? { why } : {}),
  };
}

/** For probe: the same single load. `found` is the rooftop's EV count by its
 *  own page; hasVin is whether a card carried one. A zero-EV rooftop is not
 *  promoted (nothing to prove the lane on) and stays where it was. */
export async function countDealerEProcess(origin) {
  const r = await pullDealerEProcess(origin);
  if (!r.ok) return { ok: false, found: 0, hasVin: false, requests: r.requests, why: r.why };
  return { ok: true, found: r.found, candidates: r.candidates, hasVin: r.vehicles.length > 0, requests: 1 };
}
