// AutoFunds / DealerWebsites.com — one product under two names (pages load
// "DW_Common" stylesheets through HttpCombiner.ashx, the footer credits
// autofunds.com, photos come from images.autofunds.net). Small independents,
// ASP.NET, and until now unreadable: no JSON-LD anywhere, and the SRP at
// /inventory.aspx is robots-disallowed on the rooftops checked (stsautos.com's
// robots.txt disallows both "/inventory.aspx" and "/inventory.aspx?S=*"), so
// the HTML walk had no door at all. That is why these rooftops kept coming
// back "0 VIN vehicles in 12 fetches".
//
// THE DOOR IS /rss.aspx, and robots.txt allows it. Every rooftop publishes its
// WHOLE lot there in one request, in the platform's own `addItem:` namespace:
//
//   year, make, model, trim, vin, engine, transmission, miles, the full image
//   list, and the VDP link
//
// Verified whole-lot rather than assumed (2026-08-23): stsautos.com's feed
// carries 46 items with 46 distinct VINs, and its sitemap lists exactly 46 VDP
// URLs — the same 46. nolimitautosales.com's feed carries 113. One request per
// rooftop for the entire inventory is why this lane can afford to be complete.
//
// WHAT THE FEED DOES NOT CARRY: price, fuel type, condition. Those live on the
// VDP, so this lane follows the VDP — but only for the cars that could be
// electrified (see autoFundsNeedsVdp), never the whole lot. Measured cost per
// rooftop: 1 robots.txt + 1 feed + one VDP per candidate, which was 6 of 42
// cars on greenlightautocorona.com and 4 of 113 on nolimitautosales.com.
//
// ── PRICE ─────────────────────────────────────────────────────────────────
// The VDP publishes its price as schema.org microdata (not JSON-LD), inside an
// Offer whose priceSpecification is a CompoundPriceSpecification. Three shapes
// were measured across the cohort (2026-08-23, every priced EV on 59 rooftops):
//
//  1. one price. A labelled "Internet Price" component, and the Offer's own
//     bare price repeating it:
//       <div itemprop='priceComponent'><span itemprop='name'>Internet Price
//         </span>$<span itemprop='price' content='15990'>15,990</span></div>
//       …<div class='DwNoDisplay' itemprop='price' content='15990'></div>
//
//  2. a markdown. The Internet Price component is wrapped in
//     `invv-priceStrike` — the STRIKETHROUGH — and a second component
//     ("Now Only", id DwInvPriceReduced, label "Reduced Price") holds the
//     current ask. The Offer's own bare price is the REDUCED one:
//       Internet Price 32,995 (struck) · Now Only 29,995 · bare price 29995
//     (sunriseautosales.com 2021 Model Y; same on huntingtonautomall.net,
//     sylhetmotors.com, jclopezautos.com).
//
//  3. a payment. `<div class="monthly-Ins DWPayment" itemprop='priceComponent'>
//     $<span itemprop='price' content='360'>360</span>
//     <p itemprop='unitText'>Monthly</p></div>` — $360 beside a $15,990 car
//     (greenlightautocorona.com 530e), and $116 "Weekly" beside a $29,995
//     Model Y. This is the "$1,990/mo" Model X and "$5,399/mo" Rolls that
//     lib/price-floor.mjs was written for, except that here it sits on EVERY
//     priced car — so "read the price microdata" or "take the lowest" would
//     publish a false bargain across this platform's entire inventory. A
//     component with a unit period is never a price, exactly as
//     normalize.mjs's isLeaseOffer refuses a billed priceSpecification.
//
// So the ask is the component the platform itself designates as current — the
// "Reduced Price" when the page renders one, else the "Internet Price" — and
// it has to equal the Offer's own bare price, which is the same document
// saying the same number twice. Anything else abstains: an unlabelled extra
// number, a "reduction" above the price it reduces, or a bare Offer price that
// matches no rendered component all mean this page is a shape nobody has
// characterised, and inventing a precedence for one is how the dealer.com
// internetPrice rule overstated 1,256 live listings. Abstain means price 0 —
// the dealer.com convention, which keeps the car listed with no price claim
// rather than dropping it (ingest.mjs drops priceUsd == null and keeps 0).
//
// The two rungs carry SEPARATE provenance tags, per lib/price-provenance.mjs:
// a car whose page starts rendering a Reduced Price has moved rung, and a rung
// move must not pair with the old reading into a published price cut.
//
// The platform's hidden `hdn*Price` inputs are NOT read, and the reason is
// measured rather than stylistic: on huntingtonautomall.net's 2021 Model 3 the
// page renders "Internet Price 26,999 / Now Only 25,500" while the back office
// holds hdnInternetPrice=23900, hdnReducedPrice=25500 and hdnInstorePrice=26999
// — the rendered "Internet Price" is the INSTORE field there and the internet
// field is a number the shopper never sees. A hidden-field cross-check would
// abstain on a car whose ask its own page states twice, and reading the hidden
// field directly would publish $23,900 for a car advertised at $25,500. What
// the dealer advertises is what the page prints.
//
// ── CONDITION ─────────────────────────────────────────────────────────────
// Two machine signals, and they disagree, so neither is trusted alone:
//
//   1. schema.org microdata: <link itemprop='url'
//      href='https://schema.org/UsedCondition'> in the itemCondition span.
//   2. the platform's routing: the VDP path segment /used_car/ or /new_car/.
//
// nolimitautosales.com stamps NewCondition (and hdnInventoryNewOrUsed="true")
// on its whole lot — 2020-2022 cars with 40k+ miles at a used-car leasing
// outfit, every one of them routed under /used_car/. That is a back-office
// flag a rooftop set once, which is precisely the failure lib/condition.mjs
// exists for. So this emits a condition ONLY where the two agree; where they
// disagree it emits none and lets publishedCondition() fall back to the VDP
// path, which is the signal that matched the cars. hdnInventoryNewOrUsed is
// not read at all — it is the same wrong flag in a second place.
//
// Certified is not emitted: the platform has no CPO flag on any page sampled,
// and a used car is not certified for want of evidence.
import { AUTOFUNDS_INTERNET, AUTOFUNDS_REDUCED } from "../price-provenance.mjs";
import { priceFloor } from "../price-floor.mjs";
import { stabilizeImages } from "../images.mjs";
import { fetchPage } from "../http.mjs";

