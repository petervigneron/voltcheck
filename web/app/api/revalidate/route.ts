import { createHash, timingSafeEqual } from "node:crypto";
import { revalidatePath, revalidateTag } from "next/cache";
import { FEED_CACHE_TAG } from "@/lib/listings/db";
import { SHARDS } from "@/lib/listings/pack";
import { SITEMAP_SHARDS } from "@/lib/sitemap";

// The nightly pipeline's "the data just changed" signal. The feed walk is
// cached a full day (lib/listings/db.ts) because the data changes exactly
// when the pipeline runs; this route is how the pipeline says so. It expires
// every fetch tagged "feed" and marks the six index shards stale, so the
// caller's warming curls rebuild them right then — one walk, at night,
// instead of hourly re-walks all day (the 33 GB/mo egress incident,
// 2026-08-17). Called by nightly.yml's revalidate step, and by hand after
// any out-of-cycle db-sync.
//
// Auth is the ingest gateway's pattern: the public repo carries only the
// sha256 of the secret; CI carries the plaintext (FEED_REVALIDATE_SECRET,
// also in the owner's local docs/feed-revalidate-secret.txt). Rotating it
// is one hash swap here. A guessing attacker can't invalidate anything, so
// they can't make us walk the database on demand — which is exactly the
// bill this cache exists to avoid.
const SECRET_SHA256 = "0c8c6c5e5dc8b75b5afa4c5b8db75d9c12381691fc15d7e0a79459ea46cf0dbf";

export async function POST(req: Request) {
  const given = req.headers.get("x-revalidate-secret") ?? "";
  const digest = createHash("sha256").update(given).digest();
  const want = Buffer.from(SECRET_SHA256, "hex");
  if (!timingSafeEqual(digest, want)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  // ONE ARGUMENT. Not `{ expire: 0 }`, and not updateTag. This is the whole
  // fix, and both wrong answers were tried on production first.
  //
  // The bug: this route has been a no-op for the feed since the Next 16
  // upgrade. POST it, then request a shard — it DOES re-render
  // (x-vercel-cache: REVALIDATED, age 0) but in 2.0 seconds, where a real feed
  // walk is 90-300s. It was re-rendering against fetch entries the tag call
  // never purged. Symptom: /api/index/first frozen at total 136,597 for 19+
  // hours while the database moved past 137,300, through three POSTs and two
  // deploy+promote cycles.
  //
  // Why: in Next 16.3.0 `revalidateTag(tag, profile)` reads its second
  // argument as a cacheLife PROFILE (it normalises objects through
  // validateAndNormalizeCacheLifeProfile), so `{ expire: 0 }` asked for a
  // cache lifetime rather than a purge.
  //
  // Why not updateTag, which the deprecation warning suggests: it throws here.
  // From next/dist/server/web/spec-extension/revalidate.js —
  //   if (!workStore || workStore.page.endsWith('/route')) throw new Error(
  //     'updateTag can only be called from within a Server Action. To
  //      invalidate cache tags in Route Handlers or other contexts, use
  //      revalidateTag instead.')
  // Deployed that, and this route answered HTTP 500. It is a Route Handler.
  //
  // What one argument does: the same file shows updateTag delegating to
  // `revalidate([tag], desc, undefined)` under the comment "updateTag uses
  // immediate expiration (no profile) without deprecation warning". Passing no
  // profile IS the immediate purge; the single-arg call reaches exactly that
  // code path. It logs a deprecation warning and works, which is the right
  // trade against a second argument that silently does nothing.
  // The cast is load-bearing, not laziness: Next 16's TYPES mark the profile
  // as required (`revalidateTag(tag, profile: string | CacheLifeConfig)`),
  // while its RUNTIME treats no-profile as the immediate purge. Passing a
  // profile to satisfy the compiler is what caused this bug in the first
  // place, so the type is the thing that gives way here, with the reason
  // written down.
  (revalidateTag as unknown as (tag: string) => void)(FEED_CACHE_TAG);
  for (let s = 0; s < SHARDS; s++) revalidatePath(`/api/index/${s}`);
  // The seventh and eighth bodies under the shard route: the first-paint
  // payload and /worth's trim facets. Same data, same staleness rules.
  revalidatePath("/api/index/first");
  revalidatePath("/api/index/trims");
  // The sitemap shards render off the same feed walk and cache for the same
  // day (app/sitemap/[shard]/route.ts). They stopped being build artifacts on
  // 2026-08-22 — which means this route, and the caller's warming curls after
  // it, are now what keeps them current. Warmed in the same pass as the index
  // shards, they cost no extra database read: db.ts's ten-minute walk memo is
  // still holding the walk the index warm-up just paid for.
  for (let s = 0; s < SITEMAP_SHARDS; s++) revalidatePath(`/sitemap/${s}.xml`);
  // The model hubs read hubs.json through a tagged fetch, but on 2026-09-08
  // the tag alone did not turn the pages over: two hours after a publish that
  // gave every hub its first stats block, /ev/tesla/model-y still served the
  // pre-publish render (x-vercel-cache HIT, age 7,723 s). The index routes and
  // the sitemaps never had this problem because they are named here by path.
  // So the hubs are too — one call covers all 246, plus the index that links
  // them — and a publish is what makes a hub's numbers current, not its TTL.
  revalidatePath("/ev/[make]/[model]", "page");
  revalidatePath("/ev");
  // The listing pages too (2026-09-12). Each caches for a day
  // (app/listing/[id]/page.tsx), so a car the database stopped serving at
  // 04:00 — delisted by the recheck, or withheld by 0089 because nothing
  // could vouch for it — kept answering 200 with its price until its own
  // TTL ran out, up to 24 hours later. The owner found the sold Lightning's
  // page still up after the view had dropped it. A publish is the moment
  // the data underneath moved, so it is the moment every listing page's
  // entry is invalidated; each page re-renders once on its next visit,
  // which is the same one-write-per-page-per-day the TTL already implies,
  // just aligned to the data instead of to the clock.
  revalidatePath("/listing/[id]", "page");
  return Response.json({ revalidated: true });
}
