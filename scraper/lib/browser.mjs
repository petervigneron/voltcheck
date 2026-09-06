// A real Chrome, for the rooftops whose firewalls reject everything else.
//
// WHY THIS EXISTS
//
// Four dealer-website vendors — Dealer Inspire (1,496 rooftops in the
// 2026-09-02 walled pile), DealerEProcess (213), DealerCenter (199) and
// CarsForSale (360) — answer lib/http.mjs's plain GET with a firewall page on
// every path, robots.txt included on some. Their robots files, where
// readable, ALLOW crawling ("User-agent: * / Crawl-delay: 1" on every Dealer
// Inspire rooftop). What they reject is the client, not the visitor: the TLS
// handshake and header order Node's fetch produces do not look like a
// browser's, and Cloudflare's firewall rule says so ("Attention Required").
// A real Chrome — this file, through Playwright, with nothing patched —
// loaded the same pages at 200 on 2026-09-02: Dealer Inspire 20 VINs on the
// first used-vehicles page, DealerCenter's inventory JSONP captured off its
// own page, DealerEProcess VDP JSON-LD complete. CarsForSale (DataDome)
// still answered 403 to plain headless Chrome and stays closed: passing
// DataDome needs the crawler to pretend to be something it is not, and this
// house does not do that (see the header of lib/http.mjs).
//
// THE POLICY LINE, STATED ONCE
//
// The owner ruled (2026-08-19): no proxy rotation, no challenge-solving. This
// file is neither. The user-agent every request in this project already
// sends is Chrome's; this makes the claim true. No stealth patches, no
// fingerprint spoofing, no captcha services, one browser from one address,
// the same robots gate and the same one-request-per-host-per-1.1s pacing as
// lib/http.mjs. A page that only loads once the browser is disguised as a
// human's does not load here — that is the difference between tier 1/2 of
// the 2026-09-02 write-up (a client check, a JS check) and tier 3 (a human
// check), and only the first two are on this side of the line. The owner
// confirmed this reading on 2026-09-02 ("Is this within project policy or
// not?" — yes) and separately ruled robots-disallowed fetching OUT, so the
// robots gate below is the same hard rule it is everywhere else.
//
// WHAT IT COSTS, AND THE SHAPE THAT KEEPS IT AFFORDABLE
//
// A Chrome page load is ~30x the CPU and ~10x the wall time of a fetch. So
// the lanes that use this never walk a site with it: they fetch the cheap
// index with the ordinary client where that answers (DealerEProcess's
// sitemap does) or read one SRP page per browser load, pick EV candidates by
// VIN/WMI and nameplate exactly as the HTML crawl does, and spend browser
// loads on candidate VDPs only. Images, fonts and media are blocked at the
// request level; they are most of a dealer page's bytes and none of its
// data. One browser process per crawl process, BROWSER_CONCURRENCY pages in
// flight (default 3), closed on exit.
//
// Playwright is an optional dependency on purpose: a machine without it (or
// without the downloaded headless shell) gets { status: "browser_unavailable" }
// from every call, the lanes decline cleanly, and the rest of the crawl is
// untouched. CI installs it in the workflows that run browser lanes.
import { robotsAllows, politeDelay, robotsEntry, robotsRulesAllow, seedRobots, CRAWLER_DECLARATION } from "./http.mjs";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36";
const CONCURRENCY = Math.max(1, Number(process.env.BROWSER_CONCURRENCY ?? 3));
const BLOCKED_TYPES = new Set(["image", "font", "media"]);

let browserP; // Promise<{browser, context}> | null once known unavailable
let unavailable = null;
let inFlight = 0;
const waiters = [];

async function acquire() {
  if (inFlight < CONCURRENCY) {
    inFlight++;
    return;
  }
  await new Promise((r) => waiters.push(r));
  inFlight++;
}
function release() {
  inFlight--;
  const next = waiters.shift();
  if (next) next();
}

