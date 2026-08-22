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
  revalidateTag(FEED_CACHE_TAG, { expire: 0 });
  for (let s = 0; s < SHARDS; s++) revalidatePath(`/api/index/${s}`);
  // The seventh body under the shard route: the first-paint payload. Same
  // data, same staleness rules.
  revalidatePath("/api/index/first");
  // The sitemap shards render off the same feed walk and cache for the same
  // day (app/sitemap/[shard]/route.ts). They stopped being build artifacts on
  // 2026-08-22 — which means this route, and the caller's warming curls after
  // it, are now what keeps them current. Warmed in the same pass as the index
  // shards, they cost no extra database read: db.ts's ten-minute walk memo is
  // still holding the walk the index warm-up just paid for.
  for (let s = 0; s < SITEMAP_SHARDS; s++) revalidatePath(`/sitemap/${s}.xml`);
  return Response.json({ revalidated: true });
}
