// Ever (evercars.com) — an all-EV retailer out of Costa Mesa / San Francisco.
// 1,130 electrified cars on 2026-08-24, which makes it the largest single
// unbuilt rooftop this project has found: the 08-20 coverage audit flagged it
// as the highest-yield unbuilt independent and it sat in needs-investigation
// through six probes with the same note — "0 VIN vehicles in 12 fetches …
// leads: nextjs" — because every one of them was true.
//
// WHY SIX PROBES FOUND NOTHING, AND WHY THE OBVIOUS DOOR IS SHUT
//
// It is a Next.js app whose SRP hydrates from an inventory API under /api —
// and /api is the one thing its robots.txt forbids:
//
//   User-Agent: *
//   Allow: /
//   Disallow: /api
//   Disallow: /api/*
//
// So the API is not a door for us and will not become one. The sitemap's 3,913
// /cars/{VIN} pages are allowed, but 71% of them are sold — their own titles
// say "(Sold)" — so a VIN walk would spend ~2.3 GB and 72 minutes a night to
// find 1,130 live cars among them.
//
// THE DOOR THAT IS OPEN
//
// /cars itself is a server component, and it server-renders the search RESULT,
// not just the shell — the cars are in the RSC flight payload, one JSON object
// per car with vin, make, model, trim, year, price, mileage, purchase_status
// and location. The page size and page number ride in a single JSON-encoded
// query parameter, which is what the site's own pager sets:
//
//   /cars?f={"p":2,"ps":32}      (captured from the pagination control, 2026-08-24)
//
// and the server honours both. `f` carries no rule of any kind in robots.txt;
// nothing else on the page (?page=2, ?make=Tesla, ?page_size=200) changes the
// response at all, which is why a static probe could never page past the first
// screen.
//
// PAGE SIZE was measured against the server rather than guessed: ps=32 returns
// 32, ps=200 returns 200, ps=500 returns 500 in a 14.9 MB document, and
// ps=2000 fails outright with an error page. Bigger pages are cheaper per car
// (30 KB/car at 500, 47 KB/car at 32 — the facet tree and the recommendation
// carousel are re-sent whole every time), so this lane asks for 250: five
// requests for a lot this size, comfortably inside the range that answers, and
// small enough that one failed page costs a fifth of the walk rather than a
// third.
//
// PRICE is the record's `price`, the integer the card prints — $43,999 on
// 1FTVW1EL6PWG53923, checked against the rendered SRP. `monthly_payment` sits
// beside it and is never read.
//
// CONDITION: abstained. The record has no condition field. The site is titled
// "Shop Used Electric Cars" and every car carries an odometer reading, but
// that is an inference about the lot, not a field — and ../condition.mjs
// exists because an absent field quietly becoming "used" is a claim made from
// no evidence.
//
// CERTIFICATION: never claimed. Every VDP wears a green "Certified" chip, but
// it is "Ever Certified" — the retailer's own inspection programme, which the
// homepage advertises as such. This project's `certified` means a
// manufacturer CPO warranty, so this lane sets it on nothing.
import { EVERCARS_PRICE } from "../price-provenance.mjs";
import { stabilizeImages } from "../images.mjs";
import { fetchPage } from "../http.mjs";

const VIN_RE = /^[A-HJ-NPR-Z0-9]{17}$/;

export const EVERCARS_HOST_RE = /^(?:www\.)?evercars\.com$/i;

// The site's own schema.org @ids and its asset host. Each string contains the
// host, so nothing else can trip them — the precision a single-rooftop lane's
// detector needs.
const EVERCARS_MARK_RE = /evercars\.com\/#(?:organization|website|dealer-)|static\.production\.evercars\.live/i;

export function isEverCars(html) {
  return typeof html === "string" && EVERCARS_MARK_RE.test(html);
}

export function isEverCarsOrigin(origin) {
  try {
    return EVERCARS_HOST_RE.test(new URL(origin).host);
  } catch {
    return false;
  }
}

export const EVERCARS_SRP_PATH = "/cars";
export const EVERCARS_PAGE_SIZE = 250;

