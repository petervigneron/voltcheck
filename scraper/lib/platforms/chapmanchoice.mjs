// Chapman Automotive's own group site, www.chapmanaz.com — 17 Arizona stores
// (Chapman Hyundai Phoenix/Scottsdale, Chapman Honda, Chapman Acura, Freeway
// Chevrolet, Palo Verde Used Cars, Chapman Speedway …) on an in-house Nuxt
// build whose assets live on chapmanchoice.com. Not a vendor platform; one
// site, so this lane is fingerprinted on that asset host and nothing else.
//
// WHY IT EXISTS (owner question, 2026-09-02: "Do we search these guys?")
//
// No, we did not: 28 Chapman rooftop domains sit in the registry, eight of
// them holding 138 live cars, and the group site itself was never a row. It
// is the open door to the whole group: its used-EV search page answered our
// plain fetcher at 200 with 100 VINs server-rendered, 97 of them not in the
// database; robots.txt allows everything but forms; and /sitemap.xml lists
// 7,270 vehicle pages shaped
//
//   /detail/{new|used|cpo}/{year}/{make}/{model}/{stock}/{store}
//
// (model URL-encoded, "Silverado%2B1500"; the store is the DMS code, CAO =
// Chapman Acura, CAS = Chapman Hyundai Phoenix …). Every vehicle page carries
// a schema.org Car node: VIN, model year, brand, fuelType, mileage,
// itemCondition, and an Offer with the price and the store's address under
// `offeredBy` — which normalize() reads as `seller`, so the lane renames it.
//
// PRICE
//
// The Offer's price is the card's "Total Price", and Chapman's total price
// INCLUDES its $589 doc fee (2016 i-MiEV: was $8,798, save $799, Total Price
// $8,588 "includes $589 doc fee"). The pre-fee figure ($7,999) is printed
// nowhere on the page, so it is not a claim the dealer makes; the lane keeps
// the page's own offer, tagged JSONLD like every other dealer page's, and
// that errs OVER by the fee — the direction this house tolerates. If a
// pre-fee convention is ever wanted here, the Nuxt payload carries
// pricing.docFee per car; subtracting it is a one-line change and a new tag.
//
// WHY THE SEARCH PAGE IS NOT THE SOURCE
//
// The server-rendered search list is a fixed 100-car slice whatever the
// page or filter (?page=2 serves the same 100), so it can prove the door is
// open but cannot enumerate the lot. The sitemap can. Candidates are picked
// off the slug's make+model with the crawl's own EV net (the slug carries no
// trim and no VIN, so a "BMW X5" plug-in reads as a candidate only if the
// model word is on the list — the AutoCorner/DealerEProcess limitation).
import { fetchPage } from "../http.mjs";
import { extractVehicles } from "../jsonld.mjs";
import { LOC_RE, EVISH_RE, decodeEntities } from "../sitemap.mjs";

const CC_RE = /\b(?:photos|assets)\.chapmanchoice\.com\b/i;
export const CHAPMANCHOICE_SITEMAP_PATH = "/sitemap.xml";
export const CHAPMANCHOICE_DETAIL_RE = /\/detail\/(new|used|cpo)\/(\d{4})\/([^/]+)\/([^/]+)\/([^/]+)\/([A-Z0-9]+)\/?$/i;

export function isChapmanChoice(html) {
  return typeof html === "string" && CC_RE.test(html);
}

export function chapmanChoiceSitemapUrl(origin) {
  return `${origin.replace(/\/$/, "")}${CHAPMANCHOICE_SITEMAP_PATH}`;
}

// "Silverado%2B1500" → "Silverado+1500" → "Silverado 1500": the site
// encodes a space as a plus and the plus as %2B, so decode, then unplus.
const dec = (s) => {
  let t = String(s);
  try {
    t = decodeURIComponent(t);
  } catch {}
  return t.replace(/\+/g, " ");
};

/** The site is the fingerprint too: the homepage carries no chapmanchoice
 *  asset (the search and detail pages do), so the probe recognises the
 *  registry domain itself, as the Recharged and EverCars lanes do. */
