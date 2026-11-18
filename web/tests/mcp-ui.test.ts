// The connector's in-chat card (MCP Apps, lib/mcp/ui/), driven through the
// real /api/mcp route against fixture artifacts (nothing leaves the process).
//
// First and most important: with the switch off, the published connector
// answers byte for byte as it did before the cards existed. WIRE_SHA256 is
// the sha256 of the whole transcript (status, headers, body) of
// WIRE_REQUESTS, taken from origin/main a42510ddc's route before any of this
// was written, and reproduced by this code. If you change what the published
// connector says on purpose, re-take it and say so in the commit.
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { stubFeed, WIRE_REQUESTS, kia, AS_OF } from "./fixtures/mcp-wire";
import { POST } from "../app/api/mcp/route";
import { POST as POST_UI } from "../app/api/mcp/ui/route";
import { CARD_URI, CARD_MAX, CARD_REF, cardOf, cardCar } from "../lib/mcp/ui/card";
import { CARD_HTML, CARD_OWN_PARTS, inlineClient } from "../lib/mcp/ui/html";
import { MCP_APP_MIME } from "../lib/mcp/ui/app";
import { EXT_APPS_APP_WITH_DEPS, EXT_APPS_SHA256, EXT_APPS_VERSION } from "../lib/mcp/ui/ext-apps-app-with-deps";
import { visitSrc } from "../lib/visit";

// The clock is held a few hours after the fixture's publish time, for every
// test in this file. Without it this file had an expiry date: the fixture's
// as_of is a fixed instant, lib/api/artifacts.ts refuses a manifest older
// than 48 hours, so from 2026-11-19 06:00 UTC the fixture search would have
// answered "inventory data is not available", the pinned transcript hash
// would have stopped matching, and the deploy workflow, which refuses a
// commit whose web tests fail, would have refused every deploy from then on.
// The battery-warranty label in the transcript also depends on today's date.
// Only Date is held; timers run, so timeouts in the code under test still fire.
mock.timers.enable({ apis: ["Date"], now: Date.parse(AS_OF) + 6 * 3_600_000 });

stubFeed();

// Re-taken 2026-11-18 for server 1.3.0, on purpose. What the published
// connector says differently, and nothing else: initialize (version 1.3.0,
// instructions naming compare_listings, last_seen, battery_warranty and
// asking_vs_similar); tools/list (compare_listings added, search_listings'
// and get_listing's descriptions, the detail description without last_seen);
// and compact search records now carry last_seen. The fixture feed has no
// Pro artifact, so no record here carries asking_vs_similar.
// Re-taken 2026-11-18 again for the asking_vs_similar band (lib/listings/
// similarBand.ts). Two messages change and nothing else: initialize's
// instructions (+68 bytes: "listed now or in the last 30 days", "absent when
// a car could not be compared, which includes new cars") and tools/list,
// where search_listings' and get_listing's shared asking_vs_similar sentence
// states the new rule (+532 bytes each). The fixture index carries no band,
// so still no record here carries asking_vs_similar.
const WIRE_SHA256 = "e2c3982836613f65e492141f9069ac13657a8ba92d22cd9aa46b0fb5e2869a0e";

async function transcript(post: (r: Request) => Promise<Response>, url: string): Promise<string[]> {
  const out: string[] = [];
  for (const r of WIRE_REQUESTS) {
    const res = await post(new Request(url, { method: "POST", body: JSON.stringify(r), headers: { "content-type": "application/json" } }));
    out.push(`${res.status} ${[...res.headers].map(([k, v]) => `${k}:${v}`).join("|")}\n${await res.text()}`);
  }
  return out;
}

async function call(post: (r: Request) => Promise<Response>, url: string, method: string, params?: unknown): Promise<Record<string, unknown>> {
  const res = await post(new Request(url, { method: "POST", body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, ...(params ? { params } : {}) }) }));
  return (await res.json()) as Record<string, unknown>;
}

const UI = "https://censusev.com/api/mcp?ui=1";
type Tool = { name: string; _meta?: Record<string, unknown> };

// ------------------------------------------------------------ switch off

