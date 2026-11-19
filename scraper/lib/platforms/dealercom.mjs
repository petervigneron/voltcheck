// Dealer.com (DDC) platform extractor. VDPs embed the full vehicle record —
// odometer, trim, driveLine, colors, images, features, and GM RPO optionCodes —
// in `DDC.dataLayer['vehicles'] = [ {...} ]`, server-rendered in the HTML the
// page serves to everyone. This is the same data the page's own widgets read.
import { priceFloor } from "../price-floor.mjs";
import { JSONLD, DDC_INTERNET, DDC_SALE, DDC_ASKING, DDC_MSRP } from "../price-provenance.mjs";
import { text } from "../normalize.mjs";
import { conditionToken } from "../condition.mjs";
import { stickerDollars, stickerRecord } from "../sticker.mjs";

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

// Junk-price floors live in lib/price-floor.mjs (one scraper copy, mirrored
// in web/lib/listings/price.ts). Year-aware since 2026-08-19: dealer.com
// intermittently serves a finance payment as JSON-LD offers.price on used
// cars — $1,280 on a 2024 Wrangler 4xe with every DDC field zeroed
// (beckchryslerdodgejeep.com, verified live) — and with no MSRP anchor the
// old flat $1,000 used floor let it through as the price.

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
  return resolveDdcPriceTagged(rec, d).priceUsd;
}

