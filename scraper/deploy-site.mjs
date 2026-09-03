#!/usr/bin/env node
// Deploy web/ the only way that still works at this inventory size: build a
// production candidate WITHOUT moving the domain, warm every browse shard and
// sitemap on the candidate's own URL behind Vercel's Protection Bypass for
// Automation, verify what got cached, and only then promote. Shoppers never
// see a cold shard.
//
// WHY THIS EXISTS (2026-08-25, twice in one evening): at 137,544 cars a fresh
// deployment can no longer warm its 24 shards in one pass after the domain
// moves. A cold shard needs a full feed walk unless it lands inside db.ts's
// 10-minute in-process memo; warming /api/index/first eats ~200s of that
// window, ~15 shards fit behind it, and the rest cascade into 500s — which
// the client turns into a dead grid for EVERY visitor, because useCardIndex
// fetches all 24 and one failure fails the load. Both attempts were recovered
// with `vercel promote <previous>`. The root cause was never the warm rate:
// it was that an un-aliased deployment 302s to SSO, so warming could only
// start AFTER the domain moved, in front of shoppers, racing their traffic.
// The bypass secret (enabled 2026-08-25) removes exactly that constraint.
// Here, a failed warm costs nothing anyone can see: we simply don't promote.
//
// This also retires walk-gate.mjs as a PRE-deploy gate (it kept causing the
// starvation it gated against — see the walk-gate/deploy-trap note in its
// header). The warm below IS the gate now, run against the same database by
// the same code shoppers will hit, and its failure mode is "nothing changed".
//
//   node scraper/deploy-site.mjs                  build HEAD, warm, promote
//   node scraper/deploy-site.mjs --ref <sha>      pin the build to a commit
//   node scraper/deploy-site.mjs --url <dep-url>  warm+promote an existing
//                                                 candidate (skip the build)
//   node scraper/deploy-site.mjs --no-promote     everything except the last step
//   node scraper/deploy-site.mjs --smoke <url>    only the browser check, against any URL
//   node scraper/deploy-site.mjs --no-smoke       skip the browser check (no Playwright here)
//
// Exit 0 = promoted (or, with --no-promote, fully warmed and verified).
// Exit 1 = stopped before promoting. voltcheck.net is untouched either way
//          once the script says "candidate"; only `vercel promote` changes
//          what shoppers see, and it runs only after every check passes.
import { execFileSync, execFile } from "node:child_process";
import { mkdtempSync, rmSync, cpSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const arg = (n, d) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : d; };
const has = (n) => process.argv.includes(n);

// Keep in step with web/lib/listings/pack.ts SHARDS and web/lib/sitemap.ts
// SITEMAP_SHARDS (this lane can't import TS) — same rule as feed-shard-check.
const SHARD_PATHS = Array.from({ length: 24 }, (_, i) => `/api/index/${i}`);
const SITEMAP_PATHS = Array.from({ length: 12 }, (_, i) => `/sitemap/${i}.xml`);
// /api/index/first before everything: it is what the next visitor's first
// card waits on, and its render is the walk every later path's memo reuses.
// /api/index/trims is /worth's trim-facet body (2026-08-25) — same route,
// same memo, so it rides between first and the shards for free.
//
// The sitemaps are NOT in the pre-promote set (2026-08-26). What must be
// cached before the domain moves is exactly what breaks a shopper when cold:
// first + trims + the 24 shards the grid Promise.alls. A cold sitemap shard
// costs a crawler one 503-with-Retry-After and heals itself (its throw is
// never cached), so it can wait until after promote — where it warms through
// the domain riding whatever's left of the warm's last memo window. At ~42s
// a render, 12 sitemaps are a whole extra memo window, i.e. one extra full
// feed walk, and tonight walks are the scarcest resource there is. They do
// still have a deadline: feed-audits (06:15Z etc.) reads every advertised
// sitemap and goes red on a 503 — so a failed post-promote sitemap warm is
// this script exiting 1, not a shrug.
// trims FIRST, deliberately (2026-08-26 ~06:50Z): the walk-triggering render
// must finish inside maxDuration=300, and on a drained budget the walk alone
// runs 250-300s. first's render adds its first-paint payload build on top —
// measured dying at 280.8s and 283.8s with the walk still alive under it —
// while trims adds a ~31 KB body, nearly nothing. Triggering the walk from
// trims buys ~45s of ceiling headroom; once trims lands, the memo is proven
// live and first rides it as a ~42s render like any shard.
const WARM_PATHS = ["/api/index/trims", "/api/index/first", ...SHARD_PATHS];

