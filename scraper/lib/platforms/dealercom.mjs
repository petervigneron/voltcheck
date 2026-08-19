// Dealer.com (DDC) platform extractor. VDPs embed the full vehicle record —
// odometer, trim, driveLine, colors, images, features, and GM RPO optionCodes —
// in `DDC.dataLayer['vehicles'] = [ {...} ]`, server-rendered in the HTML the
// page serves to everyone. This is the same data the page's own widgets read.
const MARKER = /DDC\.dataLayer\[['"]vehicles['"]\]\s*=\s*\[/;

// Some dealers' feeds leak invalid JSON escapes into this blob (e.g.
// "Front\-Wheel Drive" — \- isn't a JSON escape), which makes JSON.parse
// throw and silently drops the whole vehicles array. Strip the backslash on
// any escape JSON doesn't recognize; valid escapes (\" \\ \/ \b \f \n \r \t
// \uXXXX) pass through untouched.
const sanitizeJson = (s) => s.replace(/\\(?!["\\/bfnrtu])/g, "");

export function extractDdcVehicles(html) {
  const m = html.match(MARKER);
  if (!m) return [];
  const start = html.indexOf("[", m.index + m[0].length - 1);
  let depth = 0;
  let end = start;
  for (let j = start; j < html.length; j++) {
    if (html[j] === "[") depth++;
    else if (html[j] === "]") {
      depth--;
      if (depth === 0) {
        end = j;
        break;
      }
    }
  }
  try {
    const arr = JSON.parse(sanitizeJson(html.slice(start, end + 1)));
    return Array.isArray(arr) ? arr.filter((v) => v && v.vin) : [];
  } catch {
    return [];
  }
}

const num = (v) => {
  const n = Number(String(v ?? "").replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : undefined;
};

// Junk-price floors, mirrored from web/lib/listings/price.ts
// (NEW_PRICE_FLOOR_USD / PRICE_FLOOR_USD) and scraper/price-audit.mjs — three
// copies, keep them in sync. No new EV lists under $15k; old Leafs are real
// cars at real four-figure prices.
const NEW_PRICE_FLOOR = 15_000;
const USED_PRICE_FLOOR = 1_000;

// Abstain sentinel. 0 keeps the row alive through ingest_listings (price_usd is
// NOT NULL, so a dropped field would read as a delisting) while hasRealPrice
// hides the number on every surface — the same "we don't know it, so we don't
// print it" the price-audit lane uses. See web/lib/listings/price.ts.
export const PRICE_ABSTAIN = 0;

// A discount deeper than this off MSRP is almost never an unconditional cash
// price on dealer.com — it's a stack of finance-/trade-/military-contingent
// rebates the rooftop advertises as one number (seattlejeep.com: -$59,331 off
// a $89,530 Ram, visible price $30,399, 2026-08-18). The feed never says which
// conditions apply, so we abstain rather than print a bargain we can't stand
// behind — the house rule's asymmetric caution on false bargains.
const MIN_TRUSTED_PRICE_FRACTION = 0.6;
// Below this fraction of MSRP the JSON-LD offer price is not a discount but
// junk in the price slot — the accessories total dealer.com emitted as the
// Offer price on vanhyundai.com (2026-08-14, $2,293 on a $50,273 Ioniq 5).
const JSONLD_JUNK_FRACTION = 0.5;

// Which served number is the price a human reads off a dealer.com VDP?
//
// Validated against the rendered "Final Price"/dominant price on 8 live
// rooftops 2026-08-18 (new & used, $24k–$170k). JSON-LD offers.price is that
// number wherever it isn't merely echoing MSRP: it already carries folded-in
// unconditional incentives (VW ID.Buzz $59,110 under a $72,385 sticker),
// dealer markups above sticker (BMW X5 $89,696 over $87,900 MSRP), and used
// asks with no MSRP at all (Tesla Model Y $29,943). No single DDC field
// survives the whole set: internetPrice was a pre-incentive subtotal on the
// Buzz and a figure ABOVE MSRP on a Hummer; salePrice was the bare sticker on
// the Buzz and a $799 lease teaser on the X5. The prior "internetPrice first"
// rule (added for the vanhyundai accessories bug) published those subtotals as
// the price — the overstate this replaces, up to $30k on high-incentive EVs.
//
// The two ways JSON-LD misleads, and the served signal that catches each:
//  - it parrots MSRP while a real discount sits in internetPrice/salePrice
//    (bZ4X: JSON-LD $29,995 = MSRP, dominant price $24,511) — take the DDC
//    discount, unless it is too deep to be an unconditional price (abstain);
//  - it carries junk far below MSRP (vanhyundai accessories total) — fall back
//    to the lowest plausible DDC field, or abstain.
export function resolveDdcPrice(rec, d) {
  const jsonld = num(rec.priceUsd); // normalize() already read offers.price
  const msrp = num(d.msrp);
  const isNew = (d.newOrUsed ?? rec.condition) === "new";
  const floor = isNew ? NEW_PRICE_FLOOR : USED_PRICE_FLOOR;

  // DDC selling-price fields that clear the junk floor, sorted low→high.
  const ddcFields = [num(d.internetPrice), num(d.salePrice), num(d.askingPrice)]
    .filter((p) => p != null && p >= floor)
    .sort((a, b) => a - b);
  // The lowest DDC field that is a real discount below MSRP (not a >MSRP
  // subtotal). With no MSRP anchor, the lowest plausible field stands in.
  const ddcDiscount = msrp != null ? ddcFields.find((p) => p < msrp) : ddcFields[0];

  let price;
  const jsonldUsable =
    jsonld != null && jsonld >= floor && !(msrp != null && jsonld < msrp * JSONLD_JUNK_FRACTION);
  if (jsonldUsable) {
    const echoesMsrp = msrp != null && Math.abs(jsonld - msrp) <= Math.max(50, msrp * 0.002);
    if (echoesMsrp && ddcDiscount != null) {
      // JSON-LD is only the sticker; a real advertised discount sits below it.
      if (ddcDiscount < msrp * MIN_TRUSTED_PRICE_FRACTION) return PRICE_ABSTAIN;
      price = ddcDiscount;
    } else {
      price = jsonld; // the dealer's declared price: discount, markup, or used ask
    }
  } else {
    // No usable JSON-LD offer price (missing, junk-low, or sub-floor): the
    // lowest plausible DDC field is the best remaining served signal.
    price = ddcFields[0] ?? msrp ?? null;
  }

  return price != null && price >= floor ? price : PRICE_ABSTAIN;
}

// Merge DDC fields into a normalized record (DDC wins where present — it's
// the platform's own structured data, richer than the JSON-LD summary).
export function enrichFromDdc(rec, ddcVehicle) {
  if (!ddcVehicle || ddcVehicle.vin?.toUpperCase() !== rec.vin) return rec;
  const d = ddcVehicle;
  return {
    ...rec,
    mileage: num(d.odometer) ?? rec.mileage,
    trim: d.trim && d.trim !== "null" ? d.trim : rec.trim,
    driveLine: ["FWD", "RWD", "AWD", "4WD"].includes(d.driveLine) ? d.driveLine : undefined,
    exteriorColor: d.exteriorColor ?? rec.exteriorColor,
    interiorColor: d.interiorColor ?? undefined,
    // The advertised price a human reads off the VDP — see resolveDdcPrice.
    // 0 means "abstain": we could not name the price from the served fields.
    priceUsd: resolveDdcPrice(rec, d),
    optionCodes: Array.isArray(d.optionCodes) && d.optionCodes.length ? d.optionCodes : undefined,
    certified: d.certified === "true" || d.certified === true || undefined,
    stockNumber: d.stockNumber ?? undefined,
    city: d.address?.city ?? rec.city,
    state: d.address?.state ?? rec.state,
    zip: d.address?.postalCode ?? rec.zip,
    // On group sites the accountName is the actual rooftop (e.g. "Hendrick
    // Kia of Cary"), which beats attributing every car to the group domain.
    dealerName: d.accountName ?? rec.dealerName,
    condition: d.newOrUsed ?? rec.condition,
    platform: "dealer.com",
  };
}
