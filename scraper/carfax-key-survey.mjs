#!/usr/bin/env node
// Where does each dealer-website platform hand its Carfax badge the Snapshot
// key? A survey, not a lane: it writes nothing to the database or the
// registry, only out/carfax-key-survey.json and a summary.
//
//   node carfax-key-survey.mjs [--platforms dealer.com,dealeron] [--per-platform 8] [--seed 1]
//
// WHY
//
// lib/carfax-snapshot.mjs reads a car's title brand off the Carfax Snapshot
// only where the dealer publishes that car's key, and today it finds keys in
// two places: the Team Velocity inventory API (carFax_SNAPSHOT_KEY) and a
// `snapshotkey` written into page HTML. That is 6,866 VINs against ~69,000
// live used cars (2026-10-05). On 2026-10-05 a 2023 Lightning XLT the owner
// cited as a comp turned out branded on Carfax; it had come in through an
// Autotrader-syndicated page with no key the crawl could see, so its blank
// brand flag meant "never checked", not "clean".
//
// dealer.com, DealerOn and Dealer Inspire rooftops show the same Carfax badge
// on their VDPs. If that badge is fed a per-car key the way Team Velocity's
// is, the key is on the page or in one of its own requests, and reading it is
// the same act the existing lane already performs. This survey finds out,
// per platform, before anyone writes an extractor.
//
// WHAT IT DOES, PER LISTING
//
// One used car per rooftop, picked from the live listings table. One load in
// lib/browser.mjs's Chrome — the same robots gate and per-host pacing as the
// browser lanes — recording every response the page itself makes. It does not
// click or hover anything. Then it looks for:
//   * a snapshot request the page made on its own (snapshot.carfax.com with a
//     snapshotkey), and which earlier response or the HTML carried that key;
//   * a key published under a key-like name (snapshotkey, carFax_SNAPSHOT_KEY,
//     snapshot_key) in the HTML or any response;
//   * any carfax URL at all in the HTML or the request list, so a page whose
//     badge is wired some other way (a partner report link keyed on VIN) is
//     told apart from a page with no badge.
// A key it finds is tried once against the Snapshot endpoint, exactly as
// carfax-snapshot.mjs would, and only the answer's shape is reported: did it
// answer, how many panel rows, whether a title-brand row was present.

import { readFile, writeFile, appendFile, mkdir } from "node:fs/promises";
import { browserFetch, closeBrowser } from "./lib/browser.mjs";
import { politeGetJson } from "./lib/http.mjs";
import { parseSnapshot, snapshotUrl, isSnapshotKey, snapshotKeyFromHtml } from "./lib/carfax-snapshot.mjs";

const arg = (name, dflt) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : dflt;
};
const PLATFORMS = arg("platforms", "dealer.com,dealeron").split(",").map((s) => s.trim()).filter(Boolean);
const PER = Math.max(1, Number(arg("per-platform", "8")));
const SEED = Number(arg("seed", "1"));

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY: KEY } = process.env;
if (!SUPABASE_URL || !KEY) {
  console.error("carfax-key-survey: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are needed to pick live used cars.");
  process.exit(1);
}

