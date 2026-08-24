import { test } from "node:test";
import assert from "node:assert/strict";
import { toRecord, search } from "../lib/oem/toyota.mjs";

// Fixtures are real records from lexus.com's /rest/lexus/inventorySearch/cpo,
// trimmed to the fields this lane reads (swept 2026-08-23). The VINs are kept
// because every plug-in case below was settled against vPIC by VIN — all three
// plug-in series decode ElectrificationLevel "PHEV (Plug-in Hybrid Electric
// Vehicle)", and the conventional RX 450h fixture decodes "HEV", which is the
// whole argument for gating on `series` rather than on the "+" in the name.

const NX_PHEV = {
  overview: {
    vin: "JTJKKCFZ6R2034145", stockId: "2T35403", year: "2024", series: "NXphev",
    model: "9854", modelname: "NX 450h+ F SPORT HANDLING AWD", dealer: "60402",
    lotPrice: "44888", miles: "65670",
  },
  dealerInfo: {
    id: "60402", name: "Longo Lexus", distance: "22.79",
    address: { address1: "3530 N. Peck Road", zipCode: "91731", zipCodeFive: "91731", city: "El Monte", state: "CA" },
  },
  color: { exteriorcolorname: "OBSIDIAN", interiorcolorname: "COCKPIT RED" },
  spec: { drivetrain: "AWD", transmission: "Continuously Variable Transmission" },
  inventoryData: { inventoryUrl: { image: ["https://cdn.inventoryrsc.com/537163343_6a5ee7e04c66bf30255fbe2a.jpg"] } },
};

// Same series, but the modelname states no trim at all — only the drivetrain.
const NX_PHEV_NO_TRIM = {
  overview: {
    vin: "JTJHKCFZ5R2033160", year: "2024", series: "NXphev", modelname: "NX 450h+ AWD",
    dealer: "60470", lotPrice: "43837", miles: "45402",
  },
  dealerInfo: { id: "60470", name: "Lexus of Riverside", address: { zipCodeFive: "92504", city: "Riverside", state: "CA" } },
  color: {}, spec: { drivetrain: "AWD" }, inventoryData: { inventoryUrl: { image: [] } },
};

const RX_PHEV = {
  overview: {
    vin: "JTJCJMGA5R2008545", year: "2024", series: "RXphev",
    modelname: "RX 450h+ LUXURY AWD", dealer: "60458", lotPrice: "58410", miles: "29243",
  },
  dealerInfo: { id: "60458", name: "Lexus of Woodland Hills", address: { zipCodeFive: "91364", city: "Woodland Hills", state: "CA" } },
  color: { exteriorcolorname: "CAVIAR", interiorcolorname: "BLACK" },
  spec: { bodyType: "SUV", drivetrain: "All-Wheel Drive" },
  inventoryData: { inventoryUrl: { image: ["https://cdnrs.inventoryrsc.com/640x480/528827429_6a869f02bb502e93e76f4ffa.jpg"] } },
};

const TX_PHEV = {
  overview: {
    vin: "5TDACAC62RS000190", year: "2024", series: "TXphev",
    modelname: "TX 550h+ LUXURY AWD", dealer: "60411", lotPrice: "74494", miles: "28819",
  },
  dealerInfo: { id: "60411", name: "Tustin Lexus", address: { zipCodeFive: "92782", city: "Tustin", state: "CA" } },
  color: { exteriorcolorname: "WIND CHILL PEARL", interiorcolorname: "BLACK" },
  spec: { bodyType: "SUV", drivetrain: "AWD" },
  inventoryData: { inventoryUrl: { image: [] } },
};

const RZ = {
  overview: {
    vin: "JTJAAAABXPA019499", year: "2023", series: "RZ",
    modelname: "RZ 450e LUXURY AWD", dealer: "60420", lotPrice: "26998", miles: "52692",
  },
  dealerInfo: { id: "60420", name: "Lexus of Sacramento", address: { zipCodeFive: "95821", city: "Sacramento", state: "CA" } },
  color: { exteriorcolorname: "IRIDIUM", interiorcolorname: "ASH" },
  spec: { bodyType: "SUV", drivetrain: "AWD" },
  inventoryData: { inventoryUrl: { image: ["https://cdnrs.inventoryrsc.com/640x480/503966364_69ba50994f2b1cb07e444c38.jpg"] } },
};

