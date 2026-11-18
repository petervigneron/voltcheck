import { isPlaceholderImage } from "@/lib/listings/placeholderImage";

// /img/<vin>: a car's photo, served from censusev.com. The decisions live
// here, pure or with fetch injected, so every branch is tested
// (tests/img.test.ts); app/img/[vin]/route.ts does the lookup and the I/O.
//
// Why it exists. The connector's in-chat cards (lib/mcp/ui/) run in a
// sandboxed frame that may load images only from origins the resource
// declares, and the photos live on hundreds of dealer CDNs that cannot each
// be declared. So the card asks for https://censusev.com/img/<vin>, the one
// origin it declares, and this fetches the dealer's photo for that car.
//
// NOT AN OPEN PROXY. The upstream URL is never read from the request: it is
// the image URL stored on the live listing for that VIN, and nothing else.
// Even so the stored URL came from a crawl of someone else's page, so every
// hop is checked as if it were hostile (upstreamUrl): https on 443 only, no
// credentials, no IP literal, no localhost, no .local/.internal name, at
// most MAX_REDIRECTS redirects each re-checked, and the body is accepted
// only when it says it is a raster image and stays under MAX_BYTES.
//
// What it does not stop: a public hostname whose DNS answers with a private
// address. Checking that would need a resolve here and a fetch that pins the
// address it resolved, which fetch() does not offer; on Vercel's functions a
// private address reaches nothing of ours, and the only names that get here
// are the ones our crawls stored.
//
// COST. This route's cost is egress: each miss moves one photo (at most
// MAX_BYTES) from the dealer to us and from us to the viewer. The response
// is cacheable on Vercel's CDN for a day (IMG_CACHE), so a card shown to many
// people costs one function call per photo per day, and the size cap bounds
// the worst case of each. There is deliberately no resizing: no dependency,
// no CPU, and dealer photos are already web-sized.

/** Hops after the first request. */
export const MAX_REDIRECTS = 3;
/** Largest photo passed through, in bytes. */
export const MAX_BYTES = 2 * 1024 * 1024;
/** Whole upstream exchange, redirects included. */
export const UPSTREAM_MS = 6000;

/** Raster types only. SVG is refused: it is a document that can carry
 *  script, and a photo is never one. */
export const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/avif", "image/gif"]);

export const IMG_CACHE = "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800";

/** Headers on every photo this answers with. The CSP and nosniff make the
 *  bytes inert if a dealer's server lies about what they are; CORP lets the
 *  card's frame, on another origin, show them. */
export const IMG_HEADERS: Record<string, string> = {
  "cache-control": IMG_CACHE,
  "x-content-type-options": "nosniff",
  "x-robots-tag": "noindex",
  "content-security-policy": "default-src 'none'",
  "cross-origin-resource-policy": "cross-origin",
};

/** A 404 says nothing about why. Cached briefly, so a card shown many times
 *  with a photo-less car does not reach the database each time, but not so
 *  long that a lookup that merely timed out hides a photo for the day. */
export const MISS_HEADERS: Record<string, string> = {
  "cache-control": "public, max-age=60, s-maxage=600",
  "x-content-type-options": "nosniff",
  "x-robots-tag": "noindex",
  "content-security-policy": "default-src 'none'",
};

const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;

/** A URL this may fetch, parsed; undefined when any rule refuses it. */
export function upstreamUrl(raw: string | undefined, base?: string): URL | undefined {
  if (!raw) return undefined;
  let u: URL;
  try {
    u = base === undefined ? new URL(raw) : new URL(raw, base);
  } catch {
    return undefined;
  }
  if (u.protocol !== "https:") return undefined;
  // URL keeps "" for the scheme's default port, so anything else is not 443.
  if (u.port !== "") return undefined;
  if (u.username || u.password) return undefined;
  // WHATWG URL has already normalised the host: lower case, IPv6 in
  // brackets, and "2130706433" / "0x7f.1" rewritten to dotted IPv4.
  const host = u.hostname.replace(/\.$/, "");
  if (!host || !host.includes(".")) return undefined;
  if (host.startsWith("[") || host.includes(":") || IPV4.test(host)) return undefined;
  if (host === "localhost" || host.endsWith(".localhost")) return undefined;
  if (host.endsWith(".local") || host.endsWith(".internal")) return undefined;
  return u;
}

/** The image type to answer with, or undefined when the response is not a
 *  raster image this passes through, or says it is larger than the cap. */
export function acceptedType(contentType: string | null, contentLength: string | null): string | undefined {
  const t = (contentType ?? "").split(";")[0].trim().toLowerCase();
  const type = t === "image/jpg" || t === "image/pjpeg" ? "image/jpeg" : t;
  if (!IMAGE_TYPES.has(type)) return undefined;
  if (contentLength !== null && contentLength.trim() !== "") {
    const n = Number(contentLength);
    if (!Number.isFinite(n) || n < 0 || n > MAX_BYTES) return undefined;
  }
  return type;
}

/** The whole body, or undefined as soon as it passes `cap` bytes (the
 *  stream is cancelled there, not read to the end). */
export async function readCapped(body: ReadableStream<Uint8Array> | null, cap = MAX_BYTES): Promise<Uint8Array | undefined> {
  if (!body) return undefined;
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let n = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      n += value.byteLength;
      if (n > cap) {
        await reader.cancel().catch(() => {});
        return undefined;
      }
      chunks.push(value);
    }
  } catch {
    return undefined;
  }
  if (n === 0) return undefined;
  const out = new Uint8Array(n);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.byteLength;
  }
  return out;
}

export type Fetched = { ok: true; type: string; bytes: Uint8Array } | { ok: false };

/**
 * Fetch a stored photo URL under every rule above. `fetchImpl` is fetch in
 * production and a stub in the tests. Sends nothing of the viewer's: no
 * cookies, no client headers, no Referer, one plain Accept.
 */
export async function fetchImage(raw: string | undefined, fetchImpl: typeof fetch = fetch, timeoutMs = UPSTREAM_MS): Promise<Fetched> {
  let url = upstreamUrl(raw);
  if (!url) return { ok: false };
  const signal = AbortSignal.timeout(timeoutMs);
  const seen = new Set<string>();
  try {
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      if (seen.has(url.href)) return { ok: false };
      // A seller's "no photo yet" stand-in (lib/listings/placeholderImage.ts)
      // is not this car, stored or reached by redirect: the card shows its
      // plain block instead, as for a car with no photo at all.
      if (isPlaceholderImage(url.href)) return { ok: false };
      seen.add(url.href);
      const res = await fetchImpl(url.href, {
        method: "GET",
        redirect: "manual",
        headers: { accept: "image/*" },
        credentials: "omit",
        referrerPolicy: "no-referrer",
        cache: "no-store",
        signal,
      });
      if (res.status >= 300 && res.status < 400) {
        await res.body?.cancel().catch(() => {});
        const next = upstreamUrl(res.headers.get("location") ?? undefined, url.href);
        if (!next) return { ok: false };
        url = next;
        continue;
      }
      if (res.status !== 200) {
        await res.body?.cancel().catch(() => {});
        return { ok: false };
      }
      const type = acceptedType(res.headers.get("content-type"), res.headers.get("content-length"));
      if (!type) {
        await res.body?.cancel().catch(() => {});
        return { ok: false };
      }
      const bytes = await readCapped(res.body);
      return bytes ? { ok: true, type, bytes } : { ok: false };
    }
    return { ok: false };
  } catch {
    return { ok: false };
  }
}
