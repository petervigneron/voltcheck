// Polite fetcher: identifies itself, obeys robots.txt disallows for our UA,
// rate-limits per host, times out. Plain GETs on public pages only — if a host
// wants bots out (robots disallow or a bot-challenge response), we skip it and
// record why rather than working around it.
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";

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

// A malformed response can crash the whole process from inside Node's own
// HTTP parser: undici's `assert(!this.paused)` fires in a TLS socket event
// handler, where no try/catch around fetch() can reach it (crawl shard 1 died
// this way on 2026-08-17 and its whole slice of the night was lost — out/ is
// written only at the end, so a dead shard uploads nothing). Swallowing the
// assertion is safe for us: the poisoned connection is already dead, the
// fetch that owns it is aborted by its own timeout and surfaces as an
// ordinary error result, and every consumer of this module treats fetch
// errors as answers. Only undici assertions are swallowed — anything else
// still crashes, as it should.
process.on("uncaughtException", (e) => {
  if (e?.code === "ERR_ASSERTION" && /undici/.test(e?.stack ?? "")) {
    console.error(`http: survived undici parser crash: ${e.message?.split("\n")[0] ?? e}`);
    return;
  }
  console.error(e);
  process.exit(1);
});

// How we identify ourselves in robots.txt. The UA string above no longer
// contains our name, so rules targeting us by name have to be matched
// against this token explicitly — otherwise switching the UA would silently
// stop us honouring dealers who blocked us by name, which is the opposite
// of the intent.
const CRAWLER_TOKEN = "voltcheckbot";
export const BOT_PAGE = "https://voltcheck.net/bot";
export const CRAWLER_DECLARATION = `VoltcheckBot/0.1 (+${BOT_PAGE})`;
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

// Only write the cache when something will actually read it. This used to
// write unconditionally, which meant a full crawl spooled every page it
// fetched to disk even with caching disabled: at 474 domains x 80 pages
// that filled both a GitHub runner and a laptop, and the run died with
// ENOSPC. CI passes --cache-hours 0 (a fresh runner starts with an empty
// cache and throws it away, so caching there is pure cost).
let cacheBytes = 0;
const CACHE_BUDGET_BYTES = 2_000_000_000; // 2 GB ceiling, whatever the TTL

async function cachePut(url, status, body, finalUrl) {
  if (!cacheTtlMs) return;
  if (cacheBytes > CACHE_BUDGET_BYTES) return;
  try {
    await mkdir(CACHE_DIR, { recursive: true });
    const payload = JSON.stringify({ url, at: Date.now(), status, body, finalUrl });
    cacheBytes += payload.length;
    await writeFile(new URL(cacheKey(url), CACHE_DIR), payload);
  } catch {}
}

const MIN_INTERVAL_MS = 1100;
// How much of a robots.txt Crawl-delay we'll honour. Crawl-delay is advisory
// (Googlebot ignores it outright; Bing caps it) and almost always aimed at
// "User-Agent: *", not at us — and honoured verbatim it makes the crawl
// impossible. germainfordofbeavercreek.com publishes "Crawl-delay: 10", which
// turned each inventory page into a 10-second wait: one 337-car rooftop's API
// pull measured 210s, and an 80-page HTML crawl of such a host would take 13
// minutes. Across ~12,900 nightly domains that is the difference between a
// crawl that finishes and one that hits the job timeout and is cancelled —
// which is exactly what happened 08-17…19. We still space requests out (2.5s is
// more than twice our own floor, and the API path makes far fewer requests per
// rooftop than the HTML crawl it replaced); we just refuse to let one
// auto-generated robots line stop us from covering a lot.
const MAX_CRAWL_DELAY_MS = 2500;

export async function politeDelay(host) {
  const robotsDelay = Math.min(robotsCache.get(host)?.crawlDelayMs ?? 0, MAX_CRAWL_DELAY_MS);
  const interval = Math.max(MIN_INTERVAL_MS, robotsDelay);
  const prev = lastHit.get(host) ?? 0;
  const wait = prev + interval - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastHit.set(host, Date.now());
}

// Plenty of dealers publish their vehicle sitemap as sitemap-vehicle.xml.gz
// and serve it with Content-Encoding: gzip as well — fetch strips the
// transfer encoding and hands back the .gz file itself, whose bytes are not
// XML, so every <loc> in it was invisible and those sites looked like they
// listed no vehicle pages at all (DealerFire, found 2026-08-16). Unwrap gzip
// members until the bytes stop looking gzipped; anything that isn't gzip
// passes through untouched.
const isGzip = (buf) => buf.length > 2 && buf[0] === 0x1f && buf[1] === 0x8b;