test("switch off (?ui=0): /api/mcp answers byte for byte as before the cards", async () => {
  const t = await transcript(POST, "https://censusev.com/api/mcp?ui=0");
  assert.equal(createHash("sha256").update(t.join("\n---\n")).digest("hex"), WIRE_SHA256);
  // And in particular: no resources capability, no _meta on any tool,
  // resources/* unknown, structuredContent is the model's own result.
  const init = await call(POST, "https://censusev.com/api/mcp?ui=0", "initialize", {});
  assert.deepEqual((init.result as { capabilities: unknown }).capabilities, { tools: { listChanged: false } });
  const list = await call(POST, "https://censusev.com/api/mcp?ui=0", "tools/list");
  for (const tool of (list.result as { tools: Tool[] }).tools) assert.equal("_meta" in tool, false, tool.name);
  for (const m of ["resources/list", "resources/read"]) {
    assert.equal(((await call(POST, "https://censusev.com/api/mcp?ui=0", m, { uri: CARD_URI })).error as { code: number }).code, -32601, m);
  }
  // Cards are the default since 2026-11-18: only ui=0 turns them off.
  for (const q of ["", "?ui=1", "?ui=true", "?UI=0", "?ui=0x"]) {
    const l = await call(POST, `https://censusev.com/api/mcp${q}`, "tools/list");
    const search = (l.result as { tools: Tool[] }).tools.find((t) => t.name === "search_listings")!;
    assert.equal("_meta" in search, true, q || "(no query)");
  }
});

// ------------------------------------------------------------ switch on

test("switch on: search_listings points at the card, nothing else changes in tools/list", async () => {
  const off = (await call(POST, "https://censusev.com/api/mcp?ui=0", "tools/list")).result as { tools: Tool[] };
  for (const [post, url] of [[POST, UI], [POST_UI, "https://censusev.com/api/mcp/ui"]] as const) {
    const on = (await call(post, url, "tools/list")).result as { tools: Tool[] };
    assert.deepEqual(on.tools.map((t) => t.name), off.tools.map((t) => t.name));
    for (const [i, t] of on.tools.entries()) {
      if (t.name === "search_listings") {
        assert.deepEqual(t._meta, { ui: { resourceUri: CARD_URI }, "ui/resourceUri": CARD_URI });
        const { _meta, ...rest } = t;
        void _meta;
        assert.deepEqual(rest, off.tools[i]);
      } else {
        assert.deepEqual(t, off.tools[i], t.name);
      }
    }
    const init = (await call(post, url, "initialize", {})).result as { capabilities: unknown };
    assert.deepEqual(init.capabilities, { tools: { listChanged: false }, resources: { listChanged: false } });
  }
});

test("switch on: resources/list and resources/read", async () => {
  const list = (await call(POST, UI, "resources/list")).result as { resources: Record<string, unknown>[] };
  assert.deepEqual(list.resources, [{ uri: CARD_URI, name: "cars", title: "Census EV cars", description: "Cars from a listing search, as cards.", mimeType: "text/html;profile=mcp-app" }]);
  assert.equal(MCP_APP_MIME, "text/html;profile=mcp-app");
  const read = (await call(POST, UI, "resources/read", { uri: CARD_URI })).result as { contents: { uri: string; mimeType: string; text: string; _meta: unknown }[] };
  assert.equal(read.contents.length, 1);
  const c = read.contents[0];
  assert.equal(c.uri, CARD_URI);
  assert.equal(c.mimeType, "text/html;profile=mcp-app");
  assert.equal(c.text, CARD_HTML);
  assert.deepEqual(c._meta, { ui: { csp: { resourceDomains: ["https://censusev.com"] } } }, "one origin, no connect or frame domains");
  const missing = await call(POST, UI, "resources/read", { uri: "ui://censusev/nope" });
  assert.equal((missing.error as { code: number }).code, -32002);
  assert.deepEqual((await call(POST, UI, "resources/templates/list")).result, { resourceTemplates: [] });
});

