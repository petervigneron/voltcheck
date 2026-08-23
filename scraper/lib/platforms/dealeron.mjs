// DealerOn platform extractor. Two templates are in the wild and both ship
// everything we need in the HTML served to everyone:
//
//   sdDataLayer — the older one. One `sdDataLayer = {...}` per VDP, holding
//   vehicleDetails (vin, trim, drivetrain, colors, price) plus the dealer's
//   own city/state/zip, with the odometer rendered separately as an
//   info__item--mileage block.
//
//   dotagging — the current one. No sdDataLayer at all; each vehicle carries
//   its facts as `data-dotagging-item-*` attributes on its own element, and
//   the subject car adds `data-odometer`. Measured 2026-08-17: 2,260 listings
//   — 44% of everything we hold on DealerOn sites — were falling out of this
//   extractor because it required sdDataLayer and returned null without it.
//   They reached the site with no mileage, no stock number and no colours;
//   the sample that started this (a 2017 Bolt on familydeal.com) was showing
//   a $11,803 asking price beside no odometer at all, and the car has
//   137,703 miles on it. Silence about mileage on a used car reads as a
//   low-mileage car, so this was the worst-shaped gap on the page.
//
// A VDP carries several dotagging blocks — the subject plus its "similar
// vehicles" rail — so blocks are keyed by VIN and matched to the record,
// never taken positionally. Only the subject's block has data-odometer.

import { DEOL_DISPLAYED } from "../price-provenance.mjs";