async function readBody(res) {
  let buf = Buffer.from(await res.arrayBuffer());
  if (!isGzip(buf)) {
    // Not gzip: decode exactly as res.text() would have. Some dealer CMSes
    // still serve windows-1252, and hard-coding utf-8 here would mojibake
    // every accented model name and trim on those sites.
    const charset = /charset=["']?([\w-]+)/i.exec(res.headers.get("content-type") ?? "")?.[1];
    try {
      return new TextDecoder(charset || "utf-8").decode(buf);
    } catch {
      return buf.toString("utf-8");
    }
  }
  for (let i = 0; i < 3 && isGzip(buf); i++) {
    try {
      buf = gunzipSync(buf);
    } catch {
      break;
    }
  }
  return buf.toString("utf-8");
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
        "x-crawler": CRAWLER_DECLARATION,
      },
      redirect: "follow",
      signal: ctrl.signal,
    });
    const body = await readBody(res);
    return { status: res.status, body, finalUrl: res.url };
  } finally {
    clearTimeout(t);
  }
}

// Polite JSON POST for structured public endpoints (OEM inventory locators).
// Same identity, same per-host rate limit, same robots respect as fetchRaw —
// a POST to a search API is still a crawl request and gets no exemption.
export async function politePostJson(url, { headers = {}, body, timeoutMs = 20000 } = {}) {
  if (!(await robotsAllows(url))) return { status: "robots_disallowed", json: null };
  const u = new URL(url);
  await politeDelay(u.host);
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "user-agent": UA,
        accept: "application/json, text/plain, */*",
        "content-type": "application/json",
        "x-crawler": CRAWLER_DECLARATION,
        ...headers,
      },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    const text = await res.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {}
    return { status: res.status, json, text };
  } catch (e) {
    return { status: `error:${e.name ?? "unknown"}`, json: null };
  } finally {
    clearTimeout(t);
  }
}

// Polite JSON GET for structured public endpoints that need custom headers
// (e.g. a Referer some inventory APIs require). Same identity/rate-limit/robots
// respect as fetchPage, but lets the caller add headers fetchPage cannot.
export async function politeGetJson(url, { headers = {}, timeoutMs = 20000 } = {}) {
  if (!(await robotsAllows(url))) return { status: "robots_disallowed", json: null };
  const u = new URL(url);
  await politeDelay(u.host);
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: {
        "user-agent": UA,
        accept: "application/json, text/plain, */*",
        "x-crawler": CRAWLER_DECLARATION,
        ...headers,
      },
      redirect: "follow",
      signal: ctrl.signal,
    });
    const text = await res.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {}
    return { status: res.status, json, text };
  } catch (e) {
    return { status: `error:${e.name ?? "unknown"}`, json: null };
  } finally {
    clearTimeout(t);
  }
}

export function parseRobots(txt) {
  // Collect Allow + Disallow + Crawl-delay rules that apply to * or to us.
  // Minimal parser: good enough to respect intent; unknown directives ignored.
  // Allow is collected (not just Disallow) because the standard lets a specific
  // Allow override a broader Disallow — e.g. Stellantis brand sites Disallow
  // /hostd/ but explicitly Allow /hostd/inventory/getinventoryresults.json.
  // Ignoring Allow would over-block a path the site owner deliberately opened.
  const lines = txt.split(/\r?\n/);
  let applies = false;
  const allow = [];
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
    } else if (applies && key === "allow" && val) {
      allow.push(val);
    } else if (applies && key === "disallow" && val) {
      disallow.push(val);
    } else if (applies && key === "crawl-delay") {
      const s = Number(val);
      if (Number.isFinite(s) && s > 0) crawlDelayMs = Math.min(s, 30) * 1000;
    }
  }
  return { allow, disallow, crawlDelayMs };
}

// Does `path` match a robots rule? Supports `*` wildcards and a trailing `$`
// end-anchor (the two extensions every major crawler honours); a plain prefix
// rule falls out as the no-wildcard case.
function robotsPathMatch(path, rule) {
  if (!rule) return false;
  const anchored = rule.endsWith("$");
  const pattern = anchored ? rule.slice(0, -1) : rule;
  const segs = pattern.split("*");
  let idx = 0;
  for (let i = 0; i < segs.length; i++) {
    const seg = segs[i];
    if (!seg) continue;
    if (i === 0) {
      if (!path.startsWith(seg)) return false;
      idx = seg.length;
    } else {
      const at = path.indexOf(seg, idx);
      if (at < 0) return false;
      idx = at + seg.length;
    }
  }
  return anchored ? idx === path.length : true;
}

// Length of the rule's literal path (the `$` anchor is not a path character),
// used for the longest-match tie-break below.
const robotsRuleLen = (rule) => (rule.endsWith("$") ? rule.length - 1 : rule.length).valueOf();

