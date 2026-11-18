import { hasRealPrice } from "./price";
import { RECENT_DAYS } from "./similarBand";

// Cars no longer listed, at their last asking price, as peers for the free
// similar-cars band (lib/listings/similarBand.ts). Read from
// similar_recent_asks (migration 0126) with the publisher's service key.
//
// Absent table, a failed page, no key: the answer is [] and the band is
// computed from live cars alone — the pool is smaller, never wrong. That is
// the state until 0126 is applied.

export interface RecentAsk {
  vin: string;
  year: number;
  mileage: number;
  priceUsd: number;
  condition?: string;
  drive?: string;
  trimKey?: string;
  identity?: string;
  recent: true;
}

interface Row {
  vin: string;
  year: number;
  mileage: number;
  price_usd: number;
  condition: string | null;
  drive: string | null;
  trim_key: string | null;
  identity: string | null;
  delisted_at: string;
}

const PAGE = 1000;

/** Rows as the table holds them → peers, with the window and the junk-price
 *  floor applied here, whatever the table's own refresh did. */
export function toRecentAsks(rows: Row[], now: Date = new Date()): RecentAsk[] {
  const since = now.getTime() - RECENT_DAYS * 86_400_000;
  const out: RecentAsk[] = [];
  for (const r of rows) {
    const t = Date.parse(r.delisted_at);
    if (!(t > since) || !r.vin || r.vin.length !== 17) continue;
    const price = Number(r.price_usd);
    const year = Number(r.year);
    const peer = { priceUsd: price, condition: r.condition ?? undefined, year };
    if (!Number.isFinite(price) || !hasRealPrice(peer)) continue;
    out.push({
      vin: r.vin.toUpperCase(),
      year,
      mileage: Number(r.mileage),
      priceUsd: price,
      condition: r.condition ?? undefined,
      drive: r.drive ?? undefined,
      trimKey: r.trim_key ?? undefined,
      identity: r.identity ?? undefined,
      recent: true,
    });
  }
  return out;
}

export async function fetchRecentAsks(base: string, serviceKey: string, now: Date = new Date()): Promise<RecentAsk[]> {
  const since = new Date(now.getTime() - RECENT_DAYS * 86_400_000).toISOString();
  const rows: Row[] = [];
  let after = "";
  try {
    for (;;) {
      const res = await fetch(
        `${base.replace(/\/$/, "")}/rest/v1/similar_recent_asks?select=vin,year,mileage,price_usd,condition,drive,trim_key,identity,delisted_at` +
          `&delisted_at=gt.${encodeURIComponent(since)}${after ? `&vin=gt.${encodeURIComponent(after)}` : ""}&order=vin.asc&limit=${PAGE}`,
        {
          headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "Accept-Encoding": "gzip" },
          signal: AbortSignal.timeout(30_000),
        }
      );
      if (!res.ok) throw new Error(`PostgREST ${res.status}`);
      const page = (await res.json()) as Row[];
      rows.push(...page);
      if (page.length < PAGE) break;
      after = page[page.length - 1].vin;
    }
  } catch (err) {
    console.error(`[recentAsks] not read, the band uses live cars only: ${err instanceof Error ? err.message : err}`);
    return [];
  }
  return toRecentAsks(rows, now);
}
