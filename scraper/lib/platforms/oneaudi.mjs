// OneAudi — Audi of America's own dealer website platform (the "falcon"
// renderer at *.renderer.one.audi, backed by omnigraph.audi.com). Every US
// Audi rooftop runs it, and every one of them was written off.
//
// 273 rows of the needs-investigation pile name omnigraph.audi.com — the
// single largest cohort in it, and the one with the best EV odds in the whole
// registry, because Audi's US line is Q4/Q6/Q8 e-tron, e-tron GT and the Q5
// TFSI e. They scored "0 VIN vehicles in 12 fetches (0 ItemList entries, 0
// sitemap urls)" every time, for three compounding reasons:
//
//   1. There is no sitemap. /sitemap.xml answers 500.
//   2. There is no ItemList, no Vehicle JSON-LD, and no car anywhere in the
//      rendered markup — the grid is drawn client-side. Searching the served
//      HTML for a VIN finds nothing in the DOM.
//   3. The inventory paths are /en/inventory/new/ and /en/inventory/used/,
//      which is not a shape any of the SRP guesses tries.
//
// But the whole page-one result set IS served, in a place nothing was looking:
// a <script type="x-feature-hub/serialized-states"> block holding a
// URI-encoded JSON map of feature-service states. The stock-search feature
// app's entry is `{apollo, vehicles}`, and `vehicles.cars[].stockCar` is a
// complete record — VIN, title, model year, carline, trim text, mileage, fuel,
// colours, drivetrain, photos, the dealer that owns it, its VDP link, and the
// price ladder. So this is a server-rendered read of the site's own page, not
// an API call: no key, no token, nothing the browser wouldn't fetch.
//
// FORTY-EIGHT AT A TIME, AND THE ONLY LEVER THAT MOVES
//
// The SSR always renders offset 0, limit 48. `?page=2`, `?offset=48` and
// `?limit=96` are all ignored — verified on audiraleigh.com, whose returned
// paging stayed {limit:48, offset:0} for each (the client pages with "Load
// more" against the GraphQL endpoint, and nothing in the URL reaches it).
//
// `?modelFamily=<id>[,<id>…]` DOES reach it: it lands in the query as the
// `model-range` criterion, verified by reading the criteria back out of the
// state (`?type=new&modelFamily=q3` → model-range ["q3"], 258 results down to
// 58). That is the whole walk strategy here. The unfiltered SRP publishes a
// `model-range` facet listing every family in stock WITH ITS COUNT, so the
// electrified ones can be asked for by name and the answer checked against
// the count the site itself just gave us. Nothing is hard-coded about which
// families a rooftop has; only which family names mean "plugs in".
//
// KNOWN GAP, stated rather than papered over: setting modelFamily also flips
// the used query's `t_preowned` criterion from `all` to `AudiPreowned`, so the
// family walk cannot see a rooftop's non-Audi trade-ins. On audiraleigh.com
// that pool is 1,595 of 1,688 used cars and has no facets of its own, so its
// EVs are reachable only as whatever lands on page one of the unfiltered SRP.
// Those are other brands' cars on an Audi lot; a Model 3 there is a real miss.
//
// ONE SITE IS SEVERAL ROOFTOPS
//
// audiraleigh.com's new SRP queries dealers ["09B11","09B04"] — Audi Raleigh
// AND Audi Cary — and 30 of the 48 cars on page one are Cary's, with weblinks
// on audicary.com. Every record therefore carries the owning rooftop's name
// and id, and its `weblink` (the platform's own per-car URL) is used as the
// VDP link rather than a URL built on the host we asked. lib/colisting.mjs
// counts the rest: this is one car on two of a group's sites, which is what
// that file exists to keep out of the move detector.
//
// THE PRICE IS `sale`, AND THE OTHER RUNGS ARE TRAPS
//
// carPrices carries up to six types. Measured on audiraleigh.com,
// audidenver.com, prestigeaudi.com, audicoralsprings.com, audimortongrove.com
// and audiofcostamesa.com, page one of each lot (2026-08-24):
//
//   list          MSRP.
//   dealerDiscount  a negative number.
//   sale          the advertised price. This is the one the card prints, read
//                 off two rendered rooftops that use DIFFERENT fee keys:
//                 audiraleigh.com "Price $39,990.00 / Dealer Handling Fee
//                 $698.00 / Selling Price $40,688.00" (sale / dealerDocFees /
//                 final), and prestigeaudi.com "Sale Price $42,196.00 /
//                 Dealer Handling $799.00 / Total Price $42,995.00" (sale /
//                 dealerMarkup / final).
//   dealerDocFees, dealerMarkup
//                 the add-on line(s). Which key a rooftop uses varies and two
//                 of the six use BOTH at once, so they are summed rather than
//                 named — a fee key nobody has seen yet would otherwise break
//                 the reconciliation below and silence a whole store.
//   dealerPrice   sale + the fees.
//   final         on a used car, sale + the fees. On a NEW car, that MINUS
//                 conditional incentives: a 2026 A3 at sale 43,919,
//                 dealerPrice 44,617, final 41,117 — $3,500 below the ask, on
//                 rebates a given shopper may not qualify for. Publishing
//                 that is the false bargain the house rule calls the most
//                 expensive error, so `final` is never used.
//
// `final == sale + fees` held on 48/48 used cars and only 20/48 new ones,
// which is precisely the incentive split above; `sale` is the one field that
// means the same thing on both. It is emitted alone, and only when the ladder
// still reconciles (dealerPrice or final equals sale plus the fees). A record
// whose arithmetic does not hold is a record whose price semantics are not
// the ones measured here, so it abstains — no price is a state ingest already
// handles, a wrong one costs a shopper. Some new records carry no `sale` at
// all (16 of 48 on audicoralsprings.com); those abstain too.
//
// Condition comes from `cartypeText` ("N"/"U"), the platform's machine token,
// with `preUse.text` ("New car"/"Used car") behind it through the shared
// conditionToken vocabulary. See ../condition.mjs for why a display string is
// never the first reading and why an absent one is not "used".
import { conditionToken } from "../condition.mjs";
import { stabilizeImages } from "../images.mjs";
import { ONEAUDI_SALE } from "../price-provenance.mjs";

