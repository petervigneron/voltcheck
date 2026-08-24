import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isOneAudi,
  oneAudiState,
  oneAudiVehicles,
  oneAudiSeeds,
  oneAudiPrice,
  oneAudiTruncated,
  oneAudiSrpUrls,
  oneAudiMake,
  isElectrifiedFamily,
} from "../lib/platforms/oneaudi.mjs";
import { classifyEv } from "../lib/ev.mjs";
import { normalize } from "../lib/normalize.mjs";
import { ONEAUDI_SALE } from "../lib/price-provenance.mjs";

// A OneAudi page is a feature-hub shell: a URI-encoded JSON map of
// feature-service states, one of whose values is itself a JSON string holding
// the stock-search app's `{apollo, vehicles}`. Build the fixture the same way
// the platform does, so the double encoding is part of what is under test.
const page = (state, extraHead = "") =>
  `<!doctype html><html><head>
<link rel="preload" as="script" href="https://oneaudi-falcon.prod.renderer.one.audi/static/client/client.js"/>
<link rel="dns-prefetch" href="https://omnigraph.audi.com"/>${extraHead}
</head><body><div id="root"></div>
<script type="x-feature-hub/serialized-states">${encodeURIComponent(
    JSON.stringify({
      "page-info-service": "{}",
      "cookie-service": "[]",
      "f7c4f635-ec1a-4b4c-bf14-881d4ab39014-1": JSON.stringify(state),
    }),
  )}</script>
</body></html>`;

const price = (type, value) => ({
  __typename: "LabeledTypedPrice",
  label: null,
  price: { __typename: "Price", value, valueAsText: String(value), formattedValue: `$${value}` },
  type,
});

const car = (over = {}) => ({
  __typename: "StockCar",
  id: "VVNBMDlCMDQ0MjQyODE2OTU=",
  vin: "WA1LABGE7MB033833",
  weblink: "https://www.audicary.com/en/inventory/vehicle/?isdealer&market=usuc&vehicleId=WA1LABGE7MB033833",
  titleText: "2021 Audi e-tron",
  model: { __typename: "StockCarModel", name: "Audi e-tron Premium Plus quattro®", salesModelyear: 2021 },
  modelInfo: {
    __typename: "StockCarModelInfo",
    genericModel: { __typename: "StockcarCodedTextItem", code: "AAEO", text: "e-tron" },
    modelyear: 2021,
  },
  dealer: { __typename: "DealerInfo", id: "USA09B11", name: "Audi Raleigh" },
  carPrices: [price("dealerDocFees", 698), price("final", 27647), price("sale", 26949)],
  subtitleText: "Premium Plus quattro®",
  cartypeText: "U",
  preUse: { __typename: "StockcarCodedTextItem", code: "R", text: "Used car" },
  images: [
    { __typename: "StockCarImage", url: "https://vtpimages.audi.com/carimg2/1/1.jpg?im=Resize,width=640", type: "photo" },
    { __typename: "StockCarImage", url: "https://vtpimages.audi.com/carimg2/2/2.jpg?im=Resize,width=640", type: "photo" },
  ],
  colorInfo: {
    exteriorColor: { colorInfo: { text: "Brilliant Black" }, baseColorInfo: { code: "05", text: "Black" } },
    interiorColor: { colorInfo: { text: "Black with Rock Gray stitching" } },
  },
  driveText: "All-wheel drive",
  engineInfo: { __typename: "StockCarEngine", fuel: { __typename: "StockcarCodedTextItem", code: "E", text: "Electric" } },
  carline: { __typename: "StockCarCarline", id: "etron", name: "e-tron" },
  mileage: { unitText: "miles", value: { formatted: "50,867", number: 50867 } },
  dynamicAttributes: [{ __typename: "StockCarStringItemWithId", id: "VEHICLE_ID", value: "MB033833" }],
  ...over,
});

const state = (cars, { totalCount, families = [] } = {}) => ({
  apollo: { ROOT_QUERY: { __typename: "Query" } },
  vehicles: {
    cars: cars.map((c) => ({ __typename: "StockCarSearchResultsCar", geoDistance: null, stockCar: c })),
    totalCount: totalCount ?? cars.length,
    pagination: { __typename: "StockCarSearchResultsPaging", limit: 48, offset: 0 },
    possibleFilters: [
      {
        __typename: "StockCarSearchCriterion",
        id: "model-range",
        possibleItems: families.map((f) => ({ __typename: "StockCarSearchCriterionItem", ...f })),
        selectedItems: [],
      },
    ],
  },
});

const USED_URL = "https://www.audiraleigh.com/en/inventory/used/";

