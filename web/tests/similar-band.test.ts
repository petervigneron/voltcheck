// The free asking-vs-similar band (lib/listings/similarBand.ts): the rule,
// its asymmetry, what it refuses to compare, the pool of live and recent
// cars, the live-only fallback, and that only the band is ever published.
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildAskIndex, MIN_PEERS, type CompIndex } from "../lib/listings/comps";
import {
  similarBand,
  similarBandDetail,
  ABOVE_K,
  ABOVE_SE,
  BELOW_K,
  BELOW_SE,
  MIN_GAP_USD,
  MIN_POOL,
  RECENT_DAYS,
  SPREAD_FLOOR,
} from "../lib/listings/similarBand";
import { fetchRecentAsks, toRecentAsks } from "../lib/listings/recentAsks";
import { slimRow, slimBand, SLIM_BANDS, type ApiListing } from "../lib/api/records";
import type { EnrichedListing } from "../lib/listings/enrich";

const NO_COMPS: CompIndex = new Map();
const SELF = "KNDC3DLC8P5100000";
type P = { vin: string; year: number; mileage: number; priceUsd: number; condition: string; identity?: string; trimKey?: string; drive?: string; recent?: true };
const peer = (i: number, priceUsd: number, extra: Partial<P> = {}): P => ({
  vin: `KNDC3DLC8P5${200000 + i}`,
  year: 2023,
  mileage: 30000,
  priceUsd,
  condition: "used",
  identity: "77 kWh",
  ...extra,
});
/** n peers spread evenly ±spreadUsd around centre, same mileage as the subject. */
const pool = (n: number, centre: number, spreadUsd: number, extra: Partial<P> = {}) =>
  Array.from({ length: n }, (_, i) => peer(i, Math.round(centre + spreadUsd * ((2 * i) / (n - 1) - 1)), extra));
const band = (peers: P[], ask: number, s: Partial<{ mileage: number; identity: string | undefined; trimKey: string; drive: string; real: boolean }> = {}) =>
  similarBand(buildAskIndex(peers), NO_COMPS, SELF, 2023, s.mileage ?? 30000, ask, s.real ?? true, s.trimKey, "identity" in s ? s.identity : "77 kWh", s.drive);
const detail = (peers: P[], ask: number) => similarBandDetail(buildAskIndex(peers), NO_COMPS, SELF, 2023, 30000, ask, true, undefined, "77 kWh");

// ------------------------------------------------------------ the rule

test("typical whenever the comparison is made and the price is inside the band", () => {
  const peers = pool(30, 30000, 1500);
  assert.equal(band(peers, 30000), "typical");
  assert.equal(band(peers, 30400), "typical");
  assert.equal(band(peers, 29600), "typical");
});

test("asymmetry: the same distance is 'above' over the pool and 'typical' under it", () => {
  assert.ok(BELOW_K >= ABOVE_K && BELOW_SE >= ABOVE_SE);
  const peers = pool(30, 30000, 1500);
  const d = detail(peers, 30000)!;
  const n = d.poolN;
  const aboveBar = ABOVE_K * d.spread * (1 + ABOVE_SE / Math.sqrt(n));
  const belowBar = BELOW_K * d.spread * (1 + BELOW_SE / Math.sqrt(n));
  assert.ok(belowBar > aboveBar);
  const f = (aboveBar + belowBar) / 2;
  const med = d.peerMedianUsd;
  assert.equal(band(peers, Math.round(med * (1 + f))), "above");
  assert.equal(band(peers, Math.round(med * (1 - f))), "typical");
  assert.equal(band(peers, Math.round(med * (1 - belowBar * 1.05))), "below");
});

