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
import { readFile } from "node:fs/promises";

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

const source = process.env.DB_SYNC_SOURCE ?? "nightly";

// Which domains did the crawler see COMPLETELY this run? Only those can
// support delisting (see supabase/migrations/0002). A report without the
// `truncated` field — older crawl.mjs, or no crawl this run — certifies
// nothing, so nothing gets delisted.
let completeDomains = [];
try {
  const reports = JSON.parse(await readFile(new URL("./out/report.json", import.meta.url), "utf-8"));
  completeDomains = reports.filter((r) => r.truncated === false).map((r) => r.domain);
} catch {
  console.error("db-sync: no crawl report found — delisting skipped for this run.");
}
const res = SERVICE_KEY
  ? await fetch(`${SUPABASE_URL}/rest/v1/rpc/ingest_listings`, {
      method: "POST",
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ _rows: listings, _source: source, _complete_domains: completeDomains }),
    })
  : await fetch(`${SUPABASE_URL}/functions/v1/ingest`, {
      method: "POST",
      headers: {
        apikey: process.env.SUPABASE_ANON_KEY,
        Authorization: `Bearer ${process.env.SUPABASE_ANON_KEY}`,
        "x-ingest-token": process.env.SUPABASE_INGEST_TOKEN,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ rows: listings, source, completeDomains }),
    });

if (!res.ok) {
  console.error(`db-sync: FAILED — HTTP ${res.status}: ${(await res.text()).slice(0, 500)}`);
  process.exit(1);
}
const counts = await res.json();
console.error(
  `db-sync: run ${counts.run_id} — ${counts.seen} seen, ${counts.new} new, ` +
  `${counts.price_changed} price changes, ${counts.delisted} delisted, ${counts.relisted} relisted`
);