test("recognises the platform by its renderer and graph hosts, not by the word Audi", () => {
  assert.ok(isOneAudi(page(state([car()]))));
  assert.ok(isOneAudi('<html><head><meta name="x" content="omnigraph.audi.com"></head></html>'));
  // A dealer.com Audi rooftop mentions Audi everywhere and is NOT this
  // platform — the mislabel this fingerprint exists to stop runs the other
  // way (20 of 21 promoted Audi rows read "dealer.com"), so the name alone
  // must not be enough to claim it.
  assert.equal(isOneAudi('<html>Audi Raleigh — new Audi vehicles. DDC.dataLayer = {}</html>'), false);
  assert.equal(isOneAudi(null), false);
});

test("reads the whole car out of the doubly-encoded state block", () => {
  const [v] = oneAudiVehicles(page(state([car()])));
  assert.equal(v.vehicleIdentificationNumber, "WA1LABGE7MB033833");
  assert.equal(v.vehicleModelDate, "2021");
  assert.equal(v.brand, "Audi");
  assert.equal(v.model, "e-tron");
  assert.equal(v.vehicleConfiguration, "Premium Plus quattro®");
  assert.equal(v.itemCondition, "used");
  assert.equal(v.mileageFromOdometer.value, 50867);
  assert.equal(v.color, "Brilliant Black");
  assert.equal(v.sku, "MB033833");
  assert.equal(v.fuelType, "Electric");
  assert.equal(v.offers.seller.name, "Audi Raleigh");
  // The platform's own per-car link, on the rooftop that owns the car.
  assert.match(v.offers.url, /audicary\.com/);
  assert.equal(v.image.length, 2);
});

test("a page with no stock-search state yields nothing rather than throwing", () => {
  // The VDP is the live case: it 200s, it is unmistakably OneAudi, and its
  // state carries no `vehicles.cars` at all (checked on audicary.com).
  const vdp = page({ apollo: {}, someOtherApp: { detail: { vin: "WA1LABGE7MB033833" } } });
  assert.equal(isOneAudi(vdp), true);
  assert.deepEqual(oneAudiVehicles(vdp), []);
  assert.equal(oneAudiState("<html>not this platform</html>"), null);
  assert.deepEqual(oneAudiVehicles("<html>not this platform</html>"), []);
});

test("condition comes from the machine token, and an unknown one abstains", () => {
  const [n] = oneAudiVehicles(page(state([car({ cartypeText: "N", preUse: { code: "L", text: "New car" } })])));
  assert.equal(n.itemCondition, "new");
  // No cartypeText: fall through to the shared condition vocabulary.
  const [f] = oneAudiVehicles(page(state([car({ cartypeText: null, preUse: { code: "R", text: "Used car" } })])));
  assert.equal(f.itemCondition, "used");
  // Neither says anything → no claim, per lib/condition.mjs.
  const [q] = oneAudiVehicles(page(state([car({ cartypeText: "", preUse: null })])));
  assert.equal(q.itemCondition, undefined);
});

test("publishes `sale`, never `final` — the new-car incentive rung", () => {
  // The live 2026 A3 on audiraleigh.com: list 44,815, discount -896,
  // sale 43,919, dealerPrice 44,617 (= sale + the $698 doc fee), and
  // final 41,117 — $3,500 below the ask on conditional rebates.
  const a3 = car({
    vin: "WAUHUDGY4TA062734",
    cartypeText: "N",
    preUse: { code: "L", text: "New car" },
    carPrices: [
      price("dealerDiscount", -896),
      price("dealerPrice", 44617),
      price("dealerDocFees", 698),
      price("final", 41117),
      price("list", 44815),
      price("sale", 43919),
    ],
  });
  const [v] = oneAudiVehicles(page(state([a3])));
  assert.equal(v.offers.price, 43919);
  assert.notEqual(v.offers.price, 41117, "final is the incentive price, not the ask");
  assert.notEqual(v.offers.price, 44815, "list is MSRP");
  assert.notEqual(v.offers.price, 44617, "dealerPrice carries the doc fee");
  assert.equal(v.offers.priceProvenance, ONEAUDI_SALE);
});