test("switch on: the model's text is unchanged; structuredContent is the card", async () => {
  const args = { make: "Kia", model: "EV6", limit: 10 };
  const off = (await call(POST, "https://censusev.com/api/mcp?ui=0", "tools/call", { name: "search_listings", arguments: args })).result as {
    content: { text: string }[];
    structuredContent: Record<string, unknown>;
  };
  const on = (await call(POST, UI, "tools/call", { name: "search_listings", arguments: args })).result as {
    content: { type: string; text: string }[];
    structuredContent: { cars: Record<string, unknown>[]; total: number; as_of: string; breakdown: unknown };
    isError: boolean;
  };
  assert.equal(on.isError, false);
  assert.deepEqual(on.content, off.content, "content text byte for byte");
  const sc = on.structuredContent;
  // The model's whole result, plus the card's cars: a client that hands the
  // model structuredContent in place of the text must lose nothing.
  const { cars: _cars, ...rest } = sc as Record<string, unknown>;
  void _cars;
  assert.deepEqual(rest, JSON.parse(off.content[0].text));
  assert.ok(Array.isArray((sc as { cars: unknown[] }).cars));
  assert.equal(sc.total, 30);
  assert.equal(sc.as_of, off.structuredContent.as_of);
  assert.deepEqual(sc.breakdown, off.structuredContent.breakdown);
  assert.equal(sc.cars.length, CARD_MAX, "10 asked for, 8 carded");
  // The cars are the first eight of the page, in its order.
  const offVins = (off.structuredContent.results as { vin: string }[]).slice(0, CARD_MAX).map((r) => r.vin);
  assert.deepEqual(sc.cars.map((c) => c.vin), offVins);
  for (const car of sc.cars) {
    assert.match(String(car.url), new RegExp(`^https://censusev\\.com/listing/[a-z0-9]{17}\\?ref=${CARD_REF}$`));
    assert.equal(visitSrc(new URL(String(car.url)).search), "mcp-card");
    if ("image" in car) assert.equal(car.image, `https://censusev.com/img/${String(car.vin).toLowerCase()}`);
    assert.ok(!JSON.stringify(car).includes("dealer.example"), "no dealer link or photo host in a card");
  }
  // Photo only where the listing has one (fixture: every third car has none).
  const byVin = new Map(sc.cars.map((c) => [String(c.vin), c]));
  for (let i = 0; i < 30; i++) {
    const c = byVin.get(kia(i).vin);
    if (c) assert.equal("image" in c, i % 3 !== 2, kia(i).vin);
  }
  // Whole result far under the ~150,000-character cap; the card itself small.
  assert.ok(JSON.stringify(on).length < 150_000);
  assert.ok(JSON.stringify((sc as { cars: unknown }).cars).length < 12_000);
});

test("switch on: other tools and errors are exactly the published connector's", async () => {
  for (const r of WIRE_REQUESTS) {
    const req = r as { method: string; params?: { name?: string } };
    if (req.method !== "tools/call" || req.params?.name === "search_listings") continue;
    const a = await call(POST, "https://censusev.com/api/mcp?ui=0", "tools/call", req.params);
    const b = await call(POST, UI, "tools/call", req.params);
    assert.deepEqual(b, a, req.params?.name);
  }
  const bad = (await call(POST, UI, "tools/call", { name: "search_listings", arguments: { detail: "everything" } })).result as { isError: boolean; structuredContent?: unknown };
  assert.equal(bad.isError, true);
  assert.equal("structuredContent" in bad, false, "an error has nothing for the card");
});

test("cardCar: labels the estimated figures, drops what is absent, keeps the title bounded", () => {
  const base = kia(1);
  const c = cardCar({ ...base, distance_mi: 12 })!;
  assert.deepEqual(c, {
    vin: base.vin,
    title: "2023 Kia EV6",
    price_usd: 30100,
    mileage: 10001,
    location: { city: "Portland", state: "OR" },
    distance_mi: 12,
    range_mi: 310,
    range_estimated: true,
    battery_kwh: 77,
    image: `https://censusev.com/img/${base.id}`,
    url: `https://censusev.com/listing/${base.id}?ref=mcp-card`,
  });
  const bare = cardCar({ ...base, price_usd: null, mileage: undefined, range: undefined, battery: undefined, image_url: undefined, location: {}, title: "x".repeat(500) })!;
  assert.deepEqual(Object.keys(bare).sort(), ["location", "title", "url", "vin"]);
  assert.equal(bare.title.length, 120);
  const phev = cardCar({ ...base, range: { mi: 32, estimated: false, electric_only: true } })!;
  assert.equal(phev.range_electric_only, true);
  assert.equal("range_estimated" in phev, false);
  assert.equal(cardCar({ ...base, url: "https://dealer.example/vdp/1" }), undefined, "a card never links off-site");
  assert.deepEqual(cardOf({ total: 0, as_of: "x" }, []), { cars: [], total: 0, as_of: "x" });
});

// ------------------------------------------------------------ the document