// BROWSER_LANES=off makes every call answer browser_unavailable without
// launching anything: the lanes decline cleanly and their rooftops report
// partial (never a delisting). The switch was thrown on 2026-09-04 because
// the rolling crawl lost 39 of 48 slices to its job timeout with the lanes
// on. It is back on since the 20:39 run, because that was not what the lanes
// were doing: the slices were losing one hung rooftop each — ridemotive,
// dealer.com and dealeron as often as a browser lane — and waiting on it
// for ever. lib/wall.mjs ends that wait. The first run with it walked away
// from 36 visits across 30 slices and synced 48 of 48.
const LANES_OFF = /^(off|0|false)$/i.test(String(process.env.BROWSER_LANES ?? ""));

// BROWSER_TRACE=1 prints one line per load — status, wall time, bytes, the URL
// it landed on — and one per robots decision. A lane's own summary cannot say
// why it came back empty: on 2026-09-06 twenty-six Dealer Inspire rooftops
// reported "browser lane failed" and the statuses that produced it were gone
// by the time the crawl printed the line. Off by default; the crawl never
// turns it on.
const TRACE = /^(1|on|true|yes)$/i.test(String(process.env.BROWSER_TRACE ?? ""));

async function getContext() {
  if (LANES_OFF) {
    unavailable = "BROWSER_LANES=off";
    return null;
  }
  if (unavailable) return null;
  if (!browserP) {
    browserP = (async () => {
      let pw;
      try {
        pw = await import("playwright");
      } catch (e) {
        unavailable = `playwright not installed (${e.code ?? e.message})`;
        return null;
      }
      try {
        const browser = await pw.chromium.launch({ headless: true });
        // The same declaration lib/http.mjs puts on every plain request, and
        // the one voltcheck.net/bot promises is on "every request". Until
        // 2026-09-05 the browser sent none: a Dealer Inspire operator reading
        // their logs saw a Mac Chrome and nothing else.
        const context = await browser.newContext({
          userAgent: UA,
          viewport: { width: 1280, height: 900 },
          extraHTTPHeaders: { "x-crawler": CRAWLER_DECLARATION },
        });
        await context.route("**/*", (route) => {
          const req = route.request();
          if (BLOCKED_TYPES.has(req.resourceType())) return route.abort();
          // The page's own requests are the crawler's requests. A URL the
          // host's robots.txt disallows is not fetched because a script on an
          // allowed page asked for it — the rule Googlebot's renderer applies,
          // and the one that closes DealerCenter's inventory JSONP (their
          // robots.txt, read through Chrome on 2026-09-05, disallows
          // /inv-scripts-v2/* and /*?page_no=; see lib/platforms/
          // dealercenter.mjs). Navigations pass through here too, so a pager
          // click onto a disallowed URL is refused the same way. Only hosts
          // whose robots.txt has been read have rules; a CDN host the crawler
          // never navigated to has no entry and passes.
          try {
            const u = new URL(req.url());
            const rules = robotsEntry(u.host);
            if (rules && !robotsRulesAllow(rules, u.pathname + u.search)) return route.abort("blockedbyclient");
          } catch {}
          return route.continue();
        });
        const close = async () => {
          try {
            await browser.close();
          } catch {}
        };
        process.once("exit", close);
        process.once("SIGINT", async () => {
          await close();
          process.exit(130);
        });
        return { browser, context };
      } catch (e) {
        unavailable = `chromium failed to launch (${String(e.message).split("\n")[0].slice(0, 120)})`;
        return null;
      }
    })();
  }
  return browserP;
}

/** Why the browser is not usable on this machine, or null when it is. */
export async function browserUnavailable() {
  await getContext();
  return unavailable;
}

const bounded = (p, ms, what) =>
  Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(Object.assign(new Error(`${what} timed out after ${ms}ms`), { name: "timeout" })), ms))]);

const robotsReadByBrowser = new Set(); // hosts whose robots.txt Chrome has been asked for, whatever it answered

