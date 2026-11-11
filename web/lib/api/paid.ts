import { presentedKey, verifyKey } from "@/lib/dataKey";
import { open } from "@/lib/listings/proSeal";
import { unpackPro, type PackedPro, type ProSignals } from "@/lib/listings/proSignals";
import { json } from "./http";

// The paid tier's two jobs at request time: decide whether a request holds a
// working data key, and load the fields a key buys.
//
// THE PAID ENDPOINTS HAVE THEIR OWN URLS (/api/v1/data/…) AND THAT IS NOT
// TIDINESS. The free endpoints are cached at the CDN by URL for an hour. If
// a key simply added fields to /api/v1/listings, a keyed request for a URL
// someone had already asked for without a key would be answered from that
// cache — the free body, without the fields — and a free request after a
// keyed one could be handed the paid body. Separate paths cannot collide,
// and the free routes are untouched: not one line of them changed for this.
//
// A paid endpoint answers 401 to a missing, malformed or lapsed key. It
// never falls back to the free body: someone running a job on what they
// believe is the paid tier should find out at the first request, not after
// 168,000 rows without the columns they paid for.

/** Null when the request holds a working key; otherwise the 401 to send. */
export async function requireKey(req: Request): Promise<Response | null> {
  const key = presentedKey(req.headers);
  if (key === null) return keyRequired();
  if (key === "malformed" || !(await verifyKey(key))) {
    return json(
      { error: "this API key is not active", details: ["Keys are managed at https://censusev.com/account"] },
      { status: 401, keyed: true },
    );
  }
  return null;
}

/** The answer for an endpoint only a key opens. */
export const keyRequired = (): Response =>
  json(
    { error: "this endpoint needs a data key", details: ["Send it as: Authorization: Bearer <key>", "https://censusev.com/data"] },
    { status: 401, keyed: true },
  );

// The sealed Pro artifact, opened once per as_of per instance. The same
// read app/api/index/pro/route.ts makes for a pass-holder's browser; that
// route keeps its own copy of these fifteen lines because it returns the
// packed body untouched and this returns it unpacked.
let memo: { asOf: string; signals: ProSignals } | undefined;

/** Null when the artifact or its key is unavailable: the caller answers 503
 *  rather than serving a paid response with the paid fields silently gone. */
export async function paidSignals(): Promise<ProSignals | null> {
  const base = process.env.SUPABASE_URL;
  const secret = process.env.PRO_FEED_KEY;
  if (!base || !secret) return null;
  try {
    const mRes = await fetch(`${base}/storage/v1/object/public/feed/pro-manifest.json`, { cache: "no-store", signal: AbortSignal.timeout(20_000) });
    if (!mRes.ok) return null;
    const m = (await mRes.json()) as { v: number; as_of: string };
    if (m.v !== 1 || !Number.isFinite(Date.parse(m.as_of))) return null;
    if (memo?.asOf === m.as_of) return memo.signals;
    const res = await fetch(`${base}/storage/v1/object/public/feed/pro-index.bin`, { cache: "no-store", signal: AbortSignal.timeout(60_000) });
    if (!res.ok) return null;
    const packed = JSON.parse(open(new Uint8Array(await res.arrayBuffer()), secret)) as PackedPro;
    if (packed.v !== 1) return null;
    memo = { asOf: m.as_of, signals: unpackPro(packed) };
    return memo.signals;
  } catch (e) {
    console.error("[api/paid] signals unavailable:", e instanceof Error ? e.message : e);
    return null;
  }
}

export const paidUnavailable = (): Response =>
  json({ error: "the paid fields are not available right now", as_of: null }, { status: 503, keyed: true });
