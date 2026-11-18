// The half of the AI-agent tests that needs Next: see ai-agents.test.ts for why it is a .tsx file.
// lib/aiAgents.ts and proxy.ts's second matcher: which assistant fetched
// which kind of page, and that the proxy is invoked for exactly those.
// First, as Next's own server does: some next/dist modules otherwise build a
// fake AsyncLocalStorage that throws after the test has ended.
import "next/dist/server/node-environment-baseline.js";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { NextRequest } from "next/server";
import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { AI_AGENT_LABELS, AI_AGENT_TOKENS, PAGE_KINDS, aiAgentLabel, onBehalfOfPerson, pageKind } from "../lib/aiAgents";
import { config, proxy } from "../proxy";

// User-agents as the companies publish them.
const REAL: [string, string][] = [
  ["Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; GPTBot/1.1; +https://openai.com/gptbot)", "openai-train"],
  ["Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; OAI-SearchBot/1.0; +https://openai.com/searchbot", "openai-search"],
  ["Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; ChatGPT-User/1.0; +https://openai.com/bot", "chatgpt-user"],
  ["Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; ClaudeBot/1.0; +claudebot@anthropic.com)", "anthropic-crawl"],
  ["Mozilla/5.0 (compatible; Claude-SearchBot/1.0; +https://www.anthropic.com)", "claude-search"],
  ["Mozilla/5.0 (compatible; Claude-User/1.0; +Claude-User@anthropic.com)", "claude-user"],
  ["Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; PerplexityBot/1.0; +https://perplexity.ai/perplexitybot)", "perplexity-crawl"],
  ["Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; Perplexity-User/1.0; +https://perplexity.ai/perplexity-user)", "perplexity-user"],
  ["Mozilla/5.0 (compatible; GoogleOther)", "google-ai"],
  ["Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; Amazonbot/0.1; +https://developer.amazon.com/support/amazonbot) Chrome/119.0.6045.214 Safari/537.36", "amazon"],
  ["meta-externalagent/1.1 (+https://developers.facebook.com/docs/sharing/webmasters/crawler)", "meta-ai"],
  ["meta-externalfetcher/1.1 (+https://developers.facebook.com/docs/sharing/webmasters/crawler)", "meta-user"],
  ["Mozilla/5.0 (Linux; Android 5.0) AppleWebKit/537.36 (KHTML, like Gecko) Mobile Safari/537.36 (compatible; Bytespider; spider-feedback@bytedance.com)", "bytedance"],
  ["CCBot/2.0 (https://commoncrawl.org/faq/)", "commoncrawl"],
  ["Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; MistralAI-User/1.0; +https://docs.mistral.ai/robots)", "mistral-user"],
  ["DuckAssistBot/1.2; (+http://duckduckgo.com/duckassistbot.html)", "duckassist"],
  ["cohere-ai", "cohere"],
];

const NOT_AI = [
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1",
  "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; Googlebot/2.1; +http://www.google.com/bot.html) Chrome/131.0.0.0 Safari/537.36",
  "Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/13.1.1 Safari/605.1.15 (Applebot/0.1; +http://www.apple.com/go/applebot)",
  "curl/8.7.1",
];

const matches = (url: string, ua?: string, cookies?: Record<string, string>) =>
  unstable_doesMiddlewareMatch({ config, url, headers: ua ? { "user-agent": ua } : {}, cookies });

test("the proxy runs for every listed assistant on pages, robots, llms and sitemaps", () => {
  for (const [ua] of REAL) {
    for (const url of ["/", "/listing/5YJ3E1EA5RF824810", "/ev/kia/ev6/near/60614", "/robots.txt", "/llms.txt", "/sitemap/0.xml", "/api/index/0", "/api/mcp"])
      assert.ok(matches(url, ua), `${ua} on ${url}`);
  }
});

test("every token in the module is one the matcher also sees", () => {
  // A token the matcher misses would never reach the proxy to be counted.
  for (const [tok] of AI_AGENT_TOKENS) {
    const real = tok.startsWith("Meta-") ? tok.toLowerCase() : tok;
    assert.ok(matches("/", `Mozilla/5.0 (compatible; ${real}/1.0)`), tok);
  }
});

