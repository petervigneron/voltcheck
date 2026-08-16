#!/usr/bin/env node
// web/data/scraped-listings.json → Supabase, via the ingest_listings RPC
// (supabase/migrations/0001_init.sql). Plain Node, no dependencies.
//
// Credentials come from scraper/.env (gitignored), in either mode:
//   SUPABASE_URL=https://<project-ref>.supabase.co
// Mode A (direct RPC, needs the service/secret key):
//   SUPABASE_SERVICE_ROLE_KEY=...
// Mode B (ingest gateway — the deployed supabase/functions/ingest holds the
// service key server-side; the scraper holds only a scoped token):
//   SUPABASE_ANON_KEY=...        (legacy anon JWT — passes the gateway's JWT check)
//   SUPABASE_INGEST_TOKEN=...    (minted at deploy; rotation = redeploy)
// With no .env this exits 0 quietly, so nightly.sh works unchanged before
// the database exists. The JSON file remains the web app's fallback either
// way — this script adds persistence, it replaces nothing.
import { readFile, stat } from "node:fs/promises";
import { markTrimSuspects } from "./lib/trim-suspect.mjs";

// Minimal .env parser — launchd jobs carry no shell environment.
async function loadEnv(url) {
  try {
    const text = await readFile(url, "utf-8");
    for (const line of text.split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (m && !line.trimStart().startsWith("#") && !(m[1] in process.env)) {
        process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
      }
    }
  } catch {} // no .env file is a supported state
}
await loadEnv(new URL("./.env", import.meta.url));

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const GATEWAY = process.env.SUPABASE_INGEST_TOKEN && process.env.SUPABASE_ANON_KEY;
if (!SUPABASE_URL || (!SERVICE_KEY && !GATEWAY)) {
  console.error("db-sync: no Supabase credentials (scraper/.env) — skipping. JSON file is still the data source.");
  process.exit(0);
}

const listings = JSON.parse(
  await readFile(new URL("../web/data/scraped-listings.json", import.meta.url), "utf-8")
);

// A catastrophically small feed means the crawl broke, not that the
// inventory vanished. Don't push it — a fetch failure is never evidence
// about the world. (Per-domain delisting in SQL already guards partial
// failures; this guards total ones.)
const MIN_ROWS = Number(process.env.DB_SYNC_MIN_ROWS ?? 50);
if (listings.length < MIN_ROWS) {
  console.error(`db-sync: only ${listings.length} listings (< ${MIN_ROWS}) — refusing to sync a broken crawl.`);
  process.exit(1);
}

// Whether a listing's own description contradicts its trim field — decided
// here because it needs the whole corpus AND the descriptions, and the web app
// has neither together (the browse feed drops description for egress, and the
// detail page reads one VIN). Must run on the full array, before chunking:
// chunks are per-domain, and a vocabulary learned from one dealer's inventory
// would be worthless.
const suspects = markTrimSuspects(listings);
console.error(
  `db-sync: ${suspects} of ${listings.length} listings have a trim their own description contradicts`
);

const source = process.env.DB_SYNC_SOURCE ?? "nightly";

// Which domains did the crawler see COMPLETELY this run? Only those can
// support delisting (see supabase/migrations/0002). A report without the
// `truncated` field — older crawl.mjs, or no crawl this run — certifies
// nothing, so nothing gets delisted.
//
// observedAt = when the crawler actually SAW these rows, from the report
// entries' crawledAt stamps (earliest wins — never claim evidence fresher
// than it is). ingest_listings (0013) uses it to refuse stale overwrites:
// a snapshot replayed after a recheck can no longer resurrect the
// recheck's delistings, nor delist cars seen alive since the crawl. The
// git-committed snapshot's mtime is checkout time, not crawl time, so it
// is only the loudly-warned fallback for pre-0013 reports.
let completeDomains = [];
let observedAt = null;
try {
  const reportUrl = new URL("./out/report.json", import.meta.url);
  const reports = JSON.parse(await readFile(reportUrl, "utf-8"));
  completeDomains = reports.filter((r) => r.truncated === false).map((r) => r.domain);
  const times = reports.map((r) => Date.parse(r.crawledAt)).filter(Number.isFinite);
  if (times.length) observedAt = new Date(Math.min(...times)).toISOString();
} catch {
  console.error("db-sync: no crawl report found — delisting skipped for this run.");
}
if (!observedAt) {
  try {
    const { mtime } = await stat(new URL("../web/data/scraped-listings.json", import.meta.url));
    observedAt = mtime.toISOString();
    console.error(`db-sync: report has no crawledAt — falling back to snapshot mtime ${observedAt}. ` +
      "If this snapshot came from git (mtime = checkout time), stale rows may masquerade as fresh.");
  } catch {}
}
// The feed outgrew a single request (OEM-locator rows pushed it past the
// gateway's body ceiling), so it ships in chunks. Chunk boundaries MUST fall
// between dealer domains, never inside one: ingest_listings delists a
// complete domain's absent VINs per call, so splitting a domain across two
// calls would delist the second half while ingesting the first. Each chunk
// therefore carries whole domains plus exactly the completeDomains it holds
// rows for. (A complete domain with zero rows certifies nothing either way —
// the SQL requires incoming rows before delisting — so those ride chunk 1.)
const CHUNK_BYTES = Number(process.env.DB_SYNC_CHUNK_BYTES ?? 8_000_000);
const byDomain = new Map();
for (const l of listings) {
  const d = l.dealerDomain ?? "";
  if (!byDomain.has(d)) byDomain.set(d, []);
  byDomain.get(d).push(l);
}
const completeSet = new Set(completeDomains);
const chunks = [];
let cur = { rows: [], completeDomains: [], bytes: 0 };
for (const [domain, rows] of byDomain) {
  const bytes = JSON.stringify(rows).length;
  if (cur.rows.length && cur.bytes + bytes > CHUNK_BYTES) {
    chunks.push(cur);
    cur = { rows: [], completeDomains: [], bytes: 0 };
  }
  cur.rows.push(...rows);
  cur.bytes += bytes;
  if (completeSet.has(domain)) {
    cur.completeDomains.push(domain);
    completeSet.delete(domain);
  }
}
chunks.push(cur);
cur.completeDomains.push(...completeSet); // row-less complete domains: harmless, see above