// THE TRAP. A petrol RX whose TRIM is called "Premium+". Eighteen of these
// were live within 150mi of Dallas on 2026-08-23. Anything that reached for
// the "+" in the modelname to find Lexus's plug-ins would publish every one of
// them as a plug-in hybrid.
const RX_PREMIUM_PLUS = {
  overview: {
    vin: "JTJCHMAA5P2004108", year: "2023", series: "RX",
    modelname: "RX 350 PREMIUM+ FWD", dealer: "64237", lotPrice: "48989", miles: "23094",
  },
  dealerInfo: { id: "64237", name: "Park Place Lexus Grapevine", address: { zipCodeFive: "76051", city: "Grapevine", state: "TX" } },
  color: {}, spec: { drivetrain: "FWD" }, inventoryData: { inventoryUrl: { image: [] } },
};

// The other half of the same control: a conventional 2010-22 RX 450h hybrid,
// sitting on the same lot as the plug-ins. vPIC: "HEV (Hybrid Electric
// Vehicle) - Level Unknown". Only the "+" separates it from the RX 450h+.
const RX_450H_CONVENTIONAL = {
  overview: {
    vin: "2T2HGMDA4NC081005", year: "2022", series: "RXh",
    modelname: "RX 450h AWD", dealer: "64237", lotPrice: "42889", miles: "53372",
  },
  dealerInfo: { id: "64237", name: "Park Place Lexus Grapevine", address: { zipCodeFive: "76051", city: "Grapevine", state: "TX" } },
  color: {}, spec: { drivetrain: "AWD" }, inventoryData: { inventoryUrl: { image: [] } },
};

const rec = (doc) => toRecord(doc, {}, new Map());

test("each plug-in series publishes as PHEV with the maker's own nameplate", () => {
  const nx = rec(NX_PHEV);
  assert.equal(nx.make, "Lexus");
  assert.equal(nx.model, "NX 450h+");
  assert.equal(nx.trim, "F Sport Handling");
  assert.equal(nx.evKind, "PHEV");
  assert.equal(nx.evConfidence, "high");
  assert.equal(nx.condition, "certified");
  assert.equal(nx.priceUsd, 44888);
  assert.equal(nx.mileage, 65670);
  assert.equal(nx.driveLine, "AWD");
  assert.equal(nx.state, "CA");

  const rx = rec(RX_PHEV);
  assert.equal(rx.model, "RX 450h+");
  assert.equal(rx.trim, "Luxury");
  assert.equal(rx.evKind, "PHEV");
  assert.equal(rx.evConfidence, "high");

  const tx = rec(TX_PHEV);
  assert.equal(tx.model, "TX 550h+");
  assert.equal(tx.trim, "Luxury");
  assert.equal(tx.evKind, "PHEV");
  assert.equal(tx.evConfidence, "high");
});

test("the RZ still reads exactly as it did before the plug-ins were added", () => {
  const r = rec(RZ);
  assert.equal(r.model, "RZ 450e");
  assert.equal(r.trim, "Luxury");
  assert.equal(r.evKind, "BEV");
  assert.equal(r.evConfidence, "high");
  assert.equal(r.priceUsd, 26998);
  assert.equal(r.condition, "certified");
});

test('a petrol RX whose TRIM is "Premium+" is not a plug-in', () => {
  // The gate is `series`, not the "+" in the name — series RX is not in the
  // electrified set, so the record never becomes a listing at all.
  assert.equal(rec(RX_PREMIUM_PLUS), null);
});

test("a conventional RX 450h from the same store is not kept", () => {
  // Series RXh. The 2010-22 RX 450h is a strong hybrid; only the RX 450h+ is a
  // plug-in, and this lane must never blur the two.
  assert.equal(rec(RX_450H_CONVENTIONAL), null);
});

test("a plug-in stating no trim gets no trim invented for it", () => {
  const r = rec(NX_PHEV_NO_TRIM);
  assert.equal(r.model, "NX 450h+");
  assert.equal(r.trim, undefined);
  assert.equal(r.driveLine, "AWD");
});

test("a record whose series and nameplate disagree is dropped, not half-read", () => {
  // The series says plug-in NX, the name says petrol RX. Two structured fields
  // contradicting each other is not something to resolve by preferring one.
  const drops = {};
  assert.equal(toRecord({ ...NX_PHEV, overview: { ...NX_PHEV.overview, modelname: "RX 350 PREMIUM AWD" } }, drops, new Map()), null);
  assert.equal(drops["not an electrified Lexus record"], 1);
});

