#!/usr/bin/env node
// Recompute the observed half of vin_variant (migration 0020).
//
// vin_variant_observed reads which trim a VIN cohort's own listings agree on.
// It used to be a plain view, which meant a full scan of every live listing
// on every page render — 3.8s once the feed reached 50k, past anon's 8s
// statement timeout, so the listing page's sold-price box silently vanished.
// It is a materialized view now, and this is what keeps it current.
//
// Runs after recheck, which is the last step that changes what's live.
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
const res = await fetchWithRetry("refresh-variants", () =>
  fetch(`${SUPABASE_URL}/functions/v1/ingest`, {
    method: "POST",
    headers: {
      apikey: ANON,
      Authorization: `Bearer ${ANON}`,
      "x-ingest-token": TOKEN,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ dataset: "refresh_variants" }),
  })
);
const text = await res.text();
if (!res.ok) {
  console.error(`refresh-variants: FAILED HTTP ${res.status} — ${text.slice(0, 300)}`);
  process.exit(1);
}
console.error(`refresh-variants: ${text.trim()}`);
