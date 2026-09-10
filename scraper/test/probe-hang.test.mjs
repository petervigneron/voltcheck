import { test } from "node:test";
import assert from "node:assert/strict";
import net from "node:net";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fetchRaw } from "../lib/http.mjs";

// Two probe runs over ~180-domain chunks stopped in their serial retry pass and
// sat there at 0% CPU with one ESTABLISHED socket to a dealer, for hours, and
// took every main-pass verdict with them because the sites file was written
// only at the very end: ridesharecarz.com (160.153.0.54) on 2026-09-09, and on
// 2026-09-10 an Ohio chunk whose retry printed three of its six rows and never
// the fourth, shanekelley.com.
//
// The obvious suspect — a fetch with no deadline on connect or TLS — is not
// it, and the first test below is the measurement that says so, kept as a
// lock: fetchRaw's own abort ends a socket that accepts and never answers, a
// TLS handshake that never completes and a body that stalls after its headers,
// each at its deadline. probe.mjs run whole against such a server finishes
// both passes in under a minute. So what held those runs was a probeSite that
// never returned, by a route no reproduction reached. The other two tests hold
// the fix for THAT: a call that never returns, started in the retry pass while
// holding a socket open exactly as the incidents' did, must neither cost the
// main pass's verdicts nor hold the run.
//
// Loopback and a local stand-in for fetch/DNS only; nothing leaves the machine.

const PROBE = fileURLToPath(new URL("../probe.mjs", import.meta.url));

function tracked(onConnection) {
  const sockets = new Set();
  const server = net.createServer((s) => {
    sockets.add(s);
    s.on("error", () => {});
    s.on("close", () => sockets.delete(s));
    onConnection(s);
  });
  const port = new Promise((r) => server.listen(0, "127.0.0.1", () => r(server.address().port)));
  const close = () => {
    for (const s of sockets) s.destroy();
    return new Promise((r) => server.close(r));
  };
  return { port, close };
}

async function settlesWithin(p, ms) {
  let timer;
  const watchdog = new Promise((r) => (timer = setTimeout(() => r({ hung: true }), ms)));
  try {
    return await Promise.race([p.then((value) => ({ value }), (error) => ({ error })), watchdog]);
  } finally {
    clearTimeout(timer);
  }
}

test("fetchRaw cuts off a socket that accepts and never answers — plain HTTP, a TLS handshake, a stalled body", async () => {
  const silent = tracked(() => {}); // accepts, reads, never writes a byte
  const stalledBody = tracked((s) =>
    s.once("data", () => s.write("HTTP/1.1 200 OK\r\ncontent-type: text/html\r\ncontent-length: 100000\r\n\r\n<html>")),
  );
  const [p1, p2] = await Promise.all([silent.port, stalledBody.port]);
  try {
    for (const [label, url] of [
      ["plain HTTP, no reply", `http://127.0.0.1:${p1}/`],
      ["TLS ClientHello, no ServerHello", `https://127.0.0.1:${p1}/`],
      ["headers, then the body stalls", `http://127.0.0.1:${p2}/`],
    ]) {
      const t0 = Date.now();
      const r = await settlesWithin(fetchRaw(url, { timeoutMs: 1000 }), 8000);
      assert.ok(!r.hung, `${label}: still waiting 8s into a 1s deadline`);
      assert.ok(r.error, `${label}: answered, which a silent server cannot do`);
      // 1.1s of per-host spacing (the TLS case reuses the plain case's host)
      // plus the 1s deadline, with room for a slow runner.
      assert.ok(Date.now() - t0 < 5000, `${label}: took ${Date.now() - t0}ms`);
    }
  } finally {
    await Promise.all([silent.close(), stalledBody.close()]);
  }
});

// Loaded into the probe child with --import. Robots.txt is absent everywhere;
// refuses.test answers 403 (a real verdict, "blocked"); stalls.test fails to
// connect (a transient verdict, so the retry pass takes it). Once the retry
// pass announces itself, a request to stalls.test opens a real socket to a
// server that never answers and then never settles — and ignores its abort
// signal, because whatever held the incident runs did not honour one either.
// DNS answers nothing, so vendorByDns stays off the network.
const PRELOAD = `
import net from "node:net";
import dns from "node:dns/promises";
let retrying = false;
const say = console.error;
console.error = (...args) => {
  if (String(args[0]).startsWith("probe: re-probing")) retrying = true;
  say(...args);
};
const offline = async () => { throw Object.assign(new Error("offline"), { code: "ENOTFOUND" }); };
dns.Resolver.prototype.resolveCname = offline;
dns.Resolver.prototype.resolve4 = offline;
const held = [];
globalThis.fetch = async (url) => {
  const u = new URL(url);
  if (u.pathname === "/robots.txt") return new Response("", { status: 404 });
  if (u.hostname.endsWith("refuses.test")) return new Response("<html>Forbidden</html>", { status: 403 });
  if (u.hostname.endsWith("stalls.test")) {
    if (!retrying) throw new TypeError("fetch failed");
    held.push(net.connect(Number(process.env.STALL_PORT), "127.0.0.1").on("error", () => {}));
    return new Promise(() => {});
  }
  return new Response("", { status: 404 });
};
`;

