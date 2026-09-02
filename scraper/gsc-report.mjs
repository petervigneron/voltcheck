#!/usr/bin/env node
// Search Console reporting for voltcheck.net.
//
// Answers three questions with Google's own numbers: is anyone arriving from
// search, what are they searching for, and which pages Google is willing to
// show. It reports what the API returns and nothing else — an empty window
// prints as empty rather than as a reassuring sentence.
//
// Credentials: GSC_SERVICE_ACCOUNT_JSON (raw JSON, for CI) or, locally,
// docs/gsc-service-account.json. The account is a Restricted user on the
// sc-domain:voltcheck.net property, which is read-only by construction.
//
// Usage:
//   node scraper/gsc-report.mjs                 # last 28d, vs the 28d before
//   node scraper/gsc-report.mjs --days 7
//   node scraper/gsc-report.mjs --json          # machine-readable
import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";

const SITE = "sc-domain:voltcheck.net";
const API = "https://searchconsole.googleapis.com/webmasters/v3";

const argv = process.argv.slice(2);
const flag = (n, d) => {
  const i = argv.indexOf(`--${n}`);
  return i === -1 ? d : argv[i + 1];
};
const DAYS = Number(flag("days", 28));
const AS_JSON = argv.includes("--json");

function loadKey() {
  const raw = process.env.GSC_SERVICE_ACCOUNT_JSON;
  if (raw) return JSON.parse(raw);
  const local = path.join(process.cwd(), "docs/gsc-service-account.json");
  if (fs.existsSync(local)) return JSON.parse(fs.readFileSync(local, "utf8"));
  throw new Error(
    "No credentials. Set GSC_SERVICE_ACCOUNT_JSON or place docs/gsc-service-account.json.",
  );
}

// Google's endpoints time out intermittently from some networks, and a
// scheduled report that dies on one flake reports nothing at all. Retry with
// a backoff rather than failing the run.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function fetchRetry(url, opts = {}, tries = 5) {
  let last;
  for (let i = 0; i < tries; i++) {
    try {
      return await fetch(url, { ...opts, signal: AbortSignal.timeout(30_000) });
    } catch (err) {
      last = err;
      if (i < tries - 1) await sleep(2000 * (i + 1));
    }
  }
  throw last;
}

const b64 = (o) =>
  Buffer.from(typeof o === "string" ? o : JSON.stringify(o)).toString("base64url");

async function accessToken(key) {
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${b64({ alg: "RS256", typ: "JWT" })}.${b64({
    iss: key.client_email,
    scope: "https://www.googleapis.com/auth/webmasters.readonly",
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now,
  })}`;
  const sig = crypto
    .createSign("RSA-SHA256")
    .update(unsigned)
    .sign(key.private_key)
    .toString("base64url");
  const res = await fetchRetry("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${unsigned}.${sig}`,
    }),
  });
  const json = await res.json();
  if (!json.access_token) {
    throw new Error(`token exchange failed (${res.status}): ${JSON.stringify(json)}`);
  }
  return json.access_token;
}

// Google finalises a day's search data on a lag, so the last 2 days are
// deliberately excluded: including them makes every report look like a
// decline against the window before it.
const LAG_DAYS = 2;
const iso = (d) => new Date(Date.now() - d * 864e5).toISOString().slice(0, 10);

