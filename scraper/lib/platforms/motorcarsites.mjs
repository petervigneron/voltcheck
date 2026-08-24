// Motorcar Marketing (motorcarsites.com) — a website vendor that hosts its
// dealers on ITS OWN apex, one subdomain per rooftop
// (amgmotorsllc.motorcarsites.com, megaauto.motorcarsites.com, …). That is the
// whole reason this lane exists: a rooftop with no apex domain of its own is
// invisible to every discovery pass that starts from a dealer's own name, and
// amgmotorsllc is a licensed NY dealer the roll resolver could never reach.
//
// ── WHAT THE PLATFORM SERVES ───────────────────────────────────────────────
// Everything is server-rendered PHP. No JSON-LD anywhere — not on the SRP, not
// on the VDP — so nothing in the generic stack hooks it. robots.txt on the
// rooftops checked (amgmotorsllc, 2026-08-24) carries no Disallow at all: only
// Cloudflare's content-signals comment block.
//
//   SRP   /vehicle_listings/all/vehicles      ~10 cars a page, ?page_number=N
//   VDP   /vehicle/{id}/{year}-{make}-{model}-for-sale-in-{city}-{st}-{zip}
//
// ── THEMES ARE THE TRAP ────────────────────────────────────────────────────
// The rooftop picks a theme and the markup changes completely. Two shapes seen
// in the 36 live rooftops (2026-08-24), and there is no reason to think they
// are the only two:
//
//   "sleek"  SRP tiles are <div class="inventory">, facts in a
//            <td class="option">Label:</td><td class="spec">Value</td> table,
//            VIN printed on the SRP, price in <div class="figure">.
//   "pill"   SRP tiles are <li class="mix" data-year data-make data-model
//            data-price>, facts in <div class="pill">Label</div>
//            <div class="pill_data">Value</div>, NO VIN on the SRP at all.
//
// So this module reads NOTHING off the SRP except the links, and takes every
// fact from the VDP. The two things every theme shares are the vendor's own
// asset host and the /vehicle/{id}/ link shape — which is what the SRP pass
// keys on. A tile-shaped extractor would have worked on whichever theme it was
// written against and silently returned zero cars on the other, which is the
// failure mode the registry is already full of ("0 VIN vehicles in 12
// fetches").
//
// ── LABELS, NOT LAYOUT ─────────────────────────────────────────────────────
// vdpFacts() harvests every Label→Value pair on the page in either markup and
// normalises the label ("VIN #", "Vin", "Vehicle_condition"). A theme this
// module has never seen still yields its facts as long as it prints them as
// labelled pairs; a theme that does not, yields nothing rather than something
// wrong.
//
// ── THE SIMILAR-VEHICLES BLOCK ─────────────────────────────────────────────
// Every VDP ends with a carousel of the rooftop's OTHER cars, rendered in the
// same markup as the page's own facts: the megaauto QX80 page prints six
// Year/Make/Model/Price groups and six prices, only the first of which is the
// car you are looking at. So the page is cut at that boundary before anything
// is read. Miss the cut and this platform publishes its neighbour's price.
//
// ── PRICE ──────────────────────────────────────────────────────────────────
// Within the cut, exactly one distinct dollar amount is the ask. More than one
// abstains — this platform gives no labelled ladder to resolve, so there is
// nothing to rank, and lib/price-floor.mjs exists because a payment estimate
// beside a car is the cheapest way to publish a false bargain. Never the
// CarGurus badge's data-cg-price that sits in the same block: it is a third
// party's number, and on AutoManager it was measured $490 away from the
// dealer's own on the same tile.
//
// Sold cars are dropped outright, not published price-less. The platform marks
// them (`price-sold`, `sold_text`) and keeps them in the lot for months —
// AMG Motors' 160-car lot had 3 of its first 10 sold.
import { conditionToken } from "../condition.mjs";
import { stabilizeImages } from "../images.mjs";
import { isKnownMake } from "../makes.mjs";
import { MOTORCARSITES_PRICE } from "../price-provenance.mjs";

