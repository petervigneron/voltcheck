import type { BodyType } from "@/lib/filters";
import type { CardRow, CardTile } from "./card";

// The wire format for /api/index, and nothing else. The browse grid still works
// in CardRow (lib/listings/card.ts) at both ends — the server packs on the way
// out, the client unpacks on the way in, and no component knows this file
// exists.
//
// Why it exists: Vercel refuses to store a prerendered response over ~19 MB,
// and 39k cards of plain CardRow JSON is 31 MB — a hard stop on deploying
// anything at all. Almost none of that bulk is information. 173k fact chips are
// drawn from 539 distinct ones ("Heat pump standard" was written out 26,896
// times); 39k image URLs come from 487 hosts; every row spelled out its own key
// names. So: say each repeated thing once, point at it by number.
//
// The rule for anything added here: the transform must be exactly invertible,
// and pack→unpack must reproduce the row it started from, field for field.
// A card silently losing a fact is the failure mode, and it wouldn't look like
// a bug — it would look like a coverage gap.

const CONDITIONS = ["new", "used", "certified"] as const;
const DRIVES = ["RWD", "AWD", "FWD"] as const;
const BODIES = ["suv", "sedan", "truck", "van", "hatchback"] as const;
const HEAT_PUMPS = ["yes", "no", "verify"] as const;

/** An image URL split at its origin: [index into PackedIndex.h, the rest]. */
type PackedImage = [number, string];

/**
 * A small closed vocabulary as its index, with the raw string kept when a feed
 * says something the table doesn't list. Coding an unknown value as -1 would
 * unpack to undefined — the field would just quietly stop existing, which is
 * indistinguishable from us never having known it.
 */
type Coded = number | string;
const code = <T extends string>(table: readonly T[], v: T): Coded => {
  const i = table.indexOf(v);
  return i === -1 ? v : i;
};
const decode = <T extends string>(table: readonly T[], v: Coded): T =>
  typeof v === "number" ? table[v] : (v as T);

interface PackedRow {
  i: string;
  q: string;
  y: number;
  k: string;
  o: string;
  n: string;
  p: number;
  /** Absent means a real price — the common case pays nothing. */
  f?: 0;
  c?: { a: number; t: string; pv: number };
  m?: number;
  cd?: Coded;
  d?: Coded;
  b?: Coded;
  ct?: string;
  st?: string;
  l?: [number, number];
  g?: PackedImage;
  tr?: string;
  kw?: number;
  rm?: number;
  hp?: Coded;
  pr?: 1;
  as?: number;
  am?: [number, number];
  /** Indices into PackedIndex.t. */
  ts?: number[];
}

export interface PackedIndex {
  /** Bumped whenever the shape below changes, so a stale cached body is
   *  recognizable rather than silently misread as the current one. */
  v: 1;
  /** Every distinct fact chip, once. */
  t: CardTile[];
  /** Every distinct image origin ("https://cgi.cadillac.com"), once. */
  h: string[];
  r: PackedRow[];
}

export function packIndex(rows: CardRow[]): PackedIndex {
  const tiles = new Map<string, number>();
  const tileList: CardTile[] = [];
  const hosts = new Map<string, number>();
  const hostList: string[] = [];

  const tileId = (t: CardTile) => {
    // Keyed on the tile's own JSON: two chips are the same chip when kind,
    // text, and tooltip all match, which is what makes 173k of them 539.
    const key = JSON.stringify(t);
    let id = tiles.get(key);
    if (id === undefined) {
      id = tileList.length;
      tiles.set(key, id);
      tileList.push(t);
    }
    return id;
  };

  const hostId = (origin: string) => {
    let id = hosts.get(origin);
    if (id === undefined) {
      id = hostList.length;
      hosts.set(origin, id);
      hostList.push(origin);
    }
    return id;
  };

  const splitImage = (url: string): PackedImage => {
    // Only a well-formed absolute URL can be rejoined by pasting the halves
    // back together; anything else rides along whole under an empty origin.
    const m = /^(https?:\/\/[^/]+)(\/.*)?$/.exec(url);
    return m ? [hostId(m[1]), m[2] ?? ""] : [hostId(""), url];
  };

  const r = rows.map((row): PackedRow => {
    const p: PackedRow = {
      i: row.id,
      q: row.hay,
      y: row.year,
      k: row.make,
      o: row.model,
      n: row.title,
      p: row.priceUsd,
    };
    if (!row.realPrice) p.f = 0;
    if (row.cut) p.c = { a: row.cut.amountUsd, t: row.cut.at, pv: row.cut.prevUsd };
    if (row.mileage !== undefined) p.m = row.mileage;
    if (row.condition !== undefined) p.cd = code(CONDITIONS, row.condition);
    if (row.drive !== undefined) p.d = code(DRIVES, row.drive);
    if (row.body !== undefined) p.b = code(BODIES, row.body);
    if (row.city !== undefined) p.ct = row.city;
    if (row.state !== undefined) p.st = row.state;
    if (row.loc !== undefined) p.l = row.loc;
    if (row.imageUrl !== undefined) p.g = splitImage(row.imageUrl);
    if (row.trim !== undefined) p.tr = row.trim;
    if (row.kwh !== undefined) p.kw = row.kwh;
    if (row.rangeMi !== undefined) p.rm = row.rangeMi;
    if (row.heatPump !== undefined) p.hp = code(HEAT_PUMPS, row.heatPump);
    if (row.packReplaced) p.pr = 1;
    if (row.askVsSold !== undefined) p.as = row.askVsSold;
    if (row.askVsMarket) p.am = [row.askVsMarket.deltaUsd, row.askVsMarket.peerN];
    if (row.tiles.length) p.ts = row.tiles.map(tileId);
    return p;
  });

  return { v: 1, t: tileList, h: hostList, r };
}

/**
 * Rebuilds the rows the grid works in. Key order matches buildCardIndex's own
 * literal so a packed round trip is byte-identical, not merely equivalent.
 */
export function unpackIndex(x: PackedIndex): CardRow[] {
  return x.r.map((p) => ({
    id: p.i,
    hay: p.q,
    year: p.y,
    make: p.k,
    model: p.o,
    title: p.n,
    priceUsd: p.p,
    realPrice: p.f !== 0,
    cut: p.c ? { amountUsd: p.c.a, at: p.c.t, prevUsd: p.c.pv } : undefined,
    mileage: p.m,
    condition: p.cd === undefined ? undefined : decode(CONDITIONS, p.cd),
    drive: p.d === undefined ? undefined : decode(DRIVES, p.d),
    body: p.b === undefined ? undefined : (decode(BODIES, p.b) as BodyType),
    city: p.ct,
    state: p.st,
    loc: p.l,
    imageUrl: p.g ? `${x.h[p.g[0]]}${p.g[1]}` : undefined,
    trim: p.tr,
    kwh: p.kw,
    rangeMi: p.rm,
    heatPump: p.hp === undefined ? undefined : decode(HEAT_PUMPS, p.hp),
    packReplaced: p.pr ? true : undefined,
    askVsSold: p.as,
    askVsMarket: p.am ? { deltaUsd: p.am[0], peerN: p.am[1] } : undefined,
    // The dictionary hands back the same tile object to every row that cites
    // it. Nothing mutates a tile, and sharing is what the format is for.
    tiles: (p.ts ?? []).map((id) => x.t[id]),
  }));
}