// The vendor's own asset/brand hosts, plus the combiner query its stylesheets
// are served through. Deliberately specific: a rooftop's own domain says
// nothing, and "dealerwebsites" as a bare word appears in other vendors' boilerplate.
const ASSET_RE = /\bautofunds\.com|images\.autofunds\.net|HttpCombiner\.ashx\?s=DW_/i;

export const AUTOFUNDS_RSS_PATH = "/rss.aspx";

export function isAutoFunds(html) {
  return typeof html === "string" && ASSET_RE.test(html);
}

/** The feed itself, identified by the platform's own namespace rather than by
 *  "is this RSS" — plenty of dealer CMSes answer /rss.aspx with a blog. */
export function isAutoFundsFeed(xml) {
  return typeof xml === "string" && /xmlns:addItem=/i.test(xml) && /<addItem:vin>/i.test(xml);
}

export function autoFundsFeedUrl(origin) {
  return origin.replace(/\/$/, "") + AUTOFUNDS_RSS_PATH;
}

const VIN_RE = /^[A-HJ-NPR-Z0-9]{17}$/;

const decode = (s) =>
  String(s ?? "")
    .replace(/^\s*<!\[CDATA\[/, "")
    .replace(/\]\]>\s*$/, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/&amp;/g, "&")
    .trim();

