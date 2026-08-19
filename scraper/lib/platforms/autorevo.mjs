// AutoRevo platform extractor.
//
// AutoRevo is a website vendor for independent used-car lots (Stanley's Auto
// Sales, Heiser Motors, John Brothers Auto…). The probe filed them unknown: the
// SRP is server-rendered but carries no schema.org, and its VDP URLs are keyed
// by a numeric id after a long human slug, so neither the JSON-LD reader nor the
// sitemap VIN prefilter hooks it. The card HTML does carry the VIN in a labelled
// definition list (<dd class="vin_value">) — enough to lift the lot.
//
// Inventory lives at /vehicles, paged ?page=N (25 cars/page), with a "N matches"
// total and a class="pagination" control. This pages it to completion and
// returns each car as a schema.org Vehicle node; classifyEv does the EV/PHEV
// filtering downstream. AutoRevo's card carries no fuel field, so an EV is
// recognised by its nameplate or VIN WMI rather than a declared fuel — the same
// path every name-matched EV takes, and vPIC verifies the name matches before
// ingest.

import { fetchPage } from "../http.mjs";
import { isPlausibleVin } from "../vin.mjs";

const AR_MARK = /cf-img\.autorevo\.com|autorevo\.com|autorevo/i;

export function isAutoRevo(html) {
  return typeof html === "string" && AR_MARK.test(html);
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

const PER_PAGE = 25;
const MAX_PAGES = 80; // 80 * 25 = 2,000 — a runaway guard, not a real ceiling

// A labelled definition-list value: <dd class="mileage_value">125,252</dd>
function ddValue(frag, key) {
  const m = frag.match(new RegExp(`class=["']${key}_value["'][^>]*>\\s*([^<]+)`, "i"));
  return m ? decode(m[1]) : undefined;
}

const digits = (s) => {
  const n = s != null ? Number(String(s).replace(/[^\d]/g, "")) : NaN;
  return Number.isFinite(n) && n >= 0 ? n : undefined;
};

const DRIVES = { FWD: "FWD", RWD: "RWD", AWD: "AWD", "4WD": "4WD", "4X4": "4WD" };
const driveLine = (s) => DRIVES[String(s ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "")];

// Split the SRP into one fragment per card. Every AutoRevo theme opens a card
// with <section class="inventory_item …">, so the boundary holds.
function cardFragments(html) {
  const re = /<section\s+class="inventory_item/gi;
  const idx = [];
  let m;
  while ((m = re.exec(html))) idx.push(m.index);
  const parts = [];
  for (let i = 0; i < idx.length; i++) parts.push(html.slice(idx[i], i + 1 < idx.length ? idx[i + 1] : html.length));
  return parts;
}

// "2015 Audi A3 2.0T quattro Premium Plus | Batesville, MS | Stanley's" — the
// card's heading pipes the vehicle name, then location, then dealer. Take the
// first segment; year is the leading token, make the next, the rest the model.
function titleParts(frag) {
  const h = frag.match(/<h[1-4][^>]*>([\s\S]*?)<\/h[1-4]>/i)?.[1];
  const title = h ? decode(h.replace(/<[^>]+>/g, " ")).split("|")[0].trim() : undefined;
  if (!title) return { title: undefined };
  const year = title.match(/\b(19|20)\d{2}\b/)?.[0];
  let rest = year ? title.replace(new RegExp(`^.*?${year}\\s+`), "") : title;
  const make = rest.split(/\s+/)[0];
  const model = rest.slice(make.length).trim() || undefined;
  return { title, year, make: make || undefined, model };
}

function vehicleNode(frag, origin) {
  const vin = String(
    ddValue(frag, "vin") ?? frag.match(/data-vin=["']([A-HJ-NPR-Z0-9]{17})["']/i)?.[1] ?? ""
  ).toUpperCase();
  if (!isPlausibleVin(vin)) return null;

  const { title, year, make, model } = titleParts(frag);

  // Price: AutoRevo shows one asking price per card ("Our Price $11,500"); a
  // rooftop that discounts shows a strike-through original too. Take the HIGHER
  // number — the unconditional asking price — as the Dealr/DealerVenom/AutoManager
  // lanes do, never a lower conditional one. No number ("Call") leaves it undefined.
  const vals = [...frag.matchAll(/\$\s*([\d,]{4,})/g)]
    .map((x) => Number(x[1].replace(/,/g, "")))
    .filter((n) => Number.isFinite(n) && n >= 1000);
  const price = vals.length ? Math.max(...vals) : undefined;

  const mileage = digits(ddValue(frag, "mileage"));
  const img = frag.match(/<img[^>]+src=["'](https:\/\/[^"']*autorevo\.com[^"']+)["']/i)?.[1];

  let url = origin;
  const href = frag.match(/href=["'](\/[^"']*\/\d{4,})["']/i)?.[1];
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
    mileageFromOdometer: mileage != null ? { "@type": "QuantitativeValue", value: mileage } : undefined,
    driveWheelConfiguration: driveLine(ddValue(frag, "drivetrain") ?? ddValue(frag, "drive")),
    sku: ddValue(frag, "stock"),
    image: img ? [decode(img)] : undefined,
    itemCondition: "used",
    offers: { "@type": "Offer", price, priceCurrency: "USD", url },
  };
}

const invUrl = (origin, page) => `${origin}/vehicles${page > 1 ? `?page=${page}` : ""}`;

// The "N matches" line is the whole lot's size; use it to know when the walk is
// done rather than trusting the pager control, which some themes keep rendering.
function matchTotal(html) {
  const n = html.match(/([\d,]+)\s+matches/i)?.[1];
  return n ? Number(n.replace(/,/g, "")) : null;
}

// Page /vehicles to completion. `complete` is true only when the walk covered
// the reported match total (or ran off the end cleanly) without a fetch hole, so
// db-sync never delists a lot on an HTTP hiccup.
export async function pullAutoRevo(origin) {
  const out = [];
  const seen = new Set();
  let total = null;
  let cardsSeen = 0;
  let page = 1;
  let ok = false;
  let complete = false;

  while (page <= MAX_PAGES) {
    const { status, body } = await fetchPage(invUrl(origin, page));
    if (status === "robots_disallowed") return { vehicles: out, complete: false, found: out.length, ok: false, robots: true };
    if (status !== 200 || !body) break;
    ok = true;
    if (total == null) total = matchTotal(body);
    const cards = cardFragments(body);
    cardsSeen += cards.length;
    for (const c of cards) {
      const node = vehicleNode(c, origin);
      if (node && !seen.has(node.vehicleIdentificationNumber)) {
        seen.add(node.vehicleIdentificationNumber);
        out.push(node);
      }
    }
    if (cards.length === 0) {
      complete = true; // clean end
      break;
    }
    if (total != null && cardsSeen >= total) {
      complete = true;
      break;
    }
    if (cards.length < PER_PAGE) {
      complete = true; // short page = last page
      break;
    }
    page++;
  }

  return { vehicles: out, complete: ok && complete, found: total ?? out.length, ok };
}

// Cheap liveness check for probe.mjs: does /vehicles hold VIN'd inventory?
export async function countAutoRevo(origin) {
  const { status, body } = await fetchPage(invUrl(origin, 1));
  if (status !== 200 || !body) return { ok: false, found: 0, hasVin: false };
  const cards = cardFragments(body);
  const hasVin = cards.some((c) => vehicleNode(c, origin));
  return { ok: true, found: matchTotal(body) ?? cards.length, hasVin };
}
