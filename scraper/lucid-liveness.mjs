#!/usr/bin/env node
// Ask Lucid, per VIN, whether each NEW-lane car is still for sale.
//
//   node lucid-liveness.mjs [--concurrency 8] [--limit N] [--dry-run]
//
// WHY THIS LANE NEEDS ITS OWN PASS. recheck.mjs asks a car's own web page
// whether it is still listed. That does not work for Lucid: every
// lucidmotors.com/inventory-vehicle?UUID=..&shortCode=.. page is a
// client-rendered shell that 200s with the same ~789 KB body and zero VINs for
// a real car, a fabricated UUID, and no query string at all (control-tested in
// lib/oem/lucid.mjs's header). So recheck skips both Lucid domains, and the
// used/demo lane (lucidmotors.com) is fine without it — its national sweep
// certifies complete, so db-sync retires VINs that fall out of it.
//
// The gap is the NEW lane (synthetic domain "lucid-new"). Lucid's inventory API
// returns only ONE car per distinct build configuration — the nearest to the
// query point — so no sweep can be proven exhaustive; the lane is truncated:true
// always, which strips db-sync of the authority to delist from it. Truncated
// plus recheck-skipped means a sold new Lucid never retires: it sits on the
// site until something else happens to remove it. This pass is that something.
//
// THE ORACLE. Lucid publishes a per-VIN liveness endpoint that discriminates a
// real car from a fabricated one — the exact property the shell page lacks
// (verified 2026-08-18):
//   GET buynow.lucidmotors.com/api/v4/en_us/store/inventory/vehicles/isSaleable?id={uuid}
//   real uuid      -> 200 {"statusCode":200,"isSaleable":true,"titleStatus":"New",...}
//   fabricated uuid-> 200 {"statusCode":404,"errorCode":"VEHICLE_NOT_FOUND"}
// The HTTP status is 200 in BOTH cases — the answer lives in the body's
// statusCode/errorCode, not in the transport code, so we read the body and
// never the status alone. Same open AWS API Gateway as the inventory pull: no
// auth, and /robots.txt 403s "Missing Authentication Token" (no route, so no
// stated policy), which politeGetJson reads as "allowed".
//
// THE UUID. isSaleable is keyed by the store uuid, and that uuid is already in
// the DB: lucid.mjs writes it into each row's sourceUrl as the ?UUID= param.
// So we parse it back out — no schema change, no new column. Rows whose
// sourceUrl carries no UUID (lucid.mjs's /available-vehicles fallback, written
// when a row lacked a uuid) are left untouched: no id, no question to ask.
//
// VERDICTS mirror recheck's contract (migration 0004), and only a clean,
// structured answer moves a row. A fabricated-shaped 404 is as decisive here as
// a 404 web page is in recheck, so it delists at once:
//   gone   200 body {statusCode:404, errorCode:"VEHICLE_NOT_FOUND"} -> hardGone (delist now)
//   alive  200 body {statusCode:200, isSaleable:true}               -> confirm (refresh freshness)
//   else   isSaleable:false, other errorCodes, non-JSON, non-200,
//          transport error, robots_disallowed                       -> no conclusion, untouched
// isSaleable:false is deliberately NOT a delist: a reserved-but-unsold car still
// exists on the lot and may return. Caution is asymmetric on purpose — we retire
// a car only on a positive "does not exist", never on an ambiguous one.
//
// SCOPE GUARD. This pass reads and writes ONLY "lucid-new" rows. The used lane
// (lucidmotors.com) is already retired by db-sync's complete-sweep authority;
// touching its rows here would delist them a second time, on a different and
// weaker signal. The domain filter is applied in the query AND re-asserted per
// row before any VIN is queued, so a used VIN can never reach the delist list.
//
// DEPENDS ON lib/oem/lucid.mjs (the new lane that produces "lucid-new" rows and
// exports LUCID_NEW). Until that lane lands and runs, this pass has nothing to
// check and imports a module that isn't here yet — it is inert by construction,
// exactly like the rest of the Lucid feature, not a check that silently passes.
import { readFile } from "node:fs/promises";
import { politeGetJson } from "./lib/http.mjs";
import { fetchWithRetry } from "./lib/retry.mjs";
import { LUCID_NEW } from "./lib/oem/lucid.mjs";

const HOST = "https://buynow.lucidmotors.com";
const ISSALEABLE = `${HOST}/api/v4/en_us/store/inventory/vehicles/isSaleable`;
// Same origin/referer the inventory pull sends; the endpoint answers plain Node
// without them, but staying consistent with lucid.mjs costs nothing.
const HEADERS = { origin: "https://lucidmotors.com", referer: "https://lucidmotors.com/available-vehicles" };

function flag(name, fallback) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? Number(process.argv[i + 1]) : fallback;
}
const CONCURRENCY = flag("--concurrency", 8);
const LIMIT = flag("--limit", 0);
const DRY = process.argv.includes("--dry-run");

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