const field = (item, name) => {
  const v = decode(item.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`, "i"))?.[1]);
  return v || undefined;
};

// Some rooftops type their sales pitch into the trim column. Measured across
// the whole cohort's feeds (2026-08-23): 58 of 2,959 trims carry copy rather
// than a version — "CLEAN CARFAX", "1 OWNER * NO ACCIDENTS", "LOW MILES!!!" —
// and about half of those have a real trim in front of it ("Touring L CLEAN
// CARFAX! LOADED VEHICLE!", "EX AWD  CLEAN CARFAX!!!"). A trim is a claim
// about which version of the car this is, so the pitch is cut off and what is
// left of the version kept; a field that is nothing but pitch yields no trim
// at all, which is a state every consumer already handles.
//
// `*Ltd Avail*` is the trim catalogue's own limited-availability annotation
// (45 of the 58), not the dealer's words and not part of the name either.
//
// The cut is deliberately literal rather than clever, and it does not catch
// everything: "NEW HYBRID BATTERIES W/ 3 YEAR WARRANTY?" keeps the fragment
// before "WARRANTY". It removes the sales claims it can name and leaves the
// rest alone rather than inventing a grammar for dealer prose.
const PITCH_RE =
  /\s*(?:[*!]+\s*)?\b(?:clean\s+carfax|carfax|no\s+accidents?|accident\s+free|(?:1|one)\s+owner|low\s+miles?|low\s+price|original\s+miles?|factory\s+serviced|well\s+maintained|loaded\s+vehicle|rare\s+find|super\s+clean|all\s+the\s+options|warranty)\b[\s\S]*$/i;

export function autoFundsTrim(raw) {
  if (!raw) return undefined;
  const cut = raw
    .replace(/\*+\s*ltd\.?\s*avail\.?\s*\*+/gi, " ")
    .replace(PITCH_RE, "")
    .replace(/[\s*!.,-]+$/g, "")
    .replace(/^[\s*!.,-]+/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  return /[a-z0-9]/i.test(cut) ? cut : undefined;
}

const num = (v) => {
  if (v == null) return undefined;
  const n = Number(String(v).replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : undefined;
};

/** Every car in one rooftop's feed, as schema.org-shaped nodes. No price: the
 *  feed has none, and a node that claimed one would be inventing it. */
export function autoFundsVehicles(xml) {
  if (!isAutoFundsFeed(xml)) return [];
  const out = [];
  const seen = new Set();
  for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)) {
    const item = m[1];
    const vin = (field(item, "addItem:vin") ?? "").toUpperCase();
    if (!VIN_RE.test(vin) || seen.has(vin)) continue;
    seen.add(vin);
    const url = field(item, "link");
    const miles = num(field(item, "addItem:miles"));
    // The feed's engine string ("2.4 4 Cylinder Engine", "Electric") is the
    // only powertrain signal it carries, so it goes where classifyEv reads —
    // the dealer's own word, the same standing AutoManager's data-displayfuel
    // has. The VDP's hdnFuelType overrides it below when a VDP is fetched.
    const engine = field(item, "addItem:engine");
    const images = stabilizeImages(
      [...item.matchAll(/<addItem:image>([\s\S]*?)<\/addItem:image>/gi)].map((i) => decode(i[1])).filter(Boolean),
    );
    out.push({
      "@type": "Vehicle",
      vehicleIdentificationNumber: vin,
      vehicleModelDate: field(item, "addItem:year"),
      brand: field(item, "addItem:make"),
      model: field(item, "addItem:model"),
      vehicleConfiguration: autoFundsTrim(field(item, "addItem:trim")),
      name: field(item, "title"),
      description: field(item, "description"),
      mileageFromOdometer: miles != null ? { "@type": "QuantitativeValue", value: miles } : undefined,
      vehicleTransmission: field(item, "addItem:transmission"),
      image: images.length ? images : undefined,
      vehicleEngine: { "@type": "EngineSpecification", name: engine, fuelType: engine },
      offers: { "@type": "Offer", priceCurrency: "USD", url },
    });
  }
  return out;
}

// A car whose VDP is worth one request. The feed carries no fuel field, so a
// nameplate this project does not know (a Ford Focus Electric, a Kia Soul EV
// spelled without the badge) would be invisible — but the VDP's hdnFuelType
// names the powertrain outright. So the candidate set is "classifyEv already
// says yes" OR "the car's own text mentions electrification at all", and the
// VDP settles it. Hybrids ride along and are dropped after the merge; that
// cost was measured at 6 of 42 cars on greenlightautocorona.com.
const ELECTRIFIED_TEXT_RE = /electric|\bev\b|\bphev\b|plug[\s-]?in|hybrid|\bkwh\b|\bbev\b/i;

export function autoFundsNeedsVdp(v, isEv) {
  if (isEv) return true;
  const hay = [v.name, v.model, v.vehicleConfiguration, v.description, v.vehicleEngine?.name]
    .filter(Boolean)
    .join(" ");
  return ELECTRIFIED_TEXT_RE.test(hay);
}

const hidden = (html, id) =>
  html.match(new RegExp(`<input[^>]*id="${id}"[^>]*value=(?:"([^"]*)"|'([^']*)')`, "i"))?.slice(1).find((x) => x != null);

/** Every price microdata reading on the VDP, sorted into what the page says it
 *  is: the labelled "Internet Price" and "Reduced Price" components, the
 *  Offer's own bare price, and the payment estimates. Deduped per bucket —
 *  the platform prints each number more than once.
 *
 *  Which bucket a reading falls in is decided by the markup immediately
 *  around it (its component's own label and container), never by comparing
 *  the numbers: on a marked-down car the ask is the LOWER number and on a
 *  financed car the payment is lower still, so magnitude cannot tell them
 *  apart and a rule built on it would publish the payment. */
export function autoFundsPriceReadings(html) {
  const out = { internet: [], reduced: [], bare: [], payments: [] };
  if (typeof html !== "string") return out;
  const add = (bucket, n) => {
    if (n != null && !out[bucket].includes(n)) out[bucket].push(n);
  };
  // The tag itself first, because it is unambiguous: the Offer's own repeat of
  // the price is always a DwNoDisplay element with no text in it, and the
  // payment's own span carries the platform's monthly-Ins id. Only when the
  // tag says nothing does the label just before it decide.
  for (const m of html.matchAll(/<(?:span|div)[^>]*\bitemprop=['"]price['"][^>]*>/gi)) {
    const tag = m[0];
    const n = num(tag.match(/\bcontent=['"]([\d.]+)['"]/i)?.[1]) ?? 0;
    const before = html.slice(Math.max(0, m.index - 250), m.index);
    const after = html.slice(m.index, m.index + 250);
    if (/monthly-Ins|DWPayment/i.test(tag) || /itemprop=['"]unitText['"]/i.test(after)) {
      add("payments", n);
    } else if (/DwNoDisplay/i.test(tag)) {
      // The Offer's own repeat. Tested before the payment container below
      // because it sits just after it in the markup — close enough to fall in
      // its shadow, and it is not a payment.
      add("bare", n);
    } else if (/monthly-Ins|DWPayment/i.test(before)) {
      add("payments", n);
    } else if (/(?:>|content=['"])\s*Reduced Price\s*(?:<|['"])|DwInvPriceReduced/i.test(before)) {
      add("reduced", n);
    } else if (/(?:>|content=['"])\s*Internet Price\s*(?:<|['"])|DWInvPriceSpan/i.test(before)) {
      add("internet", n);
    } else {
      add("bare", n);
    }
  }
  return out;
}

/** The advertised asking price, or 0 for an abstain — see the header for the
 *  three page shapes and why each rung is tagged separately. */
export function resolveAutoFundsPrice(html, { floor = 0 } = {}) {
  const r = autoFundsPriceReadings(html);
  const ABSTAIN = { priceUsd: 0, priceProvenance: undefined };
  // More than one distinct number under the same label is a page shape nobody
  // has characterised.
  if (r.internet.length > 1 || r.reduced.length > 1) return ABSTAIN;
  const internet = r.internet[0];
  const reduced = r.reduced[0];
  // "Now Only" above the price it reduces is incoherent; so is a reduction
  // with nothing to reduce.
  if (reduced != null && !(internet != null && reduced <= internet)) return ABSTAIN;
  const picked = reduced != null
    ? { priceUsd: reduced, priceProvenance: AUTOFUNDS_REDUCED }
    : internet != null
      ? { priceUsd: internet, priceProvenance: AUTOFUNDS_INTERNET }
      : null;
  if (picked == null || !(picked.priceUsd > 0)) return ABSTAIN;
  // The Offer's own price is the same document saying the same number again.
  // A bare price that names some other figure means the ask is not the one we
  // picked, and we cannot say which it is.
  const bare = r.bare.filter((n) => n > 0);
  if (bare.length > 1 || (bare.length === 1 && bare[0] !== picked.priceUsd)) return ABSTAIN;
  return picked.priceUsd >= floor ? picked : ABSTAIN;
}

/** schema.org's own condition enum off the VDP's itemCondition span. */
export function autoFundsMicrodataCondition(html) {
  const m = html.match(/itemprop=['"]itemCondition['"][\s\S]{0,400}?schema\.org\/(New|Used|Refurbished|Damaged)Condition/i);
  return m ? m[1].toLowerCase() : undefined;
}

/** The platform's routing token for the same fact: /used_car/ or /new_car/. */
export function autoFundsPathCondition(url) {
  const m = String(url ?? "").match(/\/(new|used|certified)_cars?\//i);
  return m ? m[1].toLowerCase() : undefined;
}

/**
 * What one VDP adds to its feed row: the advertised price (or an abstain), the
 * powertrain the feed omits, and a condition only where two independent
 * machine signals agree.
 */
export function autoFundsVdpFacts(html, vdpUrl, { year } = {}) {
  if (typeof html !== "string") return {};
  const micro = autoFundsMicrodataCondition(html);
  const path = autoFundsPathCondition(vdpUrl);
  // Only where both say the same thing. "certified" is a used car plus a
  // warranty claim, and nothing on these pages carries that claim, so a
  // certified path reads as used and the certification is not asserted.
  const norm = (c) => (c === "certified" ? "used" : c);
  const condition = micro && path && norm(micro) === norm(path) ? norm(micro) : undefined;

  // An unresolved condition takes the used tier, which is what
  // publishedCondition() will report for these rooftops anyway (their VDP
  // paths all say used_car). ingest.mjs applies the same floor again.
  const floor = priceFloor({ isNew: condition === "new", year });
  // 0 is an abstain: keep the car, make no price claim.
  const { priceUsd, priceProvenance } = resolveAutoFundsPrice(html, { floor });

  const fuelType = hidden(html, "hdnFuelType");
  return {
    vin: hidden(html, "hdnInventoryVin")?.toUpperCase(),
    priceUsd,
    priceProvenance,
    condition,
    fuelType: fuelType || undefined,
    stockNumber: hidden(html, "hdnStock") || undefined,
    exteriorColor: hidden(html, "hdnExteriorColor") || undefined,
    interiorColor: hidden(html, "hdnInteriorColor") || undefined,
    driveLine: hidden(html, "hdnDriveTrain") || undefined,
    mileage: num(hidden(html, "hdnMilesOut")),
    dealerName: hidden(html, "hdnDealerName") || undefined,
    city: hidden(html, "hdnDealerCity")?.replace(/-/g, " ") || undefined,
    state: hidden(html, "hdnDealerState") || undefined,
  };
}

/** Merge one car's VDP facts into the schema.org node, BEFORE classification:
 *  the VDP's fuel field is the platform's own, so it outranks the feed's engine
 *  string — including when it disagrees, which is the honest direction (a
 *  "Gasoline Fuel" answer on a name-matched car sends it to vPIC instead of
 *  shipping on a nameplate alone). */
export function applyAutoFundsVdp(vehicle, facts) {
  if (!facts) return vehicle;
  const v = { ...vehicle };
  if (facts.fuelType) {
    v.fuelType = facts.fuelType;
    v.vehicleEngine = { ...(v.vehicleEngine ?? {}), fuelType: facts.fuelType };
  }
  if (facts.mileage != null) v.mileageFromOdometer = { "@type": "QuantitativeValue", value: facts.mileage };
  if (facts.exteriorColor) v.color = facts.exteriorColor;
  if (facts.interiorColor) v.vehicleInteriorColor = facts.interiorColor;
  if (facts.driveLine) v.driveWheelConfiguration = facts.driveLine;
  if (facts.stockNumber) v.sku = facts.stockNumber;
  return v;
}

/** Merge the VDP's facts into the normalized record. Price is set here rather
 *  than on the Offer node because an abstain is 0 and normalize() drops a
 *  non-positive price — the same reason enrichFromDdc sets it. */
export function enrichFromAutoFunds(rec, facts) {
  if (!facts) return rec;
  return {
    ...rec,
    priceUsd: facts.priceUsd,
    priceProvenance: facts.priceProvenance,
    condition: facts.condition ?? rec.condition,
    stockNumber: facts.stockNumber ?? rec.stockNumber,
    exteriorColor: facts.exteriorColor ?? rec.exteriorColor,
    interiorColor: facts.interiorColor ?? rec.interiorColor,
    dealerName: facts.dealerName ?? rec.dealerName,
    city: facts.city ?? rec.city,
    state: facts.state ?? rec.state,
    platform: "autofunds",
  };
}

/**
 * One rooftop's whole lot, plus a VDP for each car that could be electrified.
 *
 * `keep` decides which cars earn a VDP fetch (crawl.mjs passes classifyEv, the
 * probe passes nothing and just counts the feed). Returns the vehicles with
 * VDP facts already merged into the node, and a vin→facts map for the record
 * enrichment after normalize().
 *
 * `complete` says the feed answered and parsed, which is what licenses db-sync
 * to retire this rooftop's missing VINs — the feed is the whole lot in one
 * request (verified against stsautos.com's sitemap, 46 = 46). A VDP that fails
 * costs that car its price, not the run its completeness: the VIN set is the
 * feed's.
 */
export async function pullAutoFunds(origin, { keep } = {}) {
  const feedUrl = autoFundsFeedUrl(origin);
  const res = await fetchPage(feedUrl);
  let requests = 1;
  if (res.status !== 200 || !res.body || !isAutoFundsFeed(res.body)) {
    return { ok: false, complete: false, found: 0, vehicles: [], factsByVin: new Map(), requests };
  }
  const all = autoFundsVehicles(res.body);
  const factsByVin = new Map();
  const vehicles = [];
  let vdpFailures = 0;
  for (const v of all) {
    if (!keep || !keep(v)) {
      vehicles.push(v);
      continue;
    }
    const url = v.offers?.url;
    if (!url) {
      vehicles.push(v);
      continue;
    }
    const vdp = await fetchPage(url);
    requests++;
    if (vdp.status !== 200 || !vdp.body) {
      vdpFailures++;
      vehicles.push(v);
      continue;
    }
    const facts = autoFundsVdpFacts(vdp.body, vdp.finalUrl ?? url, {
      year: Number(String(v.vehicleModelDate ?? "").match(/\d{4}/)?.[0]),
    });
    factsByVin.set(v.vehicleIdentificationNumber, facts);
    vehicles.push(applyAutoFundsVdp(v, facts));
  }
  return { ok: true, complete: true, found: all.length, vehicles, factsByVin, requests, vdpFailures };
}

/** Probe helper: does this rooftop's feed carry VIN'd inventory? One request. */
export async function countAutoFunds(origin) {
  const res = await fetchPage(autoFundsFeedUrl(origin));
  if (res.status !== 200 || !res.body || !isAutoFundsFeed(res.body)) return { ok: false, found: 0, hasVin: false };
  const vehicles = autoFundsVehicles(res.body);
  return { ok: true, found: vehicles.length, hasVin: vehicles.length > 0 };
}