// Statuses worth a second attempt: gateway/origin blips and rate limits.
// Deliberately excludes 4xx like 401/413 — a bad token or an oversized body
// fails the same way every time, and retrying only delays the real error.
const TRANSIENT = new Set([429, 500, 502, 503, 504, 520, 521, 522, 523, 524]);

const send = (rows, doms) =>
  SERVICE_KEY
    ? fetch(`${SUPABASE_URL}/rest/v1/rpc/ingest_listings`, {
        method: "POST",
        headers: {
          apikey: SERVICE_KEY,
          Authorization: `Bearer ${SERVICE_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ _rows: rows, _source: source, _complete_domains: doms, _observed_at: observedAt }),
      })
    : fetch(`${SUPABASE_URL}/functions/v1/ingest`, {
        method: "POST",
        headers: {
          apikey: process.env.SUPABASE_ANON_KEY,
          Authorization: `Bearer ${process.env.SUPABASE_ANON_KEY}`,
          "x-ingest-token": process.env.SUPABASE_INGEST_TOKEN,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ rows, source, completeDomains: doms, observedAt }),
      });

console.error(
  `db-sync: observed ${observedAt ?? "UNKNOWN (legacy: treated as now)"} — ${listings.length} rows in ${chunks.length} chunk(s): ` +
  chunks.map((c) => `${c.rows.length} rows/${(c.bytes / 1e6).toFixed(1)}MB/${c.completeDomains.length} complete`).join(", ")
);

const totals = { seen: 0, new: 0, price_changed: 0, delisted: 0, relisted: 0 };
for (const [i, chunk] of chunks.entries()) {
  // Retry transient failures — and give a crashed database time to get up.
  // The 2026-08-16 diagnosis (postgres_logs, three failed nights): the "520
  // blip" was never Cloudflare. The sync's row churn — every VIN's full row
  // rewritten every night — walks the Nano instance into its memory ceiling
  // after ~4-6 chunks regardless of chunk composition; the OOM killer takes
  // Postgres down mid-statement ("database system was not properly shut
  // down; automatic recovery in progress"), and recovery holds the door
  // shut for ~2 minutes of 500/503/520. The first retry schedule here
  // (10/20/30s) spent all three retries inside that window, so the night
  // failed anyway. These waits outlast a recovery cycle — and the same
  // chunk then passes, because a fresh post-crash backend's per-row memory
  // budget starts over (observed: the post-crash replay cleared 4 more
  // chunks before pressure built again).
  // A dying database also resets connections mid-request, which fetch()
  // surfaces as a thrown error rather than a status — treat those as
  // transient too (status 0 below); before this, one reset crashed the
  // whole script as an unhandled rejection.
  // Replay is safe: ingest_listings upserts by VIN and derives delisting from
  // the payload it is handed, so re-sending a chunk converges to the same
  // state (it only costs an extra run id).
  const attempt = async () => {
    try {
      return await send(chunk.rows, chunk.completeDomains);
    } catch (e) {
      return { ok: false, status: 0, text: async () => String(e?.cause?.code ?? e?.message ?? e) };
    }
  };
  let res = await attempt();
  for (const waitS of [30, 120, 240]) {
    if (res.ok || !(res.status === 0 || TRANSIENT.has(res.status))) break;
    const label = res.status === 0 ? `network error (${(await res.text()).slice(0, 120)})` : `HTTP ${res.status}`;
    console.error(`db-sync: chunk ${i + 1}/${chunks.length} ${label} — retrying in ${waitS}s`);
    await new Promise((r) => setTimeout(r, waitS * 1000));
    res = await attempt();
  }
  if (!res.ok) {
    // A failed chunk leaves its domains un-synced and un-delisted — stale for
    // a night, never wrongly removed. Exit hard so the failure is visible.
    const detail = (await res.text()).slice(0, 500);
    console.error(`db-sync: chunk ${i + 1}/${chunks.length} FAILED — ${res.status === 0 ? "network error" : `HTTP ${res.status}`}: ${detail}`);
    process.exit(1);
  }
  const counts = await res.json();
  for (const k of Object.keys(totals)) totals[k] += counts[k] ?? 0;
  console.error(
    `db-sync: chunk ${i + 1}/${chunks.length} run ${counts.run_id} — ${counts.seen} seen, ${counts.new} new, ` +
    `${counts.price_changed} price changes, ${counts.delisted} delisted, ${counts.relisted} relisted`
  );
}
console.error(
  `db-sync: total — ${totals.seen} seen, ${totals.new} new, ` +
  `${totals.price_changed} price changes, ${totals.delisted} delisted, ${totals.relisted} relisted`
);
