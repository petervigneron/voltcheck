// Response helpers shared by the /api/v1 routes and /api/mcp. Every body is
// JSON, every response is CORS-open (public read data, same as /api/index),
// and cacheable responses carry an s-maxage so the CDN — not the function —
// answers repeats of the same query.

export const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers": "content-type, accept, mcp-protocol-version, mcp-session-id",
  "access-control-expose-headers": "x-as-of, mcp-session-id",
};

export function json(body: unknown, { status = 200, maxAge = 0, asOf }: { status?: number; maxAge?: number; asOf?: string } = {}): Response {
  const headers: Record<string, string> = { "content-type": "application/json; charset=utf-8", ...CORS };
  headers["cache-control"] = maxAge > 0 ? `public, s-maxage=${maxAge}, stale-while-revalidate=86400` : "no-store";
  if (asOf) headers["x-as-of"] = asOf;
  return new Response(JSON.stringify(body), { status, headers });
}

export function options(): Response {
  return new Response(null, { status: 204, headers: CORS });
}

/** The unavailable answer, for when no fresh artifact exists — a first
 *  deploy before its first publish, or a publisher that has died. Loud on
 *  purpose; the browse route makes the same choice. */
export function unavailable(): Response {
  return json({ error: "inventory data is not available right now", as_of: null }, { status: 503 });
}
