import { apiIndex, apiManifest, apiPartition, hydrate } from "@/lib/api/artifacts";
import { makeLabel } from "@/lib/api/search";
import type { ApiIndex, ApiListing, ApiManifest } from "@/lib/api/records";
import { modelKey, preferredForm } from "./modelName";
import { MODEL_HUBS, hubPath, type ModelHub } from "./modelHubs";
import { shopMatches, shopModels, type ModelName, type ShopModel } from "./shop";
import { SHOP_CARS, type ShopQuestion } from "./shopQuestions";

// The data half of /shop/<slug> (lib/listings/shop.ts says why the pages
// exist): the public API's published artifacts, never the database. Same
// manifest, same slim index and same filter engine as /api/v1/listings and
// the near-a-ZIP page, so none of them can disagree about a car.
//
// COST. The model table is answered from the slim index alone (api-index,
// ~20 MB raw on 2026-11-18, read once per instance and shared by every
// question). Only the cars listed under the table need full records, so only
// the make partitions those ≤20 cars are in are read — not the ~185 MB of
// all of them. Both reads are memoised per instance against the manifest's
// as_of (lib/api/artifacts.ts).
//
// Unreadable artifacts THROW. An empty table here reads as "no used EVs under
// $25,000", which is a false answer; a 500 leaves the previous ISR entry in
// place. Same choice as the near page and the browse shards.

export interface ShopResult {
  asOf: string;
  total: number;
  models: ShopModel[];
  cars: ApiListing[];
}

async function loadIndex(): Promise<{ m: ApiManifest; idx: ApiIndex }> {
  const m = await apiManifest();
  if (!m) throw new Error("shop: the inventory manifest is missing or stale");
  const idx = await apiIndex(m);
  if (!idx) throw new Error("shop: the inventory index could not be read");
  return { m, idx };
}

/** A model's name and page, from the model hubs where one exists, else from
 *  the manifest's own spellings (the commonest, as the site's dropdowns
 *  choose it). Rows of one hub are one model even when the feed spells it
 *  two ways. */
export function modelNamer(m: ApiManifest, hubs: ModelHub[] = MODEL_HUBS): (makeSlug: string, key: string) => ModelName {
  const hubByKey = new Map<string, ModelHub>();
  for (const h of hubs) for (const k of h.keys) hubByKey.set(`${h.makeSlug}|${k}`, h);
  const makes = new Map<string, { label: string; forms: Map<string, Map<string, number>> }>();
  for (const x of m.makes) {
    const forms = new Map<string, Map<string, number>>();
    for (const [name, n] of Object.entries(x.models)) {
      const k = modelKey(name);
      let f = forms.get(k);
      if (!f) forms.set(k, (f = new Map()));
      f.set(name, (f.get(name) ?? 0) + n);
    }
    makes.set(x.slug, { label: makeLabel(x), forms });
  }
  return (makeSlug, key) => {
    const hub = hubByKey.get(`${makeSlug}|${key}`);
    if (hub) return { key: hubPath(hub), name: `${hub.make} ${hub.model}`, href: hubPath(hub) };
    const mk = makes.get(makeSlug);
    const forms = mk?.forms.get(key);
    return { key: `${makeSlug}|${key}`, name: `${mk?.label ?? makeSlug} ${forms ? preferredForm(forms) : key}` };
  };
}

export async function shopSearch(q: ShopQuestion): Promise<ShopResult> {
  const { m, idx } = await loadIndex();
  const hits = shopMatches(idx.r, q);
  const page = hits.slice(0, SHOP_CARS).map((r): [string, string] => [r[0], r[1]]);
  // hydrate() quietly drops a partition it cannot read; here that would print
  // a count over a short list. Read them first and refuse when one is missing.
  const slugs = [...new Set(page.map(([, s]) => s))];
  const parts = await Promise.all(slugs.map((s) => apiPartition(m, s)));
  const missing = slugs.filter((_, i) => !parts[i]);
  if (missing.length) throw new Error(`shop: the ${missing.join(", ")} partition could not be read`);
  const cars = await hydrate(m, page);
  return { asOf: m.as_of, total: hits.length, models: shopModels(hits, modelNamer(m)), cars };
}
