// Where a hub page gets its cars.
//
// The artifact first, a walk only if there isn't one — the same order, the
// same 36h freshness gate and the same cache tag as app/api/index/[shard],
// and for the same reason its comment gives: a cold render should cost one
// CDN file fetch, not a 149,000-row database walk. The difference here is
// that one file serves all 246 hubs, so the fetch is shared by every hub
// render in the instance rather than repeated per page.
//
// The fallback is deliberately NOT the refuse-and-throw the browse shards
// use. Those refuse a fallback feed because a thin one silently understates
// the whole site's inventory on the page every visit starts at. A hub is a
// leaf page about one nameplate: if the feed is thin, this page lists fewer
// of that model's cars, which is visibly less rather than invisibly wrong,
// and 404ing 246 URLs during an outage would cost far more than it saves.

import { FEED_CACHE_TAG } from "./db";
import { buildCardIndex } from "./buildIndex";
import { buildHubIndex, type HubEntry, type HubIndex } from "./hubIndex";

const ARTIFACT_MAX_AGE_MS = 36 * 60 * 60 * 1000;

interface FeedManifest {
  v: 1;
  publishedAt: string;
  total: number;
}

async function publishedHubIndex(): Promise<HubIndex | null> {
  const base = process.env.SUPABASE_URL;
  if (!base) return null;
  try {
    const mRes = await fetch(`${base}/storage/v1/object/public/feed/manifest.json`, {
      next: { revalidate: 86400, tags: [FEED_CACHE_TAG] },
    });
    if (!mRes.ok) return null;
    const m = (await mRes.json()) as FeedManifest;
    if (m.v !== 1 || !Number.isFinite(Date.parse(m.publishedAt))) return null;
    // An artifact older than the gate is treated as absent rather than
    // served: quietly listing last week's cars because a publisher died is
    // the bundled-snapshot incident with extra steps.
    if (Date.now() - Date.parse(m.publishedAt) > ARTIFACT_MAX_AGE_MS) return null;

    const bRes = await fetch(`${base}/storage/v1/object/public/feed/hubs.json`, {
      next: { revalidate: 86400, tags: [FEED_CACHE_TAG] },
    });
    if (!bRes.ok) return null;
    const body = (await bRes.json()) as HubIndex;
    // A published file predating the hubs artifact answers 404 above; one
    // from a future shape is caught here rather than rendered as empty.
    if (body?.v !== 1 || !body.hubs) return null;
    return body;
  } catch {
    // A hub page is not the right place to surface a storage outage. The
    // walk below either answers or fails on its own terms.
    return null;
  }
}

// One load shared by every hub render in this process, the same shape and the
// same reasoning as db.ts's walk memo: warming 246 hubs is a sequence of
// curls landing on the same warm lambda, and this is what turns 246 renders
// into one load. Ten minutes for the same reason too — the pages themselves
// cache a day, so the memo's TTL is never the user-visible staleness, and a
// lambda outliving a revalidate can serve at most ten stale minutes.
const MEMO_MS = 10 * 60 * 1000;
let memo: { at: number; promise: Promise<HubIndex> } | null = null;

async function loadHubIndex(): Promise<HubIndex> {
  if (memo && Date.now() - memo.at < MEMO_MS) return memo.promise;
  const next = {
    at: Date.now(),
    promise: (async (): Promise<HubIndex> => {
      const published = await publishedHubIndex();
      if (published) return published;
      const { rows } = await buildCardIndex();
      return buildHubIndex(rows);
    })(),
  };
  memo = next;
  // A failed load must not stick for ten minutes — the next request should
  // get a real attempt rather than a cached rejection.
  next.promise.catch(() => {
    if (memo === next) memo = null;
  });
  return next.promise;
}

/** One hub's cars, or an empty entry when the model has none live. */
export async function hubEntry(key: string): Promise<HubEntry> {
  const index = await loadHubIndex();
  return index.hubs[key] ?? { total: 0, cars: [] };
}

/** Every hub's car count, for the /ev index. */
export async function hubTotals(): Promise<Record<string, number>> {
  const index = await loadHubIndex();
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(index.hubs)) out[k] = v.total;
  return out;
}
