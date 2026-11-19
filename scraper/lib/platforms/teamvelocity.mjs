// Team Velocity platform (teamvelocityportal.com).
//
// PRIMARY PATH is the platform's own open inventory API — one call returns a
// rooftop's whole lot as JSON, so the per-VDP HTML scraping below is now the
// fallback for a page we happen to have in hand. Every Team Velocity page
// carries the rooftop's ids inline (`var accountId = '71000'; var campaignId =
// '7226';`), and
//   GET websites.api.teamvelocityportal.com/tvm-services/inventory/vehicles
//        ?AccountID=&CampaignId=&Type=All&Limit=
// answers a plain browser-UA GET (no auth, no token) with vin, year/make/model/
// trim, miles, sellingPrice, the declared fuel, condition and the VDP url. It
// also lives on the Team Velocity host, so it clears the Akamai wall that 403s
// some dealer front-ends. See lib/platforms/overfuel.mjs for the same shape.
//
// Type=All, not Type=Used: the call was hard-coded to Type=Used, which made
// every new-inventory car at every Team Velocity rooftop invisible — caught
// 2026-08-20 on vwofoakland.com, whose site shows 4 new ID. Buzz that the
// crawl never saw. Probed live: Type=Used and Type=New each return only their
// own condition, but Type=All pages New and Used together (verified against
// vwofoakland.com: 96 used + 125 new = 221, matching a Type=All walk exactly,
// with a page short of Limit still correctly ending it). No server-side fuel
// filter is added here — same house rule as dealercom-api.mjs and
// dealeron-api.mjs: pull the whole lot and let classifyEv decide downstream,
// because a server-side EV filter was tried once and false-delisted real cars.
//
// EV signal (verified against live lots, do not simplify): `isElectric` means
// "plugs in", NOT battery-electric — on truwestcdjr its three isElectric cars
// are Jeep 4xe PHEVs with fuel_Type "Hybrid Fuel". And `isElectric` UNDER-counts
// BEVs: a Dublin BMW i4 carried isElectric=false with fuel_Type "Electric Fuel
// System". So fuel_Type is the reliable marker: /electric/ → BEV; isElectric +
// /hybrid/ → PHEV. We hand classifyEv a fuelType string built from those and let
// it make the call, exactly as every other lane does.
//
// PRICE: `sellingPrice` is a SNAPSHOT, `yourPrice` is the live asking price.
// This lane published stale prices until 2026-09-01, always low, which is the
// false-bargain direction the house rule is asymmetric about. Caught on
// parkwayfamilykia.com VIN 1FT6W1EV7PWG15378: we printed $39,784 and
// "$7,901 below similar listings" on a truck the dealer lists at $42,339.
//
// The record carries both numbers. The per-VIN endpoint the VDP itself calls
// (/api/Inventory/vehicle?source=websites&vin=&accountid=) shows the two
// layers plainly: the vehicle record holds sellingPrice = msrp =
// internet_Price = 39784, while the offer layer holds payments[].retail =
// purchasePrice = buyFors[].buyForPrice = 42339 and a top-level finalPrice of
// 42564. The platform's own name for the asking price is `retail`; in this
// bulk API that is `yourPrice`, and `yourPriceSort` is the fees-inclusive
// finalPrice.
//
// `sellingPrice` is a snapshot written at feed import that then goes stale —
// MEASURED, not assumed. Divergence tracks days in stock, and fresh cars agree
// exactly (used cars, 1,037 rows across 11 rooftops):
//   0-7d: 0 of 220 divergent (0.0%) | 8-30d: 2.5% | 31-90d: 3.6% | 90d+: 4.4%
// 0 of 220 on fresh inventory is the control. That rules out a pricing-rules
// markup (which would apply from day one, not accumulate with age) and a
// separate syndication-channel price (which would not track days in stock).
// The dealer's own Facebook and GA4 pixels do fire the stale number, but both
// read the same vehicle record, so they are not independent evidence.
//
// USED cars therefore take `yourPrice`. Verified against what the VDP actually
// renders, 5 of 5, in BOTH directions — do not "simplify" this to a max():
//   parkwayfamilykia F-150 Lightning  selling 39,784 → renders 42,339
//   parkwayfamilykia Telluride        selling 31,269 → renders 34,843
//   parkwayfamilykia Odyssey          selling 35,485 → renders 35,750
//   livermoreford    Patriot          selling  6,900 → renders  8,500
//   livermoreford    Explorer demo    selling 45,420 → renders 43,920  ← LOWER
// That last one is why the rule is "use yourPrice", not "use the higher one":
// yourPrice is the live figure whichever way it moved, and 45,420 appears
// nowhere on that page.
//
// NEW cars take `max(sellingPrice, yourPrice)`, and the asymmetry with the used
// rule above is deliberate — do NOT unify them. Two mechanisms move these
// fields, and they move them in different directions:
//
//   - Rebates pull `yourPrice` DOWN. Of divergent new rows with a non-zero
//     `cashRebates`, 70.3% (187 of 266) have sellingPrice - yourPrice equal to
//     cashRebates to the dollar (cityworldhyundai Elantra 23,585 - 21,585 =
//     2,000; dallasdodge Compass 29,777 - 27,277 = 2,500). Mirror control: 0 of
//     26 divergent USED rows carry any rebate. That money is conditional, so
//     publishing the rebated figure would invent a bargain a shopper may not
//     get — when yourPrice is lower, keep sellingPrice.
//   - The same import staleness as the used lane pushes `yourPrice` UP. When
//     yourPrice is higher, the record is stale and the live figure wins.
//
// max() is therefore the semantics, not a hedge: rebates only ever subtract, so
// the higher of the two is the pre-rebate live price either way. Measured on 78
// divergent new cars across 120 rooftops (docs/tools/tv-newcar-price-sweep.mjs)
// against the stack's own bottom line — `sellingPrice` alone published BELOW
// what the shopper pays on 12 of them, median $1,050 short and worst $2,931
// (markleyhonda 36,100 against a real 37,199). max() takes that to 0 of 78
// while leaving the 66 conservative pre-rebate reads untouched. Plain
// `yourPrice` was measured too and still shorts 3.
//
// For USED cars max() would be WRONG, which is the trap here: with no rebates
// in play a lower yourPrice is a genuine price cut to follow down, not a rebate
// to ignore. livermoreford's Explorer demo is that case (see above).
//
// One more thing the sweep settled: on a new car `payments[].retail` is the
// MSRP top line, NOT the asking price. The stack runs retail → dealer discount
// → rebates → total, so a sellingPrice below retail is expected and correct,
// and 4 rows even carry a purchasePrice ABOVE retail because the record went
// stale. Do not "fix" new cars toward retail. Some rooftops also gate the real
// number behind a form (markleyhonda's new-car inventorysetup returns
// enableOverleyOnVDP:true, priceDiscount:50, specialFieldValue "Below
// Invoice"); 4 such cars were in the sample and none needed special handling,
// but a rooftop that publishes no price at all should abstain, not guess.
//
// Never use `yourPriceSort` or the page's JSON-LD offer: both bake in the doc
// fee (42,339 + 225 = 42,564). Our convention is the pre-fee asking price.
import { readFileSync } from "node:fs";
import { classifyEv } from "../ev.mjs";
import { politeGetJson } from "../http.mjs";
import { TV_PRE_REBATE, TV_RETAIL, TV_SELLING } from "../price-provenance.mjs";
import { text } from "../normalize.mjs";
import { stickerDollars, withSticker } from "../sticker.mjs";