test("the vendored client is the published ext-apps file, byte for byte", () => {
  assert.equal(EXT_APPS_VERSION, "1.7.5");
  assert.equal(createHash("sha256").update(EXT_APPS_APP_WITH_DEPS, "utf8").digest("hex"), EXT_APPS_SHA256);
  assert.equal(EXT_APPS_SHA256, "5bc0452b9994217df506cb505af20e97e766700513afb7d0b45d255785bb051f");
  assert.throws(() => inlineClient("let a=1;", ["App"]), /export clause/);
  assert.throws(() => inlineClient("export{a as B};", ["App"]), /no export named App/);
  assert.throws(() => inlineClient("'</script>';export{a as App};", ["App"]), /end an inline script/);
  assert.equal(inlineClient("let a=1;export{a as App};", ["App"]), "let a=1;\nconst __censusExtApps={App:a};\n");
});

const URL_RE = /\b(?:https?|wss?):\/\/[^\s"'`)\\]+/gi;

test("the document asks for nothing but censusev.com", () => {
  // Our own markup, style and script: no http:// at all, and the only
  // https:// origin is ours.
  const own = Object.values(CARD_OWN_PARTS).join("\n");
  assert.ok(!/http:\/\//i.test(own));
  for (const u of own.match(URL_RE) ?? []) assert.ok(u.startsWith("https://censusev.com"), u);
  // No markup loads anything by attribute other than what the script sets.
  assert.ok(!/\b(?:src|href|srcset|action|poster)\s*=/i.test(CARD_OWN_PARTS.BODY));
  assert.ok(!/@import|url\(/i.test(CARD_OWN_PARTS.CSS));
  assert.ok(!/<script[^>]+src=|<link\b|<iframe\b/i.test(CARD_HTML));
  // The vendored bundle contains URL strings, none of them a request: JSON
  // Schema dialect identifiers, two IPv6 formatting templates, and a doc
  // example. Pinned, so an upgrade that adds one has to be looked at.
  const vendor = new Set(EXT_APPS_APP_WITH_DEPS.match(URL_RE) ?? []);
  assert.deepEqual([...vendor].sort(), [
    "http://[${n}]",
    "http://[${v.value}]",
    "http://json-schema.org/draft-04/schema#",
    "http://json-schema.org/draft-07/schema#",
    "https://*.example.com",
    "https://json-schema.org/draft/2020-12/schema",
  ]);
  // Every URL in the final document is one of those or ours.
  for (const u of CARD_HTML.match(URL_RE) ?? []) assert.ok(vendor.has(u) || u.startsWith("https://censusev.com"), u);
});

test("the document never writes markup from data", () => {
  for (const sink of ["innerHTML", "outerHTML", "insertAdjacentHTML", "document.write", "createContextualFragment", "DOMParser"]) {
    assert.ok(!CARD_HTML.includes(sink), sink);
  }
  const s = CARD_OWN_PARTS.SCRIPT;
  assert.ok(s.includes("textContent"));
  assert.ok(!/\.src\s*=|\.href\s*=/.test(s), "attributes go through setAttribute after a prefix check");
  assert.ok(s.includes("IMG_PREFIX") && s.includes("PAGE_PREFIX"));
});

test("the document follows the MCP Apps design rules it can be checked for", () => {
  const { CSS, SCRIPT, BODY } = CARD_OWN_PARTS;
  assert.ok(/<meta name="color-scheme" content="light dark">/.test(CARD_HTML));
  assert.ok(/background:transparent/.test(CSS));
  // No hard-coded colour: no hex, rgb() or hsl(); host tokens with system-colour fallbacks.
  assert.ok(!/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i.test(CSS), "no hard-coded colour");
  for (const v of ["--color-text-primary", "--color-background-primary", "--color-background-inverse", "--color-text-inverse", "--color-border-tertiary", "--font-sans", "--border-radius-md"]) assert.ok(CSS.includes(v), v);
  assert.ok(/min-height:44px/.test(CSS), "44px tap target");
  assert.ok(/overflow-y:hidden/.test(CSS) && !/overflow-y:(auto|scroll)/.test(CSS), "no vertical scroll of its own");
  assert.ok(/scroll-padding-inline/.test(CSS) && SCRIPT.includes("safeAreaInsets"));
  assert.ok(!/<select|<details|popover/i.test(CARD_HTML), "no dropdowns or popovers");
  assert.ok(SCRIPT.includes("skeleton()") && SCRIPT.indexOf("app.ontoolresult") < SCRIPT.indexOf("app.connect()"), "skeleton, then handlers, then connect");
  assert.equal((SCRIPT.match(/"View on Census EV"/g) ?? []).length, 1, "one call to action");
  assert.ok(SCRIPT.includes('setAttribute("alt"'));
  assert.ok(BODY.includes('aria-label="Cars"'));
});
