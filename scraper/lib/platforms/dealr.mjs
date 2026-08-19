// Dealr (dealr.cloud) platform extractor.
//
// Dealr is the website platform of a cluster of small independent used-car lots
// (Broom Broom Auto in Aurora CO, JFR & Associates, e-Prius in MA…). 52 of our
// registry's sites run it and every one yielded zero cars, for the same reason
// Dealer Car Search did: the only schema.org on the page is an AutoDealer whose
// `makesOffer` lists cars as bare `@type:Car` with name and price but no VIN, so
// the JSON-LD/VIN-sitemap extractors have nothing to hook. The VDP URL is keyed
// by an internal inventory id (/inventory/2022-chevrolet-equinox-fwd-lt/1162111)
// rather than the VIN, so the sitemap prefilter misses it too.
//
// What Dealr does serve — on every rooftop — is a clean paged JSON endpoint its
// own SRP calls to render the grid:
//   GET /functions/getInventorySubset?page=N&blockKey=blocks/inventory/srp/inventory-list.twig
//   -> { filters: {make:[{count,val}...], year:[...], ...}, list: "<html cards>" }
// `list` is the server-rendered card HTML (50 cars/page); `filters` re-renders
// against the whole result set, so summing any one facet's counts is the exact
// lot total — the same trick DCS's Make-facet total uses to know when the walk
// is done. We page the endpoint to completion and parse each card. No login and
// no bot-detection to defeat: this is the request the shopper's own browser
// makes when it scrolls the inventory.
//
// The `blockKey` names a template block, and a handful of rooftops run a custom
// theme whose inventory block is not the default one — the API then answers with
// the right `filters` but an empty `list` ("There is no content in this block").
// For those we fall back to paging the plain SRP at /inventory?page=N, which
// every theme renders server-side; its cards are split on the one anchor that
// survives every theme — the /inventory/{slug}/{id} VDP link — and identified by
// the slug when the standard title/detail markup is absent. So a custom-theme
// rooftop degrades to VIN + price + name rather than to zero.
//
// Like a JSON-LD site's absence, Dealr is API-backed, so this exports a puller
// (`pullDealr`) rather than an `extract…(html)`. It manufactures schema.org
// Vehicle nodes so the pull flows through the same classifyEv/normalize path as
// every other source: nothing here pre-judges which cars are electric — Dealr
// even renders an EV's engine as "0cyl - 0.0L" rather than "Electric", so the
// classification is left to classifyEv's nameplate/VIN logic.
//
// VIN source is the one soft spot. Dealr's card carries the VIN only inside the
// optional third-party badges a rooftop enables — `data-cg-vin` (CarGurus),
// `data-vin` (Recurrent), or the `vehicle-inquiry="VIN|year|make|model"` the
// inquiry modal reads. No two rooftops in the sample used the same one, but the
// union covers all of them; a card exposing none of the three is skipped, since
// a listing with no VIN is one we can't stand behind.

import { politeGetJson, fetchPage } from "../http.mjs";

const decode = (s) =>
  String(s ?? "")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;|&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();

const clean = (s) => {
  const t = decode(s);
  return t && t !== "-" && !/^n\/?a$/i.test(t) ? t : undefined;
};

const digits = (s) => {
  const m = String(s ?? "").match(/[\d,]+/);
  const n = m ? Number(m[0].replace(/,/g, "")) : NaN;
  return Number.isFinite(n) ? n : undefined;
};

const money = (s) => {
  const m = String(s ?? "").match(/\$?\s*([\d,]+(?:\.\d+)?)/);
  const n = m ? Number(m[1].replace(/,/g, "")) : NaN;
  return Number.isFinite(n) && n > 0 ? n : undefined;
};

const VIN_RE = /^[A-HJ-NPR-Z0-9]{17}$/;

// Page-level fingerprint. `getInventorySubset` is the platform's inventory API
// call and `dealr-inventory-list__vehicle` its grid card class; the
// `cdn.dealrcloud.com` asset host is on every page including the homepage. All
// three are specific to the vendor — this answer decides whether a crawl reads a
// dealer's whole lot off the API.
const DEALR_MARK = /getInventorySubset|dealr-inventory-list__vehicle|cdn\.dealrcloud\.com/i;

export function isDealr(html) {
  return typeof html === "string" && DEALR_MARK.test(html);
}