const rows = () => [
  { domain: "stalls.test", status: "discovered", platform: "unknown", notes: "seeded" },
  { domain: "refuses.test", status: "discovered", platform: "unknown" },
];

async function probeRun(sites, args = [], { killOnRetryMs = null, capMs = 40_000 } = {}) {
  const dir = await mkdtemp(join(tmpdir(), "probe-hang-"));
  const file = join(dir, "sites.json");
  const preload = join(dir, "preload.mjs");
  await writeFile(file, JSON.stringify(sites, null, 2));
  await writeFile(preload, PRELOAD);
  const silent = tracked(() => {});
  const port = await silent.port;
  const t0 = Date.now();
  const child = spawn(process.execPath, ["--import", pathToFileURL(preload).href, PROBE, "--sites-file", file, ...args], {
    env: { ...process.env, BROWSER_LANES: "off", STALL_PORT: String(port) },
    stdio: ["ignore", "ignore", "pipe"],
  });
  let stderr = "";
  let capped = false;
  let killTimer;
  child.stderr.on("data", (d) => {
    stderr += d;
    if (killOnRetryMs != null && !killTimer && stderr.includes("probe: re-probing"))
      killTimer = setTimeout(() => child.kill("SIGKILL"), killOnRetryMs);
  });
  const cap = setTimeout(() => {
    capped = true;
    child.kill("SIGKILL");
  }, capMs);
  const { code, signal } = await new Promise((r) => child.on("exit", (code, signal) => r({ code, signal })));
  clearTimeout(cap);
  clearTimeout(killTimer);
  await silent.close();
  const written = JSON.parse(await readFile(file, "utf-8"));
  const leftovers = (await readdir(dir)).filter((f) => f !== "sites.json" && f !== "preload.mjs");
  await rm(dir, { recursive: true, force: true });
  return { code, signal, capped, stderr, elapsed: Date.now() - t0, written, leftovers };
}

test("a probe killed during the retry pass keeps every main-pass verdict", async () => {
  const run = await probeRun(rows(), [], { killOnRetryMs: 500 });
  assert.equal(run.capped, false, `never reached the retry pass:\n${run.stderr}`);
  assert.equal(run.signal, "SIGKILL", `expected to be killed mid-retry, exited ${run.code}:\n${run.stderr}`);
  assert.ok(Array.isArray(run.written), "a bare array came in, so a bare array goes out");
  const by = Object.fromEntries(run.written.map((s) => [s.domain, s]));
  assert.equal(by["refuses.test"].probe?.verdict, "blocked", "the settled row's verdict was lost with the process");
  assert.equal(by["refuses.test"].status, "http-403");
  assert.equal(by["stalls.test"].probe?.verdict, "transient", "the main pass's own reading of the row being retried was lost");
  assert.equal(by["stalls.test"].probe?.retried, undefined, "the retry never finished, so nothing may say it did");
  assert.deepEqual(run.leftovers, [], "the checkpoint left a temporary file behind");
});

test("a rooftop whose probe never returns is walked away from, and the run finishes and writes", async () => {
  const sites = { kept: "top-level fields survive", sites: rows() };
  const run = await probeRun(sites, ["--site-wall-min", "0.1"]);
  assert.equal(run.capped, false, `still running after 40s — the stalled probe held the run:\n${run.stderr}`);
  assert.equal(run.code, 0, run.stderr);
  // 6s wall plus the main pass; the orphaned socket must not hold the exit.
  assert.ok(run.elapsed < 25_000, `took ${run.elapsed}ms`);
  assert.equal(run.written.kept, "top-level fields survive");
  const by = Object.fromEntries(run.written.sites.map((s) => [s.domain, s]));
  assert.equal(by["refuses.test"].probe?.verdict, "blocked");
  const stalled = by["stalls.test"];
  assert.equal(stalled.probe?.verdict, "transient");
  assert.equal(stalled.probe?.why, "wall");
  assert.equal(stalled.probe?.retried, true);
  // Only the retry's reading is recorded: one note for tonight, on top of
  // whatever the row said before the run.
  assert.ok(stalled.notes.startsWith("seeded | probe "), stalled.notes);
  assert.equal(stalled.notes.split("| probe ").length - 1, 1, stalled.notes);
  assert.match(run.stderr, /walked away from .*stalls\.test/);
  assert.deepEqual(run.leftovers, []);
});
