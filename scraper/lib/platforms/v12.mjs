// V12Software platform extractor.
//
// V12Software (v12soft.com) is a dealer-website vendor for independent lots. The
// probe filed them "unknown": the SRP is server-rendered but carries no
// schema.org, and its VDP URLs are keyed by an internal id after a human slug
// (/inventory/view/{id}/{year-make-model}). The card HTML does carry the VIN in
// a labelled row ("VIN Number : …") and again in the Carfax link, so the lot can
// be lifted and classifyEv can read what it needs.
//
// Inventory lives at /inventory with an "N results" total. This pages it (?page=N)
// to completion and returns each car as a schema.org Vehicle node. Many V12
// rooftops show "Call for Price" rather than a number; those listings still carry
// VIN, year/make/model, mileage and the VDP URL — a real listing without an
// asking price, which normalize already allows. V12 cards carry no fuel field, so
// an EV is recognised by nameplate or VIN WMI, the usual name-match path.

import { fetchPage } from "../http.mjs";
import { isPlausibleVin } from "../vin.mjs";

const V12_MARK = /v12soft\.com|v12software\.com/i;

export function isV12(html) {
  return typeof html === "string" && V12_MARK.test(html);
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

const digits = (s) => {
  const n = s != null ? Number(String(s).replace(/[^\d]/g, "")) : NaN;
  return Number.isFinite(n) && n >= 0 ? n : undefined;
};

const DRIVES = { FWD: "FWD", RWD: "RWD", AWD: "AWD", "4WD": "4WD", "4X4": "4WD" };
const driveLine = (s) => DRIVES[String(s ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "")];

const PER_PAGE_GUARD = 60; // pages; a runaway guard, not a real ceiling

// A labelled "<strong>VIN Number :</strong> value" row.
function labelled(frag, label) {
  const m = frag.match(new RegExp(`<strong>\\s*${label}\\s*:?\\s*<\\/strong>\\s*([^<]+)`, "i"));
  return m ? decode(m[1]) : undefined;
}

// Split the SRP into one fragment per card. Each card opens with
// class="result-item format-…"; the inner nodes are result-item-* (title, cont…),
// so anchoring on "result-item format-" keeps the boundary at the card root.
function cardFragments(html) {
  const re = /class="result-item format-/gi;
  const idx = [];
  let m;
  while ((m = re.exec(html))) idx.push(m.index);
  const parts = [];
  for (let i = 0; i < idx.length; i++) parts.push(html.slice(idx[i], i + 1 < idx.length ? idx[i + 1] : html.length));
  return parts;
}

function titleParts(frag) {
  const t = frag.match(/result-item-title[\s\S]{0,80}?<a[^>]*>\s*([^<]+?)\s*<\/a>/i)?.[1];
  const title = t ? decode(t) : undefined;
  if (!title) return { title: undefined };
  const year = title.match(/\b(19|20)\d{2}\b/)?.[0];
  let rest = year ? title.replace(new RegExp(`^.*?${year}\\s+`), "") : title;
  const make = rest.split(/\s+/)[0];
  const model = rest.slice(make.length).trim() || undefined;
  return { title, year, make: make || undefined, model };
}

function vehicleNode(frag, origin) {
  const vin = String(
    labelled(frag, "VIN Number") ??
      labelled(frag, "VIN") ??
      frag.match(/[?&]vin=([A-HJ-NPR-Z0-9]{17})/i)?.[1] ??
      ""
  ).toUpperCase();
  if (!isPlausibleVin(vin)) return null;

  const { title, year, make, model } = titleParts(frag);

  // Price: read only the card's pricing block, so a "$5,000" from a filter
  // dropdown elsewhere on the page can't leak in. "Call for Price" leaves it
  // undefined. Where a rooftop shows both an asking and a lower "Internet Price",
  // take the higher, unconditional number — the false-bargain asymmetry every
  // other lane follows.
  const price = (() => {
    const block = frag.match(/result-item-pricing[\s\S]{0,400}/i)?.[0];
    if (!block) return undefined;
    const vals = [...block.replace(/<[^>]+>/g, " ").matchAll(/\$\s*([\d,]{4,})/g)]
      .map((x) => Number(x[1].replace(/,/g, "")))
      .filter((n) => Number.isFinite(n) && n >= 1000);
    return vals.length ? Math.max(...vals) : undefined;
  })();

  let url = origin;
  const href = frag.match(/href=["'](\/inventory\/view\/\d+\/[^"']+)["']/i)?.[1];
  if (href) {
    try {
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
    mileageFromOdometer: digits(labelled(frag, "Mileage")) != null
      ? { "@type": "QuantitativeValue", value: digits(labelled(frag, "Mileage")) }
      : undefined,
    color: labelled(frag, "Exterior Color"),
    vehicleInteriorColor: labelled(frag, "Interior Color"),
    driveWheelConfiguration: driveLine(labelled(frag, "Drivetrain") ?? labelled(frag, "Drive Type")),
    sku: labelled(frag, "Stock Number") ?? labelled(frag, "Stock"),
    itemCondition: "used",
    offers: { "@type": "Offer", price, priceCurrency: "USD", url },
  };
}

const invUrl = (origin, page) => `${origin}/inventory${page > 1 ? `?page=${page}` : ""}`;

// Page /inventory to completion. V12 has no reliable "N results" line (the only
// number near the grid is a Bootstrap `col-md-9` class), so completeness is
// pagination-driven: an out-of-range ?page= is CLAMPED back to page 1 rather
// than served empty, so the walk stops the moment a page adds no new car — that
// clamp means every real page has already been seen. `complete` is true only
// when the walk ended that way (or on an empty page) without a fetch hole, so
// db-sync never delists a lot on an HTTP hiccup.
export async function pullV12(origin) {
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
    if (cards.length === 0) {
      complete = true; // clean end
      break;
    }
    let fresh = 0;
    for (const c of cards) {
      const node = vehicleNode(c, origin);
      if (node && !seen.has(node.vehicleIdentificationNumber)) {
        seen.add(node.vehicleIdentificationNumber);
        out.push(node);
        fresh++;
      }
    }
    // No new car on a non-empty page = the pager clamped past the last page, so
    // every real page has been walked.
    if (fresh === 0) {
      complete = true;
      break;
    }
    page++;
  }

  return { vehicles: out, complete: ok && complete, found: out.length, ok };
}

// Cheap liveness check for probe.mjs: does /inventory hold VIN'd inventory?
export async function countV12(origin) {
  const { status, body } = await fetchPage(invUrl(origin, 1));
  if (status !== 200 || !body) return { ok: false, found: 0, hasVin: false };
  const cards = cardFragments(body);
  const hasVin = cards.some((c) => vehicleNode(c, origin));
  return { ok: true, found: cards.length, hasVin };
}