/**
 * robots.txt as a real browser reads it. The plain fetcher asks first, and on
 * the walled vendors it is answered with the firewall page — robots.txt
 * included — which http.mjs records as "no rules": the RFC 9309 reading of
 * an unreachable robots.txt, and until 2026-09-05 the only reading these
 * lanes ever had. It was wrong on the one vendor where it mattered.
 * jordanmotors.co (DealerCenter) answers a plain GET /robots.txt with
 * "Attention Required" and Chrome with a real file that disallows
 * /inv-scripts-v2/* — the inventory JSONP the DealerCenter lane captured —
 * and /*?page_no=, the pager it followed. The lane had been reading around
 * rules it never saw.
 *
 * So when the plain read did not get a 200, the browser loads robots.txt
 * itself, once per host, and seeds http.mjs's cache with what the site
 * actually says. Every later check reads the same rules: this navigation,
 * the page's own sub-requests in the route handler above, and the plain
 * fetchers. A host Chrome cannot read either keeps the RFC reading.
 */
export async function browserRobotsAllows(url) {
  const u = new URL(url);
  await robotsAllows(url); // the plain read, which fills the cache
  let rules = robotsEntry(u.host);
  if (rules?.status !== 200 && !robotsReadByBrowser.has(u.host)) {
    robotsReadByBrowser.add(u.host);
    const ctx = await getContext();
    if (ctx) {
      await politeDelay(u.host);
      await acquire();
      let page;
      try {
        page = await bounded(ctx.context.newPage(), 30000, "newPage");
        const res = await bounded(page.goto(`${u.origin}/robots.txt`, { waitUntil: "domcontentloaded", timeout: 20000 }), 35000, "goto");
        if (res && res.status() === 200) {
          const text = await bounded(page.evaluate(() => document.body?.innerText ?? ""), 15000, "content");
          seedRobots(u.host, text, 200);
        } else if (res) {
          seedRobots(u.host, "", res.status());
        }
      } catch {
        // Unreadable by Chrome too: the plain fetch's entry stands.
      } finally {
        if (page) await bounded(page.close(), 15000, "close").catch(() => {});
        release();
      }
    }
    rules = robotsEntry(u.host);
  }
  const allowed = robotsRulesAllow(rules ?? { allow: [], disallow: [] }, u.pathname + u.search);
  if (TRACE)
    console.log(
      `[browser] robots ${u.host} status=${rules?.status ?? "none"} via=${rules?.via ?? "fetch"} allow=${rules?.allow?.length ?? 0} disallow=${rules?.disallow?.length ?? 0} crawlDelay=${rules?.crawlDelayMs ?? 0} → ${allowed ? "allow" : "DISALLOW"} ${u.pathname}${u.search}`,
    );
  return allowed;
}

/**
 * Load one page in Chrome and hand back what a fetch would have: the served
 * status, the document after scripts ran, and the URL it landed on. Also the
 * bodies of any responses whose URL matches `capture` — that is how a lane
 * reads a vendor's JSON off the page's own requests (DealerCenter's inventory
 * JSONP carries a per-request signature no fetch could produce, so the
 * page's own call is the only honest one to read).
 *
 *   { status, body, finalUrl, captured: [{ url, status, text }] }
 *   status "robots_disallowed" | "browser_unavailable" | "error:<name>" | number
 *
 * Same contract as fetchPage: robots first, then the per-host pacing, then
 * the request. `settleMs` is how long to let the page's scripts run after
 * DOMContentLoaded before reading it; `waitFor` is an optional selector to
 * wait on instead (bounded by `timeoutMs`).
 */
export async function browserFetch(url, opts = {}) {
  if (!TRACE) return browserLoad(url, opts);
  const t0 = Date.now();
  const r = await browserLoad(url, opts);
  const landed = r.finalUrl && r.finalUrl !== url ? ` → ${r.finalUrl}` : "";
  console.log(`[browser] ${r.status} ${Date.now() - t0}ms ${r.body ? r.body.length : 0}b ${url}${landed}`);
  return r;
}

