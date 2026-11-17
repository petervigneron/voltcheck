import { CORS, json } from "@/lib/api/http";
import { createMcpServer } from "@/lib/mcp/server";
import { INSTRUCTIONS, TOOLS } from "@/lib/mcp/tools";

// The two connector servers and the POST both routes share. `plain` is the
// published connector, exactly as it has always been. `cards` adds the
// in-chat card UI (lib/mcp/ui/; its README is in html.ts) and is reached only
// at /api/mcp/ui or /api/mcp?ui=1 until it has been tested in Claude.
//
// `cards` is imported on its first request, not with this module: the card
// document is assembled at its module's load, and nothing that module does
// (or fails to do) can reach the published connector's requests.

const INFO = { name: "census", title: "Census EV", version: "1.2.0", instructions: INSTRUCTIONS } as const;

export const PLAIN_SERVER = createMcpServer({ ...INFO, tools: TOOLS });

let cardsServer: Promise<ReturnType<typeof createMcpServer>> | undefined;
export function cardsMcpServer(): Promise<ReturnType<typeof createMcpServer>> {
  cardsServer ??= import("@/lib/mcp/ui/app").then(({ CARD_RESOURCE, withCards }) =>
    createMcpServer({ ...INFO, tools: withCards(TOOLS), resources: [CARD_RESOURCE] }),
  );
  // A failed import is not cached: the next request tries again.
  cardsServer.catch(() => {
    cardsServer = undefined;
  });
  return cardsServer;
}

/** The card UI is on for this request: /api/mcp?ui=1 exactly. */
export function wantsCards(req: Request): boolean {
  return new URL(req.url).searchParams.get("ui") === "1";
}

export async function mcpPost(req: Request, cards: boolean): Promise<Response> {
  let body: unknown;
  try {
    const raw = await req.text();
    if (raw.length > 65536) return json({ jsonrpc: "2.0", id: null, error: { code: -32600, message: "request too large" } }, { status: 413 });
    body = JSON.parse(raw);
  } catch {
    return json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "parse error" } }, { status: 400 });
  }
  const res = await (cards ? await cardsMcpServer() : PLAIN_SERVER).handle(body);
  if (res.status === 202) return new Response(null, { status: 202, headers: CORS });
  return json(res.body, { status: res.status });
}

/** No server-initiated stream: a GET is answered 405, as the transport
 *  allows a server that has nothing to push. */
export function mcpGet(): Response {
  return new Response(null, { status: 405, headers: { ...CORS, allow: "POST, OPTIONS" } });
}