const { SUPABASE_URL, SUPABASE_ANON_KEY: ANON, SUPABASE_INGEST_TOKEN: TOKEN } = process.env;
if (!SUPABASE_URL || !ANON) {
  console.error("lucid-liveness: no Supabase credentials (scraper/.env) — nothing to check.");
  process.exit(0);
}

// The store uuid lucid.mjs stamped into the sourceUrl's ?UUID= param. Returns
// null for the /available-vehicles fallback rows (no query, no id to ask).
function uuidOf(sourceUrl) {
  try {
    return new URL(sourceUrl).searchParams.get("UUID") || null;
  } catch {
    return null;
  }
}

// Live NEW-lane rows only. Filtered server-side to the synthetic domain so we
// never pull, let alone touch, the used lane — the used lane is db-sync's to
// retire. Paginated like recheck for the same reason: one gateway blip on a
// bare fetch has forfeited a night's sold-signal before (see lib/retry.mjs).
const rows = [];
for (let from = 0; ; from += 1000) {
  const res = await fetchWithRetry(`lucid-liveness: row fetch ${from}+`, () =>
    fetch(
      `${SUPABASE_URL}/rest/v1/listings?select=vin,payload` +
        `&delisted_at=is.null&payload->>dealerDomain=eq.${encodeURIComponent(LUCID_NEW.domain)}&order=vin.asc`,
      { headers: { apikey: ANON, Authorization: `Bearer ${ANON}`, Range: `${from}-${from + 999}` } }
    )
  );
  if (!res.ok) {
    console.error(`lucid-liveness: row fetch failed HTTP ${res.status}`);
    process.exit(1);
  }
  const page = await res.json();
  rows.push(...page);
  if (page.length < 1000) break;
}

// Re-assert the domain in code (defence in depth for the scope guard) and drop
// rows with no queryable uuid. What's left is the work list.
const targets = [];
let noUuid = 0;
for (const l of rows) {
  if (l.payload?.dealerDomain !== LUCID_NEW.domain) continue; // never the used lane
  const uuid = uuidOf(l.payload?.sourceUrl);
  if (!uuid) { noUuid++; continue; }
  targets.push({ vin: String(l.vin).toUpperCase(), uuid });
}
const work = LIMIT ? targets.slice(0, LIMIT) : targets;
console.error(
  `lucid-liveness: ${work.length} new-lane listings to check ` +
  `(${noUuid} without a UUID in sourceUrl, left untouched)`
);

const alive = [], hardGone = [];
let inconclusive = 0, cursor = 0;

async function worker() {
  while (cursor < work.length) {
    const { vin, uuid } = work[cursor++];
    const res = await politeGetJson(`${ISSALEABLE}?id=${encodeURIComponent(uuid)}`, { headers: HEADERS });
    // Read the BODY, not the HTTP status — both real and fabricated answer 200.
    const j = res.status === 200 && res.json && typeof res.json === "object" ? res.json : null;
    if (!j) {
      inconclusive++; // transport error, robots_disallowed, non-200, non-JSON
    } else if (j.statusCode === 404 && j.errorCode === "VEHICLE_NOT_FOUND") {
      hardGone.push(vin); // decisive "does not exist" — retire it
    } else if (j.statusCode === 200 && j.isSaleable === true) {
      alive.push({ vin }); // confirm; refreshes last_confirmed_at, clears strikes
    } else {
      inconclusive++; // isSaleable:false, other errorCodes, unexpected shape
    }
  }
}
await Promise.all(Array.from({ length: Math.min(CONCURRENCY, work.length) }, worker));

console.error(
  `lucid-liveness: ${alive.length} still saleable, ${hardGone.length} sold/gone (delisting), ` +
  `${inconclusive} inconclusive`
);

if (DRY) {
  console.error("[dry run — nothing written]");
  process.exit(0);
}
if (!TOKEN) {
  console.error("lucid-liveness: no ingest token — cannot write results.");
  process.exit(0);
}
if (!alive.length && !hardGone.length) {
  console.error("lucid-liveness: no conclusive results to write.");
  process.exit(0);
}

// Same door and same dataset as recheck: recheck_listings (migration 0004)
// delists hardGone at once and confirms alive. softGone is empty by design —
// isSaleable gives a definite answer or none, so there is no "strike once, retire
// on the second" middle state to feed it.
const res = await fetchWithRetry("lucid-liveness: result write", () =>
  fetch(`${SUPABASE_URL}/functions/v1/ingest`, {
    method: "POST",
    headers: {
      apikey: ANON,
      Authorization: `Bearer ${ANON}`,
      "x-ingest-token": TOKEN,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ dataset: "recheck", alive, hardGone, softGone: [], rows: [] }),
  })
);
if (!res.ok) {
  console.error(`lucid-liveness: FAILED HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  process.exit(1);
}
console.error(`lucid-liveness: ${JSON.stringify(await res.json())}`);
