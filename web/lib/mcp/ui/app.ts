import { AppResult, type McpResource, type McpTool } from "@/lib/mcp/server";
import { runSearch } from "@/lib/mcp/tools";
import { SITE } from "@/lib/api/records";
import { CARD_URI, cardOf } from "./card";
import { CARD_HTML } from "./html";

// The connector with its card UI switched on: the same tools, with
// search_listings pointed at the card and handing it its own
// structuredContent. lib/mcp/ui/html.ts has the README (how to test it, what
// must happen before it is the default).
//
// Wire shapes, each from claude.com/docs/connectors/building/mcp-apps/:
//   tools/list     search_listings._meta = { ui: { resourceUri }, "ui/resourceUri" }
//                  (quickstart: "the helper also writes the same URI under the
//                  legacy flat key ui/resourceUri"; ext-apps 1.7.5's
//                  registerAppTool writes both)
//   resources/read contents[0] = { uri, mimeType: "text/html;profile=mcp-app",
//                  text, _meta: { ui: { csp: { resourceDomains } } } } — _meta.ui
//                  on the content item, which Claude reads in preference to
//                  the resources/list entry (embedded-sites, "Declare the
//                  origins that a view embeds")
//   tools/call     content = the model's text, unchanged; structuredContent =
//                  the card (quickstart: "The UI reads structuredContent ...
//                  and the content text stays for hosts that don't render UI")

/** MCP Apps' resource MIME type (ext-apps RESOURCE_MIME_TYPE). */
export const MCP_APP_MIME = "text/html;profile=mcp-app";

export const CARD_RESOURCE: McpResource = {
  uri: CARD_URI,
  name: "cars",
  title: "Census EV cars",
  description: "Cars from a listing search, as cards.",
  mimeType: MCP_APP_MIME,
  text: CARD_HTML,
  // The card loads photos from /img/<vin> and nothing else: no fetches, no
  // frames, no fonts (the host font would need https://assets.claude.ai here;
  // the card falls back to the system sans-serif instead).
  _meta: { ui: { csp: { resourceDomains: [SITE] } } },
};

export const CARD_TOOL_META = { ui: { resourceUri: CARD_URI }, "ui/resourceUri": CARD_URI } as const;

/** `tools` with search_listings carrying the card. Every other tool, and the
 *  text every tool returns, is unchanged. */
export function withCards(tools: McpTool[]): McpTool[] {
  return tools.map((t) =>
    t.name !== "search_listings"
      ? t
      : {
          ...t,
          _meta: CARD_TOOL_META,
          handler: async (args) => {
            const { result, search } = await runSearch(args);
            // The whole result, with the card's cars added. Some clients hand
            // the model structuredContent in place of the text (the quickstart
            // names Claude Code), so it must never hold less than the text
            // does: with only the card in it, such a client would have seen
            // eight slim cars where the search returned twenty-five full ones.
            return new AppResult(result, { ...(result as Record<string, unknown>), ...cardOf(search, search.results) });
          },
        },
  );
}
