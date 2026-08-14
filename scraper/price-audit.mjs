#!/usr/bin/env node
// Price-plausibility audit for the freshly synced listing set.
//
// Why: on 2026-08-14 vanhyundai.com's dealer.com feed published an
// accessories total ($2,293) as the price on two cars actually listed at
// $50,273 and $29,999. The extractor fix lives in lib/platforms/dealercom.mjs;
// this is the pipeline-level guard so the next junk number — whatever shape
// it takes next — cannot lead a page that sorts by price.
//
// Method: every listing's priceUsd is compared to the WA DOL sale-price
// median for its make/model/year (wa_ev_sales via the wa_price_comps RPC,
// which answers only from groups of >=5 sales over $5,000). A price below
// LOW_RATIO x or above HIGH_RATIO x the median is implausible. Models WA
// cannot audit fall back to the absolute floors the web layer already
// enforces (web/lib/listings/price.ts — keep the two in sync).
//
// Flagged listings are re-fetched through the crawler's own extraction path
// (verify-price-fix.mjs). A differing price from the live page replaces the
// stored one; a price the page confirms is kept (old Leafs at real
// four-figure prices are cars, not bugs); anything unverifiable has its
// price set to 0 — which keeps the row alive through ingest_listings
// (price_usd is NOT NULL, so dropping the field would read as a delisting)
// while hasRealPrice hides the number on every display surface.
//
// Exit codes: 0 = nothing changed, 20 = listings JSON rewritten (nightly.sh
// re-runs db-sync.mjs to push the corrections), 1 = audit could not run.
//
//   node price-audit.mjs [--dry-run] [--verify-cap 60]
import { readFile, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileP = promisify(execFile);

const LOW_RATIO = 0.35;
const HIGH_RATIO = 3;
// Mirrors web/lib/listings/price.ts (PRICE_FLOOR_USD / NEW_PRICE_FLOOR_USD).
const USED_FLOOR = 1000;
const NEW_FLOOR = 15000;

function flag(name, fallback) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? Number(process.argv[i + 1]) : fallback;
}
const DRY = process.argv.includes("--dry-run");
const VERIFY_CAP = flag("--verify-cap", 60);

async function loadEnv(url) {
  try {
    const text = await readFile(url, "utf-8");
    for (const line of text.split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (m && !line.trimStart().startsWith("#") && !(m[1] in process.env)) {
        process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
      }
    }
  } catch {}
}
await loadEnv(new URL("./.env", import.meta.url));

const LISTINGS_URL = new URL("../web/data/scraped-listings.json", import.meta.url);
const listings = JSON.parse(await readFile(LISTINGS_URL, "utf-8"));

// ---- WA medians via wa_price_comps --------------------------------------
// Raw wa_ev_sales reads are hard-closed to anon (migration 0007: the site
// ships statistics, never the ODbL-derived database). wa_price_comps is the
// sanctioned statistics interface and stays anon-executable: it returns the
// group median only when n >= 5 (the table itself is already floored at
// sale_price > $5,000 by wa-prices.mjs), widening to ±1 model year when the
// exact year is thin — the `basis` field says which happened.
const SUPABASE_URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_ANON_KEY;