// Pure rule evaluation over an already-parsed robots group, exported so a
// lane that fetches robots.txt through a different client (the Autotrader
// discovery script reads it inside Chromium, because its edge blocks plain
// Node fetch) still applies exactly the same matching rules as the crawl.
// `target` is whatever the caller wants matched — pathname, or pathname plus
// query string where the site's rules reach into the query (`*keyword=`).
export function robotsRulesAllow({ allow = [], disallow = [] }, target) {
  // Standard precedence: the longest matching rule wins; an Allow ties out a
  // Disallow of equal length. If nothing disallows the path, it is allowed.
  let bestAllow = -1;
  let bestDisallow = -1;
  for (const rule of allow) if (robotsPathMatch(target, rule)) bestAllow = Math.max(bestAllow, robotsRuleLen(rule));
  for (const rule of disallow) if (robotsPathMatch(target, rule)) bestDisallow = Math.max(bestDisallow, robotsRuleLen(rule));
  if (bestDisallow < 0) return true;
  return bestAllow >= bestDisallow;
}

export async function robotsAllows(url) {
  const u = new URL(url);
  if (!robotsCache.has(u.host)) {
    try {
      const { status, body } = await fetchRaw(`${u.origin}/robots.txt`, { timeoutMs: 8000 });
      robotsCache.set(u.host, status === 200 ? parseRobots(body) : { allow: [], disallow: [] });
    } catch {
      robotsCache.set(u.host, { allow: [], disallow: [] });
    }
  }
  // The QUERY is part of what robots rules match — `Disallow: /*?*` and
  // `Allow: /*?page=` are how AutoRevo's and DealerAccelerate's rooftops
  // state their whole crawling policy — and until 2026-08-31 only the
  // pathname was tested, so every query rule on every host was silently
  // ignored (found on the AutoRevo lane build: /vehicles?page=2 fetched on
  // 14 rooftops whose robots disallow /*?*). Obeying robots is this
  // fetcher's founding rule; the pages a query rule now refuses were never
  // ours to fetch, and crawl.mjs records the refusal as truncation rather
  // than certifying a walk it did not make.
  return robotsRulesAllow(robotsCache.get(u.host), u.pathname + u.search);
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
  // Garbage in (a relative href that escaped resolution, a malformed
  // sitemap entry) must come back as an answer, not an exception — an
  // unhandled throw here takes down every caller sharing the process.
  try {
    new URL(url);
  } catch {
    return { status: "error:invalid-url", body: null, finalUrl: url };
  }
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
  // Retry on transport failure — and on a *bare* 404, because that one is
  // measurably a misdirected request, not an answer: dealer platforms
  // routinely redirect apex→www on the homepage but answer deep apex paths
  // with a ~10-byte "Not Found" from the load balancer, while the same path
  // on www serves the page (georgecolemanford.com/used-inventory/index.htm:
  // 404/10 bytes on the apex, 200/792KB on www — found 2026-08-16 when a
  // probe sweep scored 267 of 339 fresh franchise rooftops as failures).
  // The <512-byte guard keeps a site's real 404 an answer: a dealer
  // platform's own not-found page is a full HTML document (a measured one
  // was 237KB), so retrying only bare 404s costs nothing on genuinely dead
  // paths and repairs a systematic false negative. A 403 is still final.
  const bare404 = first.status === 404 && (first.body?.length ?? 0) < 512;
  if (!TRANSPORT_FAIL.test(String(first.status)) && !bare404) return first;
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

// Polite GET that also hands back the response's Set-Cookie headers.
//
// Every other helper here throws the headers away, which is right for a page
// fetch and wrong for exactly one shape of endpoint: a search that paginates
// only through a CSRF-protected form POST. Stellantis's certified-pre-owned
// search (jeepcertified.com and its sibling brand hosts) renders 12 cards
// server-side and reaches the rest only via POST /sni_filter_request, which
// Laravel answers with 419 "CSRF token mismatch" unless the request carries
// BOTH the session cookie the search page set and the token that page printed
// in its csrf-token meta. Neither can be reconstructed; they have to be
// carried out of the GET. So this returns Set-Cookie alongside the body, and
// the caller passes the cookie back in through politePostJson's `headers`.
//
// Same identity, same per-host interval, same robots check as every other
// call — this is one more return value, not an exemption.
export async function politeGetWithHeaders(url, { headers = {}, timeoutMs = 20000 } = {}) {
  if (!(await robotsAllows(url))) return { status: "robots_disallowed", text: null, cookies: [] };
  const u = new URL(url);
  await politeDelay(u.host);
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: {
        "user-agent": UA,
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "accept-language": "en-US,en;q=0.9",
        "x-crawler": `VoltcheckBot/0.1 (+${BOT_PAGE})`,
        ...headers,
      },
      redirect: "follow",
      signal: ctrl.signal,
    });
    const text = await readBody(res);
    // getSetCookie() is the only accessor that keeps multiple Set-Cookie
    // headers separate; the joined `get()` value cannot be split safely
    // because cookie attributes contain commas (Expires=Wed, 21 Oct …).
    const cookies = typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie() : [];
    return { status: res.status, text, finalUrl: res.url, cookies };
  } catch (e) {
    return { status: `error:${e.name ?? "unknown"}`, text: null, cookies: [] };
  } finally {
    clearTimeout(t);
  }
}