// The vendor's own hosts. Anchored on the host, never on a brand word: a
// rooftop is free to run this platform on a domain of its own, and one named
// "Motorcar …" must not fingerprint as the platform because of its name.
const VENDOR_ASSET_RE =
  /\b(?:www\.)?motorcarsites\.com\/(?:dealers|template|img)\/|\bwww\.motorcarmarketing\.com\b/i;

export function isMotorcarSites(html) {
  return typeof html === "string" && VENDOR_ASSET_RE.test(html);
}

export const MOTORCAR_SRP_PATH = "/vehicle_listings/all/vehicles";

export function motorcarSeeds(origin) {
  return [origin + MOTORCAR_SRP_PATH];
}

// A retired rooftop does not 404 — it serves the vendor's own placeholder with
// a 200 and the platform's `dealership_id` comment still in it. 111 of the 149
// hosts enumerated for this vendor answered that way (2026-08-24), so a probe
// that trusted the status code would have promoted all of them.
const MAINTENANCE_RE = /<title[^>]*>\s*Down For Maintenance\s*<\/title>/i;

export function isRetiredRooftop(html) {
  return typeof html === "string" && MAINTENANCE_RE.test(html);
}

const stripComments = (html) => html.replace(/<!--[\s\S]*?-->/g, " ");
const stripTags = (s) => s.replace(/<[^>]+>/g, " ");
const collapse = (s) => s.replace(/&nbsp;/gi, " ").replace(/\s+/g, " ").trim();
const VIN_RE = /^[A-HJ-NPR-Z0-9]{17}$/;
// Every theme identifies a car by the platform's numeric id, in its link and
// in its photo filename. Slicing the page on the id — rather than on a
// container class no two themes share — is what makes one tile's VIN or SOLD
// badge unable to leak onto its neighbour. Slicing on the link alone was not
// enough: the pill theme prints `<li data-year… >` and the photo BEFORE the
// link, so a link-anchored fragment started mid-tile.
const ID_ANCHOR_RE = /\/vehicle\/(\d{1,9})\/|image_(\d{1,9})[_.]/g;

