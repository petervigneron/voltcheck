// lib/img.ts: /img/<vin>'s checks. The upstream URL comes from a stored
// listing, but it was crawled from someone else's page, so every hop is
// treated as hostile: these are the refusals, then the one good path.
import { test } from "node:test";
import assert from "node:assert/strict";
import { upstreamUrl, acceptedType, readCapped, fetchImage, MAX_BYTES, MAX_REDIRECTS, IMG_HEADERS, MISS_HEADERS } from "../lib/img";

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);

function stream(chunks: Uint8Array[]): ReadableStream<Uint8Array> {
  let i = 0;
  return new ReadableStream({
    pull(c) {
      if (i < chunks.length) c.enqueue(chunks[i++]);
      else c.close();
    },
  });
}

type Reply = { status: number; headers?: Record<string, string>; body?: Uint8Array[] };
/** A fetch that answers by URL and records what it was asked. */
function fakeFetch(routes: Record<string, Reply>) {
  const calls: { url: string; init: RequestInit }[] = [];
  const f = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init: init ?? {} });
    const r = routes[url];
    if (!r) return new Response(null, { status: 404 });
    return new Response(r.body ? stream(r.body) : null, { status: r.status, headers: r.headers });
  }) as typeof fetch;
  return { f, calls };
}

test("upstreamUrl: https on 443 to a public name, nothing else", () => {
  assert.equal(upstreamUrl("https://images.dealer.example/a.jpg")?.href, "https://images.dealer.example/a.jpg");
  assert.equal(upstreamUrl("https://images.dealer.example:443/a.jpg")?.href, "https://images.dealer.example/a.jpg", "explicit 443 is the default port");
  for (const bad of [
    "http://images.dealer.example/a.jpg", // not https
    "ftp://images.dealer.example/a.jpg",
    "data:image/png;base64,AAAA",
    "https://images.dealer.example:8443/a.jpg", // non-443
    "https://user:pw@images.dealer.example/a.jpg", // credentials
    "https://127.0.0.1/a.jpg", // IP literals, every spelling
    "https://10.0.0.5/a.jpg",
    "https://169.254.169.254/latest/meta-data",
    "https://2130706433/a.jpg",
    "https://0x7f.1/a.jpg",
    "https://[::1]/a.jpg",
    "https://[fd00::1]/a.jpg",
    "https://localhost/a.jpg", // local names
    "https://LOCALHOST./a.jpg",
    "https://app.localhost/a.jpg",
    "https://printer.local/a.jpg",
    "https://db.internal/a.jpg",
    "https://metadata/a.jpg", // a single label
    "not a url",
    "",
    undefined,
  ]) {
    assert.equal(upstreamUrl(bad), undefined, String(bad));
  }
});

test("acceptedType: raster images only, SVG refused, a stated length over the cap refused", () => {
  assert.equal(acceptedType("image/jpeg", "1000"), "image/jpeg");
  assert.equal(acceptedType("IMAGE/JPG; charset=binary", null), "image/jpeg");
  for (const t of ["image/png", "image/webp", "image/avif", "image/gif"]) assert.equal(acceptedType(t, null), t);
  assert.equal(acceptedType("image/svg+xml", "100"), undefined);
  assert.equal(acceptedType("text/html", "100"), undefined);
  assert.equal(acceptedType("application/octet-stream", "100"), undefined);
  assert.equal(acceptedType(null, "100"), undefined);
  assert.equal(acceptedType("image/jpeg", String(MAX_BYTES + 1)), undefined);
  assert.equal(acceptedType("image/jpeg", String(MAX_BYTES)), "image/jpeg");
  assert.equal(acceptedType("image/jpeg", "lots"), undefined);
});

test("readCapped stops at the cap even when no length was stated", async () => {
  const big = new Uint8Array(64 * 1024);
  assert.equal(await readCapped(stream(Array.from({ length: 40 }, () => big))), undefined, "2.5 MB streamed is refused");
  const ok = await readCapped(stream([JPEG, JPEG]));
  assert.equal(ok?.byteLength, JPEG.byteLength * 2);
  assert.equal(await readCapped(stream([])), undefined, "an empty body is not a photo");
  assert.equal(await readCapped(null), undefined);
});

test("fetchImage: a good image comes back with its type; nothing of the viewer's is sent", async () => {
  const { f, calls } = fakeFetch({ "https://img.dealer.example/1.jpg": { status: 200, headers: { "content-type": "image/jpeg" }, body: [JPEG] } });
  const r = await fetchImage("https://img.dealer.example/1.jpg", f);
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(r.type, "image/jpeg");
    assert.deepEqual([...r.bytes], [...JPEG]);
  }
  assert.equal(calls.length, 1);
  const init = calls[0].init;
  assert.equal(init.redirect, "manual", "redirects are followed by hand, each hop re-checked");
  assert.deepEqual(init.headers, { accept: "image/*" });
  assert.equal(init.credentials, "omit");
  assert.equal(init.referrerPolicy, "no-referrer");
});

