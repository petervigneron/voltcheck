// From web/:
//   SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… \
//   node --experimental-strip-types --import ./scripts/ts-resolve-hook.mjs \
//        scripts/backfill-trend-keys.mjs [--since 2026-08-15]
//
// Writes the trend key (0077: the trim the site stands behind + the pack
// identity) for cars that are NO LONGER listed but were, on some day of the
// trend archive. publish-feed.mjs keys the live cars every night from the
// walk it already does; it never sees a car that has left, and the archive's
// past days do. Without this, the trim level's history would begin the day
// the keys did and a 2023 Lightning Platinum's line would start three weeks
// late. Run once after 0077; safe to run again (the RPC writes only changed
// rows).
//
// Reads `listings` directly with the service role — the public views hide
// delisted rows — page by page on the VIN, the payload mapped to a Listing
// the way lib/listings/db.ts maps a feed row (payload + the two disclosure
// columns; nothing else the enrichment or the trim claim reads is outside
// the payload). ~54,000 rows at ~1 kB on 2026-09-09; a one-off egress.

import { enrichListing, packIdentity, specTrim } from "../lib/listings/enrich.ts";
import { trimClaim } from "../lib/listings/trimClaim.ts";

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("backfill-trend-keys: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
  process.exit(1);
}
const sinceArg = process.argv.indexOf("--since");
const SINCE = sinceArg !== -1 ? process.argv[sinceArg + 1] : "2026-08-15";
const PAGE = 1000;
const headers = {
  apikey: SUPABASE_SERVICE_ROLE_KEY,
  Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
  "Content-Type": "application/json",
};

let after = "";
let read = 0;
let keyed = 0;
let changed = 0;
const batch = [];

async function flush() {
  if (!batch.length) return;
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/upsert_vin_trend_keys`, {
    method: "POST",
    headers,
    body: JSON.stringify({ _rows: batch.splice(0) }),
  });
  if (!res.ok) throw new Error(`upsert_vin_trend_keys ${res.status}: ${(await res.text()).slice(0, 200)}`);
  changed += Number(await res.json()) || 0;
}

for (;;) {
  const url =
    `${SUPABASE_URL}/rest/v1/listings?select=vin,payload,buyback_disclosed,branded_title_disclosed` +
    `&delisted_at=gte.${SINCE}&order=vin.asc&limit=${PAGE}` +
    (after ? `&vin=gt.${encodeURIComponent(after)}` : "");
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`listings ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const rows = await res.json();
  if (!rows.length) break;
  for (const r of rows) {
    read++;
    after = r.vin;
    if (!r.payload || typeof r.payload !== "object" || !r.payload.vin) continue;
    const l = {
      ...r.payload,
      buybackDisclosed: r.buyback_disclosed || undefined,
      brandedTitleDisclosed: r.branded_title_disclosed || undefined,
    };
    const t = trimClaim(l).assert ? specTrim(l) : undefined;
    const trim_key = t ? t.toUpperCase() : null;
    const identity = packIdentity(enrichListing(l)) ?? null;
    if (trim_key && identity) keyed++;
    batch.push({ vin: r.vin, trim_key, identity });
  }
  if (batch.length >= 5000) await flush();
  if (rows.length < PAGE) break;
}
await flush();
console.error(`backfill-trend-keys: read ${read} delisted-since-${SINCE} rows, ${keyed} with both trim and identity, ${changed} keys written or changed`);
