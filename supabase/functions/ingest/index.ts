// Ingest gateway: lets the nightly scraper write without holding the
// project's service key. The scraper posts with an x-ingest-token header;
// this function checks it and forwards to the right RPC using the service
// key Supabase injects into edge functions.
//
// The token is stored here as a SHA-256 HASH, never in the clear. A hash of
// 32 random bytes cannot be reversed, so this constant is not a secret: the
// committed file is exactly what runs, with no deploy-time substitution
// step and nothing to leak in a deploy log, a transcript, or this repo's
// public history. The token itself exists in exactly two places, both of
// them write-only stores: scraper/.env and the GitHub Actions secret
// SUPABASE_INGEST_TOKEN.
//
// Rotate:
//   TOKEN=$(openssl rand -hex 32)
//   printf '%s' "$TOKEN" | shasum -a 256      # paste the digest below, redeploy
//   printf '%s' "$TOKEN" | gh secret set SUPABASE_INGEST_TOKEN
//   # and update SUPABASE_INGEST_TOKEN in scraper/.env
// The scraper keeps sending the raw token exactly as before; only this
// side changed, so a rotation never needs a matching scraper release.
const INGEST_TOKEN_SHA256 = "5ffd98a98e90db938b589423840b7e86bd10ddf29a18959f608af8da0133e943";

async function sha256Hex(s: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return new Response("method not allowed", { status: 405 });
  const presented = req.headers.get("x-ingest-token");
  if (!presented || (await sha256Hex(presented)) !== INGEST_TOKEN_SHA256) {
    return new Response(JSON.stringify({ error: "forbidden" }), { status: 403 });
  }
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const base = Deno.env.get("SUPABASE_URL");
  const headers = { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };

  // Big payloads must never enter this isolate's memory. The nightly's
  // listing chunks (7-8MB of JSON) used to be parsed here and re-serialized
  // for PostgREST — ~100MB+ of transient V8 heap per request — and on
  // 2026-08-16 back-to-back chunks OOM-killed the worker mid-request:
  // Cloudflare answered 520 with nothing in the function log (the isolate
  // died before writing one), then 503s while replacements churned, and
  // only db-sync's retry ladder got the night through. A client that
  // already speaks the target function's own parameter shape says so with
  // x-ingest-rpc and the body streams through untouched; this isolate holds
  // only the response (a small counts object). The name must be on the
  // allowlist — the service key forwards to these functions and nothing
  // else, the same boundary the parsed paths below enforce.
  const STREAM_RPCS = new Set([
    "ingest_listings",
    "recheck_listings",
    "ingest_wa_sales",
    "ingest_vin_variants",
    "refresh_vin_variants",
    // Staged monthly loads (migration 0033): chunks land keyed by
    // (dataset, batch, chunk) so a replayed chunk overwrites itself instead
    // of duplicating, and the commit swaps the live table in one
    // transaction. The plain ingest_wa_sales / ingest_vin_variants routes
    // stay as the rollback path.
    "stage_monthly_load",
    "commit_monthly_load",
    // Which rooftops offered the same VIN tonight (migration 0036) — the
    // dealer-group graph merge-shards.mjs used to throw away. Stream route
    // only: the body already speaks the RPC's parameter shape, so there is
    // nothing for this isolate to translate.
    "ingest_colisting",
    // Retiring listings that should never have been admitted (migration
    // 0043). The only DESTRUCTIVE route on this allowlist, so it is worth
    // being explicit about why it is here: audit-listings.mjs re-judges every
    // live listing and had no way to act on what it found, and the deliberate
    // act it asks for needs a mechanism that is auditable rather than a hand
    // -typed DELETE against prod. The function itself refuses a call large
    // enough to be a mistake rather than a judgement, and records every VIN
    // it removes in retired_listing.
    "retire_misclassified_listings",
  ]);
  const streamRpc = req.headers.get("x-ingest-rpc");
  if (streamRpc) {
    if (!STREAM_RPCS.has(streamRpc)) {
      return new Response(JSON.stringify({ error: "unknown rpc" }), { status: 400 });
    }
    const r = await fetch(`${base}/rest/v1/rpc/${streamRpc}`, {
      method: "POST",
      headers,
      body: req.body,
      // Request-body streaming; some fetch implementations reject a stream
      // body without it, and RequestInit's type doesn't know the field.
      // deno-lint-ignore no-explicit-any
      ...({ duplex: "half" } as any),
    });
    return new Response(await r.text(), {
      status: r.status,
      headers: { "Content-Type": "application/json" },
    });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "invalid JSON" }), { status: 400 });
  }
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

  // Recompute the observed half of vin_variant against the listings the sync
  // just wrote (migration 0020). Carries no rows, so it has to be routed
  // above the rows guard.
  if (body.dataset === "refresh_variants") {
    return call("refresh_vin_variants", {});
  }

  if (!Array.isArray(body.rows)) {
    return new Response(JSON.stringify({ error: "rows must be an array" }), { status: 400 });
  }

  // Washington transaction prices (migration 0003), loaded in chunks.
  if (body.dataset === "wa_sales") {
    return call("ingest_wa_sales", { _rows: body.rows, _replace: body.replace === true });
  }

  // VIN(1-8) -> version decodes from NHTSA vPIC (migration 0016).
  if (body.dataset === "vin_variants") {
    return call("ingest_vin_variants", { _rows: body.rows, _replace: body.replace === true });
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