function parseSdDataLayer(html) {
  const m = html.match(/sdDataLayer\s*=\s*\{/);
  if (!m) return null;
  const start = html.indexOf("{", m.index);
  let depth = 0;
  let end = start;
  for (let j = start; j < html.length; j++) {
    if (html[j] === "{") depth++;
    else if (html[j] === "}") {
      depth--;
      if (depth === 0) {
        end = j;
        break;
      }
    }
  }
  try {
    return JSON.parse(html.slice(start, end + 1));
  } catch {
    return null;
  }
}

// The rendered spec list, shared by both templates: <span class="info__label">
// names the field and the sibling info__value carries it in a title attribute.
function infoItem(html, field) {
  const re = new RegExp(`info__item--${field}[\\s\\S]{0,600}?info__value[^"]*"[^>]*title="([^"]*)"`);
  const m = html.match(re);
  const v = m?.[1]?.trim();
  return v || undefined;
}

function num(v) {
  if (v == null) return undefined;
  const n = Number(String(v).replace(/[^\d.]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

// Attributes sit on a single element, and no dotagging value contains an
// angle bracket, so the enclosing tag is the span between the surrounding
// < and >.
function enclosingTag(html, at) {
  const open = html.lastIndexOf("<", at);
  const close = html.indexOf(">", at);
  if (open === -1 || close === -1) return "";
  return html.slice(open, close + 1);
}

const DOT_ATTR = /data-dotagging-item-id="([^"]{11,})"/g;

function parseDotagging(html) {
  const byVin = new Map();
  for (const m of html.matchAll(DOT_ATTR)) {
    const tag = enclosingTag(html, m.index);
    if (!tag) continue;
    const attr = (name) => tag.match(new RegExp(`data-dotagging-item-${name}="([^"]*)"`))?.[1]?.trim() || undefined;
    const vin = m[1].trim().toUpperCase();
    if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(vin)) continue;
    byVin.set(vin, {
      vin,
      trim: attr("variant"),
      drivetrain: attr("drivetrain"),
      exteriorColor: attr("color"),
      displayedPrice: attr("price"),
      // NOTE: data-dotagging-item-condition is deliberately NOT read. It is an
      // analytics bucket, not a warranty fact, and it contradicts the page's
      // own JSON-LD: haywardkia.com and weatherfordbmw.com both stamp "cpo" on
      // cars their Product schema calls UsedCondition and their H1 carries no
      // certified badge, and one of them is a Kia store applying it to a
      // Hyundai, which no manufacturer CPO programme allows. Certification is a
      // claim about a warranty, so it comes from the feed's own condition or
      // not at all.
      stockNumber: attr("number"),
      odometer: num(tag.match(/data-odometer="([^"]*)"/)?.[1]),
    });
  }
  return byVin;
}

export function extractDealerOn(html) {
  const dl = parseSdDataLayer(html);
  const dotagging = parseDotagging(html);
  // Neither template present: not a DealerOn page, and saying so matters —
  // crawl.mjs only stamps `platform` when this returns something.
  if (!dl && dotagging.size === 0) return null;

  const mileage = num(infoItem(html, "mileage"));
  return {
    vehicle: dl?.vehicleDetails ?? null,
    dotagging,
    dealer: dl
      ? { city: dl.dealerCity, state: dl.dealerState, zip: dl.dealerZipCode, name: dl.dealerName }
      : // The dotagging template carries no dealer address anywhere on the
        // VDP (checked: no sdDataLayer, no addressLocality, no AutoDealer
        // JSON-LD). The city in the URL slug is not it either — it is the
        // rooftop's marketing city and appears as "Portland+Oregon" on some
        // sites. Left absent rather than guessed.
        null,
    mileage,
    interiorColor: infoItem(html, "interior-color"),
    exteriorColor: infoItem(html, "exterior-color"),
  };
}

const DRIVES = new Set(["FWD", "RWD", "AWD", "4WD"]);

export function enrichFromDealerOn(rec, data) {
  // sdDataLayer describes exactly one car; dotagging describes several, so it
  // is looked up by VIN. Either way the record only takes facts stamped with
  // its own VIN.
  const dot = rec.vin ? data?.dotagging?.get(String(rec.vin).toUpperCase()) : undefined;
  const sd = data?.vehicle && String(data.vehicle.vin).toUpperCase() === rec.vin ? data.vehicle : null;
  const v = sd ?? dot;
  if (!v) return rec;
  // The rendered spec list belongs to the page's subject car, so it only
  // applies to whichever record the odometer block was rendered for. On the
  // dotagging template that is the block carrying data-odometer; on the old
  // one it is the single sdDataLayer car.
  const isSubject = Boolean(sd) || dot?.odometer != null;
  return {
    ...rec,
    // Dealer-stated mileage passes through verbatim, 0 included — it has the
    // same standing as the dealer's price. (Verified: the dealer's own page
    // shows "Mileage: 0" to shoppers on these cars.) Implausible values get
    // flagged at display, not suppressed.
    mileage: (isSubject ? data.mileage : undefined) ?? dot?.odometer ?? rec.mileage,
    trim: v.trim && v.trim !== "Base" ? v.trim : rec.trim ?? v.trim,
    driveLine: DRIVES.has(v.drivetrain) ? v.drivetrain : rec.driveLine,
    exteriorColor: v.exteriorColor ?? (isSubject ? data.exteriorColor : undefined) ?? rec.exteriorColor,
    interiorColor: v.interiorColor ?? (isSubject ? data.interiorColor : undefined) ?? rec.interiorColor,
    priceUsd: rec.priceUsd ?? (Number(v.displayedPrice) > 0 ? Number(v.displayedPrice) : undefined),
    // Same precedence as the line above: the JSON-LD offer keeps its own tag,
    // and displayedPrice is only named when it is the number that survived.
    // Not assumed equal to the API path's price library — that check has not
    // been done, and lib/price-provenance.mjs says to split when in doubt.
    priceProvenance:
      rec.priceUsd != null
        ? rec.priceProvenance
        : Number(v.displayedPrice) > 0
          ? DEOL_DISPLAYED
          : undefined,
    condition: typeof sd?.status === "string" ? sd.status.toLowerCase() : rec.condition,
    city: data.dealer?.city ?? rec.city,
    state: data.dealer?.state ?? rec.state,
    zip: data.dealer?.zip ?? rec.zip,
    dealerName: data.dealer?.name ?? rec.dealerName,
    stockNumber: v.stockNumber ?? rec.stockNumber,
    platform: "dealeron",
  };
}
