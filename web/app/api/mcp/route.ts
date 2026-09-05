import { CORS, json, options } from "@/lib/api/http";
import { createMcpServer } from "@/lib/mcp/server";
import { INSTRUCTIONS, TOOLS } from "@/lib/mcp/tools";

// POST /api/mcp — the Model Context Protocol endpoint (Streamable HTTP,
// stateless). An agent host points at this URL and gets three tools:
// search_listings, get_listing, list_models. See lib/mcp/server.ts for
// the transport and lib/mcp/tools.ts for what the tools promise.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const server = createMcpServer({ name: "voltcheck", version: "1.0.0", instructions: INSTRUCTIONS, tools: TOOLS });

export const OPTIONS = options;

/** No server-initiated stream: a GET is answered 405, as the transport
 *  allows a server that has nothing to push. */
export function GET(): Response {
  return new Response(null, { status: 405, headers: { ...CORS, allow: "POST, OPTIONS" } });
}

export async function POST(req: Request): Promise<Response> {
  let body: unknown;
  try {
    const raw = await req.text();
    if (raw.length > 65536) return json({ jsonrpc: "2.0", id: null, error: { code: -32600, message: "request too large" } }, { status: 413 });
    body = JSON.parse(raw);
  } catch {
    return json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "parse error" } }, { status: 400 });
  }
  const res = await server.handle(body);
  if (res.status === 202) return new Response(null, { status: 202, headers: CORS });
  return json(res.body, { status: res.status });
}