const VIN_RE = /^[A-HJ-NPR-Z0-9]{17}$/;

// The renderer and the graph host. Both appear in the <head> of every page on
// the platform (a preload of oneaudi-falcon…/client.js and a dns-prefetch of
// omnigraph.audi.com), including pages that carry no inventory.
const ONEAUDI_RE = /renderer\.one\.audi|omnigraph\.audi\.com|apps\.one\.audi/i;

export function isOneAudi(html) {
  return typeof html === "string" && ONEAUDI_RE.test(html);
}

export const ONEAUDI_SRP_PATHS = ["/en/inventory/new/", "/en/inventory/used/"];

export function oneAudiSrpUrls(origin) {
  return ONEAUDI_SRP_PATHS.map((p) => origin.replace(/\/$/, "") + p);
}

/** The feature-hub state block, decoded: the map of feature-service id →
 *  serialized state. Values are JSON *strings*, so each is parsed on demand. */
function serializedStates(html) {
  const m = /<script type="x-feature-hub\/serialized-states">([\s\S]*?)<\/script>/.exec(html ?? "");
  if (!m) return null;
  try {
    const decoded = JSON.parse(decodeURIComponent(m[1]));
    return decoded && typeof decoded === "object" ? decoded : null;
  } catch {
    return null;
  }
}

/**
 * The stock-search app's state: `{cars, totalCount, facets}`.
 *
 * The feature app's service id is a UUID that changes between releases, so it
 * is found by shape — the one state that parses to an object carrying a
 * `vehicles.cars` array — rather than by name.
 */