// A cold render is one full feed walk: 195–249s measured on 2026-08-22/25,
// slower on a drained budget. The routes' maxDuration is 800 since the Pro
// upgrade (2026-08-26), so the client must outwait the server's own ceiling
// rather than abandon a render the platform would still have finished.
const COLD_RENDER_TIMEOUT_MS = 850_000;
// A pass ends at its first failure (the walk behind it died — see the break
// below), so a full warm is several short passes, each gated on the database
// proving it can carry the next walk. Memo-served renders are ~42s each
// (measured 2026-08-25), so ~14 paths fit per 10-min memo window and the
// 26-path critical set is ~2 windows. The cap is a backstop against a
// slow-flapping database that keeps passing the gate and failing the walk;
// the dry-pass ladder below catches everything else.
const MAX_PASSES = 20;
// Between passes the database must be ABLE to serve the next walk. Pass 1 on
// 2026-08-25 proved what firing passes back-to-back does: the warm's own
// walks drained the instance's disk-IO budget mid-pass, every later request
// fast-failed (the routes refuse to serve the fallback feed — 500/503 in
// ~2s), and further immediate passes only kept the budget pinned at zero,
// feed-shard-check's "repair that cannot succeed" shape. So after a pass
// with failures, probe the same two readings its clearPoisonedCache gates on
// (the count answers; a FAT feed page under 1.5s) and wait for them — up to
// RECOVERY_MAX_MS — before the next pass. Shoppers wait on nothing: the
// candidate is invisible until promote. Without credentials, sleep a fixed
// conservative window instead.
const RECOVERY_POLL_MS = 60_000;
// 45 min: a fully drained Nano disk-IO budget has taken half an hour-plus to
// refill (2026-08-25, a 1-row anon read at ~12s); the poll is a count and a
// few fat pages a minute, cheap enough to hold while it does.
const RECOVERY_MAX_MS = 45 * 60_000;
const NO_CREDS_BACKOFF_MS = 5 * 60_000;
// One healthy probe is NOT "recovered": measured 2026-08-26 01:22Z, a single
// fat page cleared in 0.54s and the walk fired 30+ "canceling statement due
// to statement timeout" in its first half-minute anyway — the budget had
// refilled enough for one page, and the walk's FEED_LANES concurrent readers
// drained it back to zero on contact. So the gate demands a STREAK of
// consecutive healthy probes a minute apart (partial refills fail one of
// them), each probe reading THREE fat pages back-to-back (closer to lane
// pressure than one). The streak also buys the budget that many quiet
// minutes of refill on top of whatever it had.
const HEALTHY_STREAK = 3;
// A failed walk is not waste — it is progress stored in the Postgres buffer
// cache. Measured 2026-08-26 at 01:00Z and leaned on here: a walk that died
// at 130s was followed 60s later by one that CLEARED in 142s, because the
// retry replays the dead walk's pages out of cache almost free and only pays
// cold IO past the old frontier. So on a failure the sweep waits just past
// db.ts's 60s walk-failure cooldown and retries the SAME path — each attempt
// reaches deeper — instead of deferring to a long ladder rung by which time
// the hot frontier has evicted. The per-pass attempt budget bounds how much
// cold IO one pass may spend before the ladder gets its say anyway.
const FAILURE_COOLDOWN_LAPSE_MS = 65_000;
// 15, raised from 10 (06:50Z): pass 1 spent its budget with the frontier at
// ~200s and rising ~35s per deep attempt — the cap was interrupting a climb
// that was converging, and the 12-min ladder rung between passes risks the
// frontier more than five extra attempts do.
const PASS_WALK_ATTEMPTS = 15;
// After a pass that warmed nothing, hold off before even probing again: the
// failed walk's canceled statements were themselves load, and probing into
// their wake reads recovery where there is none. The cooldown ESCALATES
// (base × dry-pass count) because the relationship is roughly linear and
// measured: ~25 min of true quiet bought a 127s walk, ~6 min bought 30s —
// call it ~5s of walk depth per quiet minute on a drained budget — and a
// full walk needs ~250s, so a fixed short cooldown retries forever, each
// attempt spending exactly what it just accrued (the 2026-08-26 night in
// one sentence). A ladder converges instead: some rung finally holds a
// whole walk's worth.
const DRY_PASS_COOLDOWN_MS = 12 * 60_000;
const MAX_DRY_PASSES = 8;
// Same thresholds as feed-shard-check.mjs, same incidents behind them.
const SUM_TOLERANCE = 0.03;
const SHARD_BALANCE_TOLERANCE = 0.25;
const SHARD_BYTES_CAP = 4_500_000;
const SHARD_BYTES_WARN_AT = 0.7;