export function everCarsSrpUrl(origin, { page = 1, pageSize = EVERCARS_PAGE_SIZE } = {}) {
  const f = JSON.stringify({ p: Number(page), ps: Number(pageSize) });
  return `${origin.replace(/\/$/, "")}${EVERCARS_SRP_PATH}?f=${encodeURIComponent(f)}`;
}

/** The RSC flight payload as one string.
 *
 *  Each chunk arrives as `self.__next_f.push([1,"…"])`, where the "…" is a JS
 *  string literal that is also a valid JSON string. JSON.parse is the only
 *  correct way to unescape it, and the reason is a real car: a regex that
 *  replaced \" with " turned `18\\" Mach Black High Gloss Wheels` into broken
 *  JSON and lost the whole page. */
export function flightPayload(html) {
  if (typeof html !== "string") return "";
  let out = "";
  const re = /self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)/g;
  let m;
  while ((m = re.exec(html))) {
    try {
      out += JSON.parse(m[1]);
    } catch {}
  }
  return out;
}

// Balanced-brace scan from an opening `{`, string-aware so a brace inside a
// value cannot end the object early.
function objectAt(text, start) {
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (esc) {
      esc = false;
      continue;
    }
    if (c === "\\") {
      esc = true;
      continue;
    }
    if (c === '"') {
      inStr = !inStr;
      continue;
    }
    if (inStr) continue;
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

const ANCHOR = '"search_results":';

/** The page's own search result: `{vehicles, total, page, page_size, has_more}`.
 *
 *  The payload holds the block twice — once as the query cache's empty initial
 *  state (`"vehicles":[],"total":0`) and once filled in — so the richest one
 *  wins rather than the first. Returns null when nothing parsed, which is what
 *  lets the caller refuse to certify a complete crawl off a page it could not
 *  read. */
export function everCarsSearchResult(html) {
  const t = flightPayload(html);
  let best = null;
  let i = 0;
  for (;;) {
    const at = t.indexOf(ANCHOR, i);
    if (at < 0) break;
    i = at + ANCHOR.length;
    const raw = objectAt(t, i);
    if (!raw) continue;
    let obj;
    try {
      obj = JSON.parse(raw);
    } catch {
      continue;
    }
    if (!obj || !Array.isArray(obj.vehicles)) continue;
    if (!best || obj.vehicles.length > best.vehicles.length) best = obj;
  }
  return best;
}

/** A record that is actually for sale.
 *
 *  `purchase_status` is the platform's own token. The search result carries
 *  only "AVAILABLE" (500 of 500 on the ps=500 pull), while the recommendation
 *  carousel in the same payload also holds "PURCHASE_IN_PROGRESS" — which is
 *  the reason this reads the search block and not every vehicle-shaped object
 *  on the page. Anything but AVAILABLE is not something this lane will claim
 *  is for sale. */
export function everCarsIsLive(rec) {
  return String(rec?.purchase_status ?? "").trim().toUpperCase() === "AVAILABLE";
}

const IMAGE_HOST_RE = /^https:\/\/static\.production\.evercars\.live\//i;

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : undefined;
};