test("the proxy never runs for people or ordinary crawlers without a session", () => {
  for (const ua of NOT_AI) for (const url of ["/", "/listing/x", "/robots.txt", "/sitemap/0.xml", "/api/index/0"]) assert.ok(!matches(url, ua), `${ua} on ${url}`);
  assert.ok(!matches("/"));
});

test("assets are never counted, whoever asks", () => {
  const ua = REAL[0][0];
  for (const url of [
    "/_next/static/chunks/main.js",
    "/_next/image?url=x",
    "/img/5YJ3E1EA5RF824810",
    "/favicon.ico",
    "/icon.svg",
    "/apple-icon.png",
    "/opengraph-image",
    "/listing/5YJ3E1EA5RF824810/opengraph-image",
    "/fonts/inter.woff2",
  ])
    assert.ok(!matches(url, ua), url);
});

test("the session matcher is unchanged", () => {
  const chrome = NOT_AI[0];
  assert.ok(matches("/", chrome, { vc_rt: "x" }));
  assert.ok(!matches("/sitemap/0.xml", chrome, { vc_rt: "x" }));
  assert.ok(!matches("/api/index/0", chrome, { vc_rt: "x" }));
});

test("for an assistant the proxy passes the request through untouched, and counts after", async () => {
  const waited: Promise<unknown>[] = [];
  const event = { waitUntil: (p: Promise<unknown>) => waited.push(p) } as never;
  const saved = { url: process.env.SUPABASE_URL, key: process.env.SUPABASE_ANON_KEY };
  const calls: { url: string; body: string }[] = [];
  const realFetch = globalThis.fetch;
  process.env.SUPABASE_URL = "https://db.example/";
  process.env.SUPABASE_ANON_KEY = "anon";
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    calls.push({ url: String(url), body: String(init.body) });
    return new Response(null, { status: 204 });
  }) as typeof fetch;
  try {
    // Carrying a session cookie too: the session logic must not run for it.
    const req = new NextRequest("https://censusev.com/listing/5YJ3E1EA5RF824810?zip=60614", {
      headers: { "user-agent": REAL[5][0], cookie: "vc_rt=stale; vc_at=bad" },
    });
    const res = await proxy(req, event);
    const headers = [...res.headers.keys()].sort();
    assert.deepEqual(headers, ["x-middleware-next"]);
    assert.equal(waited.length, 1);
    await Promise.all(waited);
    assert.deepEqual(calls, [
      { url: "https://db.example/rest/v1/rpc/agent_fetch_bump", body: JSON.stringify({ _agent: "claude-user", _kind: "listing" }) },
    ]);
  } finally {
    globalThis.fetch = realFetch;
    process.env.SUPABASE_URL = saved.url;
    process.env.SUPABASE_ANON_KEY = saved.key;
    if (saved.url === undefined) delete process.env.SUPABASE_URL;
    if (saved.key === undefined) delete process.env.SUPABASE_ANON_KEY;
  }
});

test("a failed count never reaches the response", async () => {
  const waited: Promise<unknown>[] = [];
  const event = { waitUntil: (p: Promise<unknown>) => waited.push(p) } as never;
  const realFetch = globalThis.fetch;
  const saved = { url: process.env.SUPABASE_URL, key: process.env.SUPABASE_ANON_KEY };
  process.env.SUPABASE_URL = "https://db.example";
  process.env.SUPABASE_ANON_KEY = "anon";
  globalThis.fetch = (async () => {
    throw new Error("down");
  }) as typeof fetch;
  try {
    const res = await proxy(new NextRequest("https://censusev.com/", { headers: { "user-agent": REAL[0][0] } }), event);
    assert.equal(res.headers.get("x-middleware-next"), "1");
    await assert.doesNotReject(Promise.all(waited));
  } finally {
    globalThis.fetch = realFetch;
    process.env.SUPABASE_URL = saved.url;
    process.env.SUPABASE_ANON_KEY = saved.key;
    if (saved.url === undefined) delete process.env.SUPABASE_URL;
    if (saved.key === undefined) delete process.env.SUPABASE_ANON_KEY;
  }
});
