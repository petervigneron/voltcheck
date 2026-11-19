// The new-car sticker (msrpUsd) and incentive basis (priceBeforeIncentives)
// each lane reads beside its price — lib/sticker.mjs for the rules. Fixtures
// in fixtures/sticker-lanes.json are real responses read on 2026-11-18,
// trimmed to the fields the lanes touch.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  STICKER,
  checkSticker,
  stickerBucketOn,
  stickerDollars,
  stickerFields,
  withSticker,
} from "../lib/sticker.mjs";
import { normalize } from "../lib/normalize.mjs";
import { mapRecord } from "../lib/platforms/dealercom-api.mjs";
import { enrichFromDdc, ddcLadderBasis } from "../lib/platforms/dealercom.mjs";
import { vehicleNode, deolLibraryBasis, libraryFields } from "../lib/platforms/dealeron-api.mjs";
import { teamVelocityApiVehicle } from "../lib/platforms/teamvelocity.mjs";
import { dealerInspireCardVehicle } from "../lib/platforms/dealerinspire.mjs";
import { toRecord as gmRecord, GM_BRANDS } from "../lib/oem/gm.mjs";
import { toRecord as kiaRecord } from "../lib/oem/kia.mjs";
import { toRecord as hyundaiRecord } from "../lib/oem/hyundai.mjs";
import { toRecord as bmwRecord } from "../lib/oem/bmw.mjs";

const F = JSON.parse(readFileSync(new URL("./fixtures/sticker-lanes.json", import.meta.url), "utf8"));
const pick = (r) => ({
  priceUsd: r.priceUsd,
  msrpUsd: r.msrpUsd,
  priceBeforeIncentives: r.priceBeforeIncentives,
  priceBeforeIncentivesUsd: r.priceBeforeIncentivesUsd,
});

// ── the guards ──────────────────────────────────────────────────────────────

test("stickerDollars: whole dollars only", () => {
  assert.equal(stickerDollars("$55,840"), 55840);
  assert.equal(stickerDollars("51332.0"), 51332);
  assert.equal(stickerDollars(77900), 77900);
  assert.equal(stickerDollars("PLEASE_CALL"), undefined);
  assert.equal(stickerDollars("36361.21"), undefined);
  assert.equal(stickerDollars(0), undefined);
  assert.equal(stickerDollars(""), undefined);
  assert.equal(stickerDollars(null), undefined);
});

test("checkSticker: new cars only, beside a real price", () => {
  const ok = { msrpUsd: 55840, priceUsd: 50412, condition: "new" };
  assert.equal(checkSticker(ok).fields.msrpUsd, 55840);
  assert.equal(checkSticker({ ...ok, condition: "used" }).reason, "not-new");
  assert.equal(checkSticker({ ...ok, condition: "certified" }).reason, "not-new");
  assert.equal(checkSticker({ ...ok, condition: undefined }).reason, "not-new");
  assert.equal(checkSticker({ ...ok, priceUsd: 0 }).reason, "no-price");
});

test("checkSticker: range and ratio bounds", () => {
  const at = (msrpUsd, priceUsd) => checkSticker({ msrpUsd, priceUsd, condition: "new" }).reason;
  assert.equal(at(14_999, 15_000), "msrp-out-of-range");
  assert.equal(at(1_000_001, 900_000), "msrp-out-of-range");
  // the one pair the 2026-11-18 sample withheld: a TV ID.4, $27,932 on $47,932
  assert.equal(at(47932, 27932), "price-msrp-ratio");
  assert.equal(at(50972, 30972), undefined); // its twin, 0.61, stands
  // buddychevy.com's $414,811 "sticker" on a $38,481 Lyriq
  assert.equal(at(414811, 38481), "price-msrp-ratio");
  assert.equal(at(45000, 60000), "price-msrp-ratio");
  assert.equal(at(45000, 58000), undefined);
  assert.equal(at("55840.50", 50000), "not-whole-dollars");
});

