// Ingest gateway: lets the nightly scraper write listings without holding
// the project's service key. The scraper posts { rows, source } with an
// x-ingest-token header; this function checks the token and forwards to the
// ingest_listings RPC using the service key Supabase injects into edge
// functions. Rotation = redeploy with a new token.
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
  let body: { rows?: unknown; source?: string };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "invalid JSON" }), { status: 400 });
  }
  if (!Array.isArray(body.rows)) {
    return new Response(JSON.stringify({ error: "rows must be an array" }), { status: 400 });
  }
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const res = await fetch(`${Deno.env.get("SUPABASE_URL")}/rest/v1/rpc/ingest_listings`, {
    method: "POST",
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ _rows: body.rows, _source: body.source ?? "nightly" }),
  });
  return new Response(await res.text(), {
    status: res.status,
    headers: { "Content-Type": "application/json" },
  });
});