export function oneAudiState(html) {
  const states = serializedStates(html);
  if (!states) return null;
  for (const raw of Object.values(states)) {
    if (typeof raw !== "string" || !raw.includes('"StockCar"')) continue;
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      continue;
    }
    const v = parsed?.vehicles;
    if (!v || !Array.isArray(v.cars)) continue;
    const facets = new Map();
    for (const c of v.possibleFilters ?? []) {
      if (!c?.id) continue;
      facets.set(
        c.id,
        (c.possibleItems ?? []).map((i) => ({ id: String(i?.id ?? ""), number: Number(i?.number) || 0 })),
      );
    }
    return {
      cars: v.cars.map((c) => c?.stockCar).filter(Boolean),
      totalCount: Number(v.totalCount) || 0,
      facets,
    };
  }
  return null;
}

// Which `model-range` facet ids mean "plugs in".
//
// Audi names its electrified families for the badge on the car, so the
// pattern does the work and survives a family we have never seen: q6etron,
// q8etron, a6etron, etron, etrongt all carry "etron", and the plug-in hybrids
// carry "tfsie" (q5tfsie, a7tfsie, a8tfsie). `q4` is listed explicitly
// because it is the one family whose facet id drops the badge — the carlines
// under it are q4etron and q4sbetron — and because there has never been a
// combustion Audi Q4 in the US, so the id cannot mean anything else.
//
// Being wrong here in the "extra" direction costs one request that returns
// cars classifyEv then declines; being wrong in the "missing" direction hides
// a rooftop's EVs, so the pattern is deliberately loose.
const ELECTRIFIED_FAMILY = /etron|e-tron|tfsi-?e|phev|electric|\bev\b/i;

export function isElectrifiedFamily(id) {
  const s = String(id ?? "").toLowerCase();
  return s === "q4" || ELECTRIFIED_FAMILY.test(s);
}

/** What one SSR request can carry. Not configurable: the server ignores
 *  `limit` in the URL, so this is a fact about the platform. */
export const PAGE_SIZE = 48;

/**
 * The follow-up SRP URLs for a rooftop, read off an SRP we already have.
 *
 * The `model-range` facet is the site telling us which families it holds and
 * how many of each. Ask for the electrified ones: as one combined request
 * when their counts sum to 48 or fewer (the SSR page size), and one request
 * per family when they don't, so no family is silently truncated. A single
 * family over 48 is beyond what the URL can slice and is reported by
 * oneAudiTruncated() rather than passed off as a complete walk.
 */
export function oneAudiSeeds(html, pageUrl) {
  const state = oneAudiState(html);
  if (!state) return [];
  const families = (state.facets.get("model-range") ?? []).filter((f) => isElectrifiedFamily(f.id));
  if (!families.length) return [];
  let base;
  try {
    base = new URL(pageUrl);
  } catch {
    return [];
  }
  base.searchParams.delete("modelFamily");
  const url = (ids) => {
    const u = new URL(base);
    u.searchParams.set("modelFamily", ids.join(","));
    return u.toString();
  };
  const total = families.reduce((a, f) => a + f.number, 0);
  return total <= PAGE_SIZE ? [url(families.map((f) => f.id))] : families.map((f) => url([f.id]));
}

/** A family request whose own result count exceeds what one page can carry —
 *  the cars past #48 are not reachable through the URL. Returned so a caller
 *  can say so instead of implying the lot was walked. */
export function oneAudiTruncated(html) {
  const state = oneAudiState(html);
  return state ? Math.max(0, state.totalCount - state.cars.length) : 0;
}

const priceMap = (car) => {
  const out = new Map();
  for (const p of car?.carPrices ?? []) {
    const v = Number(p?.price?.value);
    if (p?.type && Number.isFinite(v)) out.set(p.type, v);
  }
  return out;
};

// The rungs that are prices of the car. Everything else in carPrices is an
// add-on line the card prints under its own heading and adds to the total —
// `dealerDocFees` on most rooftops, `dealerMarkup` on others, both at once on
// audicoralsprings.com and audimortongrove.com. They are summed rather than
// named because the set is per-rooftop and a fee we have not seen would
// otherwise break the reconciliation below and silence a whole store.
const RUNGS = new Set(["sale", "final", "list", "dealerPrice", "dealerDiscount"]);