// The same resolve, also naming WHICH served field it took the number from
// (migration 0041; lib/price-provenance.mjs explains why the field and not the
// lane). Split out rather than changing resolveDdcPrice's return type because
// that function's answer is what price-audit.mjs, verify-price-fix.mjs and
// test/dealercom-price.test.mjs assert on, VIN by VIN — this had to add a fact
// about the price without touching the price.
//
// Why the tag is computed here and not inferred later by comparing the result
// against the served fields: the fields collide. On a rooftop where
// internetPrice === salePrice === the JSON-LD offer (common — it is the same
// advertised number published three ways), an after-the-fact match would have
// to pick one arbitrarily, and picking differently on two nights is exactly
// the phantom step this is meant to end. The resolver knows which branch it
// took, so it says so.
//
// An abstain carries NO provenance: it never reaches listing_price_history
// (0039 keeps zero-price rows out), and tagging a non-observation would be
// claiming we read a field we could not read.
export function resolveDdcPriceTagged(rec, d) {
  const jsonld = num(rec.priceUsd); // normalize() already read offers.price
  const msrp = num(d.msrp);
  // DDC's OTHER sticker field, and the third way JSON-LD misleads. The two
  // failure modes above are both anchored on `msrp`, so when a rooftop serves
  // msrp 0 neither guard can fire and the offer price is taken at face value
  // as "the dealer's declared price" — which is how buddychevy.com published a
  // $414,811 Cadillac Lyriq (2026-08-29). Read off its own data layer:
  //
  //   askingPrice 38481   internetPrice 38481   salePrice 0
  //   msrp 0              retailValue 414811    JSON-LD offer 414811
  //
  // and the page itself renders "Suggested Retail Price $414,811 / Your Buddy
  // Chevrolet Discount -$376,330 / Today's Price $38,481". The offer parrots
  // retailValue, exactly the MSRP-echo case, just anchored on the field that
  // was actually populated. The correct answer was sitting in two agreeing DDC
  // fields the whole time.
  const sticker = msrp ?? num(d.retailValue);
  const isNew = (d.newOrUsed ?? rec.condition) === "new";
  const floor = priceFloor({ isNew, year: rec.year ?? num(d.modelYear) });

  // DDC selling-price fields that clear the junk floor, sorted low→high, each
  // carrying the name of the field it came from so the winner can be tagged.
  // …and that the dealer's page actually prints — see "ON THE PAGE" below.
  const shown = shownOnPage(d);
  let offPage = false;
  const ddcFields = [
    { price: num(d.internetPrice), provenance: DDC_INTERNET },
    { price: num(d.salePrice), provenance: DDC_SALE },
    { price: num(d.askingPrice), provenance: DDC_ASKING },
  ]
    .filter((f) => f.price != null && f.price >= floor)
    .filter((f) => {
      if (!shown || shown(f.price)) return true;
      offPage = true;
      return false;
    })
    .sort((a, b) => a.price - b.price);
  // The lowest DDC field that is a real discount below MSRP (not a >MSRP
  // subtotal). With no MSRP anchor, the lowest plausible field stands in.
  const ddcDiscount = sticker != null ? ddcFields.find((f) => f.price < sticker) : ddcFields[0];

  let picked;
  const jsonldUsable =
    jsonld != null && jsonld >= floor && !(msrp != null && jsonld < msrp * JSONLD_JUNK_FRACTION);
  if (jsonldUsable) {
    const echoesSticker =
      sticker != null && Math.abs(jsonld - sticker) <= Math.max(50, sticker * 0.002);
    if (echoesSticker && ddcDiscount != null) {
      // JSON-LD is only the sticker; a real advertised discount sits below it.
      //
      // The depth guard stays keyed on a REAL msrp, deliberately. It abstains
      // because a discount too deep off sticker is usually a stack of
      // conditional rebates — reasoning that needs the sticker to be true. A
      // retailValue of $414,811 on a car that stickered near $60k new is not
      // true, so measuring a discount against it is meaningless, and abstaining
      // on that basis would hide the $38,481 the dealer plainly advertises.
      // Against a retailValue anchor the echo test alone does its job: it
      // disqualifies the offer as a sticker parrot and lets the agreeing DDC
      // selling fields answer.
      if (msrp != null && ddcDiscount.price < msrp * MIN_TRUSTED_PRICE_FRACTION) return ABSTAIN_RESULT;
      picked = ddcDiscount;
    } else if (offPage && msrp != null && jsonld === msrp) {
      // The page prints the sticker and nothing under it; the lower figure the
      // feed carried was refused as off the page. Named for what it is — the
      // sticker — rather than as the page's JSON-LD offer, because on this
      // exact shape the two are not always the same number: stevinsonhyundai
      // .com's ladder ends on "Stevinson Price $23,723" (= MSRP) while its
      // VDP's JSON-LD offer is the "Price $24,522" row above the dealer
      // discount. Recheck reads that offer under the jsonld tag, and a crawl
      // reading filed under the same tag would have the two take turns on the
      // headline, $799 apart, with every turn drawn on the chart (0103).
      picked = { price: jsonld, provenance: DDC_MSRP };
    } else {
      // the dealer's declared price: discount, markup, or used ask
      picked = { price: jsonld, provenance: JSONLD };
    }
  } else {
    // No usable JSON-LD offer price (missing, junk-low, or sub-floor): the
    // lowest plausible DDC field is the best remaining served signal.
    //
    // Failing that, the sticker — on a NEW car only. There it is a real
    // ceiling the manufacturer published, and showing it beats hiding a car
    // we have a defensible number for (the vanhyundai case above). On a used
    // car `msrp` is not a sticker at all: dealer.com's feed fills it with the
    // dealer's own retail book value, the strike-through anchor it renders a
    // discount against. Read off camelbackcars.com on 2026-10-25, four priced
    // used cars carried msrp $38,530 / $29,500 / $28,020 / $35,434 against
    // rendered asks of $34,990 / $21,450 / $27,909 / $31,900 — never the
    // price, always above it. A fifth, a 2023 F-150 Lightning that had landed
    // the day before, had every selling field at 0, no JSON-LD offer, and
    // msrp 36560 with wholesalePrice 40038 (a "sticker" below the dealer's
    // own wholesale figure); the page printed "Please Call". We published
    // $36,560 as its price, and seven more used cars on seven rooftops sat on
    // the same rung that day. A book value nobody advertises is not a price
    // this site can stand behind, so a used car with nothing advertised
    // abstains: the car stays listed, the number is withheld.
    picked = ddcFields[0] ?? (msrp != null && isNew ? { price: msrp, provenance: DDC_MSRP } : null);
  }

  return picked != null && picked.price >= floor
    ? { priceUsd: picked.price, provenance: picked.provenance, ...(offPage ? { offPage } : {}) }
    : offPage
      ? { ...ABSTAIN_RESULT, offPage }
      : ABSTAIN_RESULT;
}

const ABSTAIN_RESULT = { priceUsd: PRICE_ABSTAIN, provenance: undefined };