export function isChapmanChoiceOrigin(origin) {
  try {
    return /(^|\.)chapmanaz\.com$/i.test(new URL(origin).host);
  } catch {
    return false;
  }
}

/** Every vehicle page in the sitemap, one per stock+store. */
export function chapmanChoiceEntries(xml) {
  const out = [];
  const seen = new Set();
  for (const m of String(xml ?? "").matchAll(LOC_RE)) {
    const url = decodeEntities(m[1]);
    const p = CHAPMANCHOICE_DETAIL_RE.exec(url);
    if (!p) continue;
    const [, cond, year, make, model, stock, store] = p;
    const key = `${stock}/${store}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ url, cond: cond.toLowerCase(), year, make: dec(make), model: dec(model), stock, store, name: `${year} ${dec(make)} ${dec(model)}` });
  }
  return out;
}

export function chapmanChoiceCandidates(entries) {
  return entries.filter((e) => EVISH_RE.test(`${e.make} ${e.model}`));
}

/** The page's Car node for the stock asked for, offer's `offeredBy` exposed
 *  as `seller` so normalize() reads the store's city/state/zip. Null when the
 *  page is a different car (a reused slot) or carries no node. */
export function chapmanChoiceVdpVehicle(html, { stock, origin }) {
  for (const v of extractVehicles(html ?? "")) {
    const offers = (Array.isArray(v.offers) ? v.offers : [v.offers]).filter(Boolean);
    const url = offers[0]?.url ?? v.url;
    const p = url ? CHAPMANCHOICE_DETAIL_RE.exec(url) : null;
    if (!p || p[5] !== stock) continue;
    let abs;
    try {
      abs = new URL(url, origin).toString();
    } catch {
      continue;
    }
    const offer = { ...offers[0], url: abs };
    if (!offer.seller && offer.offeredBy) offer.seller = offer.offeredBy;
    return { ...v, url: abs, offers: offer };
  }
  return null;
}

async function readSitemap(origin) {
  const sm = await fetchPage(chapmanChoiceSitemapUrl(origin));
  if (sm.status !== 200 || !sm.body) return { ok: false, requests: 1, entries: [] };
  return { ok: true, requests: 1, entries: chapmanChoiceEntries(sm.body) };
}

/** Whole group by sitemap, candidate VDPs by plain fetch. Raw JSON-LD nodes
 *  out; crawl.mjs classifies and normalizes. */
export async function pullChapmanChoice(origin) {
  const sm = await readSitemap(origin);
  let requests = sm.requests;
  if (!sm.ok) return { ok: false, complete: false, found: 0, candidates: 0, vehicles: [], requests, vdpFailures: 0 };
  const cands = chapmanChoiceCandidates(sm.entries);
  const vehicles = [];
  let vdpFailures = 0;
  for (const c of cands) {
    const res = await fetchPage(c.url);
    requests++;
    if (res.status !== 200 || !res.body) {
      vdpFailures++;
      continue;
    }
    const v = chapmanChoiceVdpVehicle(res.body, { stock: c.stock, origin });
    if (!v) {
      vdpFailures++;
      continue;
    }
    vehicles.push(v);
  }
  return { ok: true, complete: vdpFailures === 0, found: sm.entries.length, candidates: cands.length, vehicles, requests, vdpFailures };
}

/** For probe: the sitemap's vehicle count, and one candidate VDP read to
 *  prove a VIN comes back. */
export async function countChapmanChoice(origin) {
  const sm = await readSitemap(origin);
  if (!sm.ok) return { ok: false, found: 0, hasVin: false, requests: sm.requests };
  const cands = chapmanChoiceCandidates(sm.entries);
  const t = cands[0] ?? sm.entries[0];
  if (!t) return { ok: true, found: 0, hasVin: false, requests: sm.requests };
  const res = await fetchPage(t.url);
  const v = res.status === 200 && res.body ? chapmanChoiceVdpVehicle(res.body, { stock: t.stock, origin }) : null;
  return { ok: true, found: sm.entries.length, candidates: cands.length, hasVin: Boolean(v?.vehicleIdentificationNumber), requests: sm.requests + 1 };
}
