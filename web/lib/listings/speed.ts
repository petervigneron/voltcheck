// How fast a model leaves the lot: the share of its used cars that were no
// longer listed 30 days after they appeared. Migration 0120 computes the
// counts and says, clause by clause, what a car has to be to count; this
// module only joins those rows to the model hubs and decides when a figure
// may be printed.
//
// THE WORDING IS "NO LONGER LISTED". A listing also disappears when a car
// goes to auction or moves lots, and nothing here tells those from a sale.
// No surface may shorten it to "sold".
//
// A fact about a model, never a verdict on a car. The per-car version was
// studied on 2026-11-11 and does not hold up; 0120's header has the result.
import { MODEL_HUBS, hubPath, type ModelHub } from "./modelHubs";
import { modelKey } from "./modelName";

/** Fewest cars a share may rest on. At 100, one car moves it by a point. */
export const SPEED_MIN = 100;

export interface RawSpeedRow {
  make: string;
  model: string;
  listed: number;
  gone: number;
  window_from: string;
  window_to: string;
}

export interface ModelSpeed {
  /** Used cars that appeared in the window. */
  listed: number;
  /** Whole percent of those no longer listed 30 days after appearing. */
  pct: number;
  /** First and last day of the window, ISO. */
  from: string;
  to: string;
}

/**
 * One figure per hub, keyed by hub path. Spellings are added before dividing,
 * through the hub's own keys — the same exact-match contract as the hubs,
 * /market and the fact links, so a row no hub claims is dropped and never
 * folded into a neighbour. Under SPEED_MIN cars there is no entry at all.
 */
export function shapeSpeed(rows: RawSpeedRow[] | null | undefined, hubs: ModelHub[] = MODEL_HUBS): Map<string, ModelSpeed> {
  const byKey = new Map<string, { listed: number; gone: number; from: string; to: string }>();
  for (const r of rows ?? []) {
    if (!r || typeof r.make !== "string" || typeof r.model !== "string") continue;
    const listed = Number(r.listed);
    const gone = Number(r.gone);
    if (!Number.isFinite(listed) || !Number.isFinite(gone) || listed <= 0 || gone < 0 || gone > listed) continue;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(r.window_from) || !/^\d{4}-\d{2}-\d{2}$/.test(r.window_to)) continue;
    const k = `${r.make.toLowerCase()} ${modelKey(r.model)}`;
    const at = byKey.get(k);
    if (at) {
      at.listed += listed;
      at.gone += gone;
    } else byKey.set(k, { listed, gone, from: r.window_from, to: r.window_to });
  }
  const out = new Map<string, ModelSpeed>();
  for (const h of hubs) {
    let listed = 0;
    let gone = 0;
    let from = "";
    let to = "";
    for (const key of h.keys) {
      const at = byKey.get(`${h.make.toLowerCase()} ${key}`);
      if (!at) continue;
      listed += at.listed;
      gone += at.gone;
      from = at.from;
      to = at.to;
    }
    if (listed < SPEED_MIN) continue;
    out.set(hubPath(h), { listed, pct: Math.round((100 * gone) / listed), from, to });
  }
  return out;
}

/**
 * Every hub's figure, or an empty map when the database does not answer.
 * Unlike fetchMarket this does not throw: the figure is one line on pages
 * that are about something else, and a model page without it is still the
 * page. Cached for a day; the table is refilled once a day.
 */
export async function fetchSpeed(): Promise<Map<string, ModelSpeed>> {
  const base = process.env.SUPABASE_URL?.replace(/\/$/, "");
  const key = process.env.SUPABASE_ANON_KEY;
  if (!base || !key) return new Map();
  try {
    const res = await fetch(`${base}/rest/v1/model_selling_speed?select=make,model,listed,gone,window_from,window_to&limit=2000`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
      next: { revalidate: 86_400 },
    });
    if (!res.ok) return new Map();
    return shapeSpeed((await res.json()) as RawSpeedRow[]);
  } catch {
    return new Map();
  }
}
