// Which AI assistant fetched a page, and what kind of page it was.
//
// Every other automated visit is discarded (lib/visit.ts automatedAgent), and
// crawlers never run the client beacon anyway, so the site could not say
// whether any assistant reads it. proxy.ts runs for requests whose
// user-agent names one of the families below (its second matcher), counts
// the fetch by label and page kind (migration 0127, agent_fetches), and
// passes the request through untouched.
//
// Nothing about the request is kept beyond the two labels: no path, VIN, ZIP,
// IP or user-agent string. Both lists are closed, and 0127's
// agent_fetch_bump() holds the same two lists and refuses anything else, so
// a label added here must be added there in the next migration.
//
// The "-user" labels are fetches an assistant made because a person asked it
// something in that moment. The rest are crawlers filling an index or a
// training set. The weekly report (scraper/visit-report.mjs) lists them apart.
//
// KEEP IN STEP with the `user-agent` regex in proxy.ts's matcher: the proxy
// is not invoked at all for a user-agent that regex misses, whatever this
// table says. tests/ai-agents.test.ts checks every token here against it.

/** [token as it appears in the user-agent, label]. Matched case-insensitively,
 *  first hit wins; no token is a substring of another. */
export const AI_AGENT_TOKENS: readonly (readonly [string, string])[] = [
  ["GPTBot", "openai-train"],
  ["OAI-SearchBot", "openai-search"],
  ["ChatGPT-User", "chatgpt-user"],
  ["ClaudeBot", "anthropic-crawl"],
  ["Claude-SearchBot", "claude-search"],
  ["Claude-User", "claude-user"],
  ["PerplexityBot", "perplexity-crawl"],
  ["Perplexity-User", "perplexity-user"],
  // Google-Extended and Applebot-Extended are robots.txt product tokens; both
  // companies document that they never send them as a user-agent (Google
  // crawls as Googlebot, Apple as Applebot). Listed so a change of practice
  // is counted, not because they are expected to match.
  ["Google-Extended", "google-ai"],
  ["GoogleOther", "google-ai"],
  ["Applebot-Extended", "apple-ai"],
  ["Amazonbot", "amazon"],
  ["Meta-ExternalAgent", "meta-ai"],
  // Meta documents meta-externalfetcher as user-initiated fetches of single
  // links, so it is a "-user" label, apart from Meta's crawler.
  ["Meta-ExternalFetcher", "meta-user"],
  ["Bytespider", "bytedance"],
  ["CCBot", "commoncrawl"],
  ["MistralAI-User", "mistral-user"],
  ["DuckAssistBot", "duckassist"],
  ["cohere-ai", "cohere"],
];

export const AI_AGENT_LABELS: readonly string[] = [...new Set(AI_AGENT_TOKENS.map(([, l]) => l))];

const LOWER = AI_AGENT_TOKENS.map(([t, l]) => [t.toLowerCase(), l] as const);

/** The label for a known AI agent's user-agent, or null for anything else. */
export function aiAgentLabel(userAgent: string | null | undefined): string | null {
  if (!userAgent) return null;
  const ua = userAgent.toLowerCase();
  for (const [t, l] of LOWER) if (ua.includes(t)) return l;
  return null;
}

/** A fetch made for a person in that moment, rather than by a crawler. */
export const onBehalfOfPerson = (label: string) => label.endsWith("-user");

export const PAGE_KINDS = [
  "home",
  "listing",
  "model",
  "near",
  "facts",
  "warranty",
  "market",
  "api",
  "mcp",
  "llms",
  "sitemap",
  "robots",
  "other",
] as const;
export type PageKind = (typeof PAGE_KINDS)[number];

/** The page family a path belongs to. Never the path itself. */
export function pageKind(pathname: string): PageKind {
  const p = (pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname).toLowerCase();
  if (p === "/" || p === "") return "home";
  const seg = p.split("/")[1];
  switch (seg) {
    case "listing":
      return "listing";
    case "ev":
      return /^\/ev\/[^/]+\/[^/]+\/near(?:\/|$)/.test(p) ? "near" : "model";
    case "facts":
      return "facts";
    case "warranty":
      return "warranty";
    case "market":
      return "market";
    case "mcp":
      return "mcp";
    case "api":
      return p === "/api/mcp" || p.startsWith("/api/mcp/") ? "mcp" : "api";
    case "robots.txt":
      return "robots";
    case "sitemap":
    case "sitemap.xml":
      return "sitemap";
  }
  if (/^llms(?:-full)?\.txt$/.test(seg)) return "llms";
  return "other";
}
