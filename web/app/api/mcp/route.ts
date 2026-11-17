import { options } from "@/lib/api/http";
import { mcpGet, mcpPost, wantsCards } from "@/lib/mcp/endpoint";

// POST /api/mcp — the Model Context Protocol endpoint (Streamable HTTP,
// stateless). An agent host points at this URL and gets five tools:
// search_listings, get_listing, list_models, battery_warranty and
// market_snapshot. See lib/mcp/server.ts for
// the transport and lib/mcp/tools.ts for what the tools promise.
//
// /api/mcp?ui=1 is the same connector with its in-chat card UI on (as is
// /api/mcp/ui); without the query nothing differs from before the cards
// existed. lib/mcp/endpoint.ts holds both servers; lib/mcp/ui/html.ts says
// how to test the cards and what must happen before they are the default.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export const OPTIONS = options;

export function GET(): Response {
  return mcpGet();
}

export async function POST(req: Request): Promise<Response> {
  return mcpPost(req, wantsCards(req));
}