test("the fee line is summed, not named — rooftops key it differently", () => {
  // prestigeaudi.com used: "Sale Price $42,196 / Dealer Handling $799 / Total
  // Price $42,995" against sale / dealerMarkup / final. No dealerDocFees.
  const markup = car({
    carPrices: [price("dealerMarkup", 799), price("final", 42995), price("sale", 42196)],
  });
  assert.equal(oneAudiPrice(markup), 42196);
  // audicoralsprings.com charges BOTH: 30,999 + 439 + 1,199 = 32,637.
  const both = car({
    carPrices: [
      price("dealerDiscount", -6751),
      price("dealerDocFees", 1199),
      price("dealerMarkup", 439),
      price("final", 32637),
      price("list", 37750),
      price("sale", 30999),
    ],
  });
  assert.equal(oneAudiPrice(both), 30999);
  // A new car reconciles against dealerPrice rather than final, because final
  // has the incentives taken off: 82,095 + 799 = 82,894, final 76,894.
  const newDenver = car({
    cartypeText: "N",
    carPrices: [
      price("dealerDiscount", -4320),
      price("dealerMarkup", 799),
      price("dealerPrice", 82894),
      price("final", 76894),
      price("list", 86415),
      price("sale", 82095),
    ],
  });
  assert.equal(oneAudiPrice(newDenver), 82095);
});

test("abstains when the price ladder does not reconcile to the doc fee", () => {
  const odd = car({
    carPrices: [price("dealerDocFees", 698), price("dealerPrice", 50000), price("final", 51000), price("sale", 40000)],
  });
  assert.equal(oneAudiPrice(odd), undefined);
  const [v] = oneAudiVehicles(page(state([odd])));
  assert.equal(v.offers.price, undefined);
  assert.equal(v.offers.priceProvenance, undefined);
  // A record carrying only `sale` has no ladder to contradict it.
  assert.equal(oneAudiPrice(car({ carPrices: [price("sale", 26949)] })), 26949);
  // No sale rung at all is an abstention, not a fallback to another rung.
  assert.equal(oneAudiPrice(car({ carPrices: [price("final", 27647), price("list", 31000)] })), undefined);
});

test("the record classifies as an EV and normalizes with its own provenance", () => {
  const [v] = oneAudiVehicles(page(state([car()])));
  assert.equal(classifyEv(v).isEv, true);
  const rec = normalize(v, { sourceUrl: USED_URL, dealerDomain: "audiraleigh.com" });
  assert.equal(rec.vin, "WA1LABGE7MB033833");
  assert.equal(rec.priceUsd, 26949);
  assert.equal(rec.priceProvenance, ONEAUDI_SALE);
  assert.equal(rec.mileage, 50867);
  assert.equal(rec.condition, "used");
  assert.equal(rec.dealerName, "Audi Raleigh");
});

test("electrified families are matched by badge, not by an enumerated list", () => {
  for (const id of ["etron", "etrongt", "q4", "q6etron", "q8etron", "a6etron", "q5tfsie", "a7tfsie"])
    assert.ok(isElectrifiedFamily(id), id);
  for (const id of ["q3", "q5", "q7", "q8", "a3", "a5", "rsq8", "s4"]) assert.equal(isElectrifiedFamily(id), false, id);
});

test("seeds one combined family request when the counts fit on a page", () => {
  const html = page(
    state([car()], {
      totalCount: 1688,
      families: [
        { id: "q5", number: 22 },
        { id: "etrongt", number: 2 },
        { id: "q4", number: 5 },
        { id: "q6etron", number: 2 },
        { id: "q8etron", number: 1 },
        { id: "etron", number: 1 },
      ],
    }),
  );
  const seeds = oneAudiSeeds(html, USED_URL);
  assert.equal(seeds.length, 1);
  const fam = new URL(seeds[0]).searchParams.get("modelFamily").split(",");
  assert.deepEqual(fam.sort(), ["etron", "etrongt", "q4", "q6etron", "q8etron"]);
  assert.ok(!fam.includes("q5"), "a combustion family is not worth a request");
});

test("splits per family when the electrified counts overflow one page", () => {
  const html = page(
    state([car()], {
      families: [
        { id: "q4", number: 30 },
        { id: "q6etron", number: 25 },
        { id: "q3", number: 90 },
      ],
    }),
  );
  const seeds = oneAudiSeeds(html, USED_URL);
  assert.equal(seeds.length, 2);
  assert.deepEqual(
    seeds.map((s) => new URL(s).searchParams.get("modelFamily")).sort(),
    ["q4", "q6etron"],
  );
});

test("a rooftop with no electrified stock is asked nothing extra", () => {
  const html = page(state([car()], { families: [{ id: "q5", number: 40 }] }));
  assert.deepEqual(oneAudiSeeds(html, USED_URL), []);
});

test("says how many cars a page could not reach", () => {
  assert.equal(oneAudiTruncated(page(state([car()], { totalCount: 60 }))), 59);
  assert.equal(oneAudiTruncated(page(state([car()], { totalCount: 1 }))), 0);
  assert.equal(oneAudiTruncated("<html></html>"), 0);
});

