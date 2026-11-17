import type { ApiIndex, ApiListing, ApiManifest } from "./records";
import type { HubIndex } from "@/lib/listings/hubIndex";

// The API's data plane: the artifacts scripts/publish-feed.mjs uploads to the
// public `feed` bucket, memoised per function instance. Nothing here touches
// the database — a request-time scan of `listings` is exactly the class of
// read that blows anon's 3-second statement timeout (CLAUDE.md), and the
// browse grid stopped walking at request time for the same reason.
//
// Freshness is the publish cadence (nightly, plus any out-of-cycle dispatch
// of publish-feed.yml), and every response says so through `as_of`. An
// artifact older than MAX_AGE is refused rather than served: quietly
// answering week-old inventory because a publisher died is the
// bundled-snapshot incident with an API on it.

const MAX_AGE_MS = 48 * 60 * 60 * 1000;
const MANIFEST_TTL_MS = 5 * 60 * 1000;

const base = () => process.env.SUPABASE_URL;
const url = (name: string) => `${base()}/storage/v1/object/public/feed/${name}.json`;

let manifestMemo: { at: number; value: ApiManifest | null } | undefined;
const memo = new Map<string, { asOf: string; value: unknown }>();

async function fetchJson<T>(name: string): Promise<T | null> {
  if (!base()) return null;
  try {
    const res = await fetch(url(name), { cache: "no-store", signal: AbortSignal.timeout(60_000) });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export async function apiManifest(): Promise<ApiManifest | null> {
  if (manifestMemo && Date.now() - manifestMemo.at < MANIFEST_TTL_MS) return manifestMemo.value;
  const m = await fetchJson<ApiManifest>("api-manifest");
  const ok = m && m.v === 1 && Number.isFinite(Date.parse(m.as_of)) && Date.now() - Date.parse(m.as_of) <= MAX_AGE_MS ? m : null;
  manifestMemo = { at: Date.now(), value: ok };
  return ok;
}

/** One artifact, re-fetched only when the manifest's as_of has moved. */
async function artifact<T>(name: string, asOf: string): Promise<T | null> {
  const hit = memo.get(name);
  if (hit && hit.asOf === asOf) return hit.value as T;
  const v = await fetchJson<T>(name);
  if (v === null) return null;
  memo.set(name, { asOf, value: v });
  return v;
}

export async function apiIndex(m: ApiManifest): Promise<ApiIndex | null> {
  const idx = await artifact<ApiIndex>("api-index", m.as_of);
  return idx && idx.v === 1 ? idx : null;
}

export async function apiPartition(m: ApiManifest, slug: string): Promise<ApiListing[] | null> {
  if (!/^[a-z0-9-]{1,40}$/.test(slug)) return null;
  return artifact<ApiListing[]>(`api-make-${slug}`, m.as_of);
}

/** The full records for a page of [id, makeSlug], in the page's order. A
 *  partition that cannot be read costs its cars, not the response. */
export async function hydrate(m: ApiManifest, page: [string, string][]): Promise<ApiListing[]> {
  const slugs = [...new Set(page.map(([, s]) => s))];
  const parts = await Promise.all(slugs.map(async (s) => [s, await apiPartition(m, s)] as const));
  const byId = new Map<string, ApiListing>();
  for (const [, recs] of parts) for (const r of recs ?? []) byId.set(r.id, r);
  return page.map(([id]) => byId.get(id)).filter((r): r is ApiListing => r !== undefined);
}

// ------------------------------------------------------------ model hubs
// The model pages' own numbers (lib/listings/hubIndex.ts), from the same
// hubs.json the pages read, behind the same 36h gate on the feed manifest
// (lib/listings/hubSource.ts). Read here rather than through hubEntry()
// because hubEntry() falls back to walking the database when the artifact is
// missing, and nothing on the API's side of the house may do that.

const HUB_MAX_AGE_MS = 36 * 60 * 60 * 1000;
const HUB_TIMEOUT_MS = 15_000;
// The manifest is re-read every few minutes; the ~1.5 MB body only when the
// manifest says a new one was published, so a warm instance does not pull it
// again on every check (the egress budget is why the pages cache a day).
let hubManifestMemo: { at: number; publishedAt: string | null } | undefined;
let hubBodyMemo: { publishedAt: string; value: HubIndex } | undefined;

async function fetchBounded<T>(name: string): Promise<T | null> {
  if (!base()) return null;
  try {
    const res = await fetch(url(name), { cache: "no-store", signal: AbortSignal.timeout(HUB_TIMEOUT_MS) });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

/** The published hub index, or null when it is missing, stale or unreadable. */
export async function apiHubIndex(): Promise<HubIndex | null> {
  if (!hubManifestMemo || Date.now() - hubManifestMemo.at >= MANIFEST_TTL_MS) {
    const m = await fetchBounded<{ v: number; publishedAt: string }>("manifest");
    const ok = m && m.v === 1 && typeof m.publishedAt === "string" && Number.isFinite(Date.parse(m.publishedAt));
    hubManifestMemo = { at: Date.now(), publishedAt: ok ? m.publishedAt : null };
  }
  const publishedAt = hubManifestMemo.publishedAt;
  if (!publishedAt || Date.now() - Date.parse(publishedAt) > HUB_MAX_AGE_MS) return null;
  if (hubBodyMemo?.publishedAt === publishedAt) return hubBodyMemo.value;
  const h = await fetchBounded<HubIndex>("hubs");
  if (!h || h.v !== 1 || !h.hubs) return null;
  hubBodyMemo = { publishedAt, value: h };
  return h;
}
