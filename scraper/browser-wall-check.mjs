// Is a browser lane walled HERE? One rooftop at a time, out loud.
//
// WHY THIS EXISTS. On 2026-09-06 the rolling crawl's Dealer Inspire lane
// reported "fetched 5 … [bailed: dealerinspire browser lane failed]" on 26
// rooftops — the shape pullDealerInspire returns when neither SRP answered 200
// twice in a row — while the same lane on the same commit, run from a laptop,
// read 278 of 299 of those rooftops at 20 VINs on the first page. A lane can
// only report that it failed; it cannot say whether the runner was challenged,
// throttled, or simply out of clock, because the status and the served page
// are gone by the time the crawl prints its one-line summary.
//
// So this prints them. Per rooftop: what robots.txt said and who managed to
// read it, then each load's HTTP status, the document title, and whether the
// body carries a challenge (Cloudflare's "Attention Required" / "Just a
// moment", a Turnstile or a cf-chl form, Akamai's "Access Denied"). Run it on
// a laptop and in the workflow and diff the two columns; that is the whole
// method, and it is the only way to tell a wall from a clock.
//
// The `--declaration off/both` control exists because the browser started
// sending lib/http.mjs's x-crawler declaration on 2026-09-05 (0bb27a4), one
// day before these failures, and "our own honesty is what is being scored" is
// a hypothesis that has to be measured rather than assumed. It runs in a
// throwaway Playwright context of its own so nothing in lib/browser.mjs has a
// switch for hiding the declaration — the production path always sends it.
//
//   node browser-wall-check.mjs --domains-file cohort.txt [--declaration both]
//   node browser-wall-check.mjs a.com b.com --paths /used-vehicles/
import { browserFetch, browserRobotsAllows, closeBrowser } from "./lib/browser.mjs";
import { robotsEntry, CRAWLER_DECLARATION } from "./lib/http.mjs";
import { readFileSync } from "node:fs";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36";

const CHALLENGES = [
  [/Attention Required!?\s*\|\s*Cloudflare/i, "cf-attention-required"],
  [/Just a moment…|Just a moment\.\.\./i, "cf-just-a-moment"],
  [/challenges\.cloudflare\.com\/turnstile/i, "cf-turnstile"],
  [/<form[^>]+id=["']challenge-form["']|cf-chl-|__cf_chl_|\/cdn-cgi\/challenge-platform\/|id=["']challenge-running["']/i, "cf-challenge-form"],
  [/Access Denied[\s\S]{0,200}Reference\s*#?\d/i, "akamai-access-denied"],
  [/Pardon Our Interruption|distil_r_captcha|_Incapsula_/i, "other-interstitial"],
];

export function challengeMarks(body) {
  const src = String(body ?? "");
  return CHALLENGES.filter(([re]) => re.test(src)).map(([, name]) => name);
}

export function pageTitle(body) {
  const m = /<title[^>]*>([\s\S]{0,200}?)<\/title>/i.exec(String(body ?? ""));
  return m ? m[1].replace(/\s+/g, " ").trim() : "";
}

function strFlag(name, fallback = null) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

/** One rooftop, in the shape the report prints. Exported for the tests. */
export function summarize(domain, robots, loads) {
  return { domain, robots, loads };
}

/** Bare domains on the command line: every argument that is not a flag and not
 *  a flag's value. `--paths /used-vehicles/` must not be read as a domain. */
export function positionalDomains(argv) {
  const out = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith("--")) {
      i++; // skip the flag's value
      continue;
    }
    out.push(argv[i]);
  }
  return out;
}

// A second, throwaway browser: the SAME user-agent and the same one page at a
// time, with the declaration header on or off. Only ever used to answer "is
// the header what is being scored?"; the crawl's own context is untouched.
async function declarationControl(url, withHeader) {
  let pw;
  try {
    pw = await import("playwright");
  } catch {
    return { status: "browser_unavailable" };
  }
  const browser = await pw.chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({
      userAgent: UA,
      viewport: { width: 1280, height: 900 },
      ...(withHeader ? { extraHTTPHeaders: { "x-crawler": CRAWLER_DECLARATION } } : {}),
    });
    const page = await context.newPage();
    const res = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 }).catch((e) => ({ err: e.name }));
    if (!res || res.err) return { status: `error:${res?.err ?? "no-response"}` };
    const body = await page.content().catch(() => "");
    const headers = res.headers();
    return {
      status: res.status(),
      title: pageTitle(body),
      challenges: challengeMarks(body),
      server: headers.server ?? null,
      cfMitigated: headers["cf-mitigated"] ?? null,
      cfRay: headers["cf-ray"] ? "yes" : null,
    };
  } finally {
    await browser.close().catch(() => {});
  }
}