const groupKey = (l) => `${l.make}|${l.model}|${l.year}`.toLowerCase();
const medians = new Map(); // groupKey -> { median, n, basis }
if (SUPABASE_URL && KEY) {
  const groups = new Map();
  for (const l of listings) {
    if (l.make && l.model && l.year) groups.set(groupKey(l), l);
  }
  const queue = [...groups.entries()];
  let failures = 0;
  await Promise.all(
    Array.from({ length: 8 }, async () => {
      for (let next; (next = queue.shift()); ) {
        const [k, { make, model, year }] = next;
        const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/wa_price_comps`, {
          method: "POST",
          headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({ _make: make, _model: model, _year: year }),
        });
        if (!res.ok) {
          failures++;
          continue;
        }
        const comp = await res.json();
        if (comp?.median) medians.set(k, comp);
      }
    })
  );
  // A broken comps source must not read as "nothing is auditable".
  if (failures > groups.size / 10) {
    console.error(`price-audit: ${failures}/${groups.size} wa_price_comps calls failed — aborting.`);
    process.exit(1);
  }
  console.error(
    `price-audit: ${medians.size}/${groups.size} make/model/year groups have WA comps` +
      (failures ? ` (${failures} lookups failed)` : "")
  );
} else {
  console.error("price-audit: no Supabase credentials — absolute floors only.");
}

// ---- flag pass ----------------------------------------------------------
const flagged = [];
let audited = 0;
for (const l of listings) {
  if (typeof l.priceUsd !== "number" || l.priceUsd <= 0) continue;
  const comp = medians.get(groupKey(l));
  if (comp) {
    audited++;
    const ratio = l.priceUsd / comp.median;
    if (ratio < LOW_RATIO || ratio > HIGH_RATIO) {
      flagged.push({
        l,
        why: `${ratio.toFixed(2)}x the WA median $${comp.median} (n=${comp.n}, basis ${comp.basis})`,
      });
    }
  } else {
    const floor = l.condition === "new" ? NEW_FLOOR : USED_FLOOR;
    if (l.priceUsd < floor) {
      flagged.push({ l, why: `below the $${floor} ${l.condition ?? "used"} floor (no WA comps)` });
    }
  }
}
console.error(
  `price-audit: ${listings.length} listings, ${audited} audited against WA medians, ${flagged.length} flagged`
);
if (!flagged.length) process.exit(0);

for (const { l, why } of flagged) {
  console.error(
    `price-audit: FLAG ${l.vin} ${l.year} ${l.make} ${l.model} $${l.priceUsd} — ${why} — ${l.sourceUrl ?? "no url"}`
  );
}
if (DRY) process.exit(0);

// ---- re-verify through the crawler's own extraction path ----------------
// verify-price-fix.mjs pretty-prints one JSON record per vehicle on the
// page; records start at column 0, so "\n{" is a safe boundary.
async function reverify(url, vin) {
  let stdout;
  try {
    ({ stdout } = await execFileP("node", ["verify-price-fix.mjs", url], {
      // fileURLToPath, not .pathname: the latter percent-encodes spaces
      // ("EV%20site") and the spawn dies with ENOENT.
      cwd: fileURLToPath(new URL(".", import.meta.url)),
      timeout: 90_000,
    }));
  } catch (e) {
    return { ok: false, reason: `fetch failed (${e.code ?? e.stdout?.trim() ?? "error"})` };
  }
  for (const chunk of stdout.split(/\n(?=\{)/)) {
    try {
      const rec = JSON.parse(chunk);
      if (rec.vin === vin) return { ok: true, priceUsd: rec.priceUsd };
    } catch {}
  }
  return { ok: false, reason: "VIN not found on page" };
}

function plausible(l, priceUsd) {
  const comp = medians.get(groupKey(l));
  if (comp) {
    const ratio = priceUsd / comp.median;
    return ratio >= LOW_RATIO && ratio <= HIGH_RATIO;
  }
  return priceUsd >= (l.condition === "new" ? NEW_FLOOR : USED_FLOOR);
}

let corrected = 0,
  confirmed = 0,
  suppressed = 0;
for (const [i, { l }] of flagged.entries()) {
  if (i >= VERIFY_CAP || !l.sourceUrl || !l.vin) {
    // Past the cap something systemic broke; a hidden price is still better
    // than a junk one leading the page (same house rule as hasRealPrice).
    console.error(`price-audit: ${l.vin ?? l.id} not re-verified (${i >= VERIFY_CAP ? "over cap" : "no url/vin"}) — price suppressed`);
    l.priceUsd = 0;
    suppressed++;
    continue;
  }
  const v = await reverify(l.sourceUrl, l.vin);
  if (!v.ok || typeof v.priceUsd !== "number" || v.priceUsd <= 0) {
    console.error(`price-audit: ${l.vin} could not re-verify (${v.reason ?? "no price extracted"}) — price suppressed`);
    l.priceUsd = 0;
    suppressed++;
  } else if (v.priceUsd === l.priceUsd) {
    // The dealer really asks this; implausible is not the same as wrong.
    console.error(`price-audit: ${l.vin} page confirms $${v.priceUsd} — kept`);
    confirmed++;
  } else if (plausible(l, v.priceUsd)) {
    console.error(`price-audit: ${l.vin} re-verified $${v.priceUsd} (was $${l.priceUsd}) — corrected`);
    l.priceUsd = v.priceUsd;
    corrected++;
  } else {
    console.error(`price-audit: ${l.vin} re-extracted $${v.priceUsd} (was $${l.priceUsd}), still implausible — price suppressed`);
    l.priceUsd = 0;
    suppressed++;
  }
  // One VDP per ~1.2s: verify-price-fix is polite per-process, but its
  // per-host rate limit resets with each spawn.
  await new Promise((r) => setTimeout(r, 1200));
}

console.error(
  `price-audit: ${corrected} corrected, ${confirmed} confirmed, ${suppressed} suppressed`
);
if (corrected + suppressed === 0) process.exit(0);
await writeFile(LISTINGS_URL, JSON.stringify(listings, null, 2));
process.exit(20);
