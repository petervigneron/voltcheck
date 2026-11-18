// The new-car half of the free asking-vs-similar band (lib/listings/
// newCarBand.ts): the discount-from-sticker rule, what it refuses, that it
// never says "below", and that adding it changed no used car's label.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  buildNewCarIndex,
  newCarBand,
  newCarBandDetail,
  newCarDiscount,
  NEW_ABOVE_K,
  NEW_ABOVE_SE,
  NEW_BELOW_K,
  NEW_BELOW_SE,
  NEW_MAX_MILES,
  NEW_MIN_POOL,
  type NewCarInput,
} from "../lib/listings/newCarBand";
import { computeBands } from "../lib/listings/buildIndex";
import { pinFeed } from "./fixtures/band-pin";

const SELF = "KM8KRDDF0VU100000";
const car = (i: number, msrpUsd: number, priceUsd: number, extra: Partial<NewCarInput> = {}): NewCarInput => ({
  vin: `KM8KRDDF0VU${200000 + i}`,
  year: 2027,
  condition: "new",
  priceUsd,
  msrpUsd,
  priceBeforeIncentives: true,
  realPrice: true,
  identity: "84 kWh",
  drive: "AWD",
  ...extra,
});
/** n peers whose discounts spread evenly ±spreadPts around centrePts, on
 *  stickers that vary by options — which the rule must not care about. */
const pool = (n: number, centrePts: number, spreadPts: number, extra: Partial<NewCarInput> = {}) =>
  Array.from({ length: n }, (_, i) => {
    const msrp = 52000 + (i % 5) * 1800;
    const d = centrePts + spreadPts * ((2 * i) / (n - 1) - 1);
    return car(i, msrp, Math.round(msrp * (1 - d)), extra);
  });
const subject = (msrp: number, price: number, extra: Partial<NewCarInput> = {}) => car(0, msrp, price, { vin: SELF, ...extra });
const band = (peers: NewCarInput[], s: NewCarInput) => newCarBand(buildNewCarIndex(peers), s);

// ------------------------------------------------------------ the rule

test("options do not move the answer: a lean car at its peers' discount is typical", () => {
  const peers = pool(30, 0.04, 0.01);
  // $8,000 under every peer's sticker, at the same 4% off its own.
  assert.equal(band(peers, subject(48000, 48000 * 0.96)), "typical");
  // and a loaded one too
  assert.equal(band(peers, subject(64000, 64000 * 0.96)), "typical");
});

test("above: a car at its sticker in a version that typically sells 6% off", () => {
  const peers = pool(30, 0.06, 0.008);
  assert.equal(band(peers, subject(56000, 56000)), "above");
  assert.equal(band(peers, subject(56000, 56000 * 1.03)), "above", "a markup over the sticker");
});

test("never 'below', and not 'typical' either: a car past the below bar gets no answer", () => {
  const peers = pool(30, 0.02, 0.008);
  const d = newCarBandDetail(buildNewCarIndex(peers), subject(56000, 56000 * 0.85))!;
  assert.equal(d.raw, "deep");
  assert.equal(d.band, undefined);
  assert.equal(band(peers, subject(56000, 56000 * 0.85)), undefined);
  // Every label the rule can give, over a sweep of prices.
  const seen = new Set<string | undefined>();
  for (let p = 0.75; p <= 1.15; p += 0.005) seen.add(band(peers, subject(56000, Math.round(56000 * p))));
  assert.deepEqual([...seen].sort(), ["above", "typical", undefined].sort());
});

test("asymmetry: the bar the 'below' side would need is at least the 'above' bar", () => {
  assert.ok(NEW_BELOW_K >= NEW_ABOVE_K && NEW_BELOW_SE >= NEW_ABOVE_SE);
  // In a 4%-off version, a car 2 points short of typical is above; a car 2
  // points past it is typical, and only past the wider bar does it go quiet.
  const peers = pool(30, 0.04, 0.008);
  assert.equal(band(peers, subject(56000, Math.round(56000 * (1 - 0.02)))), "above");
  assert.equal(band(peers, subject(56000, Math.round(56000 * (1 - 0.06)))), "typical");
  assert.equal(band(peers, subject(56000, Math.round(56000 * (1 - 0.075)))), undefined);
});

test("never under $1,000 in dollars, however tight the version", () => {
  const peers = pool(30, 0.03, 0.001).map((p) => ({ ...p, msrpUsd: 20000, priceUsd: Math.round(20000 * (p.priceUsd / p.msrpUsd!)) }));
  // 4 points short of a 3%-off version on a $20,000 sticker is past the
  // spread bar but only $800.
  assert.equal(band(peers, subject(20000, 20000 * 1.01)), "typical");
  // The same 4 points on a $56,000 sticker is $2,240.
  assert.equal(band(pool(30, 0.03, 0.001), subject(56000, 56000 * 1.01)), "above");
});

test("an 'above' that one peer's absence would flip is typical", () => {
  // Six peers, typical discount 3.75%; without the deepest one it is 3%,
  // which a car at its sticker no longer clears.
  const peers = [car(1, 50000, 50000), car(2, 50000, 50000), car(3, 50000, 48500), car(4, 50000, 47750), car(5, 50000, 47500), car(6, 50000, 47000)];
  const d = newCarBandDetail(buildNewCarIndex(peers), subject(50000, 50000))!;
  assert.equal(d.raw, "short");
  assert.equal(d.band, "typical");
});

// ------------------------------------------------------------ what is not compared