test("the two inventory paths are built off the origin we were given", () => {
  assert.deepEqual(oneAudiSrpUrls("https://www.audiraleigh.com"), [
    "https://www.audiraleigh.com/en/inventory/new/",
    "https://www.audiraleigh.com/en/inventory/used/",
  ]);
  assert.deepEqual(oneAudiSrpUrls("https://www.audiraleigh.com/"), [
    "https://www.audiraleigh.com/en/inventory/new/",
    "https://www.audiraleigh.com/en/inventory/used/",
  ]);
});

// Half of an Audi rooftop's used lot can be other brands' trade-ins: 25 of the
// 48 on audicoralsprings.com's first used page. Those records have model:null
// and only the title to name the make from.
const foreign = (over = {}) =>
  car({
    vin: "SALWR2SU2NA213182",
    titleText: "2022 Land Rover Range Rover Sport",
    model: null,
    modelInfo: {
      genericModel: { code: "BVAB", text: "Range Rover Sport" },
      modelyear: 2022,
    },
    carline: null,
    ...over,
  });

test("the make is subtracted from the title, never assumed to be Audi", () => {
  assert.equal(oneAudiMake(foreign()), "Land Rover");
  assert.equal(oneAudiMake(car()), "Audi");
  const [v] = oneAudiVehicles(page(state([foreign()])));
  assert.equal(v.brand, "Land Rover");
  assert.equal(v.model, "Range Rover Sport");
  // Nothing left over after the subtraction, and no Audi sales name to fall
  // back on: no make rather than the wrong one.
  assert.equal(oneAudiMake({ titleText: "2016 CT 200h", modelInfo: { genericModel: { text: "CT 200h" } } }), undefined);
  // A title that does not end in the generic model is not a subtraction we can
  // trust either.
  assert.equal(
    oneAudiMake({ titleText: "2016 Lexus CT 200h Premium", modelInfo: { genericModel: { text: "CT 200h" } } }),
    undefined,
  );
  // Audi's own full sales name is the second reading of the same fact.
  assert.equal(oneAudiMake({ titleText: "", model: { name: "Audi Q5 Sportback Premium Plus" } }), "Audi");
});

test("a plug-in claim about a car Audi did not build is not published", () => {
  // The live case: audicoralsprings.com serves a 2016 Lexus CT 200h with
  // engineInfo.fuel code H, "Plug-in Hybrid (Gas/Electric)". The CT 200h has
  // never had a plug. Two of the four non-Audi H records across six rooftops
  // are wrong this way, so the flag is dropped on a third party's car and the
  // nameplate is left to classifyEv.
  const lexus = foreign({
    vin: "JTHKD5BH9G2270273",
    titleText: "2016 Lexus CT 200h",
    modelInfo: { genericModel: { code: "EDAM", text: "CT 200h" }, modelyear: 2016 },
    subtitleText: "Hybrid",
    engineInfo: { fuel: { code: "H", text: "Plug-in Hybrid (Gas/Electric)" } },
  });
  const [v] = oneAudiVehicles(page(state([lexus])));
  assert.equal(v.brand, "Lexus");
  assert.equal(v.fuelType, undefined);
  assert.equal(v.vehicleEngine, undefined);
  assert.equal(classifyEv(v).isEv, false, "a conventional hybrid must not publish as a plug-in");

  // The same flag on a car Audi DID build is the manufacturer's own system and
  // is kept — the Q5 TFSI e really is a plug-in.
  const q5e = car({
    titleText: "2023 Audi Q5 TFSI e",
    modelInfo: { genericModel: { text: "Q5 TFSI e" }, modelyear: 2023 },
    model: { name: "Audi Q5 TFSI e Premium Plus 55 quattro®" },
    engineInfo: { fuel: { code: "H", text: "Plug-in Hybrid (Gas/Electric)" } },
  });
  const [p2] = oneAudiVehicles(page(state([q5e])));
  assert.equal(p2.fuelType, "Plug-in Hybrid (Gas/Electric)");
  assert.equal(classifyEv(p2).kind, "PHEV");

  // "Electric" on a third party's car IS kept: all 19 non-Audi records
  // carrying it across six rooftops are real BEVs.
  const polestar = foreign({
    vin: "LPSED3KA5PL034221",
    titleText: "2023 Polestar 2",
    modelInfo: { genericModel: { text: "2" }, modelyear: 2023 },
    engineInfo: { fuel: { code: "E", text: "Electric" } },
  });
  const [p3] = oneAudiVehicles(page(state([polestar])));
  assert.equal(p3.brand, "Polestar");
  assert.equal(p3.fuelType, "Electric");
  assert.equal(classifyEv(p3).isEv, true);
});
