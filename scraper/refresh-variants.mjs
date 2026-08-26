#!/usr/bin/env node
// Recompute the observed half of vin_variant (migration 0020).
//
// vin_variant_observed reads which trim a VIN cohort's own listings agree on.
// It used to be a plain view, which meant a full scan of every live listing
// on every page render — 3.8s once the feed reached 50k, past anon's 3s
// statement timeout (an earlier version of this comment said 8s; that is
// authenticated's ceiling, not anon's — pg_roles, 2026-08-26), so the
// listing page's sold-price box silently vanished. It is a materialized
// view now, and this is what keeps it current.
//
// Runs FIRST in nightly's finalize-audits job, right after finalize-ingest
// settles the night's listings — not "after recheck" as this header once
// claimed (it never ran there; recheck is a later job). recheck's removals
// therefore reach these views a night late, which has been the status quo
// all along; moving the refresh after recheck is a job-topology change
// nobody has needed yet.
// REFRESH ... CONCURRENTLY, so readers are never blocked.
import { readFile } from "node:fs/promises";
import { fetchWithRetry } from "./lib/retry.mjs";

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
if (!SUPABASE_URL || !TOKEN || !ANON) {
  console.error("refresh-variants: no Supabase credentials (scraper/.env) — skipping.");
  process.exit(0);
}

// This is the last step of the night that touches the database, and it runs
// unconditionally — so after the 08-14→08-17 red streak was traced to bare
// unretried fetches in db-sync and recheck, this bare fetch was the next
// domino waiting. Replay is safe: it only refreshes materialized views.
//
// ONE VIEW PER CALL (0051). This used to be a single request that refreshed
// all four views inside one statement_timeout, and on 2026-08-25 the sum
// stopped fitting: 500/57014 after three retries, ~67s burned before the
// cancel. Measured individually that night — observed 29.3s, freshness 17.7s,
// trim_spread 16.4s, velocity 5.3s, total 68.7s against a 60s ceiling — so
// nothing here is individually in trouble; the call was. Split, each view has
// the whole budget and better than 2x headroom on the worst.
//
// Order matters only in that vin_variant_observed goes first: it is the one
// the listing page's sold-price box reads, so if the night is going to run
// out of road, that is the view to have refreshed.
//
// Every view is attempted even after one fails, and the failures are
// collected rather than thrown on. All-or-nothing is what made the old
// version expensive — one slow view left all four stale — and a view that
// refreshed fine should not be held stale by a neighbour that didn't.
const VIEWS = [
  "vin_variant_observed",
  "listing_freshness",
  "ev_cohort_trim_spread",
  "ev_cohort_velocity",
];

const failed = [];
for (const view of VIEWS) {
  const t0 = Date.now();
  // x-ingest-rpc streams the body straight through to the RPC, so this needs
  // no gateway change: refresh_vin_variants is already on its allowlist.
  const res = await fetchWithRetry(`refresh-variants ${view}`, () =>
    fetch(`${SUPABASE_URL}/functions/v1/ingest`, {
      method: "POST",
      headers: {
        apikey: ANON,
        Authorization: `Bearer ${ANON}`,
        "x-ingest-token": TOKEN,
        "x-ingest-rpc": "refresh_vin_variants",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ target: view }),
    })
  );
  const text = await res.text();
  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  if (!res.ok) {
    console.error(`refresh-variants: ${view} FAILED HTTP ${res.status} after ${secs}s — ${text.slice(0, 300)}`);
    failed.push(view);
    continue;
  }
  console.error(`refresh-variants: ${view} ${text.trim()} in ${secs}s`);
}

if (failed.length) {
  console.error(`refresh-variants: FAILED — ${failed.join(", ")} left stale (${VIEWS.length - failed.length}/${VIEWS.length} refreshed)`);
  process.exit(1);
}
console.error(`refresh-variants: all ${VIEWS.length} views refreshed`);
