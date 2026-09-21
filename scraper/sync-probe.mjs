#!/usr/bin/env node
// Side-effect-free probe of the sync path db-sync.mjs uses, for the
// PGRST102 "Empty or invalid json" failures that began 2026-09-19.
//
// Every request here carries a body whose only key is `_pad`, which is not a
// parameter of ingest_listings. PostgREST parses the body first and only then
// looks the function up by its parameter names, so a body it can PARSE gets
// PGRST202 ("Could not find the function ... (_pad)") and nothing executes,
// while a body it cannot parse (or receives truncated/empty) gets PGRST102.
// That turns the parse step into an oracle without writing a row:
//   * `surrogate` — a lone UTF-16 surrogate escape, the thing JSON.stringify
//     emits for a string cut mid-emoji. PGRST102 here means a chunk carrying
//     one can never land; PGRST202 rules that mechanism out.
//   * `big` × rounds — ~3 MB of well-formed JSON in the shape of a chunk,
//     sent back to back the way db-sync sends chunks. Any PGRST102 is a body
//     that did not arrive intact. "edge" goes through functions/v1/ingest
//     with x-ingest-rpc exactly as db-sync does; "direct" goes to PostgREST
//     with the service key, so a difference between the two is the edge
//     function.
// Exits 0 whatever it finds — this is a measurement, not a check, and a red
// run would only add to the alert noise it is investigating.
import { mkdir, writeFile } from "node:fs/promises";

const URL_ = process.env.SUPABASE_URL;
const ANON = process.env.SUPABASE_ANON_KEY;
const TOKEN = process.env.SUPABASE_INGEST_TOKEN;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const rounds = Number(process.env.PROBE_ROUNDS || 25);
const targetBytes = Number(process.env.PROBE_BYTES || 3_000_000);
if (!URL_ || !ANON || !TOKEN) {
  console.error("sync-probe: SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_INGEST_TOKEN are required");
  process.exit(0);
}

const routes = {
  edge: (body) =>
    fetch(`${URL_}/functions/v1/ingest`, {
      method: "POST",
      headers: {
        apikey: ANON,
        Authorization: `Bearer ${ANON}`,
        "x-ingest-token": TOKEN,
        "x-ingest-rpc": "ingest_listings",
        "Content-Type": "application/json",
      },
      body,
    }),
  ...(SERVICE
    ? {
        direct: (body) =>
          fetch(`${URL_}/rest/v1/rpc/ingest_listings`, {
            method: "POST",
            headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/json" },
            body,
          }),
      }
    : {}),
};

// A chunk-shaped pad: ~1,700 objects of ~1.7 KB, like 1,700 listing rows.
function bigBody() {
  const rows = [];
  let bytes = 0;
  const text = "x".repeat(1_600);
  for (let i = 0; bytes < targetBytes; i++) {
    const r = { vin: `PROBE${String(i).padStart(12, "0")}`, description: text, i };
    rows.push(r);
    bytes += JSON.stringify(r).length + 1;
  }
  return JSON.stringify({ _pad: rows });
}

const results = [];
async function probe(name, route, body) {
  const t0 = Date.now();
  let status = 0, code = "", text = "";
  try {
    const res = await routes[route](body);
    status = res.status;
    text = (await res.text()).slice(0, 200);
    try { code = JSON.parse(text).code ?? ""; } catch { /* not json */ }
  } catch (e) {
    text = String(e?.cause?.code ?? e?.message ?? e).slice(0, 200);
  }
  const ms = Date.now() - t0;
  results.push({ name, route, bytes: body.length, status, code, ms, text });
  console.log(`${name.padEnd(16)} ${route.padEnd(7)} ${String(body.length).padStart(8)} B  HTTP ${status} ${code.padEnd(9)} ${String(ms).padStart(5)} ms  ${code === "PGRST202" ? "" : text}`);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
for (const route of Object.keys(routes)) {
  await probe("control", route, JSON.stringify({ _pad: "ok" }));
  await probe("surrogate-high", route, '{"_pad":"a\\ud83db"}');
  await probe("surrogate-low", route, '{"_pad":"a\\udc00b"}');
  await probe("nul-escape", route, '{"_pad":"a\\u0000b"}');
  await probe("raw-emoji", route, JSON.stringify({ _pad: "a🔥b" }));
}
const big = bigBody();
for (let i = 0; i < rounds; i++) {
  for (const route of Object.keys(routes)) await probe(`big-${i + 1}`, route, big);
  await sleep(250);
}

const summary = {};
for (const r of results) {
  const k = `${r.name.replace(/-\d+$/, "")}/${r.route}`;
  summary[k] ??= {};
  const c = `${r.status} ${r.code || r.text.slice(0, 40)}`;
  summary[k][c] = (summary[k][c] || 0) + 1;
}
console.log("\nsummary:", JSON.stringify(summary, null, 2));
await mkdir(new URL("./out/", import.meta.url), { recursive: true });
await writeFile(new URL("./out/sync-probe.json", import.meta.url), JSON.stringify({ rounds, targetBytes, summary, results }, null, 2));