function bypassSecret() {
  if (process.env.VERCEL_AUTOMATION_BYPASS_SECRET) return process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  const f = join(ROOT, "docs", "vercel-protection-bypass-secret.txt");
  if (existsSync(f)) {
    const s = readFileSync(f, "utf8").split("\n")[0].trim();
    if (s) return s;
  }
  console.error(
    "deploy-site: no bypass secret — set VERCEL_AUTOMATION_BYPASS_SECRET or restore " +
      "docs/vercel-protection-bypass-secret.txt. Without it the candidate's URL 302s to SSO " +
      "and warming would have to happen after the domain moves, in front of shoppers — " +
      "the exact failure this script exists to prevent. Not deploying."
  );
  process.exit(1);
}

// On a laptop the CLI is already logged in and linked (web/.vercel). In CI
// (deploy-site.yml) there is no login and no .vercel directory, so auth and
// project identity ride in as env: VERCEL_TOKEN/VERCEL_SCOPE here, and the
// CLI's own VERCEL_ORG_ID/VERCEL_PROJECT_ID pass through untouched.
const CLI_AUTH = process.env.VERCEL_TOKEN
  ? ["--token", process.env.VERCEL_TOKEN, ...(process.env.VERCEL_SCOPE ? ["--scope", process.env.VERCEL_SCOPE] : [])]
  : [];
// stdin is "ignore" by default, not execFileSync's piped default: with a pipe
// that nothing writes to, `vercel ls` sat for 3.5 minutes on 2026-09-02 and
// never printed (the deploy call below had already learned this and passes
// its own stdio). Same fix for every CLI call, so a hang cannot come back
// through the pre-check that guards against stacked builds.
const vercel = (args, opts = {}) =>
  execFileSync("vercel", [...args, ...CLI_AUTH], {
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
    stdio: ["ignore", "pipe", "inherit"],
    ...opts,
  });

// ---------------------------------------------------------------- build
function buildCandidate(ref) {
  // Refuse to stack builds: every build reads the one free-plan database, and
  // two at once is the 2026-08-16 crash-loop.
  const ls = vercel(["ls"]);
  if (/Building|Queued/i.test(ls)) {
    console.error("deploy-site: a deployment is already Building/Queued (vercel ls) — wait it out first.");
    process.exit(1);
  }
  // Build from a throwaway worktree pinned to one commit, never from the
  // shared working tree: several sessions edit it at once, and `vercel deploy`
  // ships the TREE, not a commit. (No node_modules lands here — the build is
  // remote — so this stays a few MB and is removed below either way.)
  const sha = execFileSync("git", ["rev-parse", ref], { cwd: ROOT, encoding: "utf8" }).trim();
  const wt = mkdtempSync(join(tmpdir(), "voltcheck-deploy-"));
  console.log(`deploy-site: building ${sha.slice(0, 8)} from a clean worktree (${wt})`);
  try {
    execFileSync("git", ["worktree", "add", "--detach", wt, sha], { cwd: ROOT, stdio: "inherit" });
    // On a laptop web/.vercel carries the project link and the throwaway
    // worktree needs its own copy. In CI that directory does not exist —
    // the link rides in as VERCEL_ORG_ID/VERCEL_PROJECT_ID, exactly as the
    // CLI_AUTH comment above describes. Copying it unconditionally is what
    // made this function laptop-only, and why deploy-site.yml had to be
    // handed a URL built somewhere else; on 2026-09-02 the local token
    // expired and there was no way to ship at all, with VERCEL_TOKEN sitting
    // in repo secrets the whole time.
    const link = join(ROOT, "web", ".vercel");
    if (existsSync(link)) {
      cpSync(link, join(wt, "web", ".vercel"), { recursive: true });
    } else if (!process.env.VERCEL_ORG_ID || !process.env.VERCEL_PROJECT_ID) {
      // Better to stop here than to let the CLI prompt for a project and
      // deploy this tree somewhere nobody is looking.
      throw new Error(
        "no web/.vercel to copy and no VERCEL_ORG_ID/VERCEL_PROJECT_ID — " +
          "the CLI would have nothing to link the build to",
      );
    }
    const out = vercel(["deploy", "--prod", "--skip-domain", "--yes"], { cwd: join(wt, "web"), stdio: ["ignore", "pipe", "inherit"] });
    // Two stdout shapes in the wild: classic CLI prints the bare deployment
    // URL; the CLI under the claude-plugins wrapper prints a JSON status
    // object with .deployment.url (seen 2026-08-25, CLI 50.39.0).
    const trimmed = out.trim();
    if (trimmed.startsWith("{")) {
      const parsed = JSON.parse(trimmed);
      const u = parsed?.deployment?.url;
      if (u && parsed?.status === "ok") return u;
      throw new Error(`vercel deploy JSON output had no deployment.url:\n${trimmed}`);
    }
    const url = trimmed.split("\n").reverse().find((l) => /^https:\/\/\S+\.vercel\.app$/.test(l.trim()));
    if (!url) throw new Error(`could not find a deployment URL in vercel's output:\n${out}`);
    return url.trim();
  } finally {
    try { execFileSync("git", ["worktree", "remove", "--force", wt], { cwd: ROOT }); } catch { rmSync(wt, { recursive: true, force: true }); }
  }
}