const num = (v) => {
  if (v == null) return undefined;
  const n = Number(String(v).replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : undefined;
};

/** "2021-lexus-nx-300-for-sale-in-laurel-md-20724" → "2021 lexus nx 300". The
 *  slug is the one identity string every theme's link carries. */
export function slugName(url) {
  const slug = String(url ?? "").match(/\/vehicle\/\d+\/([^/?#]+)/)?.[1];
  if (!slug) return undefined;
  return collapse(slug.replace(/-for-sale-in-.*$/i, "").replace(/-/g, " ")) || undefined;
}

// The tile's own powertrain words, if it prints any. Kept in the entry name
// alongside the nameplate so a car whose model EVISH_RE doesn't know still
// earns its VDP fetch when the tile says outright what it is. Bare "hybrid" is
// deliberately NOT here: EVISH_RE does not match it (a hybrid is not an EV in
// this house), so carrying it would be a word that can never change an answer.
const POWERTRAIN_RE = /electric|plug[\s-]?in|\bphev\b|\bbev\b|\bkwh\b/gi;

/**
 * The SRP's cars, as ItemList-shaped entries — `{url, name, vin, sold}`.
 *
 * `name` is the car's identity — the tile's own heading or photo alt, plus its
 * Trim and any powertrain word it prints — and NOT the tile's whole text.
 * That distinction is worth stating because the whole text was tried first and
 * is wrong: crawl.mjs screens these names with lib/sitemap.mjs's EVISH_RE,
 * whose BMW pattern is `i[45x]\b`, and every four-cylinder car on this
 * platform prints an engine designation of "I4". Screening the raw tile text
 * flagged 111 cars across 38 rooftops as possible EVs where the real answer
 * was 2 — a hundred VDP fetches spent on Accords and Camrys.
 *
 * The Trim has to be in there, though: the badge that makes a plug-in a
 * plug-in lives there and nowhere else ("RAV4" + "Prime XSE", "Wrangler" +
 * "Rubicon 4xe"), and the URL slug this platform builds carries no trim at all.
 */
export function motorcarEntries(html, pageUrl) {
  if (!isMotorcarSites(html)) return [];
  const body = stripComments(html);
  const anchors = [];
  const seen = new Set();
  ID_ANCHOR_RE.lastIndex = 0;
  for (const m of body.matchAll(ID_ANCHOR_RE)) {
    const id = m[1] ?? m[2];
    if (seen.has(id)) continue;
    seen.add(id);
    anchors.push({ id, index: m.index });
  }
  const out = [];
  for (let i = 0; i < anchors.length; i++) {
    const { id, index } = anchors[i];
    const tile = body.slice(index, anchors[i + 1]?.index ?? body.length);
    // Looked up across the whole page, not inside the tile: the id anchor can
    // land in the MIDDLE of the href it was found in ("…/vehicle/415862/…"),
    // leaving `href="` outside the fragment. Ids are unique per car, so there
    // is nothing to disambiguate.
    const href = body.match(new RegExp(`href=["']([^"'?#]*\\/vehicle\\/${id}\\/[^"'?#]*)["']`, "i"))?.[1];
    if (!href) continue; // a photo with no link of its own is not a car we can reach
    let url;
    try {
      url = new URL(href, pageUrl).toString();
    } catch {
      continue;
    }
    const vin = tile.match(/\b[A-HJ-NPR-Z0-9]{17}\b/)?.[0];
    const text = stripTags(tile);
    // The heading the "sleek" theme prints (which already carries the trim),
    // else the photo's alt (which every theme sets to "{year} {make} {model}"),
    // else the slug.
    const heading = collapse(
      tile.match(/<div[^>]*class=["'][^"']*\btitle\b[^"']*["'][^>]*>([\s\S]{0,160}?)<\/div>/i)?.[1] ?? ""
    );
    const alt = collapse(tile.match(/<img[^>]+\balt=["']([^"']{4,120})["']/i)?.[1] ?? "");
    const base = /^(19[89]\d|20\d{2})\s/.test(heading) ? heading : /^(19[89]\d|20\d{2})\s/.test(alt) ? alt : (slugName(url) ?? "");
    const parts = [base];
    const trim = labelledFacts(tile).get("trim");
    if (trim && !base.toLowerCase().includes(trim.toLowerCase())) parts.push(trim);
    parts.push(...new Set((text.match(POWERTRAIN_RE) ?? []).map((s) => s.toLowerCase())));
    out.push({
      url,
      name: collapse(parts.join(" ")).slice(0, 200),
      vin: vin && VIN_RE.test(vin) ? vin : undefined,
      sold: /price-sold|sold_text/i.test(tile),
    });
  }
  return out;
}

/** Server-side pagination, ?page_number=N, on links every theme prints. Walk
 *  to the highest number the pager offers — the same rule as AutoManager's,
 *  because the two arrows carry the same CSS class on this platform (both are
 *  `right-arrow`) and cannot be told apart. */
export function motorcarNextPageUrl(html, pageUrl) {
  if (typeof html !== "string") return null;
  const pages = [...html.matchAll(/[?&]page_number=(\d{1,4})\b/g)].map((m) => Number(m[1]));
  if (!pages.length) return null;
  let u;
  try {
    u = new URL(pageUrl);
  } catch {
    return null;
  }
  const cur = Number(u.searchParams.get("page_number") ?? 1);
  if (!Number.isFinite(cur) || cur >= Math.max(...pages)) return null;
  u.searchParams.set("page_number", String(cur + 1));
  return u.toString();
}

// Where the page stops talking about its own car. `li.mix` is the pill theme's
// carousel tile — the same element its SRP uses — and `recent-vehicles-wrap` /
// "Similar Vehicles" is the sleek theme's.
const SIMILAR_RE = /<li[^>]*class=["'][^"']*\bmix\b|recent-vehicles-wrap|similar[\s_-]vehicles/i;

export function vdpHead(html) {
  const body = stripComments(html);
  const cut = body.search(SIMILAR_RE);
  return cut > 0 ? body.slice(0, cut) : body;
}

// Both label/value markups, plus the pill theme's machine attributes.
const TD_PAIR_RE = /<td[^>]*>\s*([A-Za-z][A-Za-z0-9 _#/]{1,30}?)\s*:?\s*<\/td>\s*<td[^>]*>([\s\S]{0,300}?)<\/td>/gi;
const PILL_PAIR_RE =
  /<div[^>]*class=["'][^"']*\bpill\b[^"']*["'][^>]*>\s*([A-Za-z][A-Za-z0-9 _#/]{1,30}?)\s*:?\s*<\/div>\s*<div[^>]*class=["'][^"']*\bpill_data\b[^"']*["'][^>]*>([\s\S]{0,300}?)<\/div>/gi;

const labelKey = (raw) => raw.toLowerCase().replace(/[^a-z]/g, "");

/** Every Label→Value pair on the page, first reading wins. */
export function labelledFacts(head) {
  const facts = new Map();
  for (const re of [TD_PAIR_RE, PILL_PAIR_RE]) {
    re.lastIndex = 0;
    for (const m of head.matchAll(re)) {
      const k = labelKey(m[1]);
      if (!k || facts.has(k)) continue;
      const v = collapse(stripTags(m[2]));
      if (v) facts.set(k, v);
    }
  }
  return facts;
}

const pick = (facts, ...keys) => {
  for (const k of keys) {
    const v = facts.get(k);
    if (v) return v;
  }
  return undefined;
};

// An amount with a billing period attached is a payment estimate, never an
// asking price — the same refusal normalize.mjs's isLeaseOffer makes of a
// billed priceSpecification, and the one lib/price-floor.mjs was written for
// after "$1,990/mo" reached the site as a Model X's price.
const PERIOD_RE = /^\s*(?:<[^>]*>|\s)*(?:\/|per\b|a\b)?\s*(?:mo\b|month|wk\b|week|bi-?weekly|payment)/i;

/** Every distinct dollar amount the car's own block prints, payments excluded.
 *  Three-digit amounts are not read at all: a car under $1,000 is outside
 *  lib/price-floor.mjs's floor anyway, and refusing them means the commonest
 *  payment shape ("$429/mo") cannot be mistaken for an ask even on a theme
 *  that words its period differently. */
export function headPrices(head) {
  const seen = new Set();
  for (const m of head.matchAll(/\$\s?([0-9]{1,3}(?:,[0-9]{3})+|[0-9]{4,7})(?:\.\d{2})?/g)) {
    const n = num(m[1]);
    if (n == null) continue;
    if (PERIOD_RE.test(head.slice(m.index + m[0].length, m.index + m[0].length + 40))) continue;
    seen.add(n);
  }
  return [...seen];
}

/**
 * The asking price, or undefined.
 *
 * The rule is "the number the platform DESIGNATES as the price", not "the only
 * dollar sign on the page", and the difference is a real car: Master Auto
 * Group's 2024 Cybertruck prints $76,999 in its price heading and
 * "** $119,990 Original MSRP **" in the dealer's own free-text description
 * lower down. Counting both abstained on a priced car; taking the lower of two
 * would have been right there and wrong the moment a dealer writes "$500 doc
 * fee" instead, which is why magnitude decides nothing here.
 *
 * Two places designate it, and no theme seen so far has both:
 *   · a labelled "Price" row — the "pill" theme
 *   · a heading whose whole text is an amount — the "sleek" theme's
 *     `<h2>$76,999</h2>` beside the car's name
 *
 * A designated slot that does not hold exactly one readable amount abstains
 * where it stands rather than falling back: "Sold", or a two-rung ladder, is
 * the platform saying it has no single number for this car, and looking
 * elsewhere after that is exactly how a description's MSRP becomes the ask.
 * Only a page with no designated slot at all falls back to "one amount in the
 * car's own block, or nothing".
 */
export function resolveMotorcarPrice(head) {
  const labelled = labelledFacts(head).get("price");
  if (labelled != null) {
    const p = headPrices(labelled);
    return p.length === 1 ? p[0] : undefined;
  }
  for (const m of head.matchAll(/<h[1-4][^>]*>([\s\S]{0,80}?)<\/h[1-4]>/gi)) {
    const t = collapse(stripTags(m[1]));
    if (!t.startsWith("$")) continue;
    const p = headPrices(t);
    return p.length === 1 ? p[0] : undefined;
  }
  const p = headPrices(head);
  return p.length === 1 ? p[0] : undefined;
}

/**
 * Where the model ends and the trim begins, WITHOUT guessing.
 *
 * The platform writes the VDP's <title> itself, always as
 * "{year} {make} {model} for sale in {city}, {ST} {zip}" — no trim — while the
 * page's own heading is "{year} {make} {model} {trim}". So the trim is
 * literally the heading minus the title, and the model is whatever the title
 * has left after a known make. Nothing here has to know that "NX 300" and
 * "Model 3" are two-word models and "Luxury AWD" is a trim; the vendor already
 * drew that line and this reads it.
 *
 * Guessing it instead is what makes this worth the paragraph: splitting on
 * word position would publish a Model 3 as model "Model", trim "3 Long Range".
 * ingest.mjs repairs a bad MAKE from the vPIC decode (lib/makes.mjs) but it
 * has never repaired a model — a wrong one goes straight to the card.
 *
 * The make vocabulary is lib/makes.mjs's, longest match first so "Land Rover"
 * and "Alfa Romeo" are not read as "Land" and "Alfa". A title whose make is
 * not in the allowlist yields no make and no model rather than a guess.
 */
export function splitIdentity(titleName, headingName) {
  const base = collapse(String(titleName ?? ""));
  const full = collapse(String(headingName ?? ""));
  const words = base ? base.split(" ") : [];
  const year = /^(19[89]\d|20\d{2})$/.test(words[0] ?? "") ? words[0] : undefined;
  const rest = year ? words.slice(1) : words;
  // The heading extends the title exactly when it is the same car; anything
  // else (a theme that heads the page differently, a stale carousel title)
  // supplies no trim rather than a wrong one.
  const trim =
    base && full.toLowerCase().startsWith(base.toLowerCase()) ? collapse(full.slice(base.length)) || undefined : undefined;
  for (const n of [3, 2, 1]) {
    const candidate = rest.slice(0, n).join(" ");
    if (candidate && isKnownMake(candidate)) {
      return { year, make: candidate, model: rest.slice(n).join(" ") || undefined, trim, name: full || base || undefined };
    }
  }
  return { year, trim, name: full || base || undefined };
}

// "2021 Lexus NX 300 for sale in Laurel, MD 20724" → "2021 Lexus NX 300".
const forSaleIn = (s) => collapse(String(s ?? "").replace(/\s+for sale in\s+.*$/i, ""));

/** The platform's own title for this VDP, from og:title or <title>. */
export function vdpTitleName(html) {
  const og = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']{4,200})["']/i)?.[1];
  const t = html.match(/<title[^>]*>([\s\S]{0,200}?)<\/title>/i)?.[1];
  for (const raw of [og, t]) {
    const s = forSaleIn(raw);
    if (/^(19[89]\d|20\d{2})\s/.test(s)) return s;
  }
  return undefined;
}

/** The first heading on the page that names a car — "Inventory Listing" and
 *  the rooftop's own name are headings too, so a year has to lead it. */
export function vdpHeadingName(head) {
  for (const m of head.matchAll(/<h[1-4][^>]*>([\s\S]{0,200}?)<\/h[1-4]>/gi)) {
    const s = collapse(stripTags(m[1]));
    if (/^(19[89]\d|20\d{2})\s/.test(s)) return s;
  }
  return undefined;
}

/**
 * One VDP → one schema.org-shaped Vehicle node, or null.
 *
 * Null when the page is not a VDP of this platform, when it carries no VIN
 * (crawl.mjs keys a VIN-less record by its source URL, so a page that yields
 * one would collide with every other VIN-less page on the rooftop), or when
 * the car is sold.
 */
export function motorcarVehicle(html, pageUrl) {
  if (!isMotorcarSites(html)) return null;
  if (!/\/vehicle\/\d+\//.test(String(pageUrl ?? ""))) return null;
  const head = vdpHead(html);
  if (/price-sold|sold_text/i.test(head)) return null;

  const facts = labelledFacts(head);
  const vin = (pick(facts, "vin", "vinnumber", "vin") ?? head.match(/\b[A-HJ-NPR-Z0-9]{17}\b/)?.[0] ?? "")
    .toUpperCase()
    .trim();
  if (!VIN_RE.test(vin)) return null;

  // The rooftop's own labelled Year/Make/Model/Trim rows lead where a theme
  // prints them (the "pill" theme does); the vendor-written title and heading
  // are how the themes that don't still yield a clean split.
  const fromTable = {
    year: pick(facts, "year"),
    make: pick(facts, "make"),
    model: pick(facts, "model"),
    trim: pick(facts, "trim"),
  };
  const parsed = splitIdentity(vdpTitleName(html), vdpHeadingName(head));
  const make = fromTable.make && isKnownMake(fromTable.make) ? fromTable.make : parsed.make;
  const name = parsed.name ?? slugName(pageUrl);

  const price = resolveMotorcarPrice(head);

  const fuel = pick(facts, "fueltype", "fuel");
  const mileage = num(pick(facts, "mileage", "miles", "odometer"));
  const images = stabilizeImages(
    [...head.matchAll(/<img[^>]+src=["'](https?:\/\/[^"']*motorcarsites\.com\/dealers\/images\/vehicles\/[^"']+)["']/gi)].map(
      (m) => m[1]
    )
  );

  return {
    "@type": "Vehicle",
    vehicleIdentificationNumber: vin,
    vehicleModelDate: fromTable.year ?? parsed.year,
    brand: make,
    model: fromTable.model ?? parsed.model,
    vehicleConfiguration: fromTable.trim ?? parsed.trim,
    name,
    mileageFromOdometer: mileage != null ? { "@type": "QuantitativeValue", value: mileage } : undefined,
    color: pick(facts, "exteriorcolor", "exterior"),
    vehicleInteriorColor: pick(facts, "interiorcolor", "interior"),
    driveWheelConfiguration: pick(facts, "drivetype", "drivetrain"),
    vehicleTransmission: pick(facts, "transmission"),
    sku: pick(facts, "stock", "stocknumber"),
    image: images.length ? images : undefined,
    // The dealer's own fuel string, untouched — classifyEv decides.
    fuelType: fuel,
    vehicleEngine: { "@type": "EngineSpecification", name: pick(facts, "engine"), fuelType: fuel },
    // The platform prints an explicit condition field ("Vehicle_condition:
    // used", "CONDITION: USED") — this is a value the rooftop set, not an
    // absent field defaulted to "used", which is the failure lib/condition.mjs
    // was written for. conditionToken returns undefined for anything its
    // vocabulary does not recognise, so an unfamiliar theme abstains.
    itemCondition: conditionToken(pick(facts, "vehiclecondition", "condition")),
    offers: {
      "@type": "Offer",
      price,
      priceProvenance: price != null ? MOTORCARSITES_PRICE : undefined,
      priceCurrency: "USD",
      url: pageUrl,
    },
  };
}

/** Array form, for the extractor list in crawl.mjs/probe.mjs. An SRP returns
 *  [] on purpose — see the theme note at the top of this file. */
export function motorcarVehicles(html, pageUrl) {
  const v = motorcarVehicle(html, pageUrl);
  return v ? [v] : [];
}
