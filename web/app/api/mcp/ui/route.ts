import { options } from "@/lib/api/http";
import { mcpGet, mcpPost } from "@/lib/mcp/endpoint";

// POST /api/mcp/ui — the connector with its in-chat card UI on, at an address
// of its own. Same server as /api/mcp?ui=1; this form exists because Claude
// ignores the query string when it matches a custom connector's address to a
// directory listing, so "?ui=1" can be taken for the published connector
// (claude.com/docs/connectors/building/mcp-apps/embedded-sites). Test the
// cards here; lib/mcp/ui/html.ts has the README.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export const OPTIONS = options;

export function GET(): Response {
  return mcpGet();
}

export async function POST(req: Request): Promise<Response> {
  return mcpPost(req, true);
}