// ---------------------------------------------------------------- warm
let lastBodyBytes = 0;
async function fetchPath(base, path, headers, timeoutMs) {
  const t0 = Date.now();
  const res = await fetch(`${base}${path}`, { headers, signal: AbortSignal.timeout(timeoutMs) });
  const text = await res.text();
  lastBodyBytes = Buffer.byteLength(text);
  if (!res.ok) throw new Error(`HTTP ${res.status} after ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  return { text, secs: (Date.now() - t0) / 1000, cache: res.headers.get("x-vercel-cache") ?? "?" };
}

function supabaseCreds() {
  if (process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY)
    return { url: process.env.SUPABASE_URL, key: process.env.SUPABASE_ANON_KEY };
  const f = join(ROOT, "scraper", ".env");
  if (!existsSync(f)) return null;
  const env = Object.fromEntries(
    readFileSync(f, "utf8").split("\n").map((l) => l.match(/^([A-Z0-9_]+)=(.*)$/)).filter(Boolean).map((m) => [m[1], m[2].trim()])
  );
  return env.SUPABASE_URL && env.SUPABASE_ANON_KEY ? { url: env.SUPABASE_URL, key: env.SUPABASE_ANON_KEY } : null;
}

/** feed-shard-check's dbCanServeAWalk, verbatim in spirit: the count proves
 *  PostgREST answers at all, and a FAT feed page (db.ts's own column list — a
 *  thin select can be served from an index on a box the real walk dies on)
 *  under 1.5s proves it can move real pages. */
async function dbCanServeAWalk(creds) {
  const headers = { apikey: creds.key, Authorization: `Bearer ${creds.key}` };
  try {
    const count = await fetch(`${creds.url}/rest/v1/listings?select=vin&delisted_at=is.null`, {
      headers: { ...headers, Range: "0-0", Prefer: "count=exact" },
      signal: AbortSignal.timeout(20_000),
    });
    if (count.status !== 200 && count.status !== 206) return { ok: false, why: `count answered HTTP ${count.status}` };
    const sel = "vin,payload,first_seen_at,last_seen_at,prev_price_usd,price_changed_at,buyback_disclosed,listed_on";
    // Three fat pages from different VIN neighborhoods, back-to-back: one page
    // can clear on a budget the walk's concurrent lanes exhaust on contact.
    const times = [];
    for (const prefix of ["1", "J", "W"]) {
      const t0 = Date.now();
      const page = await fetch(`${creds.url}/rest/v1/live_listings_feed?select=${sel}&order=vin.asc&limit=500&vin=gte.${prefix}`, {
        headers,
        signal: AbortSignal.timeout(20_000),
      });
      await page.arrayBuffer();
      const secs = (Date.now() - t0) / 1000;
      if (page.status !== 200 || secs > 1.5) return { ok: false, why: `fat page vin=gte.${prefix} HTTP ${page.status} in ${secs.toFixed(2)}s (ceiling 1.5s)` };
      times.push(secs.toFixed(2));
    }
    return { ok: true, why: `count ok, fat pages ${times.join("/")}s` };
  } catch (e) {
    return { ok: false, why: e.message };
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Wait until the database can serve the next pass's walk. True = go; false =
 *  it never recovered inside RECOVERY_MAX_MS and the run should stop. */
async function awaitRecovery() {
  const creds = supabaseCreds();
  if (!creds) {
    console.log(`deploy-site: no Supabase credentials to probe with — backing off ${NO_CREDS_BACKOFF_MS / 60000} min blind`);
    await sleep(NO_CREDS_BACKOFF_MS);
    return true;
  }
  const t0 = Date.now();
  let streak = 0;
  while (Date.now() - t0 < RECOVERY_MAX_MS) {
    const gate = await dbCanServeAWalk(creds);
    if (gate.ok) {
      streak++;
      if (streak >= HEALTHY_STREAK) {
        console.log(`deploy-site: database ready — ${streak} healthy probes in a row (${gate.why})`);
        return true;
      }
      console.log(`deploy-site: healthy probe ${streak}/${HEALTHY_STREAK} (${gate.why}) — continuing the streak`);
    } else {
      streak = 0;
      console.log(`deploy-site: database not ready (${gate.why}) — streak reset, waiting`);
    }
    await sleep(RECOVERY_POLL_MS);
  }
  return false;
}

function rowCount(body) {
  if (Array.isArray(body)) return body.length;
  if (Array.isArray(body?.r)) return body.r.length;
  if (Array.isArray(body?.rows)) return body.rows.length;
  return null;
}

/** Warm every path on `base`, STRICTLY sequentially: concurrent requests land
 *  on separate lambda instances, each without the walk memo, and turn one walk
 *  into several against a database that can barely afford one. Sequential
 *  requests reuse the warm instance — that reuse is the whole mechanism. */
async function warmAll(base, headers) {
  const state = new Map(); // path -> {rows, bytes, secs} for shards; {ok} otherwise
  let total = null;
  let dryPasses = 0;
  // Gate before pass 1 and after any dry pass — but NOT between passes that
  // are making progress: those are riding a live walk memo, the sweep costs
  // the database nothing, and a 3-minute health audition would burn the
  // memo's remaining minutes for no information.
  let gateNeeded = true;
  for (let pass = 1; pass <= MAX_PASSES; pass++) {
    const pending = WARM_PATHS.filter((p) => !state.has(p));
    if (!pending.length) break;
    if (gateNeeded && !(await awaitRecovery())) {
      console.log("deploy-site: database did not recover within the window — stopping the warm rather than pinning its IO budget at zero. Already-warmed paths are kept; re-run with --url when it's back.");
      break;
    }
    console.log(`deploy-site: warm pass ${pass}/${MAX_PASSES} — ${pending.length} paths to go`);
    const before = state.size;
    let walkAttempts = 0;
    for (const path of pending) {
      if (walkAttempts >= PASS_WALK_ATTEMPTS) {
        console.log(`deploy-site: pass walk-attempt budget spent (${PASS_WALK_ATTEMPTS}) — remaining paths wait for the next pass`);
        break;
      }
      // Retry the SAME path until it lands or the pass's attempt budget is
      // spent — each retry follows the failure cooldown and rides the hot
      // frontier the previous attempt paid for (see PASS_WALK_ATTEMPTS).
      while (!state.has(path) && walkAttempts < PASS_WALK_ATTEMPTS) {
      try {
        const { text, secs, cache } = await fetchPath(base, path, headers, COLD_RENDER_TIMEOUT_MS);
        if (path === "/api/index/first") {
          const body = JSON.parse(text);
          if (typeof body.total !== "number") throw new Error("no numeric .total");
          total = body.total;
          state.set(path, { ok: true });
          console.log(`  first: total ${total} (${secs.toFixed(1)}s, ${cache})`);
        } else if (path === "/api/index/trims") {
          const body = JSON.parse(text);
          if (body.v !== 1 || !body.trims) throw new Error("unexpected shape");
          state.set(path, { ok: true });
          console.log(`  trims: ${Object.keys(body.trims).length} makes (${secs.toFixed(1)}s, ${cache})`);
        } else if (path.startsWith("/api/index/")) {
          const n = rowCount(JSON.parse(text));
          if (n === null) throw new Error("unexpected shape");
          state.set(path, { rows: n, bytes: lastBodyBytes });
          console.log(`  ${path}: ${n} rows, ${(lastBodyBytes / 1e6).toFixed(2)} MB (${secs.toFixed(1)}s, ${cache})`);
        } else {
          const locs = (text.match(/<loc>/g) ?? []).length;
          if (!locs) throw new Error("no <loc> entries");
          state.set(path, { locs });
          console.log(`  ${path}: ${locs} URLs (${secs.toFixed(1)}s, ${cache})`);
        }
      } catch (e) {
        // Two failure shapes, one response. A render that dies while its
        // walk survives server-side (measured 04:26Z: 500 at 280.8s, pages
        // still streaming after) is caught by the retry joining the live
        // memo. A walk that genuinely died is caught by the retry riding
        // the buffer-cache frontier after the 60s cooldown lapses. Either
        // way: wait, retry the same path, let the attempt budget decide
        // when this pass has spent enough.
        walkAttempts++;
        if (walkAttempts >= PASS_WALK_ATTEMPTS) {
          console.log(`  ${path}: ${e.message} — pass attempt budget spent (${PASS_WALK_ATTEMPTS})`);
        } else {
          console.log(`  ${path}: ${e.message} — retrying this path in ${FAILURE_COOLDOWN_LAPSE_MS / 1000}s (attempt ${walkAttempts}/${PASS_WALK_ATTEMPTS})`);
          await sleep(FAILURE_COOLDOWN_LAPSE_MS);
        }
      }
      }
    }
    if (state.size === before) {
      // The gate can pass and the walk still die: a partial refill carries
      // three sequential probe pages but not FEED_LANES concurrent readers
      // (2026-08-26). One dry pass is that, not a defect — cool down and let
      // the budget refill without us probing into the failed walk's wake.
      // Three in a row after full gate streaks is something else; stop.
      dryPasses++;
      if (dryPasses >= MAX_DRY_PASSES) {
        console.log(`deploy-site: ${MAX_DRY_PASSES} consecutive passes warmed nothing even with the gate passing — not an IO-refill shape any more; stopping.`);
        break;
      }
      const cooldown = DRY_PASS_COOLDOWN_MS * dryPasses;
      console.log(`deploy-site: pass warmed nothing (dry ${dryPasses}/${MAX_DRY_PASSES}) — cooling down ${cooldown / 60000} min before re-probing`);
      await sleep(cooldown);
      gateNeeded = true;
    } else {
      dryPasses = 0;
      gateNeeded = false;
    }
  }
  return { state, total };
}

/** The same questions feed-shard-check asks of production, asked of the
 *  candidate BEFORE it becomes production. Returning problems here is the
 *  script working, not failing: nothing has changed for shoppers yet. */
function validate(state, total) {
  const problems = [];
  const missing = WARM_PATHS.filter((p) => !state.has(p));
  if (missing.length) problems.push(`${missing.length} paths never warmed: ${missing.join(", ")}`);
  const shards = SHARD_PATHS.filter((p) => state.has(p)).map((p) => state.get(p));
  if (shards.length === SHARD_PATHS.length && total != null) {
    const summed = shards.reduce((a, s) => a + s.rows, 0);
    const diff = Math.abs(summed - total) / total;
    if (diff > SUM_TOLERANCE)
      problems.push(`shards sum to ${summed} rows against first's total ${total} — ${(diff * 100).toFixed(1)}% apart`);
    const even = summed / shards.length;
    const off = SHARD_PATHS.filter((p) => Math.abs(state.get(p).rows - even) / even > SHARD_BALANCE_TOLERANCE);
    if (off.length) problems.push(`shard(s) ${off.join(", ")} sit >25% off the even split — a different vintage from their siblings`);
    const fat = Math.max(...shards.map((s) => s.bytes));
    if (fat > SHARD_BYTES_CAP) problems.push(`largest shard is ${(fat / 1e6).toFixed(2)} MB, past the ~4.5 MB cold-render cap — raise SHARDS in web/lib/listings/pack.ts`);
    else if (fat > SHARD_BYTES_CAP * SHARD_BYTES_WARN_AT)
      console.log(`deploy-site: WARNING — largest shard is ${(fat / 1e6).toFixed(2)} MB, ${((100 * fat) / SHARD_BYTES_CAP).toFixed(0)}% of the cold-render cap; raise SHARDS before it gets there`);
    const locs = SITEMAP_PATHS.filter((p) => state.has(p)).reduce((a, p) => a + state.get(p).locs, 0);
    if (locs && locs < total * (1 - SUM_TOLERANCE)) problems.push(`sitemaps list ${locs} URLs against ${total} cars`);
  }
  return problems;
}