test("a plug-in with no dealer location anywhere is withheld", () => {
  // Standing rule: a car a shopper cannot locate is worse than one we did not
  // list. `dealerInfo` is dropped by the endpoint on far-from-anchor rows, and
  // here the directory cannot resolve the code either.
  const drops = {};
  assert.equal(toRecord({ ...RX_PHEV, dealerInfo: undefined }, drops, new Map()), null);
  assert.equal(drops["no dealer location (withheld)"], 1);
});

// ── Draining an overflowing cell ────────────────────────────────────────────
//
// `offset` paging was verified against the live endpoint on 2026-08-23 (a
// 155-row result returned 100 then 55, sharing zero VINs, union exactly 155,
// stable order across identical calls). What these cover is this lane's own
// loop over it, which today's national stock cannot reach: no single series
// has more than 100 L/Certified cars inside a circle the endpoint will serve.

// A fake lot of `total` cars, served in pages of 100 the way the service does.
const pagedLot = (total, report) => async (_zip, _radius, _model, rep, offset) => {
  rep.fetched++;
  const docs = [];
  for (let i = offset; i < Math.min(offset + 100, total); i++) docs.push({ overview: { vin: `VIN${i}` } });
  return { numFound: total, docs };
};

test("a cell bigger than one page is drained, so the caller sees no overflow", async () => {
  const report = { fetched: 0, errors: [], notes: [] };
  const r = await search("90045", 300, "RZ", report, pagedLot(250, report));
  assert.equal(r.numFound, 250);
  assert.equal(r.docs.length, 250);
  assert.equal(new Set(r.docs.map((d) => d.overview.vin)).size, 250);
  assert.equal(report.fetched, 3); // 100 + 100 + 50
  // This is what matters: the overflow check the caller makes now passes, so
  // it does not fall through to the per-dealer split.
  assert.ok(!(r.numFound > r.docs.length));
});

test("a cell that fits in one page costs exactly one request and is not drained", async () => {
  const report = { fetched: 0, errors: [], notes: [] };
  const r = await search("90045", 300, "RZ", report, pagedLot(83, report));
  assert.equal(r.docs.length, 83);
  assert.equal(report.fetched, 1);
  assert.deepEqual(report.notes, []);
});

test("a result set reshuffling under the drain stops it rather than spinning", async () => {
  // Every page returns the same rows: the service claims 500 but keeps handing
  // back page one. Without the no-progress guard this loops to the page cap.
  const report = { fetched: 0, errors: [], notes: [] };
  const stuck = async (_z, _r, _m, rep) => {
    rep.fetched++;
    return { numFound: 500, docs: Array.from({ length: 100 }, (_, i) => ({ overview: { vin: `VIN${i}` } })) };
  };
  const r = await search("90045", 300, "RZ", report, stuck);
  assert.equal(report.fetched, 2);
  assert.equal(r.numFound, 500);
  assert.equal(r.docs.length, 100);
  // And it reports the shortfall honestly, so the caller still splits per dealer.
  assert.ok(r.numFound > r.docs.length);
});

test("a page that fails mid-drain ends it with the shortfall visible", async () => {
  const report = { fetched: 0, errors: [], notes: [] };
  const failsAfterFirst = async (_z, _r, _m, rep, offset) => {
    rep.fetched++;
    if (offset > 0) return null;
    return { numFound: 250, docs: Array.from({ length: 100 }, (_, i) => ({ overview: { vin: `VIN${i}` } })) };
  };
  const r = await search("90045", 300, "RZ", report, failsAfterFirst);
  assert.equal(r.numFound, 250);
  assert.equal(r.docs.length, 100);
  assert.ok(r.numFound > r.docs.length, "the caller must still see this cell as unresolved");
});

test("the dealer directory resolves the location of a far-from-anchor plug-in", () => {
  const dir = new Map([["60458", { name: "Lexus of Woodland Hills", city: "Woodland Hills", state: "CA", zip: "91364" }]]);
  const r = toRecord({ ...RX_PHEV, dealerInfo: undefined }, {}, dir);
  assert.equal(r.state, "CA");
  assert.equal(r.zip, "91364");
  assert.equal(r.city, "Woodland Hills");
  assert.equal(r.dealerName, "Lexus of Woodland Hills");
  assert.equal(r.evKind, "PHEV");
});
