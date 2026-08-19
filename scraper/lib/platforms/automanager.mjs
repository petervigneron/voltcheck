// AutoManager / WebManager platform extractor.
//
// AutoManager (its sites brand as "WebManager") is a dealer-website vendor used
// by a cluster of small independent lots. The probe filed them unknown: the SRP
// is server-rendered but carries no schema.org and keys its VDP URLs by an
// opaque hash (/vehicle-details/{slug}-{32hex}), so neither the JSON-LD reader
// nor the sitemap VIN prefilter hooks it. The card HTML does carry the VIN
// (class="vin", and a labelled "VIN:" row) and a labelled "Fuel:" row — enough
// to lift the lot and let classifyEv read the declared fuel.
//
// The inventory lives at /view-inventory, paged with ?page=N. This pages it to
// completion (following the "next" control) and returns each car as a schema.org
// Vehicle node. Some rooftops hide the price ("Request Price"/"Call"); those
// listings still carry VIN, year/make/model, fuel and the VDP URL — a real
// listing, just without an asking price, which normalize already allows.

import { fetchPage } from "../http.mjs";
import { isPlausibleVin } from "../vin.mjs";

const AM_MARK = /wm\.automanager\.com|clients\.automanager\.com|automanagerprodcdn|automanager\.com/i;

export function isAutoManager(html) {
  return typeof html === "string" && AM_MARK.test(html);
}

const decode = (s) =>
  String(s ?? "")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;|&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();

const PER_PAGE_GUARD = 60; // pages; a runaway guard, not a real ceiling

// A labelled detail row: <span class="preamble">Fuel:</span> <span…>Diesel</span>
function labelled(frag, label) {
  const m = frag.match(
    new RegExp(`preamble["'][^>]*>\\s*${label}\\s*:?\\s*(?:&nbsp;|\\s)*<\\/span>\\s*<[^>]*>\\s*([^<]+)`, "i")
  );
  return m ? decode(m[1]) : undefined;
}