test("checkSticker: the flag stands only for the price it was judged on", () => {
  const r = { msrpUsd: 55840, priceUsd: 50412, condition: "new", priceBeforeIncentives: false, priceBeforeIncentivesUsd: 50412 };
  assert.deepEqual(checkSticker(r).fields, { msrpUsd: 55840, priceBeforeIncentives: false, priceBeforeIncentivesUsd: 50412 });
  // the floor (or a later enrich) moved the price: the flag goes, the sticker stays
  assert.deepEqual(checkSticker({ ...r, priceUsd: 54912 }).fields, { msrpUsd: 55840 });
  // price equal to the sticker: nothing taken off it, whatever the lane said nothing about
  assert.deepEqual(checkSticker({ msrpUsd: 55840, priceUsd: 55840, condition: "new" }).fields, {
    msrpUsd: 55840,
    priceBeforeIncentives: true,
    priceBeforeIncentivesUsd: 55840,
  });
  // …but a lane's explicit false is kept
  assert.equal(
    checkSticker({ msrpUsd: 55840, priceUsd: 55840, condition: "new", priceBeforeIncentives: false, priceBeforeIncentivesUsd: 55840 }).fields
      .priceBeforeIncentives,
    false
  );
});

test("the sticker cannot be planted by page JSON", () => {
  const fromPage = JSON.parse('{"vehicleIdentificationNumber":"3FMTK3R78TMA03282","offers":{"price":"50412","msrpUsd":99999},"msrpUsd":99999}');
  const rec = normalize(fromPage, { sourceUrl: "https://x", dealerDomain: "x" });
  assert.equal(rec.msrpUsd, undefined);
  assert.equal(rec.priceBeforeIncentives, undefined);
});

test("normalize keeps the flag only when it was judged on the price it read", () => {
  const node = { vehicleIdentificationNumber: "X", offers: { price: "41000" } };
  withSticker(node, { msrpUsd: 45000, priceBeforeIncentives: true, forPrice: 41000 });
  assert.deepEqual(stickerFields(node, 41000), { msrpUsd: 45000, priceBeforeIncentives: true, priceBeforeIncentivesUsd: 41000 });
  assert.deepEqual(stickerFields(node, 41500), { msrpUsd: 45000 });
  assert.ok(STICKER in node);
});

test("stickerBucketOn: off at 0, all at 16, stable per VIN", () => {
  assert.equal(stickerBucketOn("3FMTK3R78TMA03282", 0), false);
  assert.equal(stickerBucketOn("3FMTK3R78TMA03282", 16), true);
  const a = stickerBucketOn("3FMTK3R78TMA03282", 8);
  assert.equal(stickerBucketOn("3fmtk3r78tma03282", 8), a);
  let on = 0;
  for (let i = 0; i < 4000; i++) if (stickerBucketOn(`5YJ3E1EA${String(i).padStart(9, "0")}`, 4)) on++;
  assert.ok(on > 800 && on < 1200, `about a quarter on, got ${on}`);
});

// ── dealer.com ──────────────────────────────────────────────────────────────

const ddc = (r) => {
  const m = mapRecord(r, {}, "https://www.example.com");
  return enrichFromDdc(normalize(m.node, { sourceUrl: "https://www.example.com", dealerDomain: "example.com" }), m.ddc);
};

test("dealer.com: a Net Price after 'Offers' rows is net of incentives (walnutcreekford Mach-E)", () => {
  assert.deepEqual(pick(ddc(F.ddcSif)), { priceUsd: 50412, msrpUsd: 55840, priceBeforeIncentives: false, priceBeforeIncentivesUsd: 50412 });
});

test("dealer.com: a TOTAL row above only dealer rules is before incentives (Market Adjustment)", () => {
  assert.deepEqual(pick(ddc(F.ddcMarkup)), { priceUsd: 230982, msrpUsd: 215860, priceBeforeIncentives: true, priceBeforeIncentivesUsd: 230982 });
});

// Until 2026-11-19 this car resolved to trackingPricing.internetPrice, 45,954 —
// a figure the page prints nowhere — and so carried no flag. The resolver now
// refuses an off-page field (dealercom.mjs "ON THE PAGE") and the price is the
// ladder's final row, "Stevinson Price" — which askingPrice also carries, and
// being $21 under the sticker it is that field the resolver names.
test("dealer.com: a trackingPricing field off the ladder is not the price; the final row is", () => {
  const r = ddc(F.ddcInternet);
  assert.equal(r.priceUsd, 46204);
  assert.equal(r.priceProvenance, "ddc-asking");
  assert.equal(r.msrpUsd, 46225);
});

test("dealer.com: a used car's msrp is book value and is never stored", () => {
  const r = ddc(F.ddcUsed);
  assert.equal(r.msrpUsd, undefined);
  assert.equal(r.priceBeforeIncentives, undefined);
  // and a used `type` with a NEW display string still gets nothing
  const m = mapRecord({ ...F.ddcSif, type: "used" }, {}, "https://x");
  assert.equal(enrichFromDdc(normalize(m.node, { sourceUrl: "https://x", dealerDomain: "x" }), m.ddc).msrpUsd, undefined);
});