test("the bar is a share of the price, so $1,000 counts on a cheap car in a tight pool and not on a dear one", () => {
  // Both pools as tight as the floor allows.
  const leaf = pool(30, 12000, 150);
  const truck = pool(30, 60000, 750);
  assert.equal(detail(leaf, 12000)!.spread, SPREAD_FLOOR);
  assert.equal(detail(truck, 60000)!.spread, SPREAD_FLOOR);
  assert.equal(band(leaf, 10950), "below", "$1,050 under a $12,000 median");
  assert.equal(band(truck, 58950), "typical", "$1,050 under a $60,000 median is inside the spread");
  assert.equal(band(leaf, 13050), "above");
  assert.equal(band(truck, 61050), "typical");
});

test("never under $1,000, however tight the pool", () => {
  const cheap = pool(40, 8000, 80);
  assert.equal(band(cheap, 8000 - MIN_GAP_USD + 10), "typical");
  assert.equal(band(cheap, 8000 + MIN_GAP_USD - 10), "typical");
  assert.equal(band(cheap, 8000 + MIN_GAP_USD + 50), "above");
});

test("a pool's own spread widens the band: the same gap is 'below' in a tight pool and 'typical' in a loose one", () => {
  assert.equal(band(pool(30, 30000, 600), 27000), "below");
  assert.equal(band(pool(30, 30000, 6000), 27000), "typical");
});

test("a gap under the pool larger than 30% of the asking price is withheld, not called below (comps.ts's guard)", () => {
  // 30% of $22,500 is $6,750, and the gap is $7,500.
  assert.equal(band(pool(30, 30000, 600), 22500), undefined);
  // 30% of $23,500 is $7,050, and the gap is $6,500.
  assert.equal(band(pool(30, 30000, 600), 23500), "below");
});

test("a label one peer's absence would flip is 'typical'", () => {
  const peers = [peer(1, 29000), peer(2, 30000), peer(3, 36000)];
  const d = detail(peers, 26000)!;
  assert.equal(d.rawBand, "below", "the whole pool alone says below");
  assert.equal(d.band, "typical", "without the $36,000 car the median falls to $29,500 and the gap no longer clears");
});

// ------------------------------------------------------------ what is not compared

test("not compared: too few peers, a new car, no real price, mixed or unknown identity, a drive the pool does not share", () => {
  const peers = pool(10, 30000, 600);
  assert.equal(band(peers.slice(0, MIN_POOL - 1), 30000), undefined, "too few");
  assert.ok(band(peers.slice(0, MIN_POOL), 30000));
  assert.equal(band(peers, 30000, { mileage: 1500 }), undefined, "a new car");
  assert.equal(band(peers, 30000, { real: false }), undefined, "a payment, not a price");
  assert.equal(band(peers, 30000, { identity: "84 kWh" }), undefined, "a different pack");
  assert.equal(band([...peers, peer(99, 30000, { identity: "58 kWh" })], 30000), undefined, "a pool of two packs");
  assert.equal(band(peers, 30000, { identity: undefined }), undefined, "a car whose pack is not established");
  const rwd = pool(10, 30000, 600, { drive: "RWD" });
  assert.equal(band(rwd, 30000, { drive: "AWD" }), undefined, "an AWD car among RWDs");
  assert.equal(band(rwd, 30000, { drive: "RWD" }), "typical");
});

test("a cohort that mixes trims compares only within the car's own trim", () => {
  const peers = [...pool(6, 30000, 300, { trimKey: "LIGHT" }), ...pool(6, 40000, 300, { trimKey: "GT-LINE" }).map((p, i) => ({ ...p, vin: `KNDC3DLC8P5${300000 + i}` }))];
  assert.equal(band(peers, 30000), undefined, "no trim of its own: the pool would be a mixture");
  assert.equal(band(peers, 30000, { trimKey: "LIGHT" }), "typical");
  assert.equal(band(peers, 30000, { trimKey: "GT-LINE" }), undefined, "too far under its own trim: withheld");
});

test("peers more than 40,000 miles away do not count", () => {
  const far = pool(10, 30000, 600).map((p) => ({ ...p, mileage: 75000 }));
  assert.equal(band(far, 30000), undefined);
});

// ------------------------------------------------------------ the pool