const DRIVES = { FWD: "FWD", RWD: "RWD", AWD: "AWD", "4WD": "4WD", "4X4": "4WD" };
const driveLine = (s) => {
  const k = String(s ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  return DRIVES[k];
};

// Split the SRP into one fragment per vehicle, keyed on the first appearance of
// each /vehicle-details/{slug}-{hash} link (a card links itself several times;
// the hash makes each vehicle's link unique). Contiguous, so a fragment runs to
// the next distinct vehicle's first link.
function cardFragments(html) {
  const re = /href=["']([^"']*\/vehicle-details\/([a-z0-9-]+)-([0-9a-f]{16,}))["']/gi;
  const firstAt = new Map();
  let m;
  while ((m = re.exec(html))) {
    const id = m[3];
    if (!firstAt.has(id)) firstAt.set(id, { idx: m.index, href: m[1], slug: m[2] });
  }
  const order = [...firstAt.values()].sort((a, b) => a.idx - b.idx);
  const parts = [];
  for (let i = 0; i < order.length; i++) {
    parts.push({ ...order[i], frag: html.slice(order[i].idx, i + 1 < order.length ? order[i + 1].idx : html.length) });
  }
  return parts;
}

// "2019-hyundai-kona-electric" -> year 2019, make Hyundai, rest the model. The
// slug is the platform's own year-make-model, so no make vocabulary is needed.
function fromSlug(slug) {
  const parts = String(slug ?? "").split("-");
  const year = /^(19|20)\d{2}$/.test(parts[0]) ? parts[0] : undefined;
  const make = year ? parts[1] : parts[0];
  const model = (year ? parts.slice(2) : parts.slice(1)).join(" ");
  return { year, make: make ? make[0].toUpperCase() + make.slice(1) : undefined, model: model || undefined };
}

function vehicleNode({ frag, href, slug }, origin) {
  const vin = (
    frag.match(/class=["']vin["'][^>]*>\s*([A-HJ-NPR-Z0-9]{17})/i)?.[1] ??
    frag.match(/data-vin=["']([A-HJ-NPR-Z0-9]{17})["']/i)?.[1] ??
    labelled(frag, "VIN")
  );
  const v = String(vin ?? "").toUpperCase();
  if (!isPlausibleVin(v)) return null;

  const title = decode(frag.match(/title=["']([^"']*(?:19|20)\d{2}[^"']*)["']/i)?.[1] ?? "");
  const sl = fromSlug(slug);
  const year = sl.year ?? title.match(/\b(19|20)\d{2}\b/)?.[0];

  // Price: read the card's price block. Two wrinkles the naive scan got wrong.
  // (1) The value is split by markup — `<span class="currency-symbol">$</span>
  // 39,995` — so a `\$\s*[\d,]+` match never fired and every price came back
  // empty. We strip the block's tags first, then read the numbers.
  // (2) A rooftop that discounts shows TWO numbers: an "Original Price"
  // (accent-color2) and a lower "SALE PRICE" carrying the internetpricelabel
  // class — the conditional internet price the false-bargain rule forbids us to
  // print as the asking price. So we take the HIGHER of the two: caution here is
  // deliberately asymmetric toward the unconditional number, exactly as the
  // DealerVenom and Dealr lanes do. "Request Price"/"Call" rooftops show no
  // number at all and price stays undefined — a listing without an asking
  // price, not a wrong one.
  const price = (() => {
    const block = frag.match(/element-type-inventorylistprice[\s\S]{0,900}/i)?.[0];
    if (!block) return undefined;
    const text = block.replace(/<[^>]+>/g, " ");
    const vals = [...text.matchAll(/\$\s*([\d,]{4,})/g)]
      .map((m) => Number(m[1].replace(/,/g, "")))
      .filter((n) => Number.isFinite(n) && n >= 1000); // drop payments/fees
    return vals.length ? Math.max(...vals) : undefined;
  })();

  const mileage = (() => {
    const s = labelled(frag, "Odometer") ?? labelled(frag, "Mileage") ?? labelled(frag, "Miles");
    const n = s ? Number(String(s).replace(/[^\d]/g, "")) : NaN;
    return Number.isFinite(n) && n >= 0 ? n : undefined;
  })();

  const fuel = labelled(frag, "Fuel");
  const img = frag.match(/<img[^>]+(?:data-)?src=["'](https?:\/\/[^"']+)["']/i)?.[1];

  let url = origin;
  try {
    url = new URL(decode(href), origin + "/").toString();
  } catch {}

  return {
    "@type": "Vehicle",
    vehicleIdentificationNumber: v,
    vehicleModelDate: year,
    brand: sl.make,
    model: sl.model,
    name: title || [year, sl.make, sl.model].filter(Boolean).join(" ") || undefined,
    mileageFromOdometer:
      mileage != null ? { "@type": "QuantitativeValue", value: mileage } : undefined,
    driveWheelConfiguration: driveLine(labelled(frag, "Drivetrain") ?? labelled(frag, "Drive")),
    sku: labelled(frag, "Stock#") ?? labelled(frag, "Stock"),
    image: img ? [img] : undefined,
    itemCondition: "used",
    vehicleEngine: { "@type": "EngineSpecification", fuelType: fuel },
    offers: { "@type": "Offer", price, priceCurrency: "USD", url },
  };
}

function invUrl(origin, page) {
  return `${origin}/view-inventory${page > 1 ? `?page=${page}` : ""}`;
}

function hasNextPage(html) {
  return /pagination__next[^>]*href=["'][^"']+\?page=\d+/i.test(html) || /rel=["']next["']/i.test(html);
}

// Page /view-inventory to completion. `complete` is true only when the walk ran
// off the end (no next-page control) without a fetch hole: a partial/failed pull
// returns complete=false so db-sync never delists a lot on an HTTP hiccup.
export async function pullAutoManager(origin) {
  const out = [];
  const seen = new Set();
  let page = 1;
  let ok = false;
  let complete = false;

  while (page <= PER_PAGE_GUARD) {
    const { status, body } = await fetchPage(invUrl(origin, page));
    if (status === "robots_disallowed") return { vehicles: out, complete: false, found: out.length, ok: false, robots: true };
    if (status !== 200 || !body) break;
    ok = true;
    const cards = cardFragments(body);
    let fresh = 0;
    for (const card of cards) {
      const node = vehicleNode(card, origin);
      if (node && !seen.has(node.vehicleIdentificationNumber)) {
        seen.add(node.vehicleIdentificationNumber);
        out.push(node);
        fresh++;
      }
    }
    // An empty page is the clean end of the walk — some rooftops keep rendering a
    // "next" control one page past the last car, so this, not hasNextPage alone,
    // is what certifies completeness.
    if (cards.length === 0) {
      complete = true;
      break;
    }
    if (!hasNextPage(body)) {
      complete = true; // reached the last page cleanly
      break;
    }
    // A next control but no new car on a NON-empty page means the pager is
    // cycling (re-serving a page we've seen) — a hole we can't certify past.
    if (!fresh) break;
    page++;
  }

  return { vehicles: out, complete: ok && complete, found: out.length, ok };
}

// Cheap liveness check for probe.mjs: does page 1 hold VIN'd inventory?
export async function countAutoManager(origin) {
  const { status, body } = await fetchPage(invUrl(origin, 1));
  if (status !== 200 || !body) return { ok: false, found: 0, hasVin: false };
  const cards = cardFragments(body);
  const hasVin = cards.some((c) => vehicleNode(c, origin));
  return { ok: true, found: cards.length, hasVin };
}