const API = "https://websites.api.teamvelocityportal.com/tvm-services/inventory/vehicles";
const API_LIMIT = 200;
const API_MAX_PAGES = 30; // runaway guard; a page < limit ends the walk
const TV_VIN_RE = /^[A-HJ-NPR-Z0-9]{17}$/;
const posNum = (v) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : undefined;
};

// WALLED ROOFTOPS: IDS THE PAGE CANNOT GIVE US
//
// Seventeen Team Velocity rooftops answer our fetcher with an Akamai "Access
// Denied" on every path, robots.txt included (georgehartenissan.com,
// volvocarsfredericksburg.com, planetchryslerjeepdodge.net …). The API host
// above is not behind that wall — it answered 590 cars for George Harte
// Nissan's account with a plain GET on 2026-09-02, no robots file on the
// host (404) — so the only thing the wall costs us is the two ids that the
// homepage would have carried. registry/team-velocity-ids.json carries them
// instead, read once from the rooftop's own page in a browser and pinned by
// date. The crawl never asks the walled host for anything; it asks the API,
// exactly as it does for every other Team Velocity rooftop.
//
// This is recorded as a judgment call, not a rule. The house line is "no
// challenge-solving, no reaching around a Disallow": a 403 on robots.txt is
// not a Disallow (lib/http.mjs treats an unreadable robots as no rules, as
// RFC 9309 does), and the API host publishes none. What was measured before
// building it (2026-09-02, 15 accounts): 183 EVs, 94 VINs not yet in the
// database, 40 of those with a VDP the lane keeps, 31 of them on the crawled
// domain — the rest are group cars that already reach us through the
// group's other rooftops (hartehyundai.com holds George Harte Nissan's
// Ariyas), which is the same group-account behaviour the crawl block below
// already handles.
const REGISTRY_IDS = new URL("../../registry/team-velocity-ids.json", import.meta.url);
let registryIdsCache;
function registryIds() {
  if (registryIdsCache) return registryIdsCache;
  try {
    registryIdsCache = JSON.parse(readFileSync(REGISTRY_IDS, "utf8"));
  } catch {
    registryIdsCache = {};
  }
  return registryIdsCache;
}