// Deterministic shuffle, so a re-run with the same seed surveys the same cars.
function shuffled(arr, seed) {
  let s = seed >>> 0 || 1;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const registry = JSON.parse(await readFile(new URL("./registry/registry.json", import.meta.url), "utf-8"));

/** One live used VDP per rooftop, for up to PER rooftops of this platform.
 *  listings_live_domain (dealer_domain where delisted_at is null) keeps each
 *  read an index lookup. */
async function pickCars(platform) {
  const domains = shuffled(
    registry.sites.filter((s) => s.platform === platform && s.status === "working" && s.kind === "rooftop").map((s) => s.domain),
    SEED
  );
  const picked = [];
  for (let i = 0; i < domains.length && picked.length < PER; i += 40) {
    const chunk = domains.slice(i, i + 40);
    const url =
      `${SUPABASE_URL.replace(/\/$/, "")}/rest/v1/listings?select=vin,dealer_domain,url:payload->>sourceUrl` +
      `&delisted_at=is.null&condition=in.(used,certified)&dealer_domain=in.(${chunk.map(encodeURIComponent).join(",")})&limit=400`;
    const res = await fetch(url, { headers: { apikey: KEY, authorization: `Bearer ${KEY}` } });
    if (!res.ok) throw new Error(`listings read ${res.status}: ${await res.text()}`);
    const seen = new Set(picked.map((p) => p.domain));
    for (const r of await res.json()) {
      if (picked.length >= PER) break;
      if (seen.has(r.dealer_domain) || !/^https?:\/\//.test(r.url ?? "")) continue;
      // The car must be on the rooftop's own site: a syndicated URL would
      // survey Autotrader's page, not this platform's.
      let host;
      try {
        host = new URL(r.url).hostname.replace(/^www\./, "");
      } catch {
        continue;
      }
      if (!host.endsWith(r.dealer_domain.replace(/^www\./, ""))) continue;
      seen.add(r.dealer_domain);
      picked.push({ platform, domain: r.dealer_domain, vin: r.vin, url: r.url });
    }
  }
  return picked;
}

const NAMED_KEY = /(snapshot_?key|carfax_?snapshot_?key)["']?\s*[:=]\s*["']([A-Za-z0-9_-]{40,200})["']/gi;
const CARFAX_URL = /https?:\/\/[a-z0-9.-]*carfax\.com[^\s"'<>\\)]*/gi;

/** Where a key first appears: "html" or the response URL that carried it. */
function sourceOf(key, body, captured) {
  if (body?.includes(key)) return "html";
  const hit = captured.find((c) => !/snapshot\.carfax\.com/.test(c.url) && c.text?.includes(key));
  return hit ? hit.url.split("?")[0] : null;
}

/** Strip query values so the report names a link's shape, not its contents. */
const shape = (u) => {
  try {
    const x = new URL(u.replace(/&amp;/g, "&"));
    return `${x.host}${x.pathname}${[...x.searchParams.keys()].length ? "?" + [...x.searchParams.keys()].join("&") : ""}`;
  } catch {
    return u.slice(0, 120);
  }
};

async function survey(car) {
  const r = await browserFetch(car.url, { capture: /./, settleMs: 5000 });
  const out = { ...car, status: r.status, finalUrl: r.finalUrl };
  if (!r.body) return out;
  const captured = r.captured ?? [];

  // A snapshot the page fetched on its own.
  const snapReq = captured.find((c) => /snapshot\.carfax\.com/.test(c.url) && /snapshotkey=/i.test(c.url));
  let key, keyVia;
  if (snapReq) {
    key = new URL(snapReq.url).searchParams.get("snapshotkey") ?? undefined;
    keyVia = "page requested snapshot";
  }
  // A key published under a key-like name.
  if (!key) key = snapshotKeyFromHtml(r.body);
  if (!key) {
    for (const text of [r.body, ...captured.map((c) => c.text ?? "")]) {
      const m = [...text.matchAll(NAMED_KEY)][0];
      if (m) {
        key = m[2];
        break;
      }
    }
  }
  if (key && !keyVia) keyVia = "named in page or response";
  if (key && !isSnapshotKey(key)) key = undefined;

  const linkShapes = new Set();
  for (const m of r.body.matchAll(CARFAX_URL)) linkShapes.add(shape(m[0]));
  for (const c of captured) if (/carfax\.com/i.test(c.url)) linkShapes.add(shape(c.url));

  out.carfaxMentioned = /carfax/i.test(r.body) || captured.some((c) => /carfax/i.test(c.url));
  out.carfaxLinks = [...linkShapes].slice(0, 12);
  out.keyFound = !!key;
  if (key) {
    out.keyVia = keyVia;
    out.keySource = sourceOf(key, r.body, captured);
    const { status, json } = await politeGetJson(snapshotUrl(key), { headers: { referer: `https://${car.domain}/` } });
    const parsed = json ? parseSnapshot(json) : { rows: [] };
    out.snapshot = { status, rows: parsed.rows.length, titleBrandRow: !!parsed.titleBrand };
  }
  return out;
}

const results = [];
for (const platform of PLATFORMS) {
  const cars = await pickCars(platform);
  console.log(`${platform}: surveying ${cars.length} rooftops`);
  for (const car of cars) {
    const r = await survey(car);
    console.log(
      `  ${r.domain} ${r.status} carfax=${r.carfaxMentioned ? "y" : "n"} key=${r.keyFound ? `y (${r.keyVia}; from ${r.keySource}; snapshot ${r.snapshot?.status}, ${r.snapshot?.rows} rows)` : "n"}` +
        (r.carfaxLinks?.length ? `\n      links: ${r.carfaxLinks.join("  ")}` : "")
    );
    results.push(r);
  }
}
await closeBrowser();

await mkdir(new URL("./out/", import.meta.url), { recursive: true });
await writeFile(new URL("./out/carfax-key-survey.json", import.meta.url), JSON.stringify(results, null, 1));

const lines = ["| Platform | Loaded | Carfax on page | Key found | Snapshot answered | Key came from |", "|---|---|---|---|---|---|"];
for (const p of PLATFORMS) {
  const rs = results.filter((r) => r.platform === p);
  const loaded = rs.filter((r) => r.status === 200);
  const keyed = rs.filter((r) => r.keyFound);
  const answered = keyed.filter((r) => r.snapshot?.status === 200 && r.snapshot.rows > 0);
  const sources = [...new Set(keyed.map((r) => r.keySource ?? "?"))].join(", ") || "—";
  lines.push(`| ${p} | ${loaded.length}/${rs.length} | ${loaded.filter((r) => r.carfaxMentioned).length} | ${keyed.length} | ${answered.length} | ${sources} |`);
}
const summary = lines.join("\n");
console.log("\n" + summary);
if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, `## Carfax key survey\n\n${summary}\n`);

// One annotation per platform as well: annotations are readable through the
// REST API (check-runs/<id>/annotations), where logs and artifacts are served
// off a storage host some API-only clients cannot reach.
if (process.env.GITHUB_ACTIONS) {
  const esc = (s) => String(s).replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");
  for (const p of PLATFORMS) {
    const rows = results
      .filter((r) => r.platform === p)
      .map(
        (r) =>
          `${r.domain} ${r.status} carfax=${r.carfaxMentioned ? "y" : "n"} key=${
            r.keyFound ? `y via ${r.keyVia} from ${r.keySource} snapshot=${r.snapshot?.status}/${r.snapshot?.rows}rows brandRow=${r.snapshot?.titleBrandRow}` : "n"
          } links=${(r.carfaxLinks ?? []).join(" ") || "-"}`
      );
    console.log(`::notice title=Carfax key survey: ${p}::${esc(rows.join("\n"))}`);
  }
}
