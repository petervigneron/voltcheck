import { currentPass } from "@/lib/pro";
import { open } from "@/lib/listings/proSeal";
import type { PackedPro } from "@/lib/listings/proSignals";

// The Pro fields of the browse index — the deal delta and the incentive
// match for every car that has one — for a browser whose pass lib/pro.ts
// vouches for. The public shards stopped carrying them on 2026-09-05
// (lib/listings/proSignals.ts explains); this is the only door.
//
// The artifact sits sealed in the public bucket (scripts/publish-feed.mjs,
// lib/listings/proSeal.ts). Opened here, once per as_of per instance, and
// answered `private, no-store`: an entitlement is never served from a
// shared cache to the next visitor. A browser without a pass is told 401
// without the artifact being touched.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface ProManifest {
  v: 1;
  as_of: string;
  bytes: number;
}

let memo: { asOf: string; body: string } | undefined;

async function proBody(): Promise<string | null> {
  const base = process.env.SUPABASE_URL;
  const secret = process.env.PRO_FEED_KEY;
  if (!base || !secret) return null;
  const mRes = await fetch(`${base}/storage/v1/object/public/feed/pro-manifest.json`, { cache: "no-store", signal: AbortSignal.timeout(20_000) });
  if (!mRes.ok) return null;
  const m = (await mRes.json()) as ProManifest;
  if (m.v !== 1 || !Number.isFinite(Date.parse(m.as_of))) return null;
  if (memo?.asOf === m.as_of) return memo.body;
  const res = await fetch(`${base}/storage/v1/object/public/feed/pro-index.bin`, { cache: "no-store", signal: AbortSignal.timeout(60_000) });
  if (!res.ok) return null;
  const body = open(new Uint8Array(await res.arrayBuffer()), secret);
  const parsed = JSON.parse(body) as PackedPro;
  if (parsed.v !== 1) return null;
  memo = { asOf: m.as_of, body };
  return body;
}

export async function GET(): Promise<Response> {
  const headers = { "cache-control": "private, no-store", "content-type": "application/json" };
  let active = false;
  try {
    active = (await currentPass()).active;
  } catch {
    active = false;
  }
  if (!active) return new Response(JSON.stringify({ error: "Voltcheck Pro" }), { status: 401, headers });
  try {
    const body = await proBody();
    if (!body) return new Response(JSON.stringify({ error: "unavailable" }), { status: 503, headers });
    return new Response(body, { headers });
  } catch (e) {
    console.error("[index/pro]", e instanceof Error ? e.message : e);
    return new Response(JSON.stringify({ error: "unavailable" }), { status: 503, headers });
  }
}