test("dealer.com: 'Please Call' is no sticker and no price", () => {
  const r = ddc(F.ddcPleaseCall);
  assert.equal(r.priceUsd, 0);
  assert.equal(r.msrpUsd, undefined);
});

test("dealer.com ladder: a dealer rule labelled as manufacturer money abstains", () => {
  const ladder = [
    { type: "MIDDLE", typeClass: "msrp", value: "$50,000" },
    { type: "-", typeClass: "ABCRule", value: "$4,500", label: "Ford Retail Bonus Cash", isDiscount: true },
    { type: "TOTAL", typeClass: "priceAfterFees", value: "$45,500", isFinalPrice: true },
  ];
  assert.equal(ddcLadderBasis(ladder, 45500), undefined);
  ladder[1].label = "Dealer Discount";
  assert.equal(ddcLadderBasis(ladder, 45500), true);
  assert.equal(ddcLadderBasis(ladder, 45501), undefined); // not the final row's number
  ladder.splice(2, 0, { type: "SICI", typeClass: "SICRule", value: "$500", label: "Offers" });
  assert.equal(ddcLadderBasis(ladder, 45500), undefined); // incentive row above a non-SIF final
});

// ── DealerOn ────────────────────────────────────────────────────────────────

const deol = (vc) => normalize(vehicleNode(vc, "https://www.example.com"), { sourceUrl: "https://x", dealerDomain: "x" });

test("DealerOn: MSRP − dealer discount rebuilds the price, Global applied below it (valley-autos ID.4)", () => {
  assert.deepEqual(pick(deol(F.deolGlobal)), { priceUsd: 48974, msrpUsd: 51332, priceBeforeIncentives: true, priceBeforeIncentivesUsd: 48974 });
});

test("DealerOn: fees and filing charges are allowed into the rebuild (doinitright Ioniq 9)", () => {
  assert.deepEqual(pick(deol(F.deolFees)), { priceUsd: 58907, msrpUsd: 61785, priceBeforeIncentives: true, priceBeforeIncentivesUsd: 58907 });
});

test("DealerOn: a price that only fits with the incentive subtracted is false; ambiguity and rebate-laden discounts abstain", () => {
  const f = libraryFields(Buffer.from("MSRP:51332.0;Global:10000.0;calc_Dealer Discount:2358.0;calc_INTERNET PRICE:38974.0").toString("base64"));
  assert.equal(deolLibraryBasis(f, 51332, 38974), false);
  const g = libraryFields(Buffer.from("MSRP:40000.0;calc_Dealer Discount:3000.0;calc_Dealer Discount minus Rebates:1000.0").toString("base64"));
  assert.equal(deolLibraryBasis(g, 40000, 37000), undefined);
  const h = libraryFields(Buffer.from("MSRP:40000.0;Global:1000.0;calc_doc fee:1000.0").toString("base64"));
  assert.equal(deolLibraryBasis(h, 40000, 40000), true); // equal to the sticker
  assert.equal(deolLibraryBasis(h, 40000, 39000), false); // fits only with Global subtracted
  assert.equal(deolLibraryBasis(h, 40000, 41000), true); // fits only as sticker + doc fee
  // fits both ways (−500, or −500 −1000 Global +1000 fee): ambiguous, no claim
  const a = libraryFields(Buffer.from("MSRP:40000.0;Global:1000.0;calc_Dealer Discount:500.0;calc_doc fee:1000.0").toString("base64"));
  assert.equal(deolLibraryBasis(a, 40000, 39500), undefined);
});

test("DealerOn: a used card gets no sticker; disagreeing MSRP fields give none", () => {
  assert.equal(deol({ ...F.deolGlobal, VehicleType: "used", VehicleCondition: "Used" }).msrpUsd, undefined);
  assert.equal(deol({ ...F.deolGlobal, VehicleMsrp: 51000 }).msrpUsd, undefined);
});

// ── Team Velocity ───────────────────────────────────────────────────────────

const tv = (r) => normalize(teamVelocityApiVehicle(r, new Map()), { sourceUrl: "https://x/viewdetails/New/" + r.vin, dealerDomain: "x" });

test("Team Velocity: stored = stack total before rebates → true (volvocarssandiego EX30)", () => {
  assert.deepEqual(pick(tv(F.tvVolvo)), { priceUsd: 46945, msrpUsd: 49945, priceBeforeIncentives: true, priceBeforeIncentivesUsd: 46945 });
});

