// Polite fetcher: identifies itself, obeys robots.txt disallows for our UA,
// rate-limits per host, times out. Plain GETs on public pages only — if a host
// wants bots out (robots disallow or a bot-challenge response), we skip it and
// record why rather than working around it.
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";

// Crawler identity — owner's decision, 2026-08-13, after measuring that a
// declared-bot UA was refused by ~45% of dealers.
//
// Those refusals were Cloudflare's default bot management, not the dealers:
// on a sample of blocked sites even /robots.txt was unreachable, so we could
// never learn what policy they had actually stated. We now present a normal
// browser UA so the CDN default doesn't fire, and identify ourselves in
// X-Crawler instead — an operator reading their logs still finds us and the
// opt-out page.
//
// What did NOT change, and must not: robots.txt is obeyed (including rules
// naming VoltcheckBot — see CRAWLER_TOKEN below), one request per host per
// 1.1s, immediate backoff on errors or challenges, every listing linked back
// to the dealer's own page. No proxy rotation, no challenge-solving: the
// owner ruled that out explicitly.
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36";

// How we identify ourselves in robots.txt. The UA string above no longer
// contains our name, so rules targeting us by name have to be matched
// against this token explicitly — otherwise switching the UA would silently
// stop us honouring dealers who blocked us by name, which is the opposite
// of the intent.
const CRAWLER_TOKEN = "voltcheckbot";
const BOT_PAGE = "https://voltcheck.net/bot";
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
      headers: {
        "user-agent": UA,
        accept: "text/html,application/xhtml+xml,application/xml,application/json;q=0.9,*/*;q=0.8",
        "accept-language": "en-US,en;q=0.9",
        // We are not hiding: this names the crawler and links the page that
        // explains what it is and how to exclude it.
        "x-crawler": `VoltcheckBot/0.1 (+${BOT_PAGE})`,
      },
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
      // Match the wildcard group and any group naming this crawler. Do NOT
      // test against the browser UA string — that would make us "match"
      // rules aimed at Chrome and, worse, miss rules aimed at us.
      const v = val.toLowerCase();
      applies = v === "*" || v === CRAWLER_TOKEN || v.includes(CRAWLER_TOKEN);
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

// Plenty of dealers serve only on www and refuse the apex outright
// (connection refused on :443, not a redirect). We were recording those as
// "unreachable" — 7 of 8 sampled recovered by simply prefixing www, so a
// large slice of what looked like blocking was this bug. Retry once on the
// www host before giving up; the reverse (stripping www) costs nothing to
// support either.
function altHost(url) {
  try {
    const u = new URL(url);
    if (u.hostname.startsWith("www.")) u.hostname = u.hostname.slice(4);
    else u.hostname = "www." + u.hostname;
    return u.toString();
  } catch {
    return null;
  }
}

const TRANSPORT_FAIL = /^error:/;

export async function fetchPage(url) {
  const cached = await cacheGet(url);
  if (cached) return { status: cached.status, body: cached.body, finalUrl: cached.finalUrl, fromCache: true };
  if (!(await robotsAllows(url))) return { status: "robots_disallowed", body: null, finalUrl: url };
  let first;
  try {
    const r = await fetchRaw(url);
    if (r.status === 200 && r.body) await cachePut(url, r.status, r.body, r.finalUrl);
    first = { status: r.status, body: r.body, finalUrl: r.finalUrl };
  } catch (e) {
    first = { status: `error:${e.name ?? "unknown"}`, body: null, finalUrl: url };
  }
  // Only retry on transport failure — a 403/404 is an answer, not a
  // misdirected request, and retrying those would just double the load.
  if (!TRANSPORT_FAIL.test(String(first.status))) return first;
  const alt = altHost(url);
  if (!alt) return first;
  try {
    const r = await fetchRaw(alt);
    if (r.status === 200 && r.body) {
      await cachePut(url, r.status, r.body, r.finalUrl);
      return { status: r.status, body: r.body, finalUrl: r.finalUrl };
    }
    return first;
  } catch {
    return first;
  }
}
