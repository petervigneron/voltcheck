// schema.org Vehicle → one normalized listing record, VIN-keyed.
import { JSONLD, offerProvenance } from "./price-provenance.mjs";

// Feeds hand us HTML-encoded text, and an undecoded entity is not a cosmetic
// problem — it changes what the string IS. web/lib/enrichment/match.ts keys on
// norm(), which strips everything that isn't [A-Z0-9], so the entity's own
// letters survive and become part of the key: dealer.com publishes the
// Mercedes trim as "4MATIC &reg;", which norms to "4MATICREG" and matches no
// registry trim at all.
//
// Measured on the live feed 2026-08-25, all 24 shards, 136,915 listings: 130
// carried an entity in `trim` — 129 Mercedes (EQE / EQS / EQB / CLA 350
// Electric / GLC 350e 4MATIC, plus AMG's "&#x2B;" for the + in 4MATIC+) and
// one Ford "Platinum&reg;" Lightning. 125 came off dealer.com rooftops and one
// off cdn-ds.com, both of which read trim through this function.
//
// What that costs today is narrower than "no enrichment", and worth writing
// down so the fix isn't over-claimed later: most Mercedes rows in the corpus
// carry no trim, and a row with no trim matches every listing, so it lands on
// a broken one anyway. Of the 11 cohorts where a broken listing and a clean
// twin sit side by side in the feed, 9 have identical trim-derived badges and
// 2 do not — the 2023 EQE 350 and EQE 500 4MATIC, which lose exactly the
// trim-keyed facts: EPA range (260 mi) and pack capacity (91 kWh est). A
// further 92 broken listings have no clean twin to measure against. So: a
// small measured loss now, on a key that is wrong for all 130, in a corpus
// that cannot grow a trim-specific Mercedes row without it getting worse.
//
// This is deliberately a decode, not a strip. "4MATIC ®" norms to "4MATIC" —
// the same key the registry already holds — so the trim both matches and still
// reads on the card the way the dealer's own page renders it. Stripping would
// have worked for &reg; and quietly mangled &amp; and &#x2B;.
//
// Case-insensitive only for the names with no case-distinct twin. &Eacute; is
// É, not é, so an accented name matches exactly or not at all.
const NAMED_ENTITIES = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'",
  nbsp: " ", ensp: " ", emsp: " ", thinsp: " ", shy: "",
  reg: "®", trade: "™", copy: "©", deg: "°", plusmn: "±", times: "×",
  hellip: "…", mdash: "—", ndash: "–", minus: "−", bull: "•", middot: "·",
  lsquo: "‘", rsquo: "’", ldquo: "“", rdquo: "”", sbquo: "‚",
  frac12: "½", frac14: "¼", frac34: "¾", euro: "€", pound: "£", yen: "¥", cent: "¢",
  aacute: "á", eacute: "é", iacute: "í", oacute: "ó", uacute: "ú",
  agrave: "à", egrave: "è", ntilde: "ñ", ccedil: "ç",
  auml: "ä", ouml: "ö", uuml: "ü", szlig: "ß", oslash: "ø", aring: "å",
};
const CASELESS = new Set([
  "amp", "lt", "gt", "quot", "apos", "nbsp", "reg", "trade", "copy",
  "deg", "hellip", "mdash", "ndash", "times", "bull", "middot",
]);
const ENTITY = /&(?:#(\d{1,7})|#[xX]([0-9a-fA-F]{1,6})|([a-zA-Z][a-zA-Z0-9]{1,9}));/g;

// Reject anything String.fromCodePoint would throw on, plus the surrogate
// range and NUL. An unrecognized entity is left verbatim rather than guessed
// at — a mangled string that still looks like an entity is at least legible as
// one in the data.
const fromCodePoint = (cp) =>
  Number.isInteger(cp) && cp > 0 && cp <= 0x10ffff && !(cp >= 0xd800 && cp <= 0xdfff)
    ? String.fromCodePoint(cp)
    : undefined;

export function decodeEntities(s) {
  if (typeof s !== "string" || !s.includes("&")) return s;
  let out = s;
  // Double-encoding is real in these feeds — Dealer Car Search serves
  // `170&amp;quot; RWD` inside an onchange attribute, where one pass leaves
  // `170&quot; RWD` behind (see lib/platforms/dealercarsearch.mjs). Repeat
  // until the string stops changing, bounded at three passes so a literal
  // "&amp;amp;" someone actually typed can't be unwound past its own meaning.
  for (let i = 0; i < 3; i++) {
    const next = out.replace(ENTITY, (m, dec, hex, name) => {
      if (dec != null) return fromCodePoint(Number(dec)) ?? m;
      if (hex != null) return fromCodePoint(parseInt(hex, 16)) ?? m;
      // hasOwn, not a bare lookup: "&toString;" and "&valueOf;" both fit the
      // name pattern and would otherwise resolve up the prototype chain and
      // splice a function's own source text into the trim.
      const lower = name.toLowerCase();
      const named = Object.hasOwn(NAMED_ENTITIES, name)
        ? NAMED_ENTITIES[name]
        : CASELESS.has(lower) && Object.hasOwn(NAMED_ENTITIES, lower)
          ? NAMED_ENTITIES[lower]
          : undefined;
      return named ?? m;
    });
    if (next === out) break;
    out = next;
  }
  return out;
}

// Dealer feeds render missing fields as literal placeholder strings —
// "null", "N/A", "-" (observed in production data) — treat them as absent.
const JUNK = new Set(["", "null", "n/a", "-", "undefined"]);
export const text = (v) => {
  if (v == null) return undefined;
  if (typeof v === "string") {
    // Decode before the JUNK test and before trimming: "&#45;" is the same
    // absent-field placeholder as "-", and a value that is nothing but
    // "&nbsp;" is whitespace once decoded, not a one-character string.
    const s = decodeEntities(v).trim();
    return JUNK.has(s.toLowerCase()) ? undefined : s;
  }
  if (typeof v === "number") return String(v);
  if (typeof v === "object") return text(v.name ?? v["@value"] ?? v.value);
  return undefined;
};

const num = (v) => {
  const s = text(v);
  if (!s) return undefined;
  // Keep the sign: a dealer landing page can emit the "you save $5,500"
  // incentive in the price slot as a negative Offer.price ("-5500", seen on
  // pricefordofsimivalley.com's Mach-E JSON-LD, 2026-08-20). Digit-stripping
  // the minus turned that discount into a $5,500 asking price. A negative or
  // zero price is not an asking price — drop it.
  const neg = /^\s*-/.test(s);
  const n = Number(s.replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) && n > 0 && !neg ? n : undefined;
};

// One schema.org Vehicle increasingly carries several offers — a cash/sale
// price and a lease or subscription payment beside it. The payment offers are
// labelled: a GoodRelations businessFunction of LeaseOut/Rent (anything but
// Sell), a paymentFrequency (MONTH, WEEK…), or a price that lives inside a
// UnitPriceSpecification billed per period. Reading offers[0] blindly took a
// "$1,990/mo" Model X lease (motorenvy.com) and a "$5,399/mo" Rolls lease
// (ogaracoach.com) as the asking price. The asking price comes only from a
// sale offer; a payment offer never supplies it.
const isLeaseOffer = (o) => {
  if (!o || typeof o !== "object") return false;
  if (o.paymentFrequency != null) return true;
  const bf = (Array.isArray(o.businessFunction) ? o.businessFunction : [o.businessFunction])
    .map((x) => text(x)?.toLowerCase())
    .filter(Boolean);
  if (bf.some((x) => /lease|rent/.test(x))) return true;
  // A businessFunction that is present but names no sell/sale function is not
  // a cash price either (GoodRelations Sell = .../v1#Sell).
  if (bf.length && !bf.some((x) => /sell|sale/.test(x))) return true;
  const specs = Array.isArray(o.priceSpecification)
    ? o.priceSpecification
    : o.priceSpecification
      ? [o.priceSpecification]
      : [];
  return specs.some(
    (s) =>
      s &&
      (s.unitCode != null ||
        s.billingIncrement != null ||
        s.billingDuration != null ||
        s.referenceQuantity != null),
  );
};

// A car-subscription service (motorenvy.com) isn't a dealer selling cars: it
// lists a monthly LeaseOut offer beside a Sell offer whose price is a notional
// buyout ($102,999 on a 2019 Model X), and BOTH are availability=OutOfStock —
// the car can't actually be bought. We only want cars that are for sale, so a
// sale offer counts only when it's available. Scoped to vehicles that also
// carry a lease offer, so a plain dealer that leaves availability off a
// for-sale car (or marks a genuinely sold one OutOfStock) is untouched.
const OUT_OF_STOCK = /outofstock|soldout|discontinued/;
const isAvailable = (o) => {
  const a = text(o?.availability)?.toLowerCase();
  return !a || !OUT_OF_STOCK.test(a);
};

// vehicleModelDate is nominally a model year but some dealer platforms emit a
// full date ("2025-01-01"); digit-stripping that yields 20250101, which
// overflows the DB's smallint year column. Take the leading 4-digit year and
// bound it to plausible model years instead.
const modelYear = (v) => {
  const m = text(v)?.match(/\b(19[89]\d|20\d{2})\b/);
  const y = m ? Number(m[0]) : undefined;
  return y >= 1981 && y <= new Date().getFullYear() + 2 ? y : undefined;
};

// driveWheelConfiguration arrives as free text ("All-wheel Drive", "AWD") or a
// schema.org URL (…/AllWheelDriveConfiguration). Map to the registry's tokens.
const driveLine = (v) => {
  const s = text(v)?.toUpperCase();
  if (!s) return undefined;
  if (/ALL.?WHEEL|AWD/.test(s)) return "AWD";
  if (/FOUR.?WHEEL|4WD|4X4/.test(s)) return "4WD";
  if (/REAR.?WHEEL|RWD/.test(s)) return "RWD";
  if (/FRONT.?WHEEL|FWD/.test(s)) return "FWD";
  return undefined;
};

export function normalize(vehicle, { sourceUrl, dealerDomain }) {
  const offers = (Array.isArray(vehicle.offers) ? vehicle.offers : [vehicle.offers]).filter(Boolean);
  // The asking price comes only from a sale offer with a real positive price;
  // a lease/subscription/discount offer never supplies it. Everything else on
  // the offer (seller, url, stock) reads from the priced sale offer when there
  // is one, else the best available offer for metadata only. When a lease offer
  // is present, the sale offer must also be available for purchase — a
  // subscription service's out-of-stock buyout price is not an asking price.
  const leased = offers.some(isLeaseOffer);
  const saleOffers = offers.filter((o) => !isLeaseOffer(o) && (!leased || isAvailable(o)));
  const pricedOffer = saleOffers.find((o) => num(o.price) != null);
  const offer = pricedOffer ?? saleOffers[0] ?? offers[0];
  const mileageObj = vehicle.mileageFromOdometer;
  // Dealer identity/location from the offer's seller block (AutoDealer with a
  // PostalAddress). Only trusted when structured — a bare string address could
  // be anything, so it is not guessed at.
  const seller = Array.isArray(offer?.seller) ? offer.seller[0] : offer?.seller;
  const addr = seller?.address && typeof seller.address === "object" ? seller.address : undefined;
  const images = (Array.isArray(vehicle.image) ? vehicle.image : [vehicle.image])
    .map(text)
    .filter(Boolean)
    .slice(0, 12);
  // The offer's url is the car's own page (VDP) — canonical even when this
  // vehicle node was embedded in a search-results page.
  const vdpUrl = text(offer?.url);
  return {
    images,
    description: text(vehicle.description)?.slice(0, 2000),
    vdpUrl,
    vin: text(vehicle.vehicleIdentificationNumber)?.toUpperCase(),
    year: modelYear(vehicle.vehicleModelDate ?? vehicle.productionDate ?? vehicle.modelDate),
    make: text(vehicle.brand ?? vehicle.manufacturer),
    model: text(vehicle.model),
    trim: text(vehicle.vehicleConfiguration ?? vehicle.trim),
    name: text(vehicle.name),
    priceUsd: num(pricedOffer?.price),
    // Which field this price came from, for listing_price_history (0041). A
    // node we parsed off a dealer's page really is the schema.org offer, so it
    // is JSONLD; a node a platform extractor assembled from an API record only
    // looks like one, and says what it actually read via offers.priceProvenance
    // (see lib/price-provenance.mjs). No price read, no provenance to record:
    // an absent price is not an observation of one.
    priceProvenance:
      num(pricedOffer?.price) != null ? (offerProvenance(pricedOffer) ?? JSONLD) : undefined,
    mileage: num(mileageObj?.value ?? mileageObj),
    exteriorColor: text(vehicle.color),
    interiorColor: text(vehicle.vehicleInteriorColor),
    driveLine: driveLine(vehicle.driveWheelConfiguration),
    stockNumber: text(vehicle.sku ?? vehicle.mpn ?? offer?.sku),
    previousOwners: num(vehicle.numberOfPreviousOwners),
    dealerName: text(seller?.name),
    city: text(addr?.addressLocality),
    state: text(addr?.addressRegion),
    zip: text(addr?.postalCode),
    condition: text(vehicle.itemCondition)?.replace(/.*\//, ""),
    imageUrl: text(Array.isArray(vehicle.image) ? vehicle.image[0] : vehicle.image),
    sourceUrl: vdpUrl ?? sourceUrl,
    dealerDomain,
    scrapedAt: new Date().toISOString(),
  };
}

// When the same VIN is seen twice (SRP tile now, VDP later), keep the richer
// record.
export function richness(rec) {
  return (
    (rec.mileage != null ? 2 : 0) +
    (rec.trim ? 2 : 0) +
    (rec.description ? 1 : 0) +
    Math.min(rec.images?.length ?? 0, 5) +
    (rec.fromVdp ? 3 : 0)
  );
}
