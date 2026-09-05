import type { CardRow } from "./card";

// The Pro-only fields of the browse index, and the wall between them and
// the public feed.
//
// Until 2026-09-05 every packed shard carried three things a pass is sold
// for: `am` (this asking price against the same version listed right now —
// the Pro "Deals" filter), `ic` (the incentive program the car qualifies
// for — the Pro rebate toggle and tag) and `as` (ask-vs-sold, withheld from
// every surface but still shipped). The browser hid the controls without a
// pass; the data was in the file for anyone who read it, and llms.txt had
// just told every shopping agent exactly which key was which. Owner,
// 2026-09-05: "we want people paying for that information."
//
// So: `publicRows` strips them from everything the public bucket and the
// public routes serve; `packPro`/`unpackPro` carry them in a small artifact
// of their own that scripts/publish-feed.mjs encrypts (AES-256-GCM, key
// PRO_FEED_KEY in CI and on Vercel) before uploading to the same public
// bucket — ciphertext is what a stranger can read — and
// app/api/index/pro/route.ts decrypts it for a browser whose pass
// lib/pro.ts vouches for. lib/listings/useCardIndex.ts merges the answer
// into the rows, so a pass-holder's grid is the grid it was.
//
// `as` is not carried at all: no surface renders it, and a field no page
// stands behind should not exist in any artifact.

export const PRO_FIELDS = ["askVsMarket", "askVsSold", "incentive"] as const;

/** The rows as the public may see them. New objects; the caller's rows are untouched. */
export function publicRows(rows: CardRow[]): CardRow[] {
  return rows.map((r) => {
    if (r.askVsMarket === undefined && r.askVsSold === undefined && r.incentive === undefined) return r;
    const { askVsMarket: _a, askVsSold: _s, incentive: _i, ...rest } = r;
    void _a; void _s; void _i;
    return rest;
  });
}

/** One car's Pro fields: [id, askVsMarket?, incentive?] with the same
 *  encodings pack.ts uses for `am` and `ic`, program names in a dictionary. */
export interface PackedPro {
  v: 1;
  as_of: string;
  pn: string[];
  r: [string, [number, number, 0 | 1] | 0, [number, number, number, number, (0 | 1)?, string?] | 0][];
}

export function packPro(rows: CardRow[], asOf: string): PackedPro {
  const pn: string[] = [];
  const out: PackedPro = { v: 1, as_of: asOf, pn, r: [] };
  for (const row of rows) {
    if (!row.askVsMarket && !row.incentive) continue;
    const am: PackedPro["r"][number][1] = row.askVsMarket
      ? [row.askVsMarket.deltaUsd, row.askVsMarket.peerN, row.askVsMarket.trimMatched ? 1 : 0]
      : 0;
    let ic: PackedPro["r"][number][2] = 0;
    if (row.incentive) {
      let idx = pn.indexOf(row.incentive.name);
      if (idx === -1) idx = pn.push(row.incentive.name) - 1;
      ic = [idx, row.incentive.usd ?? 0, row.incentive.overCapUsd ?? 0, row.incentive.count];
      if (row.incentive.state !== undefined) ic.push(row.incentive.utility ? 1 : 0, row.incentive.state);
    }
    out.r.push([row.id, am, ic]);
  }
  return out;
}

export type ProSignals = Map<string, Pick<CardRow, "askVsMarket" | "incentive">>;

export function unpackPro(x: PackedPro): ProSignals {
  const m: ProSignals = new Map();
  for (const [id, am, ic] of x.r) {
    const s: Pick<CardRow, "askVsMarket" | "incentive"> = {};
    if (am) s.askVsMarket = { deltaUsd: am[0], peerN: am[1], trimMatched: am[2] === 1 };
    if (ic)
      s.incentive = {
        name: x.pn[ic[0]],
        usd: ic[1] || undefined,
        overCapUsd: ic[2] || undefined,
        count: ic[3],
        utility: ic.length > 4 ? ic[4] === 1 : undefined,
        state: ic[5],
      };
    m.set(id, s);
  }
  return m;
}

/** Merge the Pro fields into rows in place — the module-cached index the
 *  browser holds is the one the grid reads, so the rows themselves change
 *  and the caller hands React a fresh array to notice it by. */
export function mergePro(rows: CardRow[], signals: ProSignals): CardRow[] {
  for (const r of rows) {
    const s = signals.get(r.id);
    if (!s) continue;
    if (s.askVsMarket) r.askVsMarket = s.askVsMarket;
    if (s.incentive) r.incentive = s.incentive;
  }
  return rows.slice();
}
