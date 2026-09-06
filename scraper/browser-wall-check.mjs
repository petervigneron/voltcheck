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
// AND `--mode lane` RUNS THE LANE ITSELF, because loading three paths one at a
// time answers a question the crawl was not asking. Two things differ between
// the two, and both turned out to matter on 2026-09-06:
//
//   - the HOST. crawl.mjs builds its origin as `https://${canonicalHost ??
//     domain}` and the registry has no canonicalHost for any of the 26, so the
//     lane asks the APEX. The load mode above asks `https://www.<domain>` —
//     a different host, with its own robots.txt and its own redirect.
//   - the PRESSURE. The rolling crawl runs BROWSER_CONCURRENCY=8 pages shared
//     by 13-18 Dealer Inspire domains at once; one rooftop at a time on an
//     idle runner is a different machine.
//
// So `--mode lane --parallel N` calls pullDealerInspire on the apex, N
// rooftops at a time, under whatever BROWSER_CONCURRENCY the run sets, with
// the crawl's own clock (--deadline-min) and load budget (--max-loads), and
// prints the line crawl.mjs would have printed plus every load behind it
// (BROWSER_TRACE=1).
//
//   node browser-wall-check.mjs --domains-file cohort.txt [--declaration both]
//   node browser-wall-check.mjs a.com b.com --paths /used-vehicles/
//   BROWSER_TRACE=1 node browser-wall-check.mjs --mode lane --domains-file c.txt \
//     --parallel 6 --deadline-min 8 --max-loads 80
import { browserFetch, browserRobotsAllows, closeBrowser } from "./lib/browser.mjs";
import { robotsEntry, CRAWLER_DECLARATION } from "./lib/http.mjs";
import { pullDealerInspire } from "./lib/platforms/dealerinspire.mjs";
import { classifyEv } from "./lib/ev.mjs";
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

function numFlag(name, fallback) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? Number(process.argv[i + 1]) : fallback;
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

/** One rooftop through the real lane, on the origin crawl.mjs would have
 *  built. `evs` is what the crawl would have ADMITTED — the lane hands back
 *  raw JSON-LD and classifyEv is the gate every one of them passes through. */
async function laneRun(domain, { deadlineMin, maxLoads }) {
  const origin = `https://${domain.replace(/^https?:\/\//, "").replace(/\/.*$/, "")}`;
  const t0 = Date.now();
  let r;
  try {
    r = await pullDealerInspire(origin, { deadlineAt: Date.now() + deadlineMin * 60000, maxLoads });
  } catch (e) {
    r = { ok: false, complete: false, found: 0, candidates: 0, vehicles: [], requests: 0, why: `threw ${e.name}: ${String(e.message).slice(0, 120)}` };
  }
  const evs = (r.vehicles ?? []).filter((v) => classifyEv(v).isEv).length;
  return {
    domain,
    origin,
    ms: Date.now() - t0,
    ok: Boolean(r.ok),
    complete: Boolean(r.complete),
    found: r.found ?? 0,
    candidates: r.candidates ?? null,
    vehicles: (r.vehicles ?? []).length,
    evs,
    loads: r.requests ?? 0,
    vdpFailures: r.vdpFailures ?? 0,
    template: r.template ?? null,
    why: r.why ?? null,
  };
}

/** The lane cohort, `parallel` rooftops at a time — the crawl's shape, where
 *  a slice has many domains in flight sharing BROWSER_CONCURRENCY pages. */
async function laneMain(domains, opts) {
  console.log(
    `browser-wall-check --mode lane: ${domains.length} domain(s), ${opts.parallel} at a time, BROWSER_CONCURRENCY=${process.env.BROWSER_CONCURRENCY ?? 3}, deadline ${opts.deadlineMin} min, budget ${opts.maxLoads} loads`,
  );
  const out = [];
  for (let i = 0; i < domains.length; i += opts.parallel) {
    const wave = domains.slice(i, i + opts.parallel);
    const rows = await Promise.all(wave.map((d) => laneRun(d, opts)));
    for (const row of rows) {
      out.push(row);
      console.log(
        `\n── ${row.domain} (${(row.ms / 1000).toFixed(0)}s) ${row.ok ? "ok" : "FAILED"}${row.complete ? " complete" : " partial"}` +
          ` — ${row.found} in lot, ${row.candidates ?? "?"} candidate(s), ${row.evs} EV(s) admitted of ${row.vehicles} VDP node(s) in ${row.loads} browser load(s)` +
          `${row.vdpFailures ? `, ${row.vdpFailures} VDP miss(es)` : ""}${row.template ? `, template ${row.template}` : ""}${row.why ? ` — ${row.why}` : ""}`,
      );
    }
  }
  const ok = out.filter((r) => r.ok);
  console.log(
    `\nlane totals: ${ok.length}/${out.length} ok, ${out.reduce((a, r) => a + r.evs, 0)} EVs admitted, ${out.reduce((a, r) => a + r.loads, 0)} loads, ` +
      `${out.filter((r) => r.ok && r.evs === 0).length} ok-but-empty`,
  );
  console.log(`\nJSON\n${JSON.stringify(out)}`);
  await closeBrowser();
}

async function main() {
  const file = strFlag("--domains-file");
  const paths = (strFlag("--paths") ?? "/,/used-vehicles/,/new-vehicles/").split(",");
  const declaration = strFlag("--declaration", "off"); // off | both
  const domains = file ? readFileSync(file, "utf-8").split(/\s+/).filter(Boolean) : positionalDomains(process.argv.slice(2));

  if (strFlag("--mode", "loads") === "lane") {
    return laneMain(domains, {
      parallel: Math.max(1, numFlag("--parallel", 1)),
      deadlineMin: numFlag("--deadline-min", 8),
      maxLoads: numFlag("--max-loads", 80),
    });
  }

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
