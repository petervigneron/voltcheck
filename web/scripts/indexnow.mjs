// Tell IndexNow (Bing, Yandex, Naver, Seznam — and through Bing, the AI
// assistants that search with it) which pages changed. Runs after every
// publish (publish-feed.yml): the static pages, model hubs and fact sheets,
// whose numbers move with the feed, plus the listings Census first saw since
// the previous publish. `--all` submits every listing as well — a first run,
// or a domain change. A search engine that has to discover 166k pages by
// crawling a day-old domain never will; this hands it the list.
//
// The key is public by design: the protocol proves control of the host by
// serving the key file at /<key>.txt (web/public), and the key file is
// checked before anything is announced — a key mismatch is a 403 on every
// submission, forever, with no other symptom.
//
// Never fails the publish: a refused batch is a warning. The grid is live
// either way; this only decides how soon Bing hears about it.
//
// Usage: node --experimental-strip-types --import ./scripts/ts-resolve-hook.mjs \
//          scripts/indexnow.mjs [--all] [--dry-run]
// Env: SITE_ORIGIN (default https://censusev.com), INDEXNOW_KEY (default the
// committed key), INDEXNOW_SINCE_HOURS (default 7: five publishes a day plus slack).
import { unpackIndex } from "../lib/listings/pack.ts";
import { fetchServedShards } from "../lib/listings/servedShards.ts";

const ORIGIN = (process.env.SITE_ORIGIN || "https://censusev.com").replace(/\/$/, "");
const HOST = new URL(ORIGIN).host;
const KEY = process.env.INDEXNOW_KEY || "506fcf6a62c3dc1a4ac8106ca8540133";
const SINCE_H = Number(process.env.INDEXNOW_SINCE_HOURS || 7);
const ALL = process.argv.includes("--all");
const DRY = process.argv.includes("--dry-run");
const BATCH = 10_000; // the protocol's per-request cap

const keyRes = await fetch(`${ORIGIN}/${KEY}.txt`);
const served = keyRes.ok ? (await keyRes.text()).trim() : "";
if (served !== KEY) {
  console.log(`::warning::indexnow: ${ORIGIN}/${KEY}.txt does not serve the key (${keyRes.status}) — nothing submitted`);
  if (!DRY) process.exit(0);
}

// Shard 0 of the sitemap carries every non-listing page (lib/sitemap.ts
// staticRoutes): home, /ev and the 246 hubs, /facts and the sheets, /vin.
const sm = await (await fetch(`${ORIGIN}/sitemap/0.xml`)).text();
const statics = [...sm.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]).filter((u) => !u.includes("/listing/"));

const shards = (await fetchServedShards(ORIGIN)).map(unpackIndex);
const seen = new Set();
const rows = shards.flat().filter((r) => !seen.has(r.id) && (seen.add(r.id), true));
const since = Date.now() - SINCE_H * 3_600_000;
const listings = rows
  .filter((r) => ALL || (r.firstSeenAt && Date.parse(r.firstSeenAt) > since))
  .map((r) => `${ORIGIN}/listing/${r.id}`);

const urls = [...new Set([...statics, ...listings])];
console.log(
  `indexnow: ${statics.length} static/hub/fact pages + ${listings.length} listings (${ALL ? "all" : `first seen in the last ${SINCE_H}h`}) = ${urls.length} URLs`,
);
if (DRY || urls.length === 0) process.exit(0);

let accepted = 0;
for (let i = 0; i < urls.length; i += BATCH) {
  const batch = urls.slice(i, i + BATCH);
  const res = await fetch("https://api.indexnow.org/indexnow", {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({ host: HOST, key: KEY, keyLocation: `${ORIGIN}/${KEY}.txt`, urlList: batch }),
  });
  if (res.status === 200 || res.status === 202) accepted += batch.length;
  else console.log(`::warning::indexnow: batch ${i / BATCH + 1} answered ${res.status} ${(await res.text().catch(() => "")).slice(0, 200)}`);
}
console.log(`indexnow: ${accepted}/${urls.length} URLs accepted`);