const BLOCK_KEY = "blocks/inventory/srp/inventory-list.twig";
const PER_PAGE = 50; // the grid's fixed page size
const MAX_PAGES = 80; // 80 * 50 = 4,000 — a runaway guard, not a real ceiling

const subsetUrl = (base, page) =>
  `${base}/functions/getInventorySubset?page=${page}&blockKey=${encodeURIComponent(BLOCK_KEY)}`;
const srpUrl = (base, page) => `${base}/inventory?page=${page}`;

// Sum of counts on any one facet == the whole lot's size (each facet re-renders
// against the full result set). Make is the one facet every rooftop populates.
function facetTotal(filters) {
  const arr = filters?.make;
  if (!Array.isArray(arr) || !arr.length) return null;
  const sum = arr.reduce((a, x) => a + (Number(String(x?.count ?? "").replace(/,/g, "")) || 0), 0);
  return sum > 0 ? sum : null;
}

// The makes actually present in this lot, longest first — so a title match
// prefers "Land Rover"/"Mercedes-Benz"/"Alfa Romeo" over a shorter substring.
// Dealr hands us this vocabulary, so no make list has to be hard-coded and
// two-word makes fall out for free (same idea as DCS's blob-given make).
function facetMakes(filters) {
  const arr = Array.isArray(filters?.make) ? filters.make : [];
  return arr
    .map((x) => clean(x?.val))
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);
}

// "N Vehicles" on the SRP is the lot total — the count the static fallback reads
// where it has no `filters` object to sum.
function srpTotal(html) {
  const m = String(html ?? "").match(/([\d,]+)\s+Vehicles?\b/i);
  return m ? Number(m[1].replace(/,/g, "")) : null;
}

// Standard-theme split: every stock theme opens a card with
// `dealr-inventory-list__vehicle theme…`, so the boundary holds across themes
// that share it (the API `list` is card-only, so nothing else carries the class).
function cardFragmentsByContainer(html) {
  const parts = [];
  const re = /<div\s+class="dealr-inventory-list__vehicle theme/gi;
  const idx = [];
  let m;
  while ((m = re.exec(html))) idx.push(m.index);
  for (let i = 0; i < idx.length; i++) {
    parts.push({ frag: html.slice(idx[i], i + 1 < idx.length ? idx[i + 1] : html.length) });
  }
  return parts;
}