test("not compared: no sticker, no stated rung, used, a demo, too few, mixed or unknown pack, another drive", () => {
  const peers = pool(10, 0.05, 0.01);
  const s = subject(56000, 56000);
  assert.ok(band(peers, s));
  assert.equal(band(peers, { ...s, msrpUsd: undefined }), undefined, "no sticker: today, every car");
  assert.equal(band(peers, { ...s, priceBeforeIncentives: undefined }), undefined, "the rung is not known");
  assert.equal(band(peers, { ...s, priceBeforeIncentives: false }), undefined, "net of incentives");
  assert.equal(band(peers, { ...s, condition: "used" }), undefined);
  assert.equal(band(peers, { ...s, mileage: NEW_MAX_MILES }), undefined, "a demo or loaner");
  assert.ok(band(peers, { ...s, mileage: NEW_MAX_MILES - 1 }));
  assert.equal(band(peers, { ...s, realPrice: false }), undefined);
  assert.equal(band(peers, { ...s, buybackDisclosed: true }), undefined);
  assert.equal(band(peers.slice(0, NEW_MIN_POOL - 1), s), undefined, "too few");
  assert.ok(band(peers.slice(0, NEW_MIN_POOL), s));
  assert.equal(band(peers, { ...s, identity: "63 kWh" }), undefined, "another pack");
  assert.equal(band(peers, { ...s, identity: undefined }), undefined, "pack not established");
  assert.equal(band([...peers, car(99, 56000, 53000, { identity: "63 kWh" })], s), undefined, "a pool of two packs");
  assert.equal(band(peers, { ...s, drive: "RWD" }), undefined, "an RWD among AWDs");
  assert.equal(band(peers, { ...s, year: 2026 }), undefined, "a leftover is held only against its own model year");
});

test("peers carry the same requirements as the subject", () => {
  const usable = pool(4, 0.05, 0.01);
  const unusable = [
    car(50, 56000, 53000, { msrpUsd: undefined }),
    car(51, 56000, 53000, { priceBeforeIncentives: undefined }),
    car(52, 56000, 53000, { mileage: 1500 }),
    car(53, 56000, 53000, { condition: "used", mileage: 9000 }),
    car(54, 56000, 30000),
  ];
  assert.equal(band([...usable, ...unusable], subject(56000, 56000)), undefined, "four usable peers are not five");
});

test("a price far from its own sticker is not a price this rule compares", () => {
  assert.equal(newCarDiscount(subject(56000, 56000 * 0.7)), undefined, "30% off is a rebate stack");
  assert.equal(newCarDiscount(subject(56000, 56000 * 1.2)), undefined, "20% over is an add-on or a misread");
  assert.ok(Math.abs(newCarDiscount(subject(56000, 53200))! - 0.05) < 1e-9);
});

// ------------------------------------------------------------ the used rule is untouched

test("pinned: every used car's label on the fixture is what origin/main's band loop gave", () => {
  const { listings, enriched, trimKeys, recent } = pinFeed();
  const bands = computeBands(listings, enriched, trimKeys, new Map(), recent);
  const got = [...bands].sort();
  // Taken by running 20129ee8c's buildIndex band loop, verbatim, on this
  // fixture before newCarBand.ts existed: 65 labels — 56 typical, 8 above,
  // 1 below.
  assert.equal(got.length, 65);
  assert.equal(
    createHash("sha256").update(JSON.stringify(got)).digest("hex"),
    "1d09913d27c67999ad6e72aa134d18444751232fb8fb2bdcc623e4fc515884b6"
  );
  assert.deepEqual(
    got.filter(([, b]) => b !== "typical").map((x) => x.join(":")),
    [
      "1g1fy6s00p1000500:above", "1g1fy6s00p1000670:above", "5yj3e1ea0p1000270:above", "5yj3e1ea0p1000290:above",
      "5yj3e1ea0p1000320:below", "5yj3e1ea0p1000350:above", "5yj3e1ea0p1000410:above", "kndc3dlc0p1000040:above",
      "kndc3dlc0p1000190:above",
    ]
  );
  // The fixture's new cars carry no sticker, as every live car does today:
  // the new rule adds nothing.
  for (const l of listings) if (l.condition === "new") assert.equal(bands.has(l.id), false, l.id);
});

test("with stickers and a stated rung, new cars answer and used labels still do not move", () => {
  const { listings, enriched, trimKeys, recent } = pinFeed();
  const before = computeBands(listings, enriched, trimKeys, new Map(), recent);
  const withMsrp = listings.map((l) => (l.condition === "new" ? { ...l, msrpUsd: l.priceUsd, priceBeforeIncentives: true } : l));
  // Two more new cars per cohort so each new pool reaches five peers.
  const extra = withMsrp.filter((l) => l.condition === "new").flatMap((l, i) =>
    [1, 2].map((k) => {
      const vin = `${l.vin.slice(0, 10)}X${String(i * 10 + k).padStart(6, "0")}`;
      enriched.set(vin, enriched.get(l.vin)!);
      return { ...l, vin, id: vin.toLowerCase(), priceUsd: Math.round(l.priceUsd * 0.95) };
    })
  );
  const after = computeBands([...withMsrp, ...extra], enriched, trimKeys, new Map(), recent);
  for (const [id, b] of before) assert.equal(after.get(id), b, id);
  const fresh = [...after].filter(([id]) => !before.has(id));
  assert.ok(fresh.length > 0);
  for (const [, b] of fresh) assert.notEqual(b, "below");
});