test("fetchImage: redirects are re-checked, capped and loop-proof", async () => {
  const img = { status: 200, headers: { "content-type": "image/webp" }, body: [JPEG] };
  // A relative redirect on the same host, then a good image.
  let r = await fetchImage("https://a.example/x", fakeFetch({ "https://a.example/x": { status: 302, headers: { location: "/y.webp" } }, "https://a.example/y.webp": img }).f);
  assert.equal(r.ok, true);
  // A redirect to an IP literal, to http, to localhost: refused at that hop.
  for (const to of ["https://127.0.0.1/y.webp", "http://a.example/y.webp", "https://localhost/y.webp", "https://a.example:8080/y.webp"]) {
    const { f, calls } = fakeFetch({ "https://a.example/x": { status: 301, headers: { location: to } }, [to]: img });
    r = await fetchImage("https://a.example/x", f);
    assert.equal(r.ok, false, to);
    assert.equal(calls.length, 1, `${to} was never requested`);
  }
  // A loop.
  r = await fetchImage("https://a.example/x", fakeFetch({ "https://a.example/x": { status: 302, headers: { location: "https://b.example/x" } }, "https://b.example/x": { status: 302, headers: { location: "https://a.example/x" } } }).f);
  assert.equal(r.ok, false);
  // Exactly MAX_REDIRECTS hops is fine; one more is not.
  const chain = (n: number) => {
    const routes: Record<string, Reply> = {};
    for (let i = 0; i < n; i++) routes[`https://a.example/${i}`] = { status: 302, headers: { location: `https://a.example/${i + 1}` } };
    routes[`https://a.example/${n}`] = img;
    return routes;
  };
  assert.equal((await fetchImage("https://a.example/0", fakeFetch(chain(MAX_REDIRECTS)).f)).ok, true);
  assert.equal((await fetchImage("https://a.example/0", fakeFetch(chain(MAX_REDIRECTS + 1)).f)).ok, false);
  // A redirect with no location.
  assert.equal((await fetchImage("https://a.example/x", fakeFetch({ "https://a.example/x": { status: 302 } }).f)).ok, false);
});

test("fetchImage: wrong type, SVG, oversize, error status, a throwing fetch and a bad stored URL all fail closed", async () => {
  const one = (reply: Reply) => fakeFetch({ "https://a.example/p": reply }).f;
  assert.equal((await fetchImage("https://a.example/p", one({ status: 200, headers: { "content-type": "text/html" }, body: [JPEG] }))).ok, false);
  assert.equal((await fetchImage("https://a.example/p", one({ status: 200, headers: { "content-type": "image/svg+xml" }, body: [JPEG] }))).ok, false);
  assert.equal((await fetchImage("https://a.example/p", one({ status: 200, headers: { "content-type": "image/png", "content-length": String(3 * 1024 * 1024) }, body: [JPEG] }))).ok, false);
  const big = new Uint8Array(512 * 1024);
  assert.equal((await fetchImage("https://a.example/p", one({ status: 200, headers: { "content-type": "image/png" }, body: [big, big, big, big, big] }))).ok, false, "a lying or absent length is caught while reading");
  assert.equal((await fetchImage("https://a.example/p", one({ status: 500, headers: { "content-type": "image/png" }, body: [JPEG] }))).ok, false);
  assert.equal((await fetchImage("https://a.example/p", (async () => { throw new Error("boom"); }) as typeof fetch)).ok, false);
  const { f, calls } = fakeFetch({});
  assert.equal((await fetchImage("http://a.example/p", f)).ok, false);
  assert.equal((await fetchImage(undefined, f)).ok, false);
  assert.equal(calls.length, 0, "a stored URL that fails the rules is never requested");
});

test("headers: CDN-cacheable, inert, framable cross-origin; a miss says nothing", () => {
  assert.equal(IMG_HEADERS["cache-control"], "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800");
  assert.equal(IMG_HEADERS["x-content-type-options"], "nosniff");
  assert.equal(IMG_HEADERS["content-security-policy"], "default-src 'none'");
  assert.equal(IMG_HEADERS["cross-origin-resource-policy"], "cross-origin");
  assert.equal(IMG_HEADERS["x-robots-tag"], "noindex");
  assert.equal("set-cookie" in IMG_HEADERS, false);
  assert.equal(MISS_HEADERS["x-robots-tag"], "noindex");
});

// 2026-11-18: a seller's "no photo yet" stand-in is not the car; the card
// shows its plain block instead (lib/listings/placeholderImage.ts).
test("fetchImage: a placeholder is refused, stored or reached by redirect, and is never fetched", async () => {
  const png = { status: 200, headers: { "content-type": "image/png" }, body: [new Uint8Array([1, 2, 3])] };
  const direct = fakeFetch({ "https://images.dealer.com/unavailable_stockphoto.png": png });
  assert.deepEqual(await fetchImage("https://images.dealer.com/unavailable_stockphoto.png", direct.f), { ok: false });
  assert.equal(direct.calls.length, 0);
  const hop = fakeFetch({
    "https://photos.dealer.example/123.jpg": { status: 302, headers: { location: "https://images.dealersync.com/1/Photos/comingsoon/a.jpg" } },
    "https://images.dealersync.com/1/Photos/comingsoon/a.jpg": png,
  });
  assert.deepEqual(await fetchImage("https://photos.dealer.example/123.jpg", hop.f), { ok: false });
  assert.equal(hop.calls.length, 1);
});