// Theme-independent split for the static fallback: slice from where each VDP
// id is first linked to where the next distinct id is (tiles are contiguous), so
// a custom theme with a different card container still parses. The slug rides
// along — it names the car when the theme drops the <h2> title.
function cardFragmentsById(html) {
  // The href may be relative ("inventory/{slug}/{id}"), root-relative, or
  // absolute, so the slash before "inventory" is not required — only that it sits
  // inside an href value. The slug charset is "anything but a slash or the
  // closing quote", because real slugs carry apostrophes and &quot; entities
  // ("…4x4-5'7&quot;-box") that a narrow [a-z0-9.-] class drops — and dropping
  // the link drops the whole card from the walk.
  const re = /href="([^"]*?inventory\/([^/"]+)\/(\d+))"/gi;
  const firstAt = new Map();
  let m;
  while ((m = re.exec(html))) {
    const id = m[3];
    if (!firstAt.has(id)) firstAt.set(id, { idx: m.index, slug: m[2] });
  }
  const order = [...firstAt.values()].sort((a, b) => a.idx - b.idx);
  const parts = [];
  for (let i = 0; i < order.length; i++) {
    const end = i + 1 < order.length ? order[i + 1].idx : html.length;
    parts.push({ frag: html.slice(order[i].idx, end), slug: order[i].slug });
  }
  return parts;
}

// A labelled detail row: <div ...__key>Mileage</div> ... <div ...__value>80,005</div>
function detail(frag, key) {
  const re = new RegExp(
    `details__item__key[^>]*>\\s*${key}\\s*<\\/div>[\\s\\S]*?details__item__value[^>]*>([\\s\\S]*?)<\\/div>`,
    "i"
  );
  const m = frag.match(re);
  return m ? clean(m[1]) : undefined;
}

// The VIN, from whichever badge the rooftop enabled. `vehicle-inquiry` leads
// with the VIN before a `|`; the other two carry it bare. First 17-char hit
// that validates wins.
function cardVin(frag) {
  const candidates = [
    frag.match(/vehicle-inquiry=["']([A-HJ-NPR-Z0-9]{17})\|/i)?.[1],
    frag.match(/data-cg-vin=["']([A-HJ-NPR-Z0-9]{17})["']/i)?.[1],
    frag.match(/data-vin=["']([A-HJ-NPR-Z0-9]{17})["']/i)?.[1],
  ];
  for (const c of candidates) {
    const v = String(c ?? "").toUpperCase();
    if (VIN_RE.test(v)) return v;
  }
  return null;
}

// year|make|model straight from the inquiry attribute when present — the
// platform's own parse, so no title-splitting guesswork.
function inquiryParts(frag) {
  const m = frag.match(/vehicle-inquiry=["']([^"']+)["']/i);
  if (!m) return null;
  const p = m[1].split("|").map((x) => decode(x));
  return { year: clean(p[1]), make: clean(p[2]), model: clean(p[3]) };
}

// "2023-tesla-model-x-dual-motor" -> "2023 Tesla Model X Dual Motor". Only used
// where a custom theme drops the <h2> title; carries enough for classifyEv's
// nameplate match, and vPIC canonicalises make/model downstream from the VIN.
function nameFromSlug(slug) {
  const t = clean(String(slug ?? "").replace(/-/g, " "));
  return t ? t.replace(/\b([a-z])/g, (c) => c.toUpperCase()) : undefined;
}

// "2024 Kia EV9 GT-Line" + year 2024 + make "Kia" -> "EV9 GT-Line". Mirrors
// DCS's modelFromName: strip the leading year then the make, whatever is left is
// the model (plus trim). vPIC canonicalises the model downstream.
function modelFromName(name, year, make) {
  if (!name) return undefined;
  let rest = name.trim();
  if (year) rest = rest.replace(new RegExp(`^${year}\\s+`), "");
  if (make) rest = rest.replace(new RegExp(`^${make.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s+`, "i"), "");
  return clean(rest);
}

const DRIVES = { FWD: "FWD", RWD: "RWD", AWD: "AWD", "4WD": "4WD", "4X4": "4WD" };
const driveLine = (s) => (s ? DRIVES[s.toUpperCase().replace(/[^A-Z0-9]/g, "")] : undefined);

// One card fragment -> a schema.org Vehicle node, or null if it carries no VIN.
// Written to parse both the API's stock-theme card and the static fallback's
// custom-theme card: it reads whichever of h2/slug, price anchor/price-container,
// and inquiry/title is present, and best-effort details where the stock markup
// exists.
function cardNode(frag, { origin, makes, slug }) {
  const vin = cardVin(frag);
  if (!vin) return null;

  const h2 = clean(frag.match(/<h2[^>]*>([\s\S]*?)<\/h2>/i)?.[1]);
  const title = h2 || nameFromSlug(slug);
  const iq = inquiryParts(frag);

  const year = iq?.year ?? title?.match(/\b(19|20)\d{2}\b/)?.[0];
  // Make: the inquiry attribute first, else the longest lot-make the title
  // contains. `makes` is the dealer's own facet list, so this needs no make
  // vocabulary and never invents one; on the static fallback (no facet list) it
  // falls through to whatever the inquiry attribute states.
  const make =
    iq?.make ??
    (title
      ? makes.find((mk) => new RegExp(`\\b${mk.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(title))
      : undefined);
  const model = iq?.model ?? modelFromName(title, year, make);

  // Price: Dealr shows one advertised number per card — no MSRP/"internet price"
  // split anywhere in the markup, so no false-bargain choice to make. The stock
  // theme's price anchor, the custom theme's price-container, and the CarGurus
  // badge's integer are the three places it lives, in that order of preference.
  const price =
    money(frag.match(/class=["'][^"']*dealr-inventory-price[^"']*["'][^>]*>([\s\S]*?)<\/a>/i)?.[1]) ??
    money(frag.match(/class=["'][^"']*price-container[^"']*["'][^>]*>([\s\S]{0,40})/i)?.[1]) ??
    (digits(frag.match(/data-cg-price=["']([0-9]+)["']/i)?.[1]) || undefined);

  const mileage = digits(detail(frag, "Mileage"));
  const stock = detail(frag, "Stock");
  const exterior = detail(frag, "Exterior");
  const interior = detail(frag, "Interior");
  const engine = detail(frag, "Engine");
  const drive = driveLine(detail(frag, "Drivetrain"));

  const img = frag.match(/<img[^>]+src=["'](https:\/\/[^"']*dealrimages\.com[^"']+)["']/i)?.[1];

  let url = origin;
  const href = frag.match(/href="([^"]*?inventory\/[^/"]+\/\d+)"/i)?.[1];
  if (href) {
    try {
      // Entity-decode first (a slug's box size is href-encoded as &#39;/&quot;),
      // then let URL percent-encode the result to the canonical path the dealer
      // actually serves.
      url = new URL(decode(href), origin + "/").toString();
    } catch {}
  }

  return {
    "@type": "Vehicle",
    vehicleIdentificationNumber: vin,
    vehicleModelDate: year,
    brand: make,
    model,
    name: title || [year, make, model].filter(Boolean).join(" ") || undefined,
    mileageFromOdometer:
      mileage != null && mileage >= 0 ? { "@type": "QuantitativeValue", value: mileage } : undefined,
    color: exterior,
    vehicleInteriorColor: interior,
    driveWheelConfiguration: drive,
    sku: stock,
    image: img ? [decode(img)] : undefined,
    itemCondition: "used",
    // Dealr renders an EV's engine as "0cyl - 0.0L", not "Electric", so this is
    // never a reliable electric signal — it is passed through as spec text only,
    // and classifyEv decides EV/PHEV from the nameplate and VIN, exactly as for
    // every other source. Leaving fuelType unset (rather than guessing "Electric"
    // off a zero-cylinder engine) keeps a gas car with missing engine data from
    // being mislabelled.
    vehicleEngine: engine ? { "@type": "EngineSpecification", name: engine } : undefined,
    offers: { "@type": "Offer", price, priceCurrency: "USD", url },
  };
}

// Parse a block of Dealr card HTML into schema.org Vehicle nodes. Exposed for
// tests and shared by both pull paths: `byId` uses the theme-independent VDP-id
// split (the static fallback), otherwise the stock-theme container split.
export function dealrCards(html, { origin = "https://x.test", makes = [], byId = false } = {}) {
  const frags = byId ? cardFragmentsById(html) : cardFragmentsByContainer(html);
  return frags.map((f) => cardNode(f.frag, { origin, makes, slug: f.slug })).filter(Boolean);
}

// Resolve the host the API actually answers on. Dealr rooftops redirect apex to
// www on deep paths, and the redirect drops the query string (…/getInventorySubset
// with no ?page= 500s), so a plain redirect-follow lands on an error. We probe
// page 1 on the given origin and on its www/apex toggle, and keep whichever
// returns parseable JSON.
function hostVariants(origin) {
  const out = [origin];
  try {
    const u = new URL(origin);
    u.host = u.host.startsWith("www.") ? u.host.slice(4) : "www." + u.host;
    out.push(u.origin);
  } catch {}
  return out;
}

async function fetchSubset(base, page) {
  const { status, json } = await politeGetJson(subsetUrl(base, page));
  if (status === "robots_disallowed") return { robots: true };
  if (status !== 200 || !json || typeof json.list !== "string") return { ok: false };
  return { ok: true, json };
}

// Walk the plain SRP at /inventory?page=N to completion — the fallback for a
// custom theme whose API `list` is empty. Cards are split on the VDP-id link and
// each page is checked for NEW VINs, so a rooftop that ignores ?page= and
// re-serves page 1 cannot fake a complete walk: the first duplicate page ends it
// as partial rather than certifying a truncated lot.
async function pullDealrSrp(base, total) {
  const out = [];
  const seen = new Set();
  let page = 1;
  let ok = true;
  let cardsSeen = 0;

  while (page <= MAX_PAGES) {
    const { status, body } = await fetchPage(srpUrl(base, page));
    if (status === "robots_disallowed") return { vehicles: out, complete: false, ok: false, robots: true };
    if (status !== 200 || !body) {
      ok = false;
      break;
    }
    if (total == null) total = srpTotal(body);
    const frags = cardFragmentsById(body);
    let fresh = 0;
    for (const { frag, slug } of frags) {
      const node = cardNode(frag, { origin: base, makes: [], slug });
      if (node && !seen.has(node.vehicleIdentificationNumber)) {
        seen.add(node.vehicleIdentificationNumber);
        out.push(node);
        fresh++;
      }
    }
    cardsSeen += frags.length;
    if (total != null && cardsSeen >= total) break;
    if (!frags.length) break; // ran off the end
    if (!fresh) {
      // A page that added no new car is either the last page re-served or a
      // pager that ignores ?page=. Either way the walk cannot be certified.
      ok = false;
      break;
    }
    page++;
  }

  const complete = ok && (total == null ? true : cardsSeen >= total);
  return { vehicles: out, complete, found: total ?? out.length, ok: true };
}

// Page a Dealr rooftop's inventory to completion and return every car as a
// schema.org Vehicle node. `complete` is true ONLY when the walk reached the
// facet total (or a clean empty lot): a partial or failed pull returns
// complete=false so the caller reports truncated:true and db-sync never delists
// a lot on the strength of an API hiccup (migration 0002).
export async function pullDealr(origin) {
  let base = null;
  let first = null;
  for (const cand of hostVariants(origin)) {
    const r = await fetchSubset(cand, 1);
    if (r.robots) return { vehicles: [], complete: false, found: 0, ok: false, robots: true };
    if (r.ok) {
      base = cand;
      first = r.json;
      break;
    }
  }
  if (!base) return { vehicles: [], complete: false, found: 0, ok: false };

  const total = facetTotal(first.filters);
  const makes = facetMakes(first.filters);

  const out = [];
  const seen = new Set();
  // Cards SEEN, not nodes admitted: a card the platform rendered but whose VIN
  // no badge exposed is still a card the walk covered. Completeness is about the
  // walk reaching every page — a VIN-less gas car must not hold a whole rooftop
  // in truncated:true forever and block db-sync from ever delisting its sold
  // cars. `found` (the facet total) counts every card the same way.
  let cardsSeen = 0;
  let page = 1;
  let json = first;
  let ok = true;

  while (page <= MAX_PAGES) {
    const frags = cardFragmentsByContainer(json.list);
    // A custom theme answers the default blockKey with an empty list but a real
    // facet total. Nothing to parse here — hand off to the SRP fallback, which
    // every theme renders.
    if (!frags.length && cardsSeen === 0 && total && total > 0) {
      return pullDealrSrp(base, total);
    }
    cardsSeen += frags.length;
    for (const { frag } of frags) {
      const node = cardNode(frag, { origin: base, makes });
      if (node && !seen.has(node.vehicleIdentificationNumber)) {
        seen.add(node.vehicleIdentificationNumber);
        out.push(node);
      }
    }
    // Stop when the walk has covered the facet total, or a page comes back short
    // (the last page), or empty. Without a total we lean on the short-page signal.
    if (total != null && cardsSeen >= total) break;
    if (frags.length < PER_PAGE) break;
    page++;
    const r = await fetchSubset(base, page);
    if (!r.ok) {
      ok = false; // a hole in the walk — cannot certify completeness
      break;
    }
    json = r.json;
  }

  const complete = ok && (total == null ? true : cardsSeen >= total);
  return { vehicles: out, complete, found: total ?? cardsSeen, ok: true };
}

// Cheap liveness check for probe.mjs: one request, does this rooftop's API hold
// VIN'd inventory? Keeps the probe's small fetch budget intact — the full paged
// pull happens later, in the nightly crawl. A custom-theme rooftop (empty API
// list, real facet total) confirms its VINs off SRP page 1 instead.
export async function countDealr(origin) {
  for (const cand of hostVariants(origin)) {
    const r = await fetchSubset(cand, 1);
    if (r.robots) return { ok: false, found: 0, hasVin: false };
    if (r.ok) {
      const total = facetTotal(r.json.filters);
      const frags = cardFragmentsByContainer(r.json.list);
      if (frags.length) {
        return { ok: true, found: total ?? frags.length, hasVin: frags.some((f) => cardVin(f.frag)) };
      }
      if (total && total > 0) {
        const { status, body } = await fetchPage(srpUrl(cand, 1));
        if (status === 200 && body) {
          const hasVin = cardFragmentsById(body).some((f) => cardVin(f.frag));
          return { ok: true, found: total, hasVin };
        }
      }
      return { ok: true, found: total ?? 0, hasVin: false };
    }
  }
  return { ok: false, found: 0, hasVin: false };
}