function feeTotal(p) {
  let sum = 0;
  for (const [type, v] of p) if (!RUNGS.has(type) && Number.isFinite(v) && v > 0) sum += v;
  return sum;
}

/**
 * The advertised price, or undefined.
 *
 * `sale` is the rung the card prints. Verified on two rooftops with different
 * fee keys: audiraleigh.com ("Price $39,990.00 / Dealer Handling Fee $698.00 /
 * Selling Price $40,688.00" against sale/dealerDocFees/final) and
 * prestigeaudi.com ("Sale Price $42,196.00 / Dealer Handling $799.00 / Total
 * Price $42,995.00" against sale/dealerMarkup/final). The fee's key differs;
 * its role — a line item added on top of the printed price — does not.
 *
 * It is only published while the ladder it sits in still reconciles:
 * `dealerPrice` (new) or `final` (used) must equal sale plus the fees. That
 * identity held on every rooftop sampled, and it is what tells us the record's
 * semantics are the ones measured. A record that fails it abstains.
 */
export function oneAudiPrice(car) {
  const p = priceMap(car);
  const sale = p.get("sale");
  if (!Number.isFinite(sale) || sale <= 0) return undefined;
  const fees = feeTotal(p);
  const reconciles = ["dealerPrice", "final"].some((t) => {
    const v = p.get(t);
    return Number.isFinite(v) && Math.abs(v - sale - fees) < 1;
  });
  // Nothing to reconcile against is not a contradiction: a used record with
  // only `sale` on it still says what the ask is.
  const hasLadder = p.has("dealerPrice") || p.has("final");
  return !hasLadder || reconciles ? sale : undefined;
}

/**
 * The make, DERIVED — never assumed to be Audi.
 *
 * Half of a rooftop's used lot can be trade-ins of other brands: 25 of the 48
 * on audicoralsprings.com's first used page, including a Land Rover Defender
 * and a Lexus CT 200h. Those records have `model: null` and only `titleText`
 * ("2022 Land Rover Range Rover Sport") plus the generic model ("Range Rover
 * Sport") to go on. Hard-coding "Audi" published a Lexus as an Audi CT 200h.
 *
 * So the make is what is left of the title once the model year comes off the
 * front and the generic model comes off the back — a subtraction that either
 * lands exactly or does not, and returns undefined when it does not, rather
 * than guessing. A make of Audi is only ever claimed when the record's own
 * text says Audi.
 */
export function oneAudiMake(car) {
  const title = String(car?.titleText ?? "").trim();
  const model = String(car?.modelInfo?.genericModel?.text ?? "").trim();
  const rest = title.replace(/^\d{4}\s+/, "");
  if (model && rest.toLowerCase().endsWith(model.toLowerCase())) {
    const make = rest.slice(0, rest.length - model.length).trim();
    if (make) return make;
  }
  // Audi's own records also carry a full sales name that starts with the brand
  // ("Audi Q5 Sportback Premium Plus 45 TFSI® quattro®"), which is a second
  // reading of the same fact rather than a guess.
  const named = /^(Audi)\b/.exec(String(car?.model?.name ?? "").trim());
  return named ? named[1] : undefined;
}

// Audi's own inventory system is the manufacturer for a car Audi built. It is
// a third-party feed for everything else on the lot, and its plug-in flag
// there is wrong often enough to be unusable: of the four non-Audi records
// flagged `H` "Plug-in Hybrid (Gas/Electric)" across six rooftops, one is a
// 2016 Lexus CT 200h — a conventional hybrid that has never had a plug — and
// another is a 2026 Volvo XC40, a model with no US plug-in variant that year.
//
// The `E` "Electric" flag on the same pool is a different story and is kept:
// all 19 non-Audi records carrying it are real BEVs (Polestar 2 and 3, Blazer
// EV, ID.4, EV9, Wagoneer S), which is what you would expect — "does it have a
// tailpipe" is harder to get wrong than "does it plug in".
//
// So a non-Audi car's plug-in-hybrid claim is dropped and the nameplate is
// left to classifyEv. Losing a genuine third-party PHEV is a miss; publishing
// a Lexus CT 200h as a plug-in is a false claim on a listing surface, and the
// house rule makes that trade for us.
function trustedFuel(car, make) {
  const fuel = car?.engineInfo?.fuel;
  const text = fuel?.text || undefined;
  if (!text) return undefined;
  if (make === "Audi") return text;
  return /plug-?in/i.test(text) ? undefined : text;
}