// Both of these were published net of rebates, flagged false, until 2026-11-19.
// teamvelocity.mjs "PRE-REBATE" now puts the rebates back from the record.
test("Team Velocity: fields net of rebates are raised to the stack's pre-rebate figure (parkwayfamilykia EV3)", () => {
  assert.deepEqual(pick(tv(F.tvParkway)), { priceUsd: 34916, msrpUsd: 36485, priceBeforeIncentives: true, priceBeforeIncentivesUsd: 34916 });
});
test("Team Velocity: no stack, a price of dealerDiscountedPrice less cashRebates becomes dealerDiscountedPrice (mckennacars ID.4)", () => {
  const r = tv(F.tvMckenna);
  assert.equal(r.priceUsd, 44472);
  assert.equal(r.priceBeforeIncentives, undefined);
});

test("Team Velocity: nothing that explains the gap → sticker only (ggkia EV3)", () => {
  const r = tv(F.tvGg);
  assert.equal(r.msrpUsd, 31385);
  assert.equal(r.priceBeforeIncentives, undefined);
});

test("Team Velocity: a used record's msrp is never read", () => {
  assert.equal(tv({ ...F.tvVolvo, type: "Used" }).msrpUsd, undefined);
});

// ── Dealer Inspire card ─────────────────────────────────────────────────────

test("Dealer Inspire: a New card carries its blob msrp, no flag (pepecadillac Optiq)", () => {
  const r = normalize(dealerInspireCardVehicle(F.diNew), { sourceUrl: F.diNew.url, dealerDomain: "pepecadillac.com" });
  assert.equal(r.priceUsd, 56403);
  assert.equal(r.msrpUsd, 56143);
  assert.equal(r.priceBeforeIncentives, undefined);
  const used = { ...F.diNew, blob: { ...F.diNew.blob, type: "Used" } };
  assert.equal(normalize(dealerInspireCardVehicle(used), { sourceUrl: used.url, dealerDomain: "x" }).msrpUsd, undefined);
});

// ── maker locators ──────────────────────────────────────────────────────────

test("GM: cash.msrp on a NEW car; featured price under it gets no flag", () => {
  const r = gmRecord(F.gm, GM_BRANDS[0]);
  assert.deepEqual(pick(r), { priceUsd: 41902, msrpUsd: 49695, priceBeforeIncentives: undefined, priceBeforeIncentivesUsd: undefined });
  const used = gmRecord({ ...F.gm, stockDetails: { ...F.gm.stockDetails, condition: "USED" } }, GM_BRANDS[0]);
  assert.equal(used?.msrpUsd, undefined);
});

test("Kia and Hyundai: msrp, never Hyundai's startingMsrp", () => {
  const k = kiaRecord(F.kia, { code: "9AE", name: "EV3", evKind: "BEV" });
  assert.equal(k.msrpUsd, 38630);
  assert.equal(k.priceUsd, 37807);
  const h = hyundaiRecord({ ...F.hyundai, startingMsrp: 1 }, { facet: F.hyundai.aem.fuelType[0], evKind: "BEV" });
  assert.equal(h.msrpUsd, 45350);
});

test("BMW: totalMsrp is the sticker, baseMsrp never is", () => {
  const sweep = { code: "E", evKind: "BEV" };
  const r = bmwRecord({ ...F.bmw, engineDriveType: {} }, sweep);
  assert.equal(r.msrpUsd, 77900);
  assert.equal(r.priceUsd, 77900);
  const base = bmwRecord({ ...F.bmw, totalMsrp: null, engineDriveType: {} }, sweep);
  assert.equal(base.priceUsd, 67100);
  assert.equal(base.msrpUsd, undefined);
});

test("the ramp is a calendar: 0 before 2026-11-19, then 4, 8, 12, and 16 from the 22nd on", async () => {
  const { stickerBucketsOn } = await import("../lib/sticker.mjs");
  const at = (iso) => stickerBucketsOn(Date.parse(iso));
  assert.equal(at("2026-11-18T23:59:59Z"), 0);
  assert.equal(at("2026-11-19T00:00:00Z"), 4);
  assert.equal(at("2026-11-19T23:59:59Z"), 4);
  assert.equal(at("2026-11-20T12:00:00Z"), 8);
  assert.equal(at("2026-11-21T12:00:00Z"), 12);
  assert.equal(at("2026-11-22T00:00:00Z"), 16);
  assert.equal(at("2027-03-01T00:00:00Z"), 16);
});
