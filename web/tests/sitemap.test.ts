// From web/:
//   node --experimental-strip-types --import ./scripts/ts-resolve-hook.mjs \
//        --test tests/sitemap.test.ts
//
// The sitemap stopped being a build artifact on 2026-08-22 (see
// lib/sitemap.ts for why: four production builds in a row died prerendering
// it against a database that was returning PostgREST 500s). Rendering the
// shards on first request instead means they can now be built from six
// independently-timed reads — which is exactly the arrangement that made the
// browse index lose 7,300 cars the first time it shipped, because shard
// membership was positional. These tests pin the property that replaced it:
// a car's shard is a function of the car, so a mixed-vintage set of shards
// can be stale but can never double or drop a URL.
import test from "node:test";
import assert from "node:assert/strict";
import {
  BASE,
  SITEMAP_SHARDS,
  renderSitemapIndex,
  renderUrlset,
  shardUrls,
  sitemapShardOf,
} from "../lib/sitemap";

// VIN-shaped ids, the same 17 lowercase characters a real listing id is.
// The last 9 characters are the row's index in base 36, so the set is unique
// by construction — a generator that can collide would fail the partition
// test below for its own reasons and prove nothing about the sharding.
function fakeIds(n: number): string[] {
  const alphabet = "0123456789abcdefghjklmnprstuvwxyz";
  return Array.from({ length: n }, (_, i) => {
    let scramble = "";
    let x = (i + 1) * 2654435761;
    for (let c = 0; c < 8; c++) {
      x = Math.imul(x ^ (x >>> 13), 1274126177);
      scramble += alphabet[(x >>> 7) % alphabet.length];
    }
    return scramble + i.toString(36).padStart(9, "0");
  });
}

test("every car lands in exactly one shard, and always the same one", () => {
  const ids = fakeIds(50_000);
  for (const id of ids) {
    const n = sitemapShardOf(id);
    assert.ok(Number.isInteger(n) && n >= 0 && n < SITEMAP_SHARDS, `${id} -> ${n} is not a shard`);
    assert.equal(sitemapShardOf(id), n, "shard membership must be stable for the same id");
  }
});

test("splitting a feed across the shards neither drops nor duplicates a URL", () => {
  // The failure this replaces: positional slicing over a feed whose order is
  // the completion order of a parallel walk. Two shards rendered from feeds
  // one insertion apart put the same car in both, or in neither.
  const feed = fakeIds(100_297); // production's live count on 2026-08-22
  const seen = new Set<string>();
  for (let n = 0; n < SITEMAP_SHARDS; n++) {
    for (const id of feed.filter((i) => sitemapShardOf(i) === n)) {
      assert.ok(!seen.has(id), `${id} appeared in more than one shard`);
      seen.add(id);
    }
  }
  assert.equal(seen.size, feed.length, "every car must appear in exactly one shard");
});

test("shards stay far enough under the 50,000-URL cap to be worth the split", () => {
  // Six shards is a judgement about headroom, not an arbitrary number: at
  // production's 100,297 cars each shard should sit near a sixth of that,
  // two thirds under the sitemaps.org cap. A hash that clumped would quietly
  // undo that, so measure it rather than assume it.
  const feed = fakeIds(100_297);
  const counts = Array.from({ length: SITEMAP_SHARDS }, () => 0);
  for (const id of feed) counts[sitemapShardOf(id)]++;
  const even = feed.length / SITEMAP_SHARDS;
  for (const [n, c] of counts.entries()) {
    assert.ok(Math.abs(c - even) / even < 0.05, `shard ${n} holds ${c} of an even ${Math.round(even)} — the hash is clumping`);
    assert.ok(c < 50_000, `shard ${n} holds ${c} URLs, over the sitemaps.org cap`);
  }
});

test("the serializer escapes XML rather than truncating a file at the first stray character", () => {
  const xml = renderUrlset(
    [{ url: `${BASE}/listing/a&b<c>"d'e`, lastModified: new Date("2026-08-21T00:00:00.000Z"), priority: 0.7 }],
    "test"
  );
  assert.ok(xml.includes("&amp;") && xml.includes("&lt;") && xml.includes("&gt;"), "reserved characters must be escaped");
  // Strip every legitimate entity; anything left holding an "&" is a raw one,
  // which is what makes a parser stop reading the file.
  assert.ok(
    !xml.replace(/&(amp|lt|gt|quot|apos);/g, "").includes("&"),
    "no raw ampersand may survive into the XML"
  );
  assert.ok(xml.includes("<lastmod>2026-08-21T00:00:00.000Z</lastmod>"));
  assert.ok(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?><urlset'));
  assert.ok(xml.endsWith("</urlset>"));
});

test("an unparseable date is dropped, not printed as Invalid Date", () => {
  // A listing whose listed_on is junk should cost its own lastmod hint and
  // nothing else. `new Date("not a date")` is what reaches this.
  const xml = renderUrlset([{ url: `${BASE}/listing/x`, lastModified: new Date("not a date") }], "test");
  assert.ok(!xml.includes("lastmod"), "a bad date must produce no lastmod at all");
  assert.ok(xml.includes(`<loc>${BASE}/listing/x</loc>`), "the URL itself must still be published");
});

test("the index lists every shard robots.txt does, and nothing else", () => {
  const urls = shardUrls();
  assert.equal(urls.length, SITEMAP_SHARDS);
  const index = renderSitemapIndex(urls);
  for (const u of urls) assert.ok(index.includes(`<loc>${u}</loc>`), `${u} missing from the sitemap index`);
  assert.equal((index.match(/<sitemap>/g) ?? []).length, SITEMAP_SHARDS);
  assert.ok(index.startsWith('<?xml version="1.0" encoding="UTF-8"?><sitemapindex'));
});
