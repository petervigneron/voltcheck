// The tests that load Next itself (the proxy's matcher and its pass-through)
// are in ai-agents-proxy.test.tsx. The deploy workflow runs tests/*.test.ts
// with no node_modules installed, so a .test.ts file that imports `next`
// fails there with ERR_MODULE_NOT_FOUND and the deploy is refused: that is
// what happened to b006fc040 on 2026-11-18. The .tsx suffix is this repo's
// existing convention for tests that need the framework.
// lib/aiAgents.ts and proxy.ts's second matcher: which assistant fetched
// which kind of page, and that the proxy is invoked for exactly those.
// First, as Next's own server does: some next/dist modules otherwise build a
// fake AsyncLocalStorage that throws after the test has ended.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { AI_AGENT_LABELS, AI_AGENT_TOKENS, PAGE_KINDS, aiAgentLabel, onBehalfOfPerson, pageKind } from "../lib/aiAgents";

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

test("each published assistant user-agent gets its own label", () => {
  for (const [ua, label] of REAL) assert.equal(aiAgentLabel(ua), label, ua);
});

test("browsers, search crawlers and nothing at all are not AI agents", () => {
  for (const ua of NOT_AI) assert.equal(aiAgentLabel(ua), null, ua);
  assert.equal(aiAgentLabel(""), null);
  assert.equal(aiAgentLabel(null), null);
  assert.equal(aiAgentLabel(undefined), null);
});

test("matching ignores case", () => {
  assert.equal(aiAgentLabel("claudebot/1.0"), "anthropic-crawl");
  assert.equal(aiAgentLabel("Meta-ExternalAgent/1.1"), "meta-ai");
});

test("no token hides inside another, so first-hit order cannot mislabel", () => {
  const toks = AI_AGENT_TOKENS.map(([t]) => t.toLowerCase());
  for (const a of toks) for (const b of toks) if (a !== b) assert.ok(!b.includes(a), `${a} is inside ${b}`);
});

test("fetches made for a person are the -user labels, and only those", () => {
  const people = AI_AGENT_LABELS.filter(onBehalfOfPerson).sort();
  assert.deepEqual(people, ["chatgpt-user", "claude-user", "meta-user", "mistral-user", "perplexity-user"]);
});

test("the migration's allowlists are the module's lists exactly", () => {
  const sql = readFileSync(new URL("../../supabase/migrations/0127_agent_fetches.sql", import.meta.url), "utf8");
  const list = (name: string) => {
    const m = new RegExp(`${name}\\s+constant\\s+text\\[\\]\\s*:=\\s*array\\[([^\\]]*)\\]`, "i").exec(sql);
    assert.ok(m, `${name} not found in 0127`);
    return [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]).sort();
  };
  assert.deepEqual(list("agents"), [...AI_AGENT_LABELS].sort());
  assert.deepEqual(list("kinds"), [...PAGE_KINDS].sort());
});

test("a page folds to its family, never to its path", () => {
  const cases: [string, string][] = [
    ["/", "home"],
    ["/listing/5YJ3E1EA5RF824810", "listing"],
    ["/ev", "model"],
    ["/ev/kia/ev6", "model"],
    ["/ev/kia/ev6/", "model"],
    ["/ev/kia/ev6/specs", "model"],
    ["/ev/kia/ev6/near", "near"],
    ["/ev/kia/ev6/near/60614", "near"],
    ["/EV/Kia/EV6/Near/60614", "near"],
    ["/ev/kia/nearby", "model"],
    ["/facts", "facts"],
    ["/facts/tesla/model-3/battery", "facts"],
    ["/warranty", "warranty"],
    ["/market", "market"],
    ["/market/2026-10", "market"],
    ["/api/v1/listings", "api"],
    ["/api/index/0", "api"],
    ["/api/mcp", "mcp"],
    ["/api/mcp/ui", "mcp"],
    ["/api/mcpx", "api"],
    ["/mcp", "mcp"],
    ["/llms.txt", "llms"],
    ["/llms-full.txt", "llms"],
    ["/sitemap.xml", "sitemap"],
    ["/sitemap/3.xml", "sitemap"],
    ["/sitemap/facts.xml", "sitemap"],
    ["/robots.txt", "robots"],
    ["/about", "other"],
    ["/vin/5YJ3E1EA5RF824810", "other"],
    ["/worth", "other"],
  ];
  for (const [path, kind] of cases) assert.equal(pageKind(path), kind, path);
  for (const [path] of cases) assert.ok((PAGE_KINDS as readonly string[]).includes(pageKind(path)));
});
