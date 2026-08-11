// Polite fetcher: identifies itself, obeys robots.txt disallows for our UA,
// rate-limits per host, times out. Plain GETs on public pages only — if a host
// wants bots out (robots disallow or a bot-challenge response), we skip it and
// record why rather than working around it.
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";

const UA = "VoltcheckBot/0.1 (EV inventory research; contact: peter.vigneron@gmail.com)";
const lastHit = new Map(); // host → timestamp
const robotsCache = new Map(); // host → {disallow: string[]}

// Disk cache: every successful fetch is written; reads only happen when a TTL
// is set (crawl --cache-hours). Extractor iteration replays cached pages in
// seconds instead of re-crawling the network.
const CACHE_DIR = new URL("../cache/", import.meta.url);
let cacheTtlMs = 0;
export function setCacheTtl(ms) {
  cacheTtlMs = ms;
}
const cacheKey = (url) => createHash("sha1").update(url).digest("hex") + ".json";

async function cacheGet(url) {
  if (!cacheTtlMs) return null;
  try {
    const f = JSON.parse(await readFile(new URL(cacheKey(url), CACHE_DIR), "utf-8"));
    if (Date.now() - f.at < cacheTtlMs) return f;
  } catch {}
  return null;
}

async function cachePut(url, status, body, finalUrl) {
  try {
    await mkdir(CACHE_DIR, { recursive: true });
    await writeFile(new URL(cacheKey(url), CACHE_DIR), JSON.stringify({ url, at: Date.now(), status, body, finalUrl }));
  } catch {}
}

const MIN_INTERVAL_MS = 1100;

async function politeDelay(host) {
  const robotsDelay = robotsCache.get(host)?.crawlDelayMs ?? 0;
  const interval = Math.max(MIN_INTERVAL_MS, robotsDelay);
  const prev = lastHit.get(host) ?? 0;
  const wait = prev + interval - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastHit.set(host, Date.now());
}

export async function fetchRaw(url, { timeoutMs = 15000 } = {}) {
  const u = new URL(url);
  await politeDelay(u.host);
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: { "user-agent": UA, accept: "text/html,application/xhtml+xml,application/xml,application/json;q=0.9,*/*;q=0.8" },
      redirect: "follow",
      signal: ctrl.signal,
    });
    const body = await res.text();
    return { status: res.status, body, finalUrl: res.url };
  } finally {
    clearTimeout(t);
  }
}

function parseRobots(txt) {
  // Collect Disallow + Crawl-delay rules that apply to * or to us. Minimal
  // parser: good enough to respect intent; unknown directives ignored.
  const lines = txt.split(/\r?\n/);
  let applies = false;
  const disallow = [];
  let crawlDelayMs;
  for (const line of lines) {
    const [rawKey, ...rest] = line.split(":");
    if (!rest.length) continue;
    const key = rawKey.trim().toLowerCase();
    const val = rest.join(":").trim();
    if (key === "user-agent") {
      applies = val === "*" || UA.toLowerCase().includes(val.toLowerCase());
    } else if (applies && key === "disallow" && val) {
      disallow.push(val);
    } else if (applies && key === "crawl-delay") {
      const s = Number(val);
      if (Number.isFinite(s) && s > 0) crawlDelayMs = Math.min(s, 30) * 1000;
    }
  }
  return { disallow, crawlDelayMs };
}

export async function robotsAllows(url) {
  const u = new URL(url);
  if (!robotsCache.has(u.host)) {
    try {
      const { status, body } = await fetchRaw(`${u.origin}/robots.txt`, { timeoutMs: 8000 });
      robotsCache.set(u.host, status === 200 ? parseRobots(body) : { disallow: [] });
    } catch {
      robotsCache.set(u.host, { disallow: [] });
    }
  }
  const { disallow } = robotsCache.get(u.host);
  return !disallow.some((rule) => u.pathname.startsWith(rule.replace(/\*$/, "")));
}

export async function fetchPage(url) {
  const cached = await cacheGet(url);
  if (cached) return { status: cached.status, body: cached.body, finalUrl: cached.finalUrl, fromCache: true };
  if (!(await robotsAllows(url))) return { status: "robots_disallowed", body: null, finalUrl: url };
  try {
    const r = await fetchRaw(url);
    if (r.status === 200 && r.body) await cachePut(url, r.status, r.body, r.finalUrl);
    return { status: r.status, body: r.body, finalUrl: r.finalUrl };
  } catch (e) {
    return { status: `error:${e.name ?? "unknown"}`, body: null, finalUrl: url };
  }
}