async function browserLoad(url, { settleMs = 1500, waitFor = null, capture = null, timeoutMs = 45000, clicks = [] } = {}) {
  try {
    new URL(url);
  } catch {
    return { status: "error:invalid-url", body: null, finalUrl: url, captured: [] };
  }
  if (!(await browserRobotsAllows(url))) return { status: "robots_disallowed", body: null, finalUrl: url, captured: [] };
  const ctx = await getContext();
  if (!ctx) return { status: "browser_unavailable", body: null, finalUrl: url, captured: [] };
  await politeDelay(new URL(url).host);
  await acquire();
  // The whole load is bounded, close included. A Playwright call that never
  // resolves — seen 2026-09-03, one Dealer Inspire rooftop held a crawl for
  // eleven hours with no checkpoint — would otherwise keep its concurrency
  // slot forever and, six hangs later, stall every browser lane in the
  // process. `withTimeout` turns that into an error:timeout answer, and the
  // page is closed on a bounded timer of its own so a hung close cannot
  // block the release.
  const withTimeout = (p, ms, what) =>
    Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(Object.assign(new Error(`${what} timed out after ${ms}ms`), { name: "timeout" })), ms))]);
  let page;
  try {
    page = await withTimeout(ctx.context.newPage(), 30000, "newPage");
    const captured = [];
    if (capture) {
      page.on("response", async (res) => {
        if (!capture.test(res.url())) return;
        try {
          captured.push({ url: res.url(), status: res.status(), text: await res.text() });
        } catch {}
      });
    }
    const res = await withTimeout(page.goto(url, { waitUntil: "domcontentloaded", timeout: timeoutMs }), timeoutMs + 15000, "goto");
    if (waitFor) {
      await page.waitForSelector(waitFor, { timeout: timeoutMs }).catch(() => {});
    } else if (settleMs > 0) {
      await page.waitForTimeout(settleMs);
    }
    const body = await withTimeout(page.content(), 30000, "content");
    // `clicks`: selectors to click IN ORDER after the first page settles, each
    // followed by the same settle, its own body and the responses it fired.
    // This is how a lane follows a site's own pager when the firewall blocks
    // the same URL typed directly: DealerCenter answers /inventory/?page_no=2
    // with "Attention Required" to a navigation but serves it to the pager
    // link's click, which is what a shopper's browser sends (a same-site
    // referer). Clicking the page's own link is being a browser, not
    // disguising one; nothing here changes what the request looks like
    // beyond what the click itself does. A selector that is not on the page
    // ends the sequence — the pager ran out — and is not an error.
    const steps = [];
    for (const sel of clicks) {
      const before = captured.length;
      const el = page.locator(sel).first();
      if (!(await el.count())) break;
      try {
        await withTimeout(Promise.all([page.waitForLoadState("domcontentloaded", { timeout: timeoutMs }).catch(() => {}), el.click({ timeout: 10000 })]), timeoutMs + 15000, "click");
      } catch {
        break;
      }
      if (settleMs > 0) await page.waitForTimeout(settleMs);
      steps.push({ selector: sel, body: await withTimeout(page.content(), 30000, "content"), finalUrl: page.url(), captured: captured.slice(before) });
    }
    return { status: res ? res.status() : "error:no-response", body, finalUrl: page.url(), captured, steps };
  } catch (e) {
    return { status: `error:${e.name ?? "unknown"}`, body: null, finalUrl: url, captured: [], steps: [] };
  } finally {
    if (page) await withTimeout(page.close(), 15000, "close").catch(() => {});
    release();
  }
}

/** Close the browser (idempotent). Called by crawl.mjs at the end of a run. */
export async function closeBrowser() {
  if (!browserP) return;
  const ctx = await browserP;
  if (ctx) await ctx.browser.close().catch(() => {});
  browserP = null;
}
