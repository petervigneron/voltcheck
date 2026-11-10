#!/usr/bin/env node
// Who came to censusev.com, from where, and what it earned.
//
// The companion to gsc-report.mjs: that one is Google's count of searches
// BEFORE a click; this is the site's own count of people AFTER they arrive,
// from any source, plus the number the project is judged on — passes sold.
// Reads the `events` rows the site writes (web/components/VisitBeacon.tsx,
// migration 0114) and `pro_passes`, with the service-role key, because anon
// cannot read either.
//
// It reports what the rows say and nothing else. A visitor is a browser
// (a random id in its localStorage), so one person on a phone and a laptop
// is two, and the owner's own browsing is in here too. Crawlers are dropped
// before insert, not here.
//
// Usage:
//   node scraper/visit-report.mjs              # last 7 days, vs the 7 before
//   node scraper/visit-report.mjs --days 28
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

const argv = process.argv.slice(2);
const flag = (n, d) => {
  const i = argv.indexOf(`--${n}`);
  return i === -1 ? d : argv[i + 1];
};
const DAYS = Number(flag("days", 7));

const BASE = process.env.SUPABASE_URL?.replace(/\/$/, "");
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!BASE || !KEY) {
  console.error("visit-report: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
  process.exit(1);
}

const PAGE = 1000;
async function rows(table, query) {
  const out = [];
  for (let from = 0; ; from += PAGE) {
    const r = await fetch(`${BASE}/rest/v1/${table}?${query}`, {
      headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, Range: `${from}-${from + PAGE - 1}` },
      signal: AbortSignal.timeout(30_000),
    });
    if (!r.ok) throw new Error(`${table}: ${r.status} ${(await r.text()).slice(0, 200)}`);
    const page = await r.json();
    out.push(...page);
    if (page.length < PAGE) return out;
  }
}

const now = Date.now();
const iso = (ms) => new Date(ms).toISOString();
const start = now - DAYS * 864e5;
const prior = now - 2 * DAYS * 864e5;

const events = await rows(
  "events",
  `select=client_id,name,props,created_at&name=in.(page_view,dealer_click)&created_at=gte.${iso(prior)}&order=id`,
);
const passes = await rows("pro_passes", `select=amount_cents,created_at&created_at=gte.${iso(prior)}`);

function summarise(evts, from, to) {
  const inWin = evts.filter((e) => {
    const t = Date.parse(e.created_at);
    return t >= from && t < to;
  });
  const views = inWin.filter((e) => e.name === "page_view");
  const clicks = inWin.filter((e) => e.name === "dealer_click");
  const ids = (list) => new Set(list.map((e) => e.client_id)).size;
  const landings = views.filter((e) => e.props?.land);
  const tally = (list, key) => {
    const m = new Map();
    for (const e of list) m.set(key(e), (m.get(key(e)) ?? 0) + 1);
    return [...m].sort((a, b) => b[1] - a[1]);
  };
  return {
    visitors: ids(views),
    newVisitors: ids(views.filter((e) => e.props?.new)),
    visits: landings.length,
    pages: views.length,
    reachedPro: ids(views.filter((e) => e.props?.p === "/pro")),
    dealerClicks: clicks.length,
    dealerClickers: ids(clicks),
    sources: tally(landings, (e) => e.props?.src ?? e.props?.ref ?? "(direct or unknown)"),
    landingPages: tally(landings, (e) => e.props?.p ?? "?"),
  };
}

const cur = summarise(events, start, now + 1);
const was = summarise(events, prior, start);
const sold = (from, to) =>
  passes.filter((p) => Date.parse(p.created_at) >= from && Date.parse(p.created_at) < to);
const soldNow = sold(start, now + 1);
const soldWas = sold(prior, start);
const usd = (list) => `$${(list.reduce((s, p) => s + (p.amount_cents ?? 0), 0) / 100).toFixed(2)}`;

const day = (ms) => iso(ms).slice(0, 10);
const line = (label, value, before) => console.log(`${label.padEnd(15)}${value}  (was ${before})`);

console.log("Visitors — censusev.com");
console.log(`${day(start)} to ${day(now)} (${DAYS} days)`);
console.log("");
line("visitors", cur.visitors, was.visitors);
line("first-time", cur.newVisitors, was.newVisitors);
line("visits", cur.visits, was.visits);
line("pages opened", cur.pages, was.pages);
line("reached /pro", cur.reachedPro, was.reachedPro);
line("dealer clicks", `${cur.dealerClicks} by ${cur.dealerClickers}`, `${was.dealerClicks} by ${was.dealerClickers}`);
line("passes sold", `${soldNow.length} (${usd(soldNow)})`, `${soldWas.length} (${usd(soldWas)})`);

const table = (title, list) => {
  if (!list.length) return;
  console.log("");
  console.log(title);
  for (const [k, n] of list.slice(0, 12)) console.log(`  ${String(k).padEnd(40)} ${n}`);
};
table("Where visits came from", cur.sources);
table("First page of a visit", cur.landingPages);