test("recent cars join the pool and are counted as such; askVsMarket's own floor is unchanged", () => {
  assert.equal(MIN_PEERS, 4, "the Pro figure keeps its four live peers");
  const live = pool(2, 30000, 300);
  const recent = [peer(50, 30100, { recent: true })];
  assert.equal(band(live, 30000), undefined, "two live cars: no pool");
  const d = similarBandDetail(buildAskIndex([...live, ...recent]), NO_COMPS, SELF, 2023, 30000, 30000, true, undefined, "77 kWh")!;
  assert.equal(d.poolN, 3);
  assert.equal(d.recentN, 1);
  assert.equal(d.band, "typical");
});

test("toRecentAsks: the 30-day window, the junk-price floor and a whole VIN, whatever the table holds", () => {
  const now = new Date("2026-11-18T12:00:00Z");
  const row = (vin: string, daysAgo: number, price: number) => ({
    vin,
    year: 2023,
    mileage: 30000,
    price_usd: price,
    condition: "used",
    drive: "RWD",
    trim_key: "LIGHT",
    identity: "77 kWh",
    delisted_at: new Date(now.getTime() - daysAgo * 86_400_000).toISOString(),
  });
  const got = toRecentAsks(
    [row("kndc3dlc8p5200001", 2, 29000), row("KNDC3DLC8P5200002", RECENT_DAYS + 1, 29000), row("KNDC3DLC8P5200003", 3, 1493), row("KNDC3DLC", 3, 29000)],
    now
  );
  assert.deepEqual(got.map((r) => r.vin), ["KNDC3DLC8P5200001"]);
  assert.deepEqual(got[0], { vin: "KNDC3DLC8P5200001", year: 2023, mileage: 30000, priceUsd: 29000, condition: "used", drive: "RWD", trimKey: "LIGHT", identity: "77 kWh", recent: true });
});

test("degrade: no table (before 0126 is applied), or any failed page, means live cars only", async () => {
  const inner = globalThis.fetch;
  const errors = console.error;
  console.error = () => {};
  try {
    globalThis.fetch = (async () => new Response('{"code":"42P01"}', { status: 404 })) as typeof fetch;
    assert.deepEqual(await fetchRecentAsks("https://fixture.supabase.example", "k"), []);
    let calls = 0;
    globalThis.fetch = (async () => {
      calls++;
      if (calls === 1) return new Response(JSON.stringify(Array.from({ length: 1000 }, (_, i) => ({ vin: `KNDC3DLC8P5${400000 + i}`, year: 2023, mileage: 30000, price_usd: 29000, condition: "used", drive: null, trim_key: null, identity: null, delisted_at: new Date().toISOString() }))), { status: 200 });
      return new Response("", { status: 500 });
    }) as typeof fetch;
    assert.deepEqual(await fetchRecentAsks("https://fixture.supabase.example", "k"), [], "half a table is not a pool");
    assert.equal(calls, 2);
  } finally {
    globalThis.fetch = inner;
    console.error = errors;
  }
});

// ------------------------------------------------------------ what is published

test("the published index carries the band as one code, and nothing else of it", () => {
  const rec = { id: "x", make: "Kia", model: "EV6", year: 2023, price_usd: 30000, mileage: 30000, condition: "used", location: {}, kind: "BEV" } as unknown as ApiListing;
  const e = { listing: { firstSeenAt: undefined } } as unknown as EnrichedListing;
  for (const b of SLIM_BANDS) {
    const row = slimRow(rec, e, b);
    assert.equal(row.length, 19);
    assert.equal(slimBand(row), b);
    assert.ok([1, 2, 3].includes(row[18] as number));
  }
  assert.equal(slimRow(rec, e)[18], 0, "no band");
  assert.equal(slimRow({ ...rec, price_usd: null }, e, "below")[18], 0, "no price, no band");
  assert.equal(slimBand(slimRow(rec, e).slice(0, 18) as ReturnType<typeof slimRow>), undefined, "an index published before the band");
});
