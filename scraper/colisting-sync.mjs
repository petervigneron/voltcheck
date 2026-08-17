#!/usr/bin/env node
// scraper/out/colisting-pairs.json → Supabase, via the ingest_colisting RPC
// (supabase/migrations/0036_vin_colisting.sql). Plain Node, no dependencies.
//
// merge-shards.mjs writes that file: every VIN it saw on more than one dealer
// domain tonight, with the domain and price of each sighting. That is the
// dealer-group graph — which rooftops share inventory, therefore which
// rooftops share an owner — and it exists only in the moment between the
// shards being merged and the dedupe throwing the losers away. This is the
// step that gets it out of the runner before the runner is deleted.
//
// A SEPARATE SCRIPT rather than a branch inside db-sync.mjs, on purpose:
//   * db-sync runs twice on nights the price audit corrects a price (the
//     nightly re-runs it on exit 20). Co-listing is not affected by a price
//     correction, so a second write would be pure noise. The RPC's replay
//     guard would absorb it, but relying on a guard to undo a call that should
//     never have happened is worse than not making it.
//   * db-sync exits 1 on a failed chunk, and it should — listings are what a
//     shopper sees. This dataset is archive: losing a night of it costs a
//     night of graph, not a wrong price, and it must not be able to take the
//     listings sync down with it.
//   * refresh-variants.mjs already set the pattern: one script per dataset,
//     each with its own credentials block and its own retry ladder.
//
// Gateway mode only. Unlike db-sync there is no service-key path here: this
// script only ever runs on GitHub's runners, which hold the scoped ingest
// token and nothing more, and adding a service-key branch would be inventing
// a way for the project's real key to reach a machine that has never needed
// it.
import { readFile } from "node:fs/promises";
import { fetchWithRetry } from "./lib/retry.mjs";

// Minimal .env parser — same as db-sync.mjs; launchd jobs and bare `node`
// invocations carry no shell environment.
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

const { SUPABASE_URL, SUPABASE_ANON_KEY: ANON, SUPABASE_INGEST_TOKEN: TOKEN } = process.env;
if (!SUPABASE_URL || !ANON || !TOKEN) {
  console.error("colisting-sync: no Supabase credentials (scraper/.env) — skipping.");
  process.exit(0);
}

let rows;
try {
  rows = JSON.parse(await readFile(new URL("./out/colisting-pairs.json", import.meta.url), "utf-8"));
} catch {
  // No merge ran this invocation (probe-only night, or a local run). Nothing
  // to say about the world; not a failure.
  console.error("colisting-sync: no out/colisting-pairs.json — nothing to sync.");
  process.exit(0);
}
if (!Array.isArray(rows)) {
  console.error("colisting-sync: out/colisting-pairs.json is not an array — refusing to send it.");
  process.exit(1);
}
if (rows.length === 0) {
  // Genuinely possible and genuinely meaningful: it means no VIN appeared on
  // two domains. Sending an empty batch would write nothing, so don't — but
  // say so, because on a normal night this number is in the thousands and a
  // zero is far more likely to mean the merge broke than that the market did.
  console.error("colisting-sync: 0 multi-domain VINs tonight — nothing to send (expected thousands; check merge-shards).");
  process.exit(0);
}

// The night key. Same derivation as db-sync's `observedAt`: the EARLIEST
// crawledAt across the shard reports, because the graph is only as fresh as
// the oldest evidence in it and claiming otherwise would be claiming evidence
// we do not have. Every chunk of tonight's body carries this one timestamp,
// which is what makes "tonight's graph" an equality query — and what makes a
// replayed chunk collide with itself instead of duplicating (0036).
let observedAt = null;
try {
  const reports = JSON.parse(await readFile(new URL("./out/report.json", import.meta.url), "utf-8"));
  const times = reports.map((r) => Date.parse(r.crawledAt)).filter(Number.isFinite);
  if (times.length) observedAt = new Date(Math.min(...times)).toISOString();
} catch {}
if (!observedAt) {
  // Without a shared key the replay guard cannot fire, so say that out loud
  // rather than letting a duplicated chunk quietly double an edge's weight.
  console.error("colisting-sync: no crawl report timestamps — the server will stamp now(), and a retried chunk can duplicate.");
}

// Sizing, measured rather than assumed. A row is one 17-character VIN plus 2-3
// sightings of {domain, priceUsd}; against the committed feed snapshot's
// domain-length distribution that is ~150 bytes serialized, so 8,564
// multi-domain VINs is ~1.3MB — comfortably one request. The chunking below is
// therefore not expected to split anything; it exists because "expected"
// stopped being good enough for the listings feed the night it outgrew the
// gateway's body ceiling, and a limit discovered in production is a lost
// night. Chunks are independent: unlike db-sync's, a chunk boundary here can
// fall anywhere, because nothing in this RPC reasons about absence.
const CHUNK_BYTES = Number(process.env.COLISTING_CHUNK_BYTES ?? 4_000_000);
const chunks = [];
let cur = [];
let curBytes = 0;
for (const row of rows) {
  const bytes = JSON.stringify(row).length + 1;
  if (cur.length && curBytes + bytes > CHUNK_BYTES) {
    chunks.push(cur);
    cur = [];
    curBytes = 0;
  }
  cur.push(row);
  curBytes += bytes;
}
chunks.push(cur);

const domains = new Set(rows.flatMap((r) => r.sightings.map((s) => s.domain)));
console.error(
  `colisting-sync: ${rows.length} multi-domain VINs across ${domains.size} domains, ` +
  `observed ${observedAt ?? "UNKNOWN (server stamps now())"} — ${chunks.length} chunk(s), ` +
  `${(JSON.stringify(rows).length / 1e6).toFixed(2)}MB`
);

let inserted = 0;
for (const [i, chunk] of chunks.entries()) {
  // The shared ladder (30/120/240s), for the reason lib/retry.mjs documents:
  // a bare fetch against this database is a domino waiting for the next night
  // the Nano instance OOMs, and every script that talked to it without one
  // eventually became that domino. Replay is safe here by construction —
  // (vin, observed_at) is unique and the insert is on-conflict-do-nothing.
  const res = await fetchWithRetry(`colisting-sync: chunk ${i + 1}/${chunks.length}`, () =>
    fetch(`${SUPABASE_URL}/functions/v1/ingest`, {
      method: "POST",
      headers: {
        apikey: ANON,
        Authorization: `Bearer ${ANON}`,
        "x-ingest-token": TOKEN,
        // Streams the body straight through to PostgREST instead of parsing
        // it inside the edge isolate — the 2026-08-16 OOM documented in
        // supabase/functions/ingest/index.ts. This body is small enough not to
        // need it, but the parsed path would require a bespoke gateway route
        // and a translation step, which is more code and more to redeploy.
        "x-ingest-rpc": "ingest_colisting",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ _rows: chunk, _observed_at: observedAt }),
    })
  );
  if (!res.ok) {
    console.error(
      `colisting-sync: chunk ${i + 1}/${chunks.length} FAILED — ` +
      `${res.status === 0 ? "network error" : `HTTP ${res.status}`}: ${(await res.text()).slice(0, 300)}`
    );
    process.exit(1);
  }
  const out = await res.json();
  inserted += out.inserted ?? 0;
  if (out.inserted === 0) {
    console.error(`colisting-sync: chunk ${i + 1}/${chunks.length} inserted 0 — already loaded for ${out.observed_at} (replay)`);
  }
}
console.error(`colisting-sync: ${inserted} co-listing rows recorded`);
