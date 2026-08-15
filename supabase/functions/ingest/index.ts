// Ingest gateway: lets the nightly scraper write without holding the
// project's service key. The scraper posts with an x-ingest-token header;
// this function checks it and forwards to the right RPC using the service
// key Supabase injects into edge functions. Rotation = redeploy with a new
// token.
//
// The committed file carries a placeholder — the deploy step substitutes
// the real token, which lives only in scraper/.env (gitignored). JWT
// verification is also on: callers must present the anon key as Bearer.
const INGEST_TOKEN = "__DEPLOY_TIME_TOKEN__";

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return new Response("method not allowed", { status: 405 });
  if (INGEST_TOKEN.startsWith("__") || req.headers.get("x-ingest-token") !== INGEST_TOKEN) {
    return new Response(JSON.stringify({ error: "forbidden" }), { status: 403 });
  }
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "invalid JSON" }), { status: 400 });
  }
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const base = Deno.env.get("SUPABASE_URL");
  const headers = { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
  const call = async (fn: string, payload: unknown) => {
    const r = await fetch(`${base}/rest/v1/rpc/${fn}`, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });
    return new Response(await r.text(), {
      status: r.status,
      headers: { "Content-Type": "application/json" },
    });
  };

  // Per-listing daily confirmation (migration 0004).
  if (body.dataset === "recheck") {
    return call("recheck_listings", {
      _alive: Array.isArray(body.alive) ? body.alive : [],
      _hard_gone: Array.isArray(body.hardGone) ? body.hardGone : [],
      _soft_gone: Array.isArray(body.softGone) ? body.softGone : [],
    });
  }

  if (!Array.isArray(body.rows)) {
    return new Response(JSON.stringify({ error: "rows must be an array" }), { status: 400 });
  }

  // Washington transaction prices (migration 0003), loaded in chunks.
  if (body.dataset === "wa_sales") {
    return call("ingest_wa_sales", { _rows: body.rows, _replace: body.replace === true });
  }

  return call("ingest_listings", {
    _rows: body.rows,
    _source: body.source ?? "nightly",
    // Only domains the crawler saw completely may delist (migration 0002).
    _complete_domains: Array.isArray(body.completeDomains) ? body.completeDomains : [],
    // When the crawler observed the rows; stale evidence can neither
    // resurrect nor delist past fresher truth (migration 0013).
    _observed_at: typeof body.observedAt === "string" ? body.observedAt : null,
  });
});