async function query(token, body) {
  const res = await fetchRetry(
    `${API}/sites/${encodeURIComponent(SITE)}/searchAnalytics/query`,
    {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  const json = await res.json();
  if (json.error) throw new Error(`${res.status} ${json.error.message}`);
  return json.rows ?? [];
}

// Sitemap registration. Submitting a sitemap INDEX is not the same as Google
// registering the shards it points at, and the difference is invisible from
// the site's own side: on 2026-09-02 the index had been downloaded (0 errors)
// while Google had registered ZERO of its 12 children, so none of the
// ~149,000 listing URLs had ever entered its sitemap registry. Checking the
// index alone would have reported that as healthy.
async function sitemapStatus(token) {
  const base = `${API}/sites/${encodeURIComponent(SITE)}/sitemaps`;
  const get = async (url) => {
    const res = await fetchRetry(url, { headers: { authorization: `Bearer ${token}` } });
    const json = await res.json();
    if (json.error) throw new Error(`${res.status} ${json.error.message}`);
    return json.sitemap ?? [];
  };
  const submitted = await get(base);
  // Only an INDEX has children, and asking a plain sitemap for its children
  // is a 400 that would take the whole section down with it — which is
  // exactly what happened on 2026-09-02 the moment the 12 shards were
  // submitted individually alongside the index. Ask only the index, and
  // treat a refusal as "no children" rather than an error, because the
  // per-sitemap rows below are the real signal now.
  const children = [];
  for (const s of submitted.filter((m) => /\/sitemap\.xml$/.test(m.path))) {
    try {
      children.push(...(await get(`${base}?sitemapIndex=${encodeURIComponent(s.path)}`)));
    } catch {
      // A sitemap Google has not processed as an index yet.
    }
  }
  return { submitted, children };
}

// Index status for a handful of URLs. URL Inspection works from the
// gsc-reader service account even though it is only a Restricted user on the
// property, which is not obvious from the permission level.
async function inspect(token, urls) {
  const out = [];
  for (const url of urls) {
    const res = await fetchRetry(
      "https://searchconsole.googleapis.com/v1/urlInspection/index:inspect",
      {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({ inspectionUrl: url, siteUrl: SITE }),
      },
    );
    const json = await res.json();
    const r = json.inspectionResult?.indexStatusResult;
    out.push({
      url,
      state: json.error ? `error: ${json.error.message.slice(0, 40)}` : (r?.coverageState ?? "unknown"),
      lastCrawled: r?.lastCrawlTime?.slice(0, 10) ?? null,
    });
    await sleep(300);
  }
  return out;
}

// A fixed probe set, not a random sample: the same URLs every week, so a
// change in the report is a change at Google rather than a change of sample.
// One of each kind the site actually publishes.
const PROBE_URLS = [
  "https://voltcheck.net/",
  "https://voltcheck.net/facts",
  "https://voltcheck.net/worth",
  "https://voltcheck.net/vin",
  "https://voltcheck.net/facts/nissan/ariya/charging",
  "https://voltcheck.net/facts/hyundai/ioniq-5/charging",
];

const ZERO = { clicks: 0, impressions: 0, ctr: 0, position: 0 };

async function main() {
  const token = await accessToken(loadKey());

  const cur = { startDate: iso(LAG_DAYS + DAYS), endDate: iso(LAG_DAYS) };
  const prev = { startDate: iso(LAG_DAYS + DAYS * 2), endDate: iso(LAG_DAYS + DAYS + 1) };

  const [curTot, prevTot] = await Promise.all([
    query(token, cur).then((r) => r[0] ?? ZERO),
    query(token, prev).then((r) => r[0] ?? ZERO),
  ]);

  const dim = async (name, rowLimit = 20) =>
    query(token, { ...cur, dimensions: [name], rowLimit });

  const [queries, pages, countries, devices, days] = await Promise.all([
    dim("query", 25),
    dim("page", 25),
    dim("country", 10),
    dim("device"),
    dim("date", 100),
  ]);

  // A page can only draw an impression if Google has it indexed, so the count
  // of distinct pages with impressions is a floor on indexed pages — never a
  // total. Pages Google holds but never shows are invisible here.
  const pagesWithImpressions = pages.filter((r) => r.impressions > 0).length;

  // Listing pages are the bulk of the site and churn constantly, so one is
  // sampled fresh each run rather than pinned: the question is whether the
  // corpus is reachable at all, not whether one VIN survived the week.
  let sampledListing = null;
  try {
    const xml = await fetchRetry("https://voltcheck.net/sitemap/0.xml").then((r) => r.text());
    const first = xml.match(/<loc>(https:\/\/voltcheck\.net\/listing\/[^<]+)<\/loc>/);
    if (first) sampledListing = first[1];
  } catch {
    // A sitemap that will not answer is itself worth not crashing over.
  }

  const [sitemaps, probes] = await Promise.all([
    sitemapStatus(token).catch((e) => ({ error: e.message })),
    inspect(token, sampledListing ? [...PROBE_URLS, sampledListing] : PROBE_URLS).catch((e) => ({
      error: e.message,
    })),
  ]);

  const report = {
    site: SITE,
    window: cur,
    comparedWith: prev,
    totals: {
      clicks: curTot.clicks,
      impressions: curTot.impressions,
      ctr: curTot.ctr,
      position: curTot.position,
    },
    previousTotals: {
      clicks: prevTot.clicks,
      impressions: prevTot.impressions,
    },
    pagesWithImpressionsFloor: pagesWithImpressions,
    sitemaps,
    probes,
    queries,
    pages,
    countries,
    devices,
    days,
  };

  if (AS_JSON) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  const delta = (now, before) => {
    if (before === 0) return now === 0 ? "" : `  (was 0)`;
    const pct = Math.round(((now - before) / before) * 100);
    return `  (${pct >= 0 ? "+" : ""}${pct}% vs prior ${DAYS}d)`;
  };

  console.log(`Search Console — ${SITE}`);
  console.log(`${cur.startDate} to ${cur.endDate} (${DAYS} days)\n`);
  console.log(`clicks       ${curTot.clicks}${delta(curTot.clicks, prevTot.clicks)}`);
  console.log(
    `impressions  ${curTot.impressions}${delta(curTot.impressions, prevTot.impressions)}`,
  );
  console.log(`avg position ${curTot.position ? curTot.position.toFixed(1) : "n/a"}`);
  console.log(`pages shown  ${pagesWithImpressions} (floor on indexed pages)`);

  const table = (title, rows, width = 62) => {
    if (!rows.length) return;
    console.log(`\n${title}`);
    for (const r of rows) {
      const k = String(r.keys[0]);
      console.log(
        `  ${(k.length > width ? k.slice(0, width - 1) + "…" : k).padEnd(width)}` +
          ` ${String(r.clicks).padStart(4)} clicks  ${String(r.impressions).padStart(5)} impr  pos ${r.position.toFixed(1)}`,
      );
    }
  };

  table("Queries", queries);
  table("Pages", pages);
  table("Countries", countries, 10);
  table("Devices", devices, 10);

  const active = days.filter((d) => d.impressions > 0).length;
  console.log(`\nDays with any impression: ${active} of ${days.length}`);

  console.log("\nSitemaps");
  if (sitemaps.error) {
    console.log(`  could not read: ${sitemaps.error}`);
  } else if (!sitemaps.submitted.length) {
    console.log("  none submitted");
  } else {
    for (const m of sitemaps.submitted) {
      console.log(
        `  ${m.path}\n    downloaded ${m.lastDownloaded?.slice(0, 10) ?? "never"}, ` +
          `${m.errors ?? 0} errors, ${m.warnings ?? 0} warnings`,
      );
    }
    // The line that matters: an index whose children Google has not
    // registered is an index pointing at nothing, and it reports as healthy.
    console.log(`  child sitemaps registered by Google: ${sitemaps.children.length}`);
    for (const c of sitemaps.children) {
      console.log(
        `    ${c.path.replace("https://voltcheck.net", "")} ` +
          `downloaded ${c.lastDownloaded?.slice(0, 10) ?? "never"}, ${c.errors ?? 0} errors`,
      );
    }
  }

  console.log("\nIndex status");
  if (probes.error) {
    console.log(`  could not read: ${probes.error}`);
  } else {
    for (const p of probes) {
      console.log(
        `  ${p.url.replace("https://voltcheck.net", "").padEnd(46) || "/".padEnd(46)}` +
          ` ${p.state}${p.lastCrawled ? `, crawled ${p.lastCrawled}` : ""}`,
      );
    }
  }
}

main().catch((err) => {
  console.error(`gsc-report: ${err.message}`);
  process.exit(1);
});