// ---------------------------------------------------------------- smoke
// The warm proves the candidate's routes ANSWER. It does not prove the page
// RUNS: on 2026-09-03 a commit shipped main with the browse page throwing
// "test is not a function" on first render for every visitor, every path
// still answered 200, and a deploy of it was in progress when a person
// noticed. So before promote a real browser loads the candidate's homepage
// and one listing page behind the bypass and the promote is refused if
// either throws an uncaught error, or if the rail and the first card never
// appear. Playwright's headless shell, the same one the browser crawl lanes
// use; ~20 s. `--no-smoke` skips it (a laptop without Playwright);
// `--smoke <url>` runs only this, against any deployment or the domain.
const SMOKE_TIMEOUT_MS = 60_000;
async function smoke(base, extraHeaders) {
  let pw;
  try {
    pw = await import("playwright");
  } catch (e) {
    return [`playwright is not installed here (${e.code ?? e.message}) — run \`npm ci\` in scraper/ and \`npx playwright install chromium-headless-shell\`, or pass --no-smoke`];
  }
  const problems = [];
  const browser = await pw.chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ extraHTTPHeaders: extraHeaders, viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();
    const thrown = [];
    page.on("pageerror", (err) => thrown.push(String(err?.message ?? err).split("\n")[0].slice(0, 200)));
    const visit = async (path, expect) => {
      thrown.length = 0;
      const t0 = Date.now();
      try {
        await page.goto(base + path, { waitUntil: "load", timeout: SMOKE_TIMEOUT_MS });
        for (const [label, selector, min] of expect) {
          try {
            await page.waitForFunction(
              ([sel, n]) => document.querySelectorAll(sel).length >= n,
              [selector, min],
              { timeout: SMOKE_TIMEOUT_MS }
            );
          } catch {
            const got = await page.evaluate((sel) => document.querySelectorAll(sel).length, selector);
            problems.push(`${path}: ${label} never appeared (${got} of ${min} \`${selector}\` after ${SMOKE_TIMEOUT_MS / 1000}s)`);
          }
        }
      } catch (e) {
        problems.push(`${path}: did not load — ${String(e.message).split("\n")[0].slice(0, 160)}`);
      }
      if (thrown.length) problems.push(`${path}: the page threw — ${thrown.join(" | ")}`);
      console.log(`  smoke ${path}: ${thrown.length ? "THREW" : "ok"} (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
      return page;
    };
    // The browse page: the rail's quick toggles and at least one car card.
    await visit("/", [
      ["the filter rail", "button[aria-pressed]", 3],
      ["the first card", 'a[href^="/listing/"]', 1],
    ]);
    // One listing page, reached the way a shopper reaches it.
    const href = await page.evaluate(() => document.querySelector('a[href^="/listing/"]')?.getAttribute("href") ?? null);
    if (href) await visit(href, [["the car's heading", "h1", 1]]);
    else problems.push("/: no card links to a listing page");
    // The model hubs, for the same reason the browse page is here: /ev is the
    // only crawlable route into the listing corpus (the grid builds its links
    // in the browser), so a hub that renders no cars is a dead crawl path
    // while every route still answers 200 — the exact shape of the failure
    // this check was written for. A hub reads the published hubs.json
    // artifact, so a missing or malformed one empties EVERY hub at once, and
    // that is what the car-link assertion catches.
    await visit("/ev", [["the model list", 'a[href^="/ev/"]', 1]]);
    // Followed rather than named: /ev orders makes and models by live count,
    // so its first link is the biggest model on the site, and naming a model
    // here would make this check fail the day that nameplate sells out.
    const hub = await page.evaluate(() => document.querySelector('a[href^="/ev/"]')?.getAttribute("href") ?? null);
    if (hub) await visit(hub, [["the model's cars", 'a[href^="/listing/"]', 1]]);
    else problems.push("/ev: no link to a model page");
  } finally {
    await browser.close().catch(() => {});
  }
  return problems;
}

if (has("--smoke")) {
  const base = arg("--smoke").replace(/\/$/, "");
  const hdrs = /voltcheck\.net$/.test(new URL(base).host) ? {} : { "x-vercel-protection-bypass": bypassSecret() };
  console.log(`deploy-site: smoke test only — ${base}`);
  const problems = await smoke(base, hdrs);
  for (const p of problems) console.error(`deploy-site: smoke FAILED — ${p}`);
  process.exit(problems.length ? 1 : 0);
}

// ---------------------------------------------------------------- main
const secret = bypassSecret();
const headers = { "x-vercel-protection-bypass": secret };
const url = arg("--url") ?? buildCandidate(arg("--ref", "HEAD"));
console.log(`deploy-site: candidate ${url} — warming behind the SSO bypass; voltcheck.net is untouched`);

const { state, total } = await warmAll(url, headers);
const problems = validate(state, total);
if (problems.length) {
  for (const p of problems) console.error(`deploy-site: NOT promoting — ${p}`);
  console.error("deploy-site: voltcheck.net still serves the previous build, fully cached. Fix the cause and re-run with --url " + url + " (the warm entries it did fill are kept).");
  process.exit(1);
}
console.log(`deploy-site: candidate fully warm — ${total} cars across ${SHARD_PATHS.length} shards, all sitemaps rendered`);

if (has("--no-smoke")) {
  console.log("deploy-site: --no-smoke — skipping the browser check");
} else {
  console.log("deploy-site: loading the candidate in a browser");
  const smokeProblems = await smoke(url, headers);
  if (smokeProblems.length) {
    for (const p of smokeProblems) console.error(`deploy-site: NOT promoting — ${p}`);
    console.error("deploy-site: the candidate answers but does not run. voltcheck.net still serves the previous build. Fix the cause and re-run.");
    process.exit(1);
  }
  console.log("deploy-site: the candidate runs — browse page and a listing page load without throwing");
}

if (has("--no-promote")) {
  console.log(`deploy-site: --no-promote — done. Promote later with: vercel promote ${url} --yes`);
  process.exit(0);
}

vercel(["promote", url, "--yes"], { cwd: join(ROOT, "web"), stdio: "inherit" });

// Promote is an alias move, so the cache the shoppers now read is the one we
// just filled — but probe it anyway (2026-08-25: promote-candidate caches can
// be sparse) and re-warm any miss through the domain itself.
console.log("deploy-site: promoted — probing voltcheck.net");
let slowCold = 0;
let failed = 0;
for (const path of WARM_PATHS) {
  try {
    const { secs, cache } = await fetchPath("https://voltcheck.net", path, {}, COLD_RENDER_TIMEOUT_MS);
    if (secs > 10) {
      slowCold++;
      console.log(`  ${path}: answered but slow (${secs.toFixed(1)}s, ${cache}) — was cold on the domain; this probe just warmed it`);
    }
  } catch (e) {
    failed++;
    console.error(`  ${path}: ${e.message}`);
  }
}
if (failed) {
  console.error(`deploy-site: ${failed} critical path(s) FAIL on the domain — roll back with: vercel promote <previous-deployment-url>`);
  process.exit(1);
}

// The sitemaps, deferred from the pre-promote set (see WARM_PATHS): warm them
// now through the domain. Started promptly they ride the warm's last memo
// window (~42s each, no new walk); started late they cost one more walk,
// which the dry-pass ladder's logic doesn't apply to — so give each up to
// three passes and treat what's still cold as a real failure: feed-audits
// reads every advertised sitemap and a 503 there turns its run red.
const sitemapState = new Set();
for (let attempt = 1; attempt <= 3 && sitemapState.size < SITEMAP_PATHS.length; attempt++) {
  for (const path of SITEMAP_PATHS.filter((p) => !sitemapState.has(p))) {
    try {
      const { text, secs } = await fetchPath("https://voltcheck.net", path, {}, COLD_RENDER_TIMEOUT_MS);
      if (!(text.match(/<loc>/g) ?? []).length) throw new Error("no <loc> entries");
      sitemapState.add(path);
      console.log(`  ${path}: ok (${secs.toFixed(1)}s)`);
    } catch (e) {
      console.log(`  ${path}: ${e.message}${attempt < 3 ? " — will retry" : ""}`);
    }
  }
  if (sitemapState.size < SITEMAP_PATHS.length && attempt < 3) await sleep(5 * 60_000);
}
if (sitemapState.size < SITEMAP_PATHS.length) {
  console.error(
    `deploy-site: promote HELD but ${SITEMAP_PATHS.length - sitemapState.size} sitemap shard(s) are still cold — ` +
      "the browse grid is fully cached and shoppers are fine; finish these before the next feed-audits run " +
      "(they self-heal on request once the database can serve a walk)."
  );
  process.exit(1);
}
// The model hubs (/ev and /ev/<make>/<model>, added 2026-09-02). They are the
// only crawlable path from the home page into the listing corpus — the browse
// grid builds its links in the browser, so before they existed every listing
// URL was an orphan — and Google started collecting them the day the 12
// sitemap files were submitted. A crawler arriving after a promote should not
// be the one paying for the render.
//
// Deliberately NOT in WARM_PATHS, and deliberately not fatal. A hub reads the
// published hubs.json artifact instead of walking the database, so a cold one
// is ~1s against a shard's 90-300s, no shopper surface depends on it, and
// nothing goes red when one is cold the way feed-audits does for a sitemap.
// Warn and move on.
//
// The list is read from the deployed /ev page rather than from
// web/lib/listings/modelHubs.ts because this lane cannot import TS (see
// SHARD_PATHS) — and reading the index the site actually shipped means this
// warm can never drift from the registry.
let hubsWarmed = 0;
let hubsCold = 0;
try {
  const { text } = await fetchPath("https://voltcheck.net", "/ev", {}, COLD_RENDER_TIMEOUT_MS);
  const hubPaths = [...new Set([...text.matchAll(/href="(\/ev\/[^"]+)"/g)].map((m) => m[1]))];
  console.log(`deploy-site: warming /ev and ${hubPaths.length} model hubs`);
  for (const path of hubPaths) {
    try {
      await fetchPath("https://voltcheck.net", path, {}, COLD_RENDER_TIMEOUT_MS);
      hubsWarmed++;
    } catch (e) {
      hubsCold++;
      console.log(`  ${path}: ${e.message}`);
    }
  }
} catch (e) {
  console.error(`deploy-site: /ev did not answer (${e.message}) — model hubs left cold, they self-heal on request`);
}
if (hubsCold) {
  console.error(`deploy-site: ${hubsCold} model hub(s) still cold — they self-heal on request, shoppers unaffected`);
} else if (hubsWarmed) {
  console.log(`deploy-site: ${hubsWarmed} model hubs warm`);
}

console.log(
  slowCold === 0
    ? "deploy-site: every path answers warm on voltcheck.net, sitemaps included. Done."
    : `deploy-site: done — ${slowCold} path(s) were cold on the domain (sparse promote cache) and are warm now; sitemaps all answer.`
);
process.exit(0);