/** The rooftop that actually owns the car, not the host we asked. */
export function oneAudiDealer(car) {
  const d = car?.dealer;
  if (!d?.id && !d?.name) return undefined;
  return { id: d.id ? String(d.id) : undefined, name: d.name ? String(d.name) : undefined };
}

function oneCar(car) {
  const vin = String(car?.vin ?? "").toUpperCase();
  if (!VIN_RE.test(vin)) return null;

  const price = oneAudiPrice(car);
  const make = oneAudiMake(car);
  const fuel = trustedFuel(car, make);
  const mileage = Number(car?.mileage?.value?.number);
  const condition =
    ({ N: "new", U: "used" })[String(car?.cartypeText ?? "").toUpperCase()] ??
    conditionToken(car?.preUse?.text);
  const stock = (car?.dynamicAttributes ?? []).find((a) => a?.id === "VEHICLE_ID")?.value;
  const owner = oneAudiDealer(car);
  const images = stabilizeImages(
    (car?.images ?? [])
      .filter((i) => i?.type === "photo" && typeof i?.url === "string")
      .map((i) => i.url),
  );

  return {
    "@type": "Vehicle",
    vehicleIdentificationNumber: vin,
    vehicleModelDate: car?.modelInfo?.modelyear ? String(car.modelInfo.modelyear) : undefined,
    brand: make,
    // The generic model ("Q4 e-tron"), not the full sales name — the trim text
    // rides in vehicleConfiguration where the rest of the crawl expects it.
    model: car?.modelInfo?.genericModel?.text || car?.carline?.name || undefined,
    vehicleConfiguration: car?.subtitleText || undefined,
    name: car?.model?.name || car?.titleText || undefined,
    ...(condition ? { itemCondition: condition } : {}),
    mileageFromOdometer:
      Number.isFinite(mileage) && mileage >= 0
        ? { "@type": "QuantitativeValue", value: mileage, unitCode: "SMI" }
        : undefined,
    color: car?.colorInfo?.exteriorColor?.colorInfo?.text || undefined,
    vehicleInteriorColor: car?.colorInfo?.interiorColor?.colorInfo?.text || undefined,
    driveWheelConfiguration: car?.driveText || undefined,
    sku: stock || undefined,
    image: images.length ? images : undefined,
    fuelType: fuel,
    vehicleEngine: fuel ? { "@type": "EngineSpecification", fuelType: fuel } : undefined,
    offers: {
      "@type": "Offer",
      price,
      priceProvenance: price != null ? ONEAUDI_SALE : undefined,
      priceCurrency: "USD",
      // The platform's own per-car URL, which points at the rooftop that owns
      // the car — not always the site we asked. See the header.
      url: typeof car?.weblink === "string" ? car.weblink : undefined,
      // The rooftop the platform says owns the car. On a group site that is
      // often not the host we asked, and normalize() reads dealerName off the
      // offer's seller, so this is where it has to live.
      ...(owner?.name ? { seller: { "@type": "AutoDealer", name: owner.name } } : {}),
    },
  };
}

/** Every car in a OneAudi SRP's serialized state. */
export function oneAudiVehicles(html) {
  const state = oneAudiState(html);
  if (!state) return [];
  const out = [];
  const seen = new Set();
  for (const car of state.cars) {
    const v = oneCar(car);
    if (!v || seen.has(v.vehicleIdentificationNumber)) continue;
    seen.add(v.vehicleIdentificationNumber);
    out.push(v);
  }
  return out;
}
