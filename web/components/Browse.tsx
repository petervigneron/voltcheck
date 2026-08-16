"use client";

import { useEffect, useMemo, useReducer, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ListingCard, type GroundsMode } from "./ListingCard";
import { SearchBar, FilterRail, SpecFacets, type FacetGroup, type Suggestion } from "./Filters";
import { REMOVABLE, SPEC_FACETS, FACET_CAP, describeFilter, dropSpecFilters, splitValues, type SpecFacet } from "@/lib/filters";
import { featuredScore, type CardRow } from "@/lib/listings/card";
import { SHARDS, unpackIndex, type PackedIndex } from "@/lib/listings/pack";
import { milesBetween } from "@/lib/geo";
import { pushUrl } from "@/lib/pushUrl";

const CELL = "border-r-[3px] border-b-[3px] border-ink";

// The band under the search box: the four deepest models in inventory, each a
// one-click search. Deep inventory is the popularity signal we actually have.
const BAND_GROUNDS = ["bg-saffron", "bg-putty", "bg-putty", "bg-teal text-paper"];

// Which field on a row each spec facet groups by. Values are strings because
// that's what a URL carries; the numeric facets sort back to numbers.
const FACET_OF: Record<SpecFacet, (r: CardRow) => string | undefined> = {
  trim: (r) => r.trim,
  kwh: (r) => (r.kwh != null ? String(r.kwh) : undefined),
  epa: (r) => (r.rangeMi != null ? String(r.rangeMi) : undefined),
};

// Some feeds repeat the make inside the model ("Ford" / "Ford F-150
// Lightning"), which would read as two models and cost those cars their spec
// rail. Only the grouping is normalized here — the stored model is untouched.
const modelKey = (r: CardRow) => {
  const make = r.make.toLowerCase();
  const model = r.model.toLowerCase();
  return `${make} ${model.startsWith(`${make} `) ? model.slice(make.length + 1) : model}`;
};

// The whole inventory arrives once per visitor (CDN-cached JSON, hourly
// revalidate) and every filter, sort, and page flip after that is a pure
// in-browser computation — no server round-trip, which is where the latency
// used to live. Module-level cache so client-side navigation never refetches.
let indexCache: CardRow[] | null = null;
let indexPromise: Promise<CardRow[]> | null = null;

function useCardIndex(): { rows: CardRow[] | null; failed: boolean } {
  const [rows, setRows] = useState<CardRow[] | null>(indexCache);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (indexCache) return;
    // Every shard at once: the wait is the slowest file, not the sum of them.
    // One shard failing fails the load — a grid quietly missing a sixth of the
    // inventory is the failure this whole path exists to prevent.
    indexPromise ??= Promise.all(
      Array.from({ length: SHARDS }, (_, i) =>
        fetch(`/api/index/${i}`).then(async (res) => {
          if (!res.ok) throw new Error(`index shard ${i}: ${res.status}`);
          // Unpacking is one pass over already-parsed JSON — cheaper than the
          // parse itself, and it happens once per visitor.
          return unpackIndex((await res.json()) as PackedIndex);
        })
      )
    ).then((shards) => shards.flat());
    indexPromise.then(
      (rs) => {
        indexCache = rs;
        setRows(rs);
      },
      () => {
        indexPromise = null;
        setFailed(true);
      }
    );
  }, [failed]);
  return { rows, failed };
}

// The shopper's zip resolves through a tiny CDN-cached lookup; listing
// coordinates already ship in the index. Until the answer lands (or for a zip
// the gazetteer doesn't know), distance behaves as it always has with an
// unknown origin: no distance filter.
const zipCache = new Map<string, [number, number] | null>();