async function main() {
  const file = strFlag("--domains-file");
  const paths = (strFlag("--paths") ?? "/,/used-vehicles/,/new-vehicles/").split(",");
  const declaration = strFlag("--declaration", "off"); // off | both
  const domains = file ? readFileSync(file, "utf-8").split(/\s+/).filter(Boolean) : positionalDomains(process.argv.slice(2));

  console.log(`browser-wall-check: ${domains.length} domain(s), paths ${paths.join(" ")}, declaration control: ${declaration}`);
  const out = [];
  for (const domain of domains) {
    const origin = `https://www.${domain.replace(/^www\./, "")}`;
    const t0 = Date.now();
    // The lane's own first act: robots, read by fetch and then by Chrome when
    // the fetch was walled. Print what the cache ended up holding — a
    // challenge page parsed as rules would show as a 200 with no rules.
    let allowed = null;
    try {
      allowed = await browserRobotsAllows(`${origin}/used-vehicles/`);
    } catch (e) {
      allowed = `error:${e.name}`;
    }
    const entry = robotsEntry(new URL(origin).host) ?? {};
    const robots = {
      status: entry.status ?? null,
      allow: (entry.allow ?? []).length,
      disallow: (entry.disallow ?? []).length,
      crawlDelayMs: entry.crawlDelayMs ?? null,
      allowsUsedSrp: allowed,
    };
    const loads = [];
    for (const path of paths) {
      const url = `${origin}${path}`;
      const at = Date.now();
      const res = await browserFetch(url);
      loads.push({
        path,
        status: res.status,
        ms: Date.now() - at,
        bytes: res.body ? res.body.length : 0,
        title: pageTitle(res.body),
        challenges: challengeMarks(res.body),
        finalUrl: res.finalUrl === url ? null : res.finalUrl,
      });
    }
    const row = summarize(domain, robots, loads);
    if (declaration === "both") {
      row.control = {
        withHeader: await declarationControl(`${origin}/used-vehicles/`, true),
        withoutHeader: await declarationControl(`${origin}/used-vehicles/`, false),
      };
    }
    row.ms = Date.now() - t0;
    out.push(row);
    console.log(`\n── ${domain} (${(row.ms / 1000).toFixed(1)}s)`);
    console.log(`   robots: status=${robots.status} allow=${robots.allow} disallow=${robots.disallow} crawlDelay=${robots.crawlDelayMs} allowsUsedSrp=${robots.allowsUsedSrp}`);
    for (const l of loads) {
      console.log(
        `   ${l.path} → ${l.status} in ${(l.ms / 1000).toFixed(1)}s, ${l.bytes} bytes${l.challenges.length ? `, CHALLENGE ${l.challenges.join("+")}` : ""}${l.finalUrl ? `, landed ${l.finalUrl}` : ""}`,
      );
      console.log(`      title: ${l.title || "(none)"}`);
    }
    if (row.control) {
      for (const [k, c] of Object.entries(row.control)) {
        console.log(`   control ${k}: ${c.status}${c.challenges?.length ? ` CHALLENGE ${c.challenges.join("+")}` : ""} server=${c.server ?? "-"} cf-mitigated=${c.cfMitigated ?? "-"} title=${c.title || "(none)"}`);
      }
    }
  }
  console.log(`\nJSON\n${JSON.stringify(out)}`);
  await closeBrowser();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