// Ids pinned for a domain in registry/team-velocity-ids.json, or null. Both
// ids must be plain digit strings: the API builds a URL out of them.
export function teamVelocityRegistryIds(domain, table = registryIds()) {
  const row = table?.[String(domain ?? "").toLowerCase().replace(/^www\./, "")];
  return validIds(row);
}

// The page's own ids win when the page answered; the registry's are for the
// rooftop whose page never will. Null when neither has both.
export function pickTeamVelocityIds(html, domain, table) {
  return teamVelocityApiIds(html) ?? teamVelocityRegistryIds(domain, table);
}

function validIds(row) {
  const accountId = String(row?.accountId ?? "");
  const campaignId = String(row?.campaignId ?? "");
  if (!/^\d+$/.test(accountId) || !/^\d+$/.test(campaignId)) return null;
  return { accountId, campaignId };
}

// The rooftop's ids, read from any Team Velocity page's inline globals.
export function teamVelocityApiIds(html) {
  if (typeof html !== "string") return null;
  const accountId = html.match(/\baccountId\s*=\s*['"](\d+)['"]/)?.[1];
  const campaignId = html.match(/\bcampaignId\s*=\s*['"](\d+)['"]/)?.[1];
  if (!accountId || !campaignId) return null;
  return { accountId, campaignId };
}

// The declared fuel, mapped so classifyEv reads it: fuel_Type names the BEVs
// ("Electric Fuel System"); a plug-in shows up as isElectric with a hybrid
// fuel_Type. Anything else is left as-is (classifyEv returns not-EV).
function fuelTypeFor(r) {
  const f = String(r.fuel_Type ?? "");
  if (/electric/i.test(f)) return "Electric";
  if (r.isElectric && /hybrid/i.test(f)) return "Plug-in Hybrid Electric";
  return f || undefined;
}

// Used: the live `yourPrice` wins outright, in both directions.
// New: then raised to the record's own pre-rebate figure where the fields
// turn out to be net of rebates — see PRE-REBATE below.
// New: the HIGHER of the two, because a lower yourPrice there is a conditional
// rebate rather than a price cut. See the PRICE note up top — the asymmetry is
// the measured part, not an oversight.
// `internetPrice` is never read: it is 0 on real cars, and where it is non-zero
// it just mirrors the stale sellingPrice.
function teamVelocityPrice(r) {
  const read = fieldPrice(r);
  const isNew = String(r?.type ?? "").toLowerCase() === "new";
  if (!isNew || read.price == null) return read;
  const before = preRebatePrice(r);
  return before != null && before > read.price ? { price: before, provenance: TV_PRE_REBATE } : read;
}

function fieldPrice(r) {
  const snapshot = posNum(r?.sellingPrice);
  const live = posNum(r?.yourPrice) ?? posNum(r?.purchasePrice);
  const isNew = String(r?.type ?? "").toLowerCase() === "new";
  if (snapshot == null) return { price: live, provenance: live != null ? TV_RETAIL : TV_SELLING };
  if (live == null) return { price: snapshot, provenance: TV_SELLING };
  if (isNew && live <= snapshot) return { price: snapshot, provenance: TV_SELLING };
  return { price: live, provenance: TV_RETAIL };
}

// PRE-REBATE. The rule above rests on "the higher of sellingPrice and
// yourPrice is the pre-rebate price", and on a share of rooftops it is not:
// BOTH fields already have the manufacturer's rebates taken out. Measured on
// 25 rooftops on 2026-11-19 (8,596 priced new cars, whole lots): 1,138 cars,
// 13%, were published net of rebates — 362 of 869 at parkwayfamilykia.com, 181
// of 428 at timdahlebountiful.com, 179 of 362 at tempekia.com — by a median
// $1,500 and as much as $13,500 (mckennacars.com, a 2026 ID.4: msrp 47,932,
// sellingPrice = yourPrice = 27,932, dealerDiscountedPrice 41,432,
// cashRebates 13,500). Next to the same model at a rooftop whose fields are
// pre-rebate, that reads as a bargain the dealer is not offering.
//
// The pages show what the money is. tempekia.com, a 2026 Niro: "MSRP $28,930 /
// Tempe Discount −$2,604 / Kia Customer Cash −$2,000 / Doc Fee +$599 / Paint
// Protection & Tint +$995 / Tempe Price $25,920". fowlerkialongmont.com, a
// Sorento: "KFA Dealer Choice Program $2,750" — Kia's finance arm — inside the
// same headline. The rebate is in the dealer's own advertised figure, and
// whether a given shopper gets it is exactly what this file's header declines
// to assume.
//
// The record says what the price is without them. With a cash stack,
// finalPrice = msrp − dealer discount − rebates + fees, so
//
//   finalPrice − fees + rebates
//
// is MSRP less the dealer's own discount (tempekia: 25,920 − 1,594 + 2,000 =
// 26,326 = 28,930 − 2,604, the page's first two lines). Where the record also
// carries dealerDiscountedPrice, the two agreed on 1,171 of 1,171 cars. With
// no stack, the same figure is dealerDiscountedPrice itself, taken only when
// the stored number is exactly dealerDiscountedPrice − cashRebates (mckenna's
// 153). Never above the sticker plus the stack's own dealerMarkup: of the
// 1,138, none was.
//
// Only ever raises. A rooftop whose fields are already pre-rebate reads as it
// did, and so does every used car.
function preRebatePrice(r) {
  const msrp = posNum(r?.msrp);
  if (msrp == null) return undefined;
  const ds = r?.dynamicPriceStack?.cash;
  let before;
  let ceiling = msrp;
  if (ds && posNum(ds.finalPrice) != null) {
    const rebates = posNum(ds.rebates);
    const fees = Number(ds.fees);
    if (rebates == null || !Number.isFinite(fees) || fees < 0 || Number(ds.msrp) !== msrp) return undefined;
    before = Number(ds.finalPrice) - fees + rebates;
    ceiling += posNum(ds.dealerMarkup) ?? 0;
  } else if (!ds) {
    const rebates = posNum(r?.cashRebates);
    const discounted = posNum(r?.dealerDiscountedPrice);
    if (rebates == null || discounted == null) return undefined;
    if (fieldPrice(r).price !== discounted - rebates) return undefined;
    before = discounted;
  }
  return before != null && Number.isInteger(before) && before <= ceiling ? before : undefined;
}

// The VDP path every Team Velocity storefront serves, whatever the record's
// own vdpUrl field says. Verified live 2026-09-05 on four rooftops
// (gebhardtbmw, bmwofbrooklyn, oconnorvw, dahlsubarusheboygan) for used, new
// and certified cars: /viewdetails/Used/<VIN> and /viewdetails/New/<VIN> both
// render the car's real VDP, and the platform's own populated links are the
// same path with a slug and a ?type= suffix. It is also SAFE against a wrong
// host: a VIN the rooftop does not stock renders the search page, not a VDP
// (control-tested with a made-up VIN and with a car from another account's
// rooftop — both fell back to the SRP), so a synthesised link never invents a
// car page.
const viewDetailsUrl = (host, type, vin) =>
  `https://${host}/viewdetails/${String(type ?? "").toLowerCase() === "new" ? "New" : "Used"}/${vin}`;

// One API record → schema.org Vehicle node, shaped like the other producers.
// Exported for the classification and price tests.
//
// `hostByDealerId` supplies the rooftop host for a record whose own vdpUrl is
// empty. That is not an edge case: sampled over 40 working Team Velocity
// rooftops on 2026-09-05, 7,401 records carried 3,428 empty vdpUrl fields —
// 46% — and every one of those cars was dropped by crawl.mjs, which needs a
// per-VIN page. Seven of the 40 rooftops served an empty vdpUrl on EVERY
// record, so the whole lot vanished and the crawl still reported "complete":
// gebhardtbmw.com's 247-car BMW lot came back with 0 EVs admitted, its 2024 i5
// M60 included (the Autotrader miss that found this).
export function teamVelocityApiVehicle(r, hostByDealerId) {
  const vin = String(r?.vin ?? "").toUpperCase();
  if (!TV_VIN_RE.test(vin)) return null;
  let vdp = typeof r.vdpUrl === "string" && /^https?:\/\//.test(r.vdpUrl) ? r.vdpUrl : undefined;
  if (!vdp) {
    const host = hostByDealerId?.get(String(r?.dealerID ?? ""));
    if (host) vdp = viewDetailsUrl(host, r.type, vin);
  }
  const cond = String(r.type ?? "").toLowerCase();
  const { price, provenance } = teamVelocityPrice(r);
  const msrpUsd = cond === "new" ? stickerDollars(r.msrp) : undefined;
  const node = {
    "@type": "Vehicle",
    vehicleIdentificationNumber: vin,
    vehicleModelDate: r.year != null ? String(r.year) : undefined,
    brand: r.make || undefined,
    model: r.model || undefined,
    vehicleConfiguration: r.trim || undefined,
    name: [r.year, r.make, r.model, r.trim].filter(Boolean).join(" ") || undefined,
    mileageFromOdometer: posNum(r.miles) != null ? { "@type": "QuantitativeValue", value: Number(r.miles) } : undefined,
    color: r.exteriorColor || undefined,
    vehicleInteriorColor: r.interiorColor || undefined,
    driveWheelConfiguration: DRIVES.has(String(r.driveTrain ?? "").toUpperCase()) ? String(r.driveTrain).toUpperCase() : undefined,
    sku: r.stockNumber ? String(r.stockNumber) : undefined,
    image: typeof r.firstPhotoUrl === "string" && r.firstPhotoUrl ? [r.firstPhotoUrl] : undefined,
    itemCondition: cond === "new" ? "new" : "used",
    fuelType: fuelTypeFor(r),
    vehicleEngine: { "@type": "EngineSpecification", fuelType: fuelTypeFor(r) },
    offers: {
      "@type": "Offer",
      price,
      // Not the page's JSON-LD offer — this node is assembled from the API
      // record, so it names its own field (lib/price-provenance.mjs).
      priceProvenance: provenance,
      priceCurrency: "USD",
      url: vdp,
      seller: {
        "@type": "AutoDealer",
        name: r.dealerName || r.clientName || undefined,
        address: {
          "@type": "PostalAddress",
          addressLocality: r.addressCity || undefined,
          addressRegion: r.addressState || undefined,
          postalCode: r.addressZip || undefined,
        },
      },
    },
    // carried through for the caller's per-car rooftop attribution
    certified: r.certified === true || /certified|cpo/i.test(String(r.certifiedType ?? "")) || undefined,
    // The dealer's per-car Carfax Snapshot key, for carfax-snapshot.mjs. Not a
    // fact about the car; the lane turns it into one (lib/carfax-snapshot.mjs).
    carfaxSnapshotKey: typeof r.carFax_SNAPSHOT_KEY === "string" && r.carFax_SNAPSHOT_KEY ? r.carFax_SNAPSHOT_KEY : undefined,
  };
  return msrpUsd == null
    ? node
    : withSticker(node, { msrpUsd, priceBeforeIncentives: teamVelocityBasis(r, msrpUsd, price), forPrice: price });
}

// ── Sticker and incentive basis (lib/sticker.mjs) ───────────────────────────
//
// A NEW record (`type` "New", the machine field the node's itemCondition is
// built from) carries `msrp`, which agreed to the dollar with Kia's and
// Hyundai's own locator MSRP on all 77 co-listed VINs checked (ggkia.com,
// parkwayfamilykia.com, hyundaiofsanbruno.com; 2026-11-18). Whether the stored
// price has rebates in it is a per-rooftop answer: `sellingPrice` is MSRP on
// some rooftops and MSRP − dealer discount − cash rebates on others
// (parkwayfamilykia.com, a 2027 EV3: msrp 36,485, sellingPrice 33,416 =
// 36,485 − 1,569 − 1,500 rebate). Most records carry the platform's own cash
// stack, `dynamicPriceStack.cash` = {msrp, discount, rebates, fees,
// finalPrice} with finalPrice = msrp − discount − rebates + fees, and that is
// what tells the two apart:
//   stored = finalPrice − fees + rebates, rebates > 0      → before (true)
//   stored = finalPrice − fees,           rebates > 0      → net of them (false)
//   stored = finalPrice − fees, no rebate on any field      → true
//   no stack: stored = dealerDiscountedPrice − cashRebates  → false
// and nothing else is claimed. volvocarssandiego.com, a 2026 EX30: msrp 49,945,
// stack discount 3,122 / rebates 1,500 / fees 122 / finalPrice 45,567, stored
// sellingPrice 46,945 = 45,567 − 122 + 1,500 → true.
const money = (v) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
};
export function teamVelocityBasis(r, msrpUsd, priceUsd) {
  if (!(priceUsd > 0) || !(msrpUsd > 0)) return undefined;
  if (priceUsd === msrpUsd) return true;
  const ds = r?.dynamicPriceStack?.cash;
  const fin = money(ds?.finalPrice);
  const fees = money(ds?.fees);
  const reb = money(ds?.rebates);
  if (ds && money(ds.msrp) === msrpUsd && fin > 0 && fees != null && reb != null) {
    const net = fin - fees;
    if (reb > 0) {
      if (priceUsd === net + reb) return true;
      if (priceUsd === net) return false;
      return undefined;
    }
    const anyRebate = [r.cashRebates, r.buyForRebate, r.dynamicPriceStack?.finance?.cashRebates, r.dynamicPriceStack?.lease?.cashRebates]
      .some((v) => money(v) > 0);
    return !anyRebate && priceUsd === net ? true : undefined;
  }
  const cr = money(r?.cashRebates);
  const ddp = money(r?.dealerDiscountedPrice);
  if (cr > 0 && ddp > 0 && priceUsd === ddp - cr) return false;
  return undefined;
}

const apiUrl = (ids, page) =>
  `${API}?AccountID=${ids.accountId}&CampaignId=${ids.campaignId}&Type=All&Limit=${API_LIMIT}&Page=${page}`;

// Page a rooftop's whole lot (new + used + CPO) to completion, returning
// schema.org nodes. `complete` is true only when a short page ends the walk
// (offset-vs-total is not trusted; the endpoint has no reliable total on this
// call). A partial pull leaves complete=false so the caller never certifies a
// crawl it didn't finish.
//
// `origin` is the rooftop the crawl asked about. It is only ever used to fill
// in the host for records with an empty vdpUrl, and only when the whole pull
// carries a single dealerID — one dealerID is one rooftop (verified on
// chulavistaford.com, whose account 30074 spans three: dealerID 30074 →
// chulavistaford.com, 44185 → cvhonda.com, 60962 → chulavistakia.com, each
// record's own link agreeing with its id). Records that DO carry a link teach
// the map first, so a group account attributes from its own data and never
// from the crawled host.
export async function pullTeamVelocityApi(ids, { origin } = {}) {
  const raw = [];
  let ok = false;
  let reachedEnd = false;
  for (let page = 1; page <= API_MAX_PAGES; page++) {
    const { status, json } = await politeGetJson(apiUrl(ids, page));
    const cars = json?.inventoryVehicles;
    if (status !== 200 || !Array.isArray(cars)) break;
    ok = true;
    for (const r of cars) raw.push(r);
    if (cars.length < API_LIMIT) {
      reachedEnd = true;
      break;
    }
  }
  const hostByDealerId = dealerHosts(raw, origin, ids.accountId);
  const out = [];
  for (const r of raw) {
    const node = teamVelocityApiVehicle(r, hostByDealerId);
    if (node) out.push(node);
  }
  return { vehicles: out, complete: ok && reachedEnd, found: out.length, ok };
}

// dealerID → rooftop host, learned from the records that carry a real link.
// The crawled origin is the fallback for two cases only: a pull with a single
// dealerID, and — in a group pull — the dealerID that IS the account the
// crawled page named.
//
// The second case is tetontoyota.com (2026-10-06). Its account 36280 holds two
// dealerIDs — 36280 (Teton Toyota, 469 cars) and 73614 (Teton Auto Credit, 25)
// — and not one of the 494 records carried a vdpUrl, so nothing taught the map
// and the single-dealerID fallback could not fire: every car, a used 2023
// F-150 Lightning among 25 plug-ins, was dropped as unlinked every night while
// the registry row read "working". The account's own dealerID is the rooftop
// whose page we read: tetonautocredit.com's own page names account 73614,
// which is exactly the other dealerID. Control-tested over 112 sampled working
// Team Velocity rooftops by the records' own location fields (not their link
// host, which is often a group site): in all 81 with a registry ZIP, the
// account's own dealerID was that store — 77 on the same ZIP, 4 the same
// named store on a neighbouring one. Sister dealerIDs still never borrow the
// origin; the guardrail below stands, because tetontoyota.com's /viewdetails
// path renders Teton Auto Credit's cars too (checked live, same day).
export function dealerHosts(records, origin, accountId) {
  const map = new Map();
  const ids = new Set();
  for (const r of records) {
    const id = String(r?.dealerID ?? "");
    ids.add(id);
    if (map.has(id)) continue;
    if (typeof r?.vdpUrl !== "string" || !/^https?:\/\//.test(r.vdpUrl)) continue;
    try {
      map.set(id, new URL(r.vdpUrl).host);
    } catch {}
  }
  const own = ids.size === 1 ? [...ids][0] : accountId != null && ids.has(String(accountId)) ? String(accountId) : null;
  if (own != null && origin && !map.has(own)) {
    try {
      map.set(own, new URL(origin).host);
    } catch {}
  }
  return map;
}

// Cheap probe liveness: one request, does this rooftop hold VIN'd inventory?
export async function countTeamVelocityApi(ids) {
  const { status, json } = await politeGetJson(apiUrl(ids, 1));
  const cars = json?.inventoryVehicles;
  if (status !== 200 || !Array.isArray(cars)) return { ok: false, found: 0, hasVin: false };
  return { ok: true, found: cars.length, hasVin: cars.some((r) => TV_VIN_RE.test(String(r?.vin ?? "").toUpperCase())) };
}

function grabVar(html, name) {
  const m = html.match(new RegExp(`var\\s+${name}\\s*=\\s*["']([^"']*)["']`));
  // text() also drops placeholder literals ("null", "N/A", "-") the
  // server renders into these vars when a field is missing.
  return m ? text(m[1]) : undefined;
}

export function extractTeamVelocity(html) {
  const vin = grabVar(html, "vin");
  if (!vin) return null;
  // `miles` is server-rendered as a ternary literal — new-inventory pages
  // read '0', everything else carries the real odometer figure as the
  // else-branch, e.g. var miles = 'cpo' ==='new' ? '0':'23584';
  const milesMatch = html.match(
    /var\s+miles\s*=\s*['"]([^'"]*)['"]\s*===\s*['"]new['"]\s*\?\s*['"]0['"]\s*:\s*['"](\d+)['"]/
  );
  const mileage = milesMatch
    ? milesMatch[1] === "new"
      ? 0
      : Number(milesMatch[2])
    : undefined;
  return {
    vin: vin.toUpperCase(),
    stockNumber: grabVar(html, "stockNumber"),
    trim: grabVar(html, "trim"),
    driveTrain: grabVar(html, "driveTrain"),
    vehicleType: grabVar(html, "vehicleType"), // "new" | "used" | "cpo"
    exteriorColor: grabVar(html, "vdpVehicleExteriorColor"),
    interiorColor: grabVar(html, "vdpVehicleInteriorColor"),
    mileage,
    dealer: {
      name: grabVar(html, "clientName"),
      city: grabVar(html, "city"),
      state: grabVar(html, "state"),
      zip: grabVar(html, "zip"),
    },
  };
}

const DRIVES = new Set(["FWD", "RWD", "AWD", "4WD"]);

// Merge Team Velocity fields into a normalized record. Mileage passes through
// verbatim including 0 for new inventory (same standing as dealeron.mjs: the
// dealer's own page shows "Mileage: 0" to shoppers on these cars).
export function enrichFromTeamVelocity(rec, data) {
  if (!data || data.vin !== rec.vin) return rec;
  return {
    ...rec,
    mileage: data.mileage ?? rec.mileage,
    trim: data.trim ?? rec.trim,
    driveLine: DRIVES.has(data.driveTrain) ? data.driveTrain : rec.driveLine,
    exteriorColor: data.exteriorColor ?? rec.exteriorColor,
    interiorColor: data.interiorColor ?? rec.interiorColor,
    certified: data.vehicleType === "cpo" || undefined,
    stockNumber: data.stockNumber ?? rec.stockNumber,
    city: data.dealer.city ?? rec.city,
    state: data.dealer.state ?? rec.state,
    zip: data.dealer.zip ?? rec.zip,
    dealerName: data.dealer.name ?? rec.dealerName,
    platform: "team-velocity",
  };
}
