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
  // After listing_freshness, which it reads: the days-to-first-cut median is
  // only computed for cars 0028 gives a defensible listing date, so refreshing
  // this one first would date tonight's cuts against last night's verdicts
  // (0084). 12.4s measured on prod the day it landed.
  "dealer_price_behavior",
  // Last on purpose: it ships dark (0057), so it is the one to leave stale
  // if the night runs out of road. Its cost grows with the archive — 0057's
  // header says what to do the night it crowds its 60s budget.
  "ev_cohort_ask_weekly",
  // The market-trend views (0061/0064). Sales is cheap (0.2s, quarterly over
  // WA sales since 2019). The daily asks target is not a matview refresh: it
  // APPENDS one closed day per call (0104: fold the night's price rows into
  // the per-chain state, ~6s, then the day's cohort medians, ~10s), and says
  // how many days it is still "behind" — see DAY_TARGETS below.
  "ev_price_trend_sales",
  "ev_price_trend_ask_daily",
  // This VIN's history (0085). Last, and the cheapest thing on this list to
  // lose: it feeds a Pro-only block on ~2.3k listing pages and nothing else
  // reads it, so a night that runs out of road should stop here rather than
  // anywhere above. 0104 took it from 101s back to 8-41s (cache-dependent).
  "vin_listing_history",
];

// Targets that advance one closed day per call and answer {"behind": n}.
// Each call is its own statement with its own 60s budget, so a missed night
// (or the six days 2026-09-22..27 that piled up while one day cost 54s) is
// caught up by calling again, never by fitting several days into one call.
// Bounded: a week of catch-up is the most one night will attempt; anything
// past that is a reason to look, not to loop.
const DAY_TARGETS = new Set(["ev_price_trend_ask_daily"]);
const MAX_DAY_CALLS = 7;

const failed = [];

async function refreshOnce(view) {
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
    return null;
  }
  console.error(`refresh-variants: ${view} ${text.trim()} in ${secs}s`);
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

for (const view of VIEWS) {
  if (!DAY_TARGETS.has(view)) {
    if ((await refreshOnce(view)) === null) failed.push(view);
    continue;
  }
  let calls = 0;
  let out;
  do {
    out = await refreshOnce(view);
    calls++;
  } while (out !== null && Number(out.behind) > 0 && calls < MAX_DAY_CALLS);
  if (out === null) {
    failed.push(view);
  } else if (Number(out.behind) > 0) {
    console.error(`refresh-variants: ${view} still ${out.behind} day(s) behind after ${calls} calls`);
    failed.push(view);
  }
}

// ONE MORE PASS, LATER (2026-10-06). Both nights this script failed in the
// last ten (09-30, 10-03) had the same shape: a view that costs 45-50s every
// other night (ev_cohort_ask_weekly) or the daily fold timed out at 60s, and
// pg_stat_user_tables shows an autovacuum starting on a neighbouring table
// minutes before the step began — listing_seen at 17:18 UTC against a
// 17:22-17:43 step on 09-30, listing_events at 15:35 against 15:45-16:21 on
// 10-03 — while no CI job was writing to the database at all. A refresh that
// loses its budget to a vacuum is not a reason to leave the view stale for a
// day; it is a reason to ask again once the vacuum has moved on. So the
// failures are retried once, after a wait long enough for an autovacuum pass
// on a 150 MB table to finish, and only a view that fails twice is reported.
// A DAY_TARGET is retried the same way: a call that times out advanced
// nothing, so calling again is the same request, not a double fold.
const RETRY_WAIT_S = Number(process.env.REFRESH_RETRY_WAIT_S ?? 600);
if (failed.length && RETRY_WAIT_S > 0) {
  console.error(`refresh-variants: ${failed.join(", ")} failed — waiting ${RETRY_WAIT_S}s and trying once more`);
  await new Promise((r) => setTimeout(r, RETRY_WAIT_S * 1000));
  const again = failed.splice(0);
  for (const view of again) {
    if (!DAY_TARGETS.has(view)) {
      if ((await refreshOnce(view)) === null) failed.push(view);
      continue;
    }
    let calls = 0;
    let out;
    do {
      out = await refreshOnce(view);
      calls++;
    } while (out !== null && Number(out.behind) > 0 && calls < MAX_DAY_CALLS);
    if (out === null || Number(out.behind) > 0) failed.push(view);
  }
}
if (failed.length) {
  console.error(`refresh-variants: FAILED — ${failed.join(", ")} left stale (${VIEWS.length - failed.length}/${VIEWS.length} refreshed)`);
  process.exit(1);
}
console.error(`refresh-variants: all ${VIEWS.length} views refreshed`);