export function everCarsVehicle(rec, origin) {
  const vin = String(rec?.vin ?? "").toUpperCase();
  if (!VIN_RE.test(vin)) return null;
  const price = num(rec?.price);
  const mileage = Number(rec?.mileage);
  // A pre-order car's photo is a manufacturer studio render, not the car: its
  // own VDP says so in as many words — "Vehicle is almost ready · Get notified
  // when photos arrive" — under a white press shot, and none of the 71
  // pre-order records carries an interior photo while all 429 of the others
  // do. It is a real used car with a real price and a real odometer (8,091
  // miles on the 2025 Wagoneer S), so it belongs in the feed; the stock render
  // does not, because a photo on a listing is a claim about that car.
  const preOrder = rec?.is_pre_order === true;
  const images = preOrder
    ? []
    : stabilizeImages(
        [rec?.featured_image_url, rec?.interior_image_url].filter(
          (u) => typeof u === "string" && IMAGE_HOST_RE.test(u),
        ),
      );
  const loc = rec?.location && typeof rec.location === "object" ? rec.location : {};
  let url;
  try {
    url = new URL(`/cars/${vin}`, origin).toString();
  } catch {}
  return {
    "@type": "Vehicle",
    vehicleIdentificationNumber: vin,
    vehicleModelDate: rec?.year != null ? String(rec.year) : undefined,
    brand: rec?.make || undefined,
    model: rec?.model || undefined,
    vehicleConfiguration: rec?.trim || undefined,
    name: [rec?.year, rec?.make, rec?.model, rec?.trim].filter(Boolean).join(" ") || undefined,
    mileageFromOdometer:
      Number.isFinite(mileage) && mileage >= 0
        ? { "@type": "QuantitativeValue", value: mileage, unitCode: "SMI" }
        : undefined,
    image: images.length ? images : undefined,
    // No fuel field exists on this platform, so nothing is asserted: every car
    // reaches classifyEv on its nameplate alone, and vpic-enrich confirms it
    // the way it does for any other name_match. An all-EV retailer is not a
    // licence to stamp "Electric" on a record that does not say so.
    offers: {
      "@type": "Offer",
      price,
      priceProvenance: price != null ? EVERCARS_PRICE : undefined,
      priceCurrency: "USD",
      url,
      seller: {
        "@type": "AutoDealer",
        address: {
          "@type": "PostalAddress",
          streetAddress: loc.address_1 || undefined,
          addressLocality: rec?.city || loc.city || undefined,
          addressRegion: rec?.state || loc.state || undefined,
          postalCode: loc.zip_code || undefined,
        },
      },
    },
  };
}

/** Every live car on one rendered page. */
export function everCarsVehicles(html, origin) {
  const res = everCarsSearchResult(html);
  if (!res) return null;
  const out = [];
  for (const rec of res.vehicles) {
    if (!everCarsIsLive(rec)) continue;
    const v = everCarsVehicle(rec, origin);
    if (v) out.push(v);
  }
  return out;
}

const MAX_PAGES = 40;

/** Page the whole lot.
 *
 *  `complete` needs the walk to have reached the end by the server's own
 *  count: every page parsed AND records read >= `total`. `has_more` is
 *  believed for when to stop asking, but not for whether the read was whole —
 *  a page that failed mid-walk leaves complete false so crawl.mjs reports
 *  truncated and db-sync cannot read the hole as cars that sold. */
export async function pullEverCars(origin, { pageSize = EVERCARS_PAGE_SIZE } = {}) {
  const out = [];
  let seen = 0;
  let total = null;
  let ok = false;
  let requests = 0;
  const seenVins = new Set();
  for (let page = 1; page <= MAX_PAGES; page++) {
    const res = await fetchPage(everCarsSrpUrl(origin, { page, pageSize }));
    requests++;
    if (res.status !== 200 || !res.body) break;
    const parsed = everCarsSearchResult(res.body);
    if (!parsed) break;
    ok = true;
    if (Number.isFinite(parsed.total)) total = parsed.total;
    seen += parsed.vehicles.length;
    for (const rec of parsed.vehicles) {
      if (!everCarsIsLive(rec)) continue;
      const v = everCarsVehicle(rec, origin);
      if (!v || seenVins.has(v.vehicleIdentificationNumber)) continue;
      seenVins.add(v.vehicleIdentificationNumber);
      out.push(v);
    }
    if (!parsed.vehicles.length || parsed.has_more !== true) break;
    if (total != null && seen >= total) break;
  }
  return { ok, vehicles: out, found: total ?? seen, complete: ok && total != null && seen >= total, requests };
}

/** The probe's one-request settle: a small page, is there VIN'd inventory? */
export async function countEverCars(origin) {
  const res = await fetchPage(everCarsSrpUrl(origin, { page: 1, pageSize: 32 }));
  if (res.status !== 200 || !res.body) return { ok: false, found: 0, hasVin: false };
  const parsed = everCarsSearchResult(res.body);
  if (!parsed) return { ok: false, found: 0, hasVin: false };
  return {
    ok: true,
    found: Number.isFinite(parsed.total) ? parsed.total : parsed.vehicles.length,
    hasVin: parsed.vehicles.some((r) => VIN_RE.test(String(r?.vin ?? "").toUpperCase())),
  };
}
