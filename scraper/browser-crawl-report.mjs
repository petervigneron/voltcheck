#!/usr/bin/env node
// One run of the browser crawl, in outcomes: rooftops read, in how many
// minutes, at what cost, what it recovered — and the dark set before and
// after (browser-lane-dark.mjs). Written to stdout and, when GitHub sets it,
// to the job summary.
//
//   node browser-crawl-report.mjs --parts <dir> [--before a.json] [--after b.json]
//
// <dir> holds one sub-directory per crawl part with that part's out/report.json
// (crawl.mjs's per-rooftop reports), out/sync-totals.json (db-sync's own
// counts) and out/crawl-timing.json ({ startedAt, endedAt, asked }).
import { readFile, readdir, appendFile } from "node:fs/promises";
import { join } from "node:path";

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : fallback;
};
const partsDir = flag("--parts", "");
const readJson = async (p) => {
  try {
    return JSON.parse(await readFile(p, "utf-8"));
  } catch {
    return null;
  }
};
const before = await readJson(flag("--before", ""));
const after = await readJson(flag("--after", ""));

/** The lane's outcome for one rooftop, from what crawl.mjs recorded. */
export function outcomeOf(r) {
  const s = String(r?.stoppedEarly ?? "");
  if (!s) return "complete";
  if (/abandoned/.test(s)) return "abandoned";
  if (/robots_disallowed/.test(s)) return "robots-disallowed";
  if (/search 429/.test(s)) return "challenged (429)";
  if (/browser_unavailable/.test(s)) return "browser unavailable";
  if (/no SRP answered/.test(s)) return "no SRP answered";
  if (/lane failed/.test(s)) return "failed";
  if (/browser lane/.test(s) || /cap|budget|deadline/.test(s)) return "partial";
  return "other";
}
const platformOf = (r) => (r?.laneNote ?? "").split(" ")[0] || r?.evs?.[0]?.platform || "unknown";
const loadsOf = (r) => Number(/in (\d+) browser load/.exec(r?.laneNote ?? "")?.[1] ?? r?.fetched ?? 0);

const parts = [];
if (partsDir) {
  for (const name of (await readdir(partsDir)).sort()) {
    const report = await readJson(join(partsDir, name, "report.json"));
    if (!report) continue;
    parts.push({ name, report, totals: await readJson(join(partsDir, name, "sync-totals.json")), timing: await readJson(join(partsDir, name, "crawl-timing.json")) });
  }
}
const reports = parts.flatMap((p) => p.report);
const asked = parts.reduce((a, p) => a + (p.timing?.asked ?? 0), 0);
const minutes = parts.map((p) => (p.timing ? (Date.parse(p.timing.endedAt) - Date.parse(p.timing.startedAt)) / 60_000 : NaN)).filter(Number.isFinite);
const byCluster = {};
for (const r of reports) {
  const c = (byCluster[platformOf(r)] ??= { rooftops: 0, loads: 0, evs: 0, outcomes: {} });
  c.rooftops++;
  c.loads += loadsOf(r);
  c.evs += r.evs?.length ?? 0;
  const o = outcomeOf(r);
  c.outcomes[o] = (c.outcomes[o] ?? 0) + 1;
}
const loads = reports.map(loadsOf).sort((a, b) => a - b);
const pct = (q) => (loads.length ? loads[Math.min(loads.length - 1, Math.floor(loads.length * q))] : 0);
const totals = { seen: 0, new: 0, price_changed: 0, delisted: 0, relisted: 0 };
let synced = 0;
for (const p of parts) {
  if (!p.totals?.totals) continue;
  synced++;
  for (const k of Object.keys(totals)) totals[k] += p.totals.totals[k] ?? 0;
}

const lines = [];
lines.push(`## Browser crawl — what this run did`);
lines.push("");
if (before) lines.push(`Before: **${before.dark} dark cars on ${before.darkRooftops} rooftops** (${before.fullyDarkRooftops} fully dark) of ${before.live} live on ${before.browserLaneRooftops} browser-lane rooftops — ${before.at}, via ${before.via}.`);
if (after) lines.push(`After: **${after.dark} dark cars on ${after.darkRooftops} rooftops** (${after.fullyDarkRooftops} fully dark) of ${after.live} live — ${after.at}.`);
if (before && after) lines.push(`Recovered to the served view: **${Math.max(0, before.dark - after.dark)} cars** (dark before − dark after; delistings below also leave the dark set).`);
lines.push("");
lines.push(`Rooftops: ${asked} asked, ${reports.length} reported, ${parts.length} parts (${synced} synced). Crawl minutes per part: ${minutes.length ? `${Math.min(...minutes).toFixed(0)}–${Math.max(...minutes).toFixed(0)} (median ${minutes.sort((a, b) => a - b)[Math.floor(minutes.length / 2)].toFixed(0)})` : "n/a"}.`);
lines.push(`Browser loads: ${loads.reduce((a, b) => a + b, 0)} total; per rooftop median ${pct(0.5)}, p90 ${pct(0.9)}, max ${loads.at(-1) ?? 0}.`);
if (minutes.length && loads.length) {
  const totalMin = minutes.reduce((a, b) => a + b, 0);
  lines.push(`Throughput: ${(loads.reduce((a, b) => a + b, 0) / totalMin).toFixed(1)} loads/min/part, ${((reports.length / totalMin) * 60).toFixed(0)} rooftops/hour/part.`);
}
lines.push(`Cars: ${totals.seen} seen, ${totals.new} new, ${totals.price_changed} price changes, ${totals.delisted} delisted, ${totals.relisted} relisted (db-sync's own counts, summed over parts).`);
lines.push("");
lines.push(`| cluster | rooftops | loads | EVs | outcomes |`);
lines.push(`|---|---|---|---|---|`);
for (const [c, v] of Object.entries(byCluster).sort((a, b) => b[1].rooftops - a[1].rooftops)) {
  const oc = Object.entries(v.outcomes).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n} (${((100 * n) / v.rooftops).toFixed(0)}%)`).join(", ");
  lines.push(`| ${c} | ${v.rooftops} | ${v.loads} | ${v.evs} | ${oc} |`);
}
if (after?.top?.length) {
  lines.push("");
  lines.push(`Still dark after: ${after.top.map((t) => `${t.domain} ${t.dark}/${t.live}`).join(", ")}`);
}
const text = lines.join("\n");
console.log(text);
if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, text + "\n").catch(() => {});
