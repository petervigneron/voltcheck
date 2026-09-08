// From web/:
//   node --experimental-strip-types --import ./scripts/ts-resolve-hook.mjs \
//        --test tests/model-hubs.test.ts
//
// lib/listings/modelHubs.ts is the only crawlable route into the listing
// corpus. Every one of ~149,000 listing URLs was an orphan before it existed
// — the browse grid builds its links in the browser, so the homepage's HTML
// pointed at no car at all, and 18 of 18 sampled listing pages came back
// "unknown to Google, crawled never" on 2026-09-02.
//
// Two of these tests are written against mistakes actually made while
// generating the registry, not hypotheticals. The slug collision fired twice:
// first when "+" was being dropped, which folded EQS 450 and EQS 450+ — two
// different cars — onto one URL; then when "NX 450h+" and "NX 450h Plus", two
// spellings of ONE car, produced the same slug and had to be merged into a
// single hub carrying both keys. A collision is not a cosmetic problem here:
// whichever row loses is a page that silently lists another car's inventory.
import test from "node:test";
import assert from "node:assert/strict";
import { MODEL_HUBS, findModelHub, hubFor, hubPath, hubsForKeys } from "@/lib/listings/modelHubs";
import { FACT_LINK_MODELS } from "@/lib/facts/links";
import { buildHubIndex, hubIndexKey, HUB_CARS } from "@/lib/listings/hubIndex";
import { modelKey } from "@/lib/listings/modelName";
import type { CardRow } from "@/lib/listings/card";

test("no two hubs share a URL", () => {
  const seen = new Map<string, string>();
  for (const h of MODEL_HUBS) {
    const p = hubPath(h);
    const prev = seen.get(p);
    assert.equal(prev, undefined, `${p} is claimed by both "${prev}" and "${h.make} ${h.model}"`);
    seen.set(p, `${h.make} ${h.model}`);
  }
});

test("no modelKey belongs to two hubs — hubFor must not be ambiguous", () => {
  const seen = new Map<string, string>();
  for (const h of MODEL_HUBS) {
    for (const k of h.keys) {
      const id = `${h.make.toLowerCase()}|${k}`;
      const prev = seen.get(id);
      assert.equal(prev, undefined, `key ${id} is claimed by both "${prev}" and ${hubPath(h)}`);
      seen.set(id, hubPath(h));
    }
  }
});

test("every hub's slugs are URL-safe and its keys are real modelKeys", () => {
  for (const h of MODEL_HUBS) {
    assert.match(h.makeSlug, /^[a-z0-9-]+$/, `${h.make} has an unsafe make slug`);
    assert.match(h.modelSlug, /^[a-z0-9-]+$/, `${h.model} has an unsafe model slug`);
    assert.ok(h.keys.length > 0, `${hubPath(h)} carries no modelKey`);
    for (const k of h.keys) {
      assert.equal(modelKey(k), k, `${hubPath(h)} key "${k}" is not in modelKey form`);
    }
  }
});

test("a hub is reachable from the URL it publishes", () => {
  for (const h of MODEL_HUBS) {
    assert.equal(findModelHub(h.makeSlug, h.modelSlug), h, `${hubPath(h)} does not resolve`);
  }
});

test("hubFor matches on the feed's own spelling, and refuses a near-match", () => {
  const ioniq = hubFor("Hyundai", "Ioniq 5");
  assert.ok(ioniq, "Hyundai Ioniq 5 should resolve to a hub");
  assert.equal(ioniq.modelSlug, "ioniq-5");
  // Same contract as lib/facts/links.ts: exact on modelKey, no prefix rule.
  // "Ioniq 5 N" is a different car and must not inherit the Ioniq 5's page.
  assert.notEqual(hubFor("Hyundai", "Ioniq 5 N")?.modelSlug, "ioniq-5");
  // The make has to agree too.
  assert.equal(hubFor("Kia", "Ioniq 5"), undefined);
});

test("every fact-link model reaches at least one hub", () => {
  // The fact sheets are the only pages Google has indexed, so this link is
  // the site's one warm path into the hubs. A sheet whose model resolves to
  // nothing is a dead end that no one would notice from the page itself.
  for (const m of FACT_LINK_MODELS) {
    const hubs = hubsForKeys(m.make, m.keys);
    assert.ok(hubs.length > 0, `${m.name} (/facts/${m.make}/${m.model}) reaches no hub`);
  }
});

test("the Bolt sheet reaches both nameplates it covers", () => {
  // One sheet, two hubs — the case that makes slug-matching wrong here.
  const row = FACT_LINK_MODELS.find((m) => m.model === "bolt-ev-euv");
  assert.ok(row, "the Bolt fact-link row should exist");
  const hubs = hubsForKeys(row.make, row.keys).map((h) => h.modelSlug).sort();
  assert.deepEqual(hubs, ["bolt-euv", "bolt-ev"]);
});

// ---------------------------------------------------------------- the index

function card(make: string, model: string, over: Partial<CardRow> = {}): CardRow {
  return {
    id: `vin${Math.random().toString(36).slice(2, 15)}`,
    hay: "",
    year: 2024,
    make,
    model,
    title: `2024 ${make} ${model}`,
    priceUsd: 30000,
    realPrice: true,
    tiles: [],
    ...over,
  } as CardRow;
}

