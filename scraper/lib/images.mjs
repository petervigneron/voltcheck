// Photo-array stabilization, shared across every extractor that hands
// normalize() more than one image URL.
//
// Why stability matters: migration 0025's write-wide-only-on-payload-change
// guard treats the whole listings.payload jsonb as one equality check —
// payload-equal must mean row-equal, or the nightly rewrites every wide row
// it touches (the exact OOM-triggering churn 0025 was built to kill, per
// scraper/lib/normalize.mjs and the migration's own header). An `images`
// array is just as much a part of that payload as price or trim. If a
// platform's CDN reorders its photo list between requests, appends a
// cache-busting query param, or re-signs a URL, an otherwise-unchanged
// listing would register as "changed" every single night purely because its
// photo array printed differently — silently defeating 0025 for every
// listing that carries photos.
//
// dealer.com and DealerOn were live-verified byte-stable across back-to-back
// fetches (no query string at all, content-hashed paths — see
// docs/agents/photos-2026-08-20.md) — so today this is defensive insurance,
// not a fix for an observed problem. But "what's volatile" is a
// platform-specific fact a future lane's CDN might not share (a `?token=`
// or `?v=` resize/signature param would defeat raw-array equality
// immediately), so every extractor that emits multiple images should run
// them through this before handing them to normalize().
//
// Order: dedupe-then-cap, preserving the platform's own source order — not
// sorted. The first surviving URL is the hero (normalize.mjs's `imageUrl`
// is `vehicle.image[0]`; the detail page's gallery hero is `images[0]`), so
// reordering here would silently swap which photo a shopper sees first from
// under the platform's own intent.

const MAX_IMAGES = 8; // matches ingest.mjs's own images cap — no reason to carry more this far upstream

// Strip query string and fragment — the part of a URL most likely to carry a
// resize directive, cache-bust token, or signature, none of which identify a
// different photo. The path (often a content hash or sequence number on the
// platforms we've checked) is what identifies a distinct image.
function stripVolatile(raw) {
  if (typeof raw !== "string" || !raw) return undefined;
  try {
    const u = new URL(raw);
    u.search = "";
    u.hash = "";
    return u.toString();
  } catch {
    return undefined;
  }
}

// urls: an array of absolute image URLs (resolve against origin before
// calling this — it does not know a platform's base URL). Returns a deduped,
// query-stripped array capped at 8, in source order, first entry the hero.
export function stabilizeImages(urls) {
  if (!Array.isArray(urls)) return [];
  const seen = new Set();
  const out = [];
  for (const raw of urls) {
    const clean = stripVolatile(raw);
    if (!clean || seen.has(clean)) continue;
    seen.add(clean);
    out.push(clean);
    if (out.length >= MAX_IMAGES) break;
  }
  return out;
}