// ── ON THE PAGE ─────────────────────────────────────────────────────────────
//
// dealer.com's tracking fields (internetPrice / salePrice / askingPrice) are
// the dealer's back-office numbers, and on a share of rooftops one of them is
// a figure the VDP never prints. The resolver's "a real discount sits below
// the sticker" branch took the lowest such field on trust, and so published a
// price no shopper can find on the dealer's page — always LOWER than the page,
// the false-bargain direction. Read off live rooftops on 2026-11-19, each one
// opened in a browser and its rendered text searched for both numbers:
//
//   stevinsonhyundai.com  Elantra   page "Stevinson Price $23,723"   stored 23,473
//   bmwofdenverdowntown   330i      page "MSRP $58,665"              stored 54,552
//   tadgcars.com          Carnival  page "MSRP $53,860"              stored 50,656
//   mastrovito…           Elantra   page "Total Price $28,990"       stored 26,990
//   longbeachbmw.com      550e      page "Total Transparent $88,520" stored 83,932
//   westonvolvocars.com   XC60      page "Final Price $58,653"       stored 51,436
//   youngkia.com          Sorento   page "Sale Price $37,975"        stored 35,225
//   toyotaofmckinney.com  4Runner   page "Advertised Price $47,708"  stored 46,983
//   ecodriveautomall.com  Enclave   page "$59,405 Price"             stored 57,155
//
// Nine of nine: the stored number appears nowhere in the page's text. Over
// 18 rooftops sampled for carrying these tags (6,193 new cars, whole lots, so
// far above the site-wide share) the rule below moves 1,664 prices: 1,387 up
// onto the page's figure by a median $2,500, and 277 down from "sticker plus
// a fee" to the sticker on a rooftop whose price row reads PLEASE_CALL. 223
// of 225 new cars moved at the BMW store and 217 of 379 at the Volvo store,
// where one gap was $7,217. Of 2,636 used cars, 6 moved, each onto a printed
// figure or an abstain. Some of these are probably real "unlock your e-price"
// figures. They are still not a price this site can stand behind: the dealer
// does not advertise them, and the house rule is asymmetric on bargains.
//
// So a tracking field may be the price only when the page shows it:
//
//   API lane   the record's own price ladder (`d.ladder`, pricing.dprice — the
//              rows the VDP renders) carries a row with that value, or the
//              value is the ladder's MSRP less its dealer-discount rows. The
//              second clause is the pre-fee price on rooftops whose only
//              printed total has the doc fee in it (kennykenttoyota.com: MSRP
//              $47,888 − "Kenny Kent Savings" $3,270 = internetPrice 44,618,
//              printed as "Price $44,868" after a $250 fee). A discount row
//              whose label names a rebate is left out of that sum, so the
//              derived figure is never net of manufacturer money. A used
//              car's ladder opens on a "Retail Value" row instead of an MSRP
//              and the same arithmetic holds (soundford.com, a 2024 i5:
//              Retail Value $54,999 − Sound Ford Discount $5,228 = 49,771,
//              printed as "Sale Price $49,971" after a $200 fee).
//   VDP HTML   (`d.pageText`, recheck) the number, formatted the way a page
//              prints one, is in the page's visible text. Applied only when
//              the page demonstrably server-renders prices — some candidate is
//              visible — so a client-rendered template changes nothing.
//   neither    no filter; the resolver behaves as it did.
//
// A rejected field is reported as `offPage` on the result. The crawl ignores
// it. recheck-price.mjs uses it to stand down: a VDP that hides a number the
// feed carries is one whose price the ladder reader owns, and a second reader
// guessing at it is how a headline starts to flap (0103).
const dollarsText = (n) => Math.round(n).toLocaleString("en-US");

function shownOnPage(d) {
  const ladder = Array.isArray(d.ladder) ? d.ladder : null;
  if (ladder) {
    const values = new Set();
    let msrp;
    let retail;
    let dealerOff = 0;
    for (const row of ladder) {
      const v = ladderNum(row?.value);
      if (v == null) continue;
      values.add(v);
      if (row.typeClass === "msrp" && msrp == null) msrp = v;
      if (row.typeClass === "retailValue" && retail == null) retail = v;
      const dealerRule = row.typeClass === "ABCRule" || row.typeClass === "AsubBRule";
      if (row.type === "-" && dealerRule && !INCENTIVE_WORDS.test(stripTags(row.label))) dealerOff += v;
    }
    if (!values.size) return null; // a ladder of PLEASE_CALL rows shows nothing to test against
    // The ladder's opening figure: the sticker on a new car, the "Retail Value"
    // / "KBB Price" row a used car's discount is printed against.
    const anchor = msrp ?? retail;
    if (anchor != null && dealerOff > 0) values.add(anchor - dealerOff);
    return (price) => values.has(price);
  }
  if (typeof d.pageText === "string" && d.pageText) {
    const has = (v) => {
      const n = num(v);
      return n != null && d.pageText.includes(dollarsText(n));
    };
    const rendersPrices = [d.msrp, d.retailValue, d.internetPrice, d.salePrice, d.askingPrice].some(has);
    return rendersPrices ? (price) => has(price) : null;
  }
  return null;
}