test("buildHubIndex files a car under its own hub and nobody else's", () => {
  const index = buildHubIndex([card("Hyundai", "Ioniq 5"), card("Kia", "EV6")]);
  const ioniq = MODEL_HUBS.find((h) => h.modelSlug === "ioniq-5" && h.makeSlug === "hyundai")!;
  const ev6 = MODEL_HUBS.find((h) => h.modelSlug === "ev6" && h.makeSlug === "kia")!;
  assert.equal(index.hubs[hubIndexKey(ioniq)]?.total, 1);
  assert.equal(index.hubs[hubIndexKey(ev6)]?.total, 1);
});

test("a car whose model matches no hub is filed nowhere rather than guessed at", () => {
  const index = buildHubIndex([card("Hyundai", "Something We Do Not Carry")]);
  const total = Object.values(index.hubs).reduce((n, e) => n + e.total, 0);
  assert.equal(total, 0);
});

test("the listed cars are capped but the total counts them all", () => {
  const many = Array.from({ length: HUB_CARS + 25 }, () => card("Hyundai", "Ioniq 5"));
  const hub = MODEL_HUBS.find((h) => h.modelSlug === "ioniq-5" && h.makeSlug === "hyundai")!;
  const entry = buildHubIndex(many).hubs[hubIndexKey(hub)]!;
  assert.equal(entry.total, HUB_CARS + 25, "the count must be every live car, not the page's slice");
  assert.equal(entry.cars.length, HUB_CARS);
});

test("cars are listed newest first", () => {
  const rows = [card("Kia", "EV6", { year: 2021 }), card("Kia", "EV6", { year: 2025 })];
  const hub = MODEL_HUBS.find((h) => h.modelSlug === "ev6" && h.makeSlug === "kia")!;
  const cars = buildHubIndex(rows).hubs[hubIndexKey(hub)]!.cars;
  assert.deepEqual(
    cars.map((c) => c.year),
    [2025, 2021],
  );
});

test("every hub appears in the index even with no live cars", () => {
  // A hub whose inventory has thinned still has to render: an indexed URL
  // that starts 404ing costs more than a quiet page.
  const index = buildHubIndex([]);
  for (const h of MODEL_HUBS) {
    assert.ok(index.hubs[hubIndexKey(h)], `${hubPath(h)} is missing from the index`);
  }
});

// The hub numbers (hubStats). Written against the house rule that an
// aggregate is a claim: a median that would rest on fewer than STATS_MIN cars
// is left out, not printed, and an unconfirmed price never enters one.
test("hub stats: a median needs STATS_MIN confirmed prices, and unconfirmed prices do not count", () => {
  const hub = MODEL_HUBS.find((h) => h.modelSlug === "ev6" && h.makeSlug === "kia")!;
  const four = Array.from({ length: 4 }, (_, i) => card("Kia", "EV6", { year: 2023, priceUsd: 30000 + i * 1000 }));
  const fake = card("Kia", "EV6", { year: 2023, priceUsd: 1, realPrice: false });
  const thin = buildHubIndex([...four, fake], "2026-09-07").hubs[hubIndexKey(hub)]!.stats!;
  assert.equal(thin.years[0].n, 5);
  assert.equal(thin.years[0].priced, 4, "the unconfirmed price is not a priced car");
  assert.equal(thin.years[0].medianUsd, undefined, "four prices is below the floor");

  const five = [...four, card("Kia", "EV6", { year: 2023, priceUsd: 50000 })];
  const ok = buildHubIndex([...five, fake], "2026-09-07").hubs[hubIndexKey(hub)]!.stats!;
  assert.equal(ok.years[0].medianUsd, 32000, "the median of 30,31,32,33,50k — the $1 fake excluded");
  assert.equal(ok.asOf, "2026-09-07");
});

test("hub stats: configs and heat pump are floored too, and years come oldest first", () => {
  const hub = MODEL_HUBS.find((h) => h.modelSlug === "ev6" && h.makeSlug === "kia")!;
  const rows = [
    ...Array.from({ length: 5 }, () => card("Kia", "EV6", { year: 2025, kwh: 84, rangeMi: 310, heatPump: "yes", state: "CA" })),
    ...Array.from({ length: 2 }, () => card("Kia", "EV6", { year: 2022, kwh: 77, rangeMi: 274, heatPump: "no", state: "WA" })),
  ];
  const s = buildHubIndex(rows, "2026-09-07").hubs[hubIndexKey(hub)]!.stats!;
  assert.deepEqual(s.years.map((y) => y.year), [2022, 2025]);
  assert.deepEqual(s.configs, [{ kwh: 84, rangeMi: 310, n: 5 }], "the two-car config is below the floor");
  assert.deepEqual(s.heatPump, { yes: 5, no: 2 });
  assert.deepEqual(s.states, [{ state: "CA", n: 5 }, { state: "WA", n: 2 }]);
  assert.equal(s.byCondition.new + s.byCondition.used + s.byCondition.certified, 0, "no condition given, none counted");
});

test("hub stats: a hub with no cars still has stats, all empty", () => {
  const index = buildHubIndex([], "2026-09-07");
  for (const e of Object.values(index.hubs)) {
    assert.equal(e.stats?.years.length, 0);
    assert.equal(e.stats?.heatPump, undefined);
  }
  assert.equal(index.asOf, "2026-09-07");
});