function useOrigin(zip: string): [number, number] | undefined {
  const [, bump] = useReducer((c: number) => c + 1, 0);
  const z = zip.trim().slice(0, 5);
  const valid = /^\d{5}$/.test(z);
  useEffect(() => {
    if (!valid || zipCache.has(z)) return;
    fetch(`/api/zip/${z}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((loc: [number, number] | null) => {
        zipCache.set(z, loc);
        bump();
      })
      .catch(() => {});
  }, [z, valid]);
  return valid ? (zipCache.get(z) ?? undefined) : undefined;
}

// With no ZIP typed, Vercel's IP geolocation stands in as the origin, so
// distance works on arrival. The static shell can't read request headers, so
// /api/whereami (per-visitor, never CDN-cached) answers instead. Locally the
// headers are absent and everything degrades to ZIP-only.
let ipCache: { loc: [number, number]; city: string } | null | undefined;

function useIpOrigin(): { loc: [number, number]; city: string } | undefined {
  const [, bump] = useReducer((c: number) => c + 1, 0);
  useEffect(() => {
    if (ipCache !== undefined) return;
    fetch("/api/whereami")
      .then((res) => (res.ok ? res.json() : null))
      .then((geo: { lat: number | null; lng: number | null; city: string | null } | null) => {
        // "" = origin known but city unknown; null cache = no origin at all.
        ipCache = geo && geo.lat !== null && geo.lng !== null ? { loc: [geo.lat, geo.lng], city: geo.city ?? "" } : null;
        bump();
      })
      .catch(() => {});
  }, []);
  return ipCache ?? undefined;
}

function PopularBand({ popular, q }: { popular: { make: string; model: string; count: number }[]; q: string }) {
  const sp = useSearchParams();
  const go = (label: string, pressed: boolean) => {
    const params = new URLSearchParams(sp.toString());
    params.delete("page");
    dropSpecFilters(params);
    if (pressed) params.delete("q");
    else params.set("q", label);
    pushUrl(params);
  };
  return (
    <div className="grid grid-cols-2 md:grid-cols-4">
      {popular.map((p, i) => {
        const label = `${p.make} ${p.model}`;
        const pressed = q === label.toLowerCase();
        return (
          <button
            key={label}
            type="button"
            onClick={() => go(label, pressed)}
            title={pressed ? `Stop showing only ${label}` : `Show every ${label}`}
            className={`${CELL} flex flex-col px-5 py-3 text-left hover:ring-[3px] hover:ring-inset hover:ring-cobalt focus:outline-none focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-cobalt ${
              pressed ? "bg-ink text-paper" : BAND_GROUNDS[i]
            }`}
          >
            <span className="text-[10.5px] font-extrabold tracking-[0.14em] uppercase">
              {p.make} · {p.count} cars
            </span>
            <span className="text-[19px] font-extrabold tracking-[-0.02em]">
              {p.model}
              {pressed ? " ✕" : ""}
            </span>
          </button>
        );
      })}
      {popular.length === 0 &&
        BAND_GROUNDS.map((g, i) => <div key={i} className={`${CELL} h-[62px] ${g}`} aria-hidden="true" />)}
    </div>
  );
}

export function Browse() {
  const sp = useSearchParams();
  const s = (k: string) => sp.get(k) ?? "";
  const n = (k: string) => Number(s(k)) || undefined;

  const q = s("q").toLowerCase().trim();
  const make = s("make");
  const model = s("model");
  const cond = s("cond");
  const drive = s("drive");
  const body = s("body");
  const minPrice = n("minPrice");
  const maxPrice = n("maxPrice");
  const minYear = n("minYear");
  const maxYear = n("maxYear");
  const maxMiles = n("maxMiles");
  const minRange = n("minRange");
  const heatPump = s("heatPump") === "1";
  const zip = s("zip");
  const radiusParam = s("radius");
  const radius = radiusParam || "50";
  const sort = s("sort") || "featured";
  // Prototype flag: ?grounds=fact makes card colors mean something (teal =
  // new battery, cobalt = recent price cut) instead of the one-in-five rhythm.
  const grounds: GroundsMode = s("grounds") === "fact" ? "fact" : "rhythm";

  const { rows, failed } = useCardIndex();
  // A typed ZIP always wins — even an invalid one, because "Near 00000"
  // measured from the IP instead would be a lie.
  const zipOrigin = useOrigin(zip);
  const ip = useIpOrigin();
  const origin = zip ? zipOrigin : ip?.loc;
  // "" = origin inferred but city unknown; undefined = no inferred origin.
  const inferred = !zip && ip ? ip.city : undefined;

  // Per-model tally, case-insensitive because dealer feeds disagree on casing
  // ("Nissan ARIYA" / "Nissan Ariya"); the most common form is the display one.
  const { tally, suggestions, popular, makesModels } = useMemo(() => {
    const tally = new Map<string, { count: number; forms: Map<string, { make: string; model: string; n: number }> }>();
    const makesModels: Record<string, string[]> = {};
    for (const r of rows ?? []) {
      (makesModels[r.make] ??= []).push(r.model);
      const form = `${r.make} ${r.model}`;
      const t = tally.get(form.toLowerCase()) ?? { count: 0, forms: new Map() };
      t.count += 1;
      const f = t.forms.get(form) ?? { make: r.make, model: r.model, n: 0 };
      f.n += 1;
      t.forms.set(form, f);
      tally.set(form.toLowerCase(), t);
    }
    for (const k of Object.keys(makesModels)) makesModels[k] = [...new Set(makesModels[k])].sort();
    const canon = [...tally.values()]
      .map((t) => {
        const best = [...t.forms.values()].sort((a, b) => b.n - a.n)[0];
        return { make: best.make, model: best.model, count: t.count };
      })
      .sort((a, b) => b.count - a.count);
    // A model listed once is as likely a feed typo as a car — not suggestion material.
    const suggestions: Suggestion[] = canon
      .filter((c) => c.count >= 2)
      .map((c) => ({ label: `${c.make} ${c.model}`, count: c.count }));
    return { tally, suggestions, popular: canon.slice(0, 4), makesModels };
  }, [rows]);

  const { results, dist, relief, activeCount, facets } = useMemo(() => {
    const all = rows ?? [];

    const dist = new Map<string, number>();
    if (origin) {
      for (const r of all) if (r.loc) dist.set(r.id, Math.round(milesBetween(origin, r.loc)));
    }

    // Each active filter is its own predicate, which is what lets an empty
    // result say how many cars dropping any single one would give back.
    const tests: Partial<Record<(typeof REMOVABLE)[number], (r: CardRow) => boolean>> = {};
    // An inferred origin only *filters* when the visitor explicitly chose a
    // radius; otherwise the 50-mile default would silently hide most inventory
    // behind a guess, with no chip to say so.
    if (origin && radius !== "any" && (zip || radiusParam)) {
      tests.zip = (r) => {
        const d = dist.get(r.id);
        return d !== undefined && d <= Number(radius);
      };
    }
    if (q) {
      // A one- or two-letter token is a substring of half the language: "y" in
      // "tesla model y" lands inside "grey" and drags in every Model 3 painted
      // Stealth Grey. Short tokens have to match a whole word; longer ones keep
      // matching inside one, which is what lets "buzz" find "ID. Buzz".
      const toks = q.split(/\s+/).map((tok) => {
        if (tok.length > 2) return (hay: string) => hay.includes(tok);
        const re = new RegExp(`\\b${tok.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`);
        return (hay: string) => re.test(hay);
      });
      tests.q = (r) => toks.every((match) => match(r.hay));
    }
    if (make) tests.make = (r) => r.make === make;
    if (model) tests.model = (r) => r.model === model;
    if (cond === "new") tests.cond = (r) => r.condition === "new";
    else if (cond === "used") tests.cond = (r) => r.condition === "used" || r.condition === "certified" || !r.condition;
    if (drive) tests.drive = (r) => r.drive === drive;
    // Curated model→body map; cars we can't verifiably classify sit this one out.
    if (body) tests.body = (r) => r.body === body;
    // A price filter is about price, so a car whose feed gave us a lease
    // payment instead of one can't satisfy it either way.
    if (minPrice) tests.minPrice = (r) => r.realPrice && r.priceUsd >= minPrice;
    if (maxPrice) tests.maxPrice = (r) => r.realPrice && r.priceUsd <= maxPrice;
    if (minYear) tests.minYear = (r) => r.year >= minYear;
    if (maxYear) tests.maxYear = (r) => r.year <= maxYear;
    if (maxMiles) tests.maxMiles = (r) => r.mileage != null && r.mileage <= maxMiles;
    if (minRange) tests.minRange = (r) => !!r.rangeMi && r.rangeMi >= minRange;
    if (heatPump) tests.heatPump = (r) => r.heatPump === "yes";
    // Values OR within a spec facet ("Lariat or XLT"), facets AND with each
    // other. A car whose version we can't pin down has no value to match on and
    // sits the facet out, the same way the drivetrain and body filters work.
    for (const f of SPEC_FACETS) {
      const on = new Set(splitValues(s(f.key)));
      if (!on.size) continue;
      const get = FACET_OF[f.key];
      tests[f.key] = (r) => {
        const v = get(r);
        return v !== undefined && on.has(v);
      };
    }

    const activeKeys = REMOVABLE.filter((k) => tests[k]);
    const matches = (r: CardRow, skip?: string) => activeKeys.every((k) => k === skip || tests[k]!(r));

    const results = all.filter((r) => matches(r));

    // Cars without a usable price sort to the end either way — they can't
    // lead a price-sorted page in either direction.
    const priceKey = (r: CardRow, low: boolean) => (r.realPrice ? r.priceUsd : low ? Infinity : -Infinity);

    // Anything that isn't an explicit sort falls back to the featured order;
    // the day term reshuffles it once a day, not on every render.
    const explicitSorts = new Set(["price", "price-desc", "year-desc", "miles", "range-desc", ...(origin ? ["distance"] : [])]);
    // eslint-disable-next-line react-hooks/purity -- the once-a-day reshuffle is the point
    const day = Math.floor(Date.now() / 86400000);
    // The haystack includes paint, and paint borrows brand names: "lucid"
    // matches 71 Hyundais in Lucid Blue against 68 actual Lucids, and the
    // Hyundais outranked them. A car whose year/make/model/trim matches the
    // words typed is what was meant; a colour match is a bonus hit, not the
    // answer. Ranking only — nothing is filtered out, and an explicit sort
    // still wins outright.
    const qToks = q ? q.split(/\s+/) : [];
    const identityHit = (r: CardRow) =>
      qToks.length > 0 && qToks.every((tok) => r.title.toLowerCase().includes(tok));
    const feat = explicitSorts.has(sort)
      ? null
      : new Map(
          all.map((r) => [
            r.id,
            featuredScore(r, tally.get(`${r.make} ${r.model}`.toLowerCase())?.count ?? 0, day) +
              (identityHit(r) ? 1000 : 0),
          ])
        );

    results.sort((a, b) => {
      if (origin && sort === "distance") {
        return (dist.get(a.id) ?? Infinity) - (dist.get(b.id) ?? Infinity);
      }
      switch (sort) {
        case "price":
          return priceKey(a, true) - priceKey(b, true);
        case "price-desc":
          return priceKey(b, false) - priceKey(a, false);
        case "year-desc":
          return b.year - a.year || a.priceUsd - b.priceUsd;
        case "miles":
          return (a.mileage ?? Infinity) - (b.mileage ?? Infinity);
        case "range-desc":
          return (b.rangeMi ?? -1) - (a.rangeMi ?? -1);
        default:
          return (feat!.get(b.id) ?? -Infinity) - (feat!.get(a.id) ?? -Infinity);
      }
    });

    // What each filter is costing, only worth computing when nothing matched.
    const relief =
      results.length === 0 && all.length > 0
        ? activeKeys
            .map((k) => ({
              key: k,
              label: (k === "zip" && !zip ? `Within ${radius} mi` : describeFilter(k, s(k))) ?? k,
              n: all.filter((r) => matches(r, k)).length,
            }))
            .sort((a, b) => b.n - a.n)
        : [];

    // "Which version of this car?" is only a question once there's one car in
    // question, so the spec rail is keyed on the results — however they got
    // narrowed — being a single model. The pool it describes is everything the
    // other filters allow, with the spec facets themselves lifted: the rail has
    // to keep offering the versions you didn't pick, not just the one you did.
    const specKeys = new Set<string>(SPEC_FACETS.map((f) => f.key));
    const base = all.filter((r) => activeKeys.every((k) => specKeys.has(k) || tests[k]!(r)));

    const byModel = new Map<string, CardRow[]>();
    for (const r of base) {
      const k = modelKey(r);
      const group = byModel.get(k);
      if (group) group.push(r);
      else byModel.set(k, [r]);
    }
    let pool: CardRow[] = [];
    for (const group of byModel.values()) if (group.length > pool.length) pool = group;
    // A handful of feed rows carrying the trim in the model field ("Model Y
    // Long Range") shouldn't cost 690 Model Ys their rail, so the test is
    // dominance rather than purity. A genuinely mixed result set — two models
    // that split the page — has no one set of versions to offer and gets none.
    const specPool = pool.length >= 2 && pool.length / base.length >= 0.9 ? pool : [];

    const facets: FacetGroup[] = [];
    for (const f of SPEC_FACETS) {
      const get = FACET_OF[f.key];
      const seen = new Set<string>();
      for (const r of specPool) {
        const v = get(r);
        if (v !== undefined) seen.add(v);
      }
      // One value isn't a choice, and none means we can't spec this model.
      if (seen.size < 2) continue;
      // Counts hold the *other* facets fixed. Counting against the filtered
      // results instead would zero every unpicked chip in a facet the moment
      // you picked one, which reads as "no such car".
      const others = SPEC_FACETS.filter((o) => o.key !== f.key && tests[o.key]);
      const counts = new Map<string, number>();
      for (const r of specPool) {
        const v = get(r);
        if (v === undefined || !others.every((o) => tests[o.key]!(r))) continue;
        counts.set(v, (counts.get(v) ?? 0) + 1);
      }
      const values: FacetGroup["values"] = [...seen].map((v) => ({
        v,
        label: `${v}${f.unit}`,
        n: counts.get(v) ?? 0,
      }));
      // Numbers read in their own order; trims have none, so the deepest stock
      // leads and anything ruled out falls to the end.
      if (f.key === "trim") values.sort((a, b) => b.n - a.n || a.v.localeCompare(b.v));
      else values.sort((a, b) => Number(a.v) - Number(b.v));
      // Which values survive the cap is a question of stock, not of order.
      const keep = new Set(
        [...values]
          .sort((a, b) => b.n - a.n)
          .slice(0, FACET_CAP)
          .map((v) => v.v)
      );
      for (const v of values) v.top = keep.has(v.v);
      facets.push({ key: f.key, label: f.label, values });
    }

    return { results, dist, relief, activeCount: activeKeys.length, facets };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- s() reads sp, listed
  }, [rows, sp, origin, tally]);

  // 5,000 cards in one document is not a page anyone can use, and the cards
  // are photo-first. One screenful of grid at a time, paged through the URL.
  const PAGE_SIZE = 60;
  const pageCount = Math.max(1, Math.ceil(results.length / PAGE_SIZE));
  const page = Math.min(Math.max(1, n("page") ?? 1), pageCount);
  const shown = results.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const goPage = (p: number) => {
    const params = new URLSearchParams(sp.toString());
    if (p > 1) params.set("page", String(p));
    else params.delete("page");
    pushUrl(params);
    window.scrollTo(0, 0);
  };

  const PAGE_BTN = "px-5 py-4 text-[13px] font-extrabold tracking-[0.06em] uppercase focus:outline-none focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-cobalt";

  return (
    <div className="mx-auto max-w-[1400px] px-0 sm:px-6 sm:py-6">
      <div className="border-t-[3px] border-l-[3px] border-ink">
        <div className="border-r-[3px] border-ink">
          <SearchBar suggestions={suggestions} />
        </div>
        <PopularBand popular={popular} q={q} />
      </div>

      <FilterRail makesModels={makesModels} inferred={inferred} count={rows === null ? undefined : results.length} />

      <SpecFacets facets={facets} />

      {rows === null ? (
        failed ? (
          <div className="border-t-[3px] border-l-[3px] border-ink">
            <div className={`${CELL} bg-vermilion px-6 py-8 text-paper`}>
              <p className="text-[26px] leading-[1.1] font-extrabold tracking-[-0.025em]">
                Couldn&apos;t load the inventory.{" "}
                <button type="button" className="underline" onClick={() => window.location.reload()}>
                  Try again
                </button>
              </p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 border-t-[3px] border-l-[3px] border-ink sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} className={`${CELL} animate-pulse`} aria-hidden="true">
                <div className="aspect-[3/2] border-b-[3px] border-ink bg-putty" />
                <div className="h-[118px] bg-paper" />
              </div>
            ))}
          </div>
        )
      ) : results.length > 0 ? (
        <>
          <div className="grid grid-cols-1 border-t-[3px] border-l-[3px] border-ink sm:grid-cols-2 lg:grid-cols-3">
            {shown.map((r, i) => (
              <ListingCard key={r.id} r={r} distanceMi={dist.get(r.id)} index={i} grounds={grounds} />
            ))}
          </div>

          <div className="flex flex-wrap border-l-[3px] border-ink">
            {page > 1 && (
              <button type="button" onClick={() => goPage(page - 1)} className={`${CELL} bg-paper hover:bg-putty ${PAGE_BTN}`}>
                ← Previous
              </button>
            )}
            <span className={`${CELL} flex flex-1 items-center bg-paper px-5 py-4 text-[12.5px] font-bold tracking-[0.06em] text-ink/60 uppercase tabular-nums`}>
              {(page - 1) * PAGE_SIZE + 1}–{(page - 1) * PAGE_SIZE + shown.length} of {results.length.toLocaleString()}
            </span>
            {page < pageCount && (
              <button type="button" onClick={() => goPage(page + 1)} className={`${CELL} bg-ink text-paper hover:bg-cobalt ${PAGE_BTN}`}>
                Next {Math.min(PAGE_SIZE, results.length - page * PAGE_SIZE)} →
              </button>
            )}
          </div>
        </>
      ) : (
        <div className="border-t-[3px] border-l-[3px] border-ink">
          <div className={`${CELL} bg-vermilion px-6 py-8 text-paper`}>
            <p className="text-[26px] leading-[1.1] font-extrabold tracking-[-0.025em]">
              Nothing matches all {activeCount} filter{activeCount === 1 ? "" : "s"}.
              {relief[0] && relief[0].n > 0 ? (
                <>
                  <br />
                  Drop {relief[0].label.toLowerCase()} and you get {relief[0].n}.
                </>
              ) : null}
            </p>
          </div>
          <div className="flex flex-wrap">
            {relief.map((r) => (
              <span
                key={r.key}
                className={`${CELL} px-4 py-3 text-[12.5px] font-extrabold tracking-[0.04em] uppercase ${
                  r.n > 0 ? "bg-saffron text-ink" : "bg-paper text-ink/50"
                }`}
              >
                {r.label} → {r.n}
              </span>
            ))}
            <span className={`${CELL} flex-1 min-w-[40px] bg-paper`} aria-hidden="true" />
          </div>
        </div>
      )}
    </div>
  );
}