// ── Is the resolved price before manufacturer incentives? ───────────────────
//
// The inventory API (dealercom-api.mjs) carries the VDP's whole price ladder as
// `pricing.dprice`, one typed row per line, and the row the platform flags
// isFinalPrice is the number the resolver's `jsonld` leg reads. Read off 8
// rooftops on 2026-11-18 (636 new EVs; every shape below seen live):
//
//   MIDDLE/msrp "MSRP"                       the sticker
//   MIDDLE/totalFees, documentFee, wholesalePrice, retailValue, salePrice
//                                            reference lines, nothing subtracted
//   -/ABCRule, -/AsubBRule  (isDiscount)     the DEALER's pricing rules: "Dealer
//                                            Discount", "Walnut Creek Ford
//                                            Discount", "Savings", "Dealer Savings"
//   +/ABCRule                                dealer add-ons: "Market Adjustment",
//                                            "Ceramic Tint"
//   TOTAL/<askingPrice|priceAfterFees|internetPrice|msrp>
//                                            the dealer's price — "Total Price",
//                                            "Stevinson Price", "Selling Price"
//   SICI/SICRule "Offers"                    incentives SUBTRACTED from the total
//   SIF/SIFRule  "Net Price" / "<Dealer> Price"
//                                            total minus the SICI rows
//   SICCI/SICCRule "Conditional Offers"      listed AFTER the final price and not
//                                            subtracted from it
//
// walnutcreekford.com, a 2026 Mach-E: MSRP $55,840 + fees $122 − Walnut Creek
// Ford Discount $1,050 = Total Price $54,912; four "Offers" rows ($1,500,
// $500, $2,000, $500) take it to Net Price $50,412, flagged isFinalPrice. That
// $50,412 is what the resolver stores — Ford's $4,500 retail stack is in it —
// and it is exactly the mixture the 2026-11-18 study could not compare.
//
// So, for a price the resolver took from the final row:
//   - final row is SIF (net of SICI rows with a value)          → false;
//   - final row is a TOTAL/msrp row with no SICI row above it,
//     every row above it of a class listed here, and no dealer-rule
//     row whose label names a rebate or incentive              → true;
//   - anything else (a final row whose value is not the stored
//     price, an unknown row class, a SICI row above a non-SIF
//     final, a "documentFee" final row)                          → absent.
// The label check is belt and braces: no ABCRule row in the sample was
// labelled as manufacturer money, but a rooftop that folds Ford's rebates into
// its own "Savings" rule would make `true` false, and a word is all there is
// to catch it with.
const LADDER_BEFORE = new Set([
  "msrp", "totalFees", "documentFee", "wholesalePrice", "retailValue",
  "salePrice", "askingPrice", "internetPrice", "priceAfterFees", "ABCRule", "AsubBRule",
]);
const LADDER_TOTAL = new Set(["askingPrice", "priceAfterFees", "internetPrice", "msrp", "salePrice"]);
const INCENTIVE_WORDS = /rebate|incentive|bonus|cash|manufacturer|factory|\boem\b|conquest|loyalty|lease|financ|apr\b|offer/i;
const ladderNum = (v) => {
  const n = Number(String(v ?? "").replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : undefined;
};
const stripTags = (s) => String(s ?? "").replace(/<[^>]*>/g, " ");
const isIncluded = (row) => row?.type === "SICI" || row?.typeClass === "SICRule";

export function ddcLadderBasis(ladder, priceUsd) {
  if (!Array.isArray(ladder) || !(priceUsd > 0)) return undefined;
  const finalAt = ladder.findIndex((r) => r?.isFinalPrice);
  if (finalAt < 0) return undefined;
  const final = ladder[finalAt];
  if (ladderNum(final.value) !== priceUsd) return undefined;
  const above = ladder.slice(0, finalAt);
  const included = above.filter(isIncluded);
  if (final.type === "SIF" || final.typeClass === "SIFRule") {
    return included.some((r) => ladderNum(r.value) != null) ? false : undefined;
  }
  if (included.length) return undefined;
  if (!(final.type === "TOTAL" || final.typeClass === "msrp") || !LADDER_TOTAL.has(final.typeClass)) return undefined;
  for (const r of above) {
    if (!LADDER_BEFORE.has(r?.typeClass)) return undefined;
    if ((r.typeClass === "ABCRule" || r.typeClass === "AsubBRule") && INCENTIVE_WORDS.test(stripTags(r.label))) return undefined;
  }
  return true;
}

/** The car's sticker and the incentive basis of the resolved price, for a car
 *  dealer.com's own MACHINE condition calls new: the API record's `type`
 *  (dealercom-api.mjs passes it as `machineCondition`), or the data layer's
 *  `newOrUsed` on the HTML path. Never the storefront's display string, and
 *  never a used car — on a used car `msrp` is the dealer's book value. */
export function ddcSticker(d, resolved) {
  const machine = "machineCondition" in d ? d.machineCondition : conditionToken(d.newOrUsed);
  if (machine !== "new") return {};
  const msrpUsd = stickerDollars(d.msrp);
  if (msrpUsd == null) return {};
  let flag;
  if (resolved.priceUsd > 0) {
    if (resolved.provenance === DDC_MSRP) flag = true;
    else if (resolved.provenance === JSONLD) flag = ddcLadderBasis(d.ladder, resolved.priceUsd);
  }
  return stickerRecord({ msrpUsd, priceBeforeIncentives: flag, priceUsd: resolved.priceUsd });
}

// Merge DDC fields into a normalized record (DDC wins where present — it's
// the platform's own structured data, richer than the JSON-LD summary).
// String fields go through text(): DDC serializes missing values as literal
// placeholder strings ("null", "N/A", "-"), which must not beat the JSON-LD
// value or render.
export function enrichFromDdc(rec, ddcVehicle) {
  if (!ddcVehicle || ddcVehicle.vin?.toUpperCase() !== rec.vin) return rec;
  const d = ddcVehicle;
  const resolved = resolveDdcPriceTagged(rec, d);
  return {
    ...rec,
    mileage: num(d.odometer) ?? rec.mileage,
    trim: text(d.trim) ?? rec.trim,
    driveLine: ["FWD", "RWD", "AWD", "4WD"].includes(d.driveLine) ? d.driveLine : undefined,
    exteriorColor: text(d.exteriorColor) ?? rec.exteriorColor,
    interiorColor: text(d.interiorColor),
    // The advertised price a human reads off the VDP — see resolveDdcPrice.
    // 0 means "abstain": we could not name the price from the served fields.
    priceUsd: resolved.priceUsd,
    // …and which field that number came from. This OVERWRITES the JSONLD tag
    // normalize() set from the offer node: on a dealer.com row the offer price
    // is only the resolver's jsonld candidate, and the resolver may well have
    // taken a DDC field over it. An abstain clears the tag with it.
    priceProvenance: resolved.provenance,
    // The sticker and the incentive basis beside the price (ddcSticker above;
    // lib/sticker.mjs for the rules). Cleared first: the resolve above may have
    // replaced the number an earlier reading was judged on.
    msrpUsd: undefined,
    priceBeforeIncentives: undefined,
    priceBeforeIncentivesUsd: undefined,
    ...ddcSticker(d, resolved),
    optionCodes: Array.isArray(d.optionCodes) && d.optionCodes.length ? d.optionCodes : undefined,
    certified: d.certified === "true" || d.certified === true || undefined,
    stockNumber: text(d.stockNumber),
    city: text(d.address?.city) ?? rec.city,
    state: text(d.address?.state) ?? rec.state,
    zip: text(d.address?.postalCode) ?? rec.zip,
    // On group sites the accountName is the actual rooftop (e.g. "Hendrick
    // Kia of Cary"), which beats attributing every car to the group domain.
    dealerName: text(d.accountName) ?? rec.dealerName,
    condition: text(d.newOrUsed) ?? rec.condition,
    platform: "dealer.com",
  };
}
