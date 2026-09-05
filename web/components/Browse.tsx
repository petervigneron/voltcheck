"use client";

import { useEffect, useMemo, useReducer } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ListingCard, type GroundsMode } from "./ListingCard";
import { SearchBar, FilterRail, SpecFacets, type FacetGroup } from "./Filters";
import { AlertSignup } from "./AlertSignup";
import { SPEC_FACETS, FACET_CAP, QUICK_TOGGLES, describeFilter, dropSpecFilters } from "@/lib/filters";
import { featuredScore, type CardRow } from "@/lib/listings/card";
import { FIRST_PAGE_SIZE } from "@/lib/listings/firstPaint";
import { FACET_OF, QUICK_KNOWS, activeFilterKeys, buildTests, rowMatches } from "@/lib/listings/match";
import { modelTally } from "@/lib/listings/tally";
import { narrowFacets } from "@/lib/listings/narrow";
import { facetsFor } from "@/lib/listings/facetSpec";
import { factLinksFor, type FactLink } from "@/lib/facts/links";
import { firstPaintWonRace, useCardIndex, useFirstPaint } from "@/lib/listings/useCardIndex";
import { milesBetween } from "@/lib/geo";
import { pushUrl } from "@/lib/pushUrl";
import { useProState } from "@/lib/useProState";
import { rememberBrowseQuery } from "@/lib/browseState";

const CELL = "border-r-[3px] border-b-[3px] border-ink";

// The band under the search box: four of the twelve deepest models in
// inventory, each a one-click search, rotating daily so the front door doesn't
// read the same forever. Deep inventory is the popularity signal we actually
// have.
const BAND_GROUNDS = ["bg-saffron", "bg-putty", "bg-putty", "bg-teal text-paper"];
const BAND_SIZE = 4;

// The inventory index hook lives in lib/listings/useCardIndex.ts — /saved
// reads the same module-level cache, so the two pages share one download.

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

// How many models get their fact-sheet links per session before the nav goes
// quiet. The links repeat two of the same questions on every narrowed search,
// and by the fourth model they read as ads, not answers (owner, 2026-08-31).
// A model that already showed its links keeps them, so returning to a search
// never retracts what it said.
const FACT_LINK_MODELS_PER_SESSION = 3;
const FACT_LINK_SEEN_KEY = "vc-fact-links-models";

// Module cache over sessionStorage, so the render-time read stays pure and
// repeatable; writes go through recordFactLinkModel from an effect, only for
// renders that committed. sessionStorage can throw (private windows, storage
// off) — the links showing every time is the pre-cap behavior, not a failure.
let factLinkSeen: Set<string> | null = null;
function factLinkModelsSeen(): Set<string> {
  if (factLinkSeen === null) {
    try {
      factLinkSeen = new Set(JSON.parse(sessionStorage.getItem(FACT_LINK_SEEN_KEY) ?? "[]"));
    } catch {
      factLinkSeen = new Set();
    }
  }
  return factLinkSeen;
}
function recordFactLinkModel(model: string): void {
  const seen = factLinkModelsSeen();
  if (seen.has(model)) return;
  seen.add(model);
  try {
    sessionStorage.setItem(FACT_LINK_SEEN_KEY, JSON.stringify([...seen]));
  } catch {
    // The module cache still holds it for this page's lifetime.
  }
}

function FactLinksNav({ links, model }: { links: FactLink[]; model: string }) {
  // Short-circuits keep the storage read off the server render, where links
  // are always empty (the index only lands client-side).
  const seen = links.length > 0 && model ? factLinkModelsSeen() : null;
  const show = seen !== null && (seen.has(model) || seen.size < FACT_LINK_MODELS_PER_SESSION);
  useEffect(() => {
    if (show) recordFactLinkModel(model);
  }, [show, model]);
  if (!show || links.length === 0) return null;
  return (
    <nav
      aria-label="Fact sheets"
      className="flex flex-wrap gap-x-6 gap-y-1.5 border-l-[3px] border-r-[3px] border-b-[3px] border-ink bg-paper px-5 py-3"
    >
      {links.map((l) => (
        <Link key={l.path} href={l.path} className="text-[13px] font-bold text-cobalt hover:underline">
          {l.label} →
        </Link>
      ))}
    </nav>
  );
}

export function Browse() {
  const sp = useSearchParams();
  const s = (k: string) => sp.get(k) ?? "";
  const n = (k: string) => Number(s(k)) || undefined;

  const q = s("q").toLowerCase().trim();
  const zip = s("zip");
  const radiusParam = s("radius");
  const radius = radiusParam || "50";
  const sort = s("sort") || "featured";
  // Whether this browser holds a Pro pass: it is what lets match.ts apply the
  // deals filter (?deal=1). Null while the answer is on its way, which reads
  // as "no" — a grid never filters on a pass it cannot yet see.
  const pro = useProState();
  const matchCtx = { pro: pro === true };
  // Cards sit on paper. ?grounds=fact is the prototype where a ground means
  // something (teal = new battery, violet = recent price cut); the old
  // one-in-five colour rhythm is gone (owner, 2026-09-03).
  const grounds: GroundsMode = s("grounds") === "fact" ? "fact" : "plain";

  // The first-paint fetch goes out before the index fetch — hook order is
  // request order, and the payload the first card waits on should never queue
  // behind 3 MB of shards.
  const first = useFirstPaint();
  const { rows, failed } = useCardIndex();
  // A typed ZIP always wins — even an invalid one, because "Near 00000"
  // measured from the IP instead would be a lie.
  const zipOrigin = useOrigin(zip);
  const ip = useIpOrigin();
  const origin = zip ? zipOrigin : ip?.loc;
  // "" = origin inferred but city unknown; undefined = no inferred origin.
  const inferred = !zip && ip ? ip.city : undefined;

  // Per-model tally (lib/listings/tally.ts, shared with the server's
  // first-paint build). Until the index lands, the first-paint payload's own
  // tally — computed by the same function over the same hourly index — stands
  // in, so the band, the suggestions, and the dropdowns work on arrival. Once
  // the index is here it takes over: the band's counts must agree with what
  // tapping the band returns, and only the index answers that.
  const own = useMemo(() => modelTally(rows ?? []), [rows]);
  const counts = own.counts;
  const { suggestions, popular, makesModels } = rows === null && first ? first : own;

  // The band's daily window into the popular pool. Keyed on the same day term
  // as the featured sort — the payload's day when we have one — so the server
  // artifact and the client's recompute pick the same four. An old payload
  // still carrying only four models rotates as a no-op.
  const band = useMemo(() => {
    if (popular.length <= BAND_SIZE) return popular;
    // eslint-disable-next-line react-hooks/purity -- the once-a-day rotation is the point
    const day = first?.day ?? Math.floor(Date.now() / 86400000);
    const start = (day * BAND_SIZE) % popular.length;
    return Array.from({ length: BAND_SIZE }, (_, i) => popular[(start + i) % popular.length]);
    // `first` can only change null -> loaded; see the results memo on why that
    // must not reshuffle a band the shopper is looking at.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [popular]);

  // The pristine landing state — no filters, featured order, page 1 — is the
  // one state the first-paint payload can answer for, because it's exactly
  // what the server rendered. The dummy distance context makes a zip/radius
  // param count as a filter whether or not an origin has resolved yet.
  const pristine =
    activeFilterKeys(buildTests(s, { ...matchCtx, distanceMi: () => undefined })).length === 0 &&
    sort === "featured" &&
    (n("page") ?? 1) === 1;
  const firstView = rows === null && !failed && pristine && first ? first : null;

  // Park the grid's current query string so a listing detail page can send the
  // shopper back to these exact results, not an unfiltered page one
  // (lib/browseState.ts, components/BackToResults.tsx).
  useEffect(() => {
    rememberBrowseQuery(sp.toString());
  }, [sp]);

  const { results, dist, relief, activeCount, facets, quickCounts, factLinks, factModel, narrow } = useMemo(() => {
    const all = rows ?? [];

    const dist = new Map<string, number>();
    if (origin) {
      for (const r of all) if (r.loc) dist.set(r.id, Math.round(milesBetween(origin, r.loc)));
    }

    // The predicates themselves live in lib/listings/match.ts, shared with
    // the alert sender so an email can never fire on a car this grid
    // wouldn't show. Distance context: only an actual origin filters.
    const tests = buildTests(s, { ...matchCtx, distanceMi: origin ? (r) => dist.get(r.id) : undefined });

    const activeKeys = activeFilterKeys(tests);
    const matches = (r: CardRow, skip?: string) => rowMatches(tests, r, skip);

    // rowMatches re-derives the active keys on every call, which is free for
    // the alert sender's handful of rows and 71k throwaway arrays here. The
    // predicates are the same ones; the filter that runs on every keystroke
    // takes them already resolved.
    const activeTests = activeKeys.map((k) => tests[k]!);
    const results = all.filter((r) => activeTests.every((t) => t(r)));

    // Cars without a usable price sort to the end either way — they can't
    // lead a price-sorted page in either direction.
    const priceKey = (r: CardRow, low: boolean) => (r.realPrice ? r.priceUsd : low ? Infinity : -Infinity);

    // Anything that isn't an explicit sort falls back to the featured order;
    // the day term reshuffles it once a day, not on every render.
    const explicitSorts = new Set(["price", "price-desc", "year-desc", "miles", "range-desc", ...(origin ? ["distance"] : [])]);
    // The server's first paint and this recompute must score with the same day
    // term, or a payload rendered before UTC midnight and a sort after it
    // would reorder the grid under the shopper. So the payload's day wins for
    // the session whenever we have one; the local clock is only for visitors
    // the payload never reached.
    // eslint-disable-next-line react-hooks/purity -- the once-a-day reshuffle is the point
    const day = first?.day ?? Math.floor(Date.now() / 86400000);
    // The haystack includes paint, and paint borrows brand names: "lucid"
    // matches 71 Hyundais in Lucid Blue against 68 actual Lucids, and the
    // Hyundais outranked them. A car whose year/make/model/trim matches the
    // words typed is what was meant; a colour match is a bonus hit, not the
    // answer. Ranking only — nothing is filtered out, and an explicit sort
    // still wins outright.
    const qToks = q ? q.split(/\s+/) : [];
    const identityHit = (r: CardRow) =>
      qToks.length > 0 && qToks.every((tok) => r.title.toLowerCase().includes(tok));

    if (explicitSorts.has(sort)) {
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
          default:
            return (b.rangeMi ?? -1) - (a.rangeMi ?? -1);
        }
      });
    } else {
      // Score once per row, then sort on the number. The scores used to go into
      // a Map keyed by listing id and be looked up twice per comparison —
      // 71k string-hash inserts to build it (over every car, not just the ones
      // that matched) and ~2M lookups to use it, which is most of what the
      // grid spent between a keystroke and a repaint. Same order, measured
      // identical over the full feed: 145ms -> 49ms unfiltered, 33ms -> 2ms on
      // a search that leaves a few thousand cars.
      //
      // If the shopper is looking at the first-paint page when the index
      // lands, that page's cards are pinned to the front in that exact order.
      // On the same hour's index the recompute reproduces the server's page
      // anyway and the pin is a no-op; the pin is for the mixed-vintage case —
      // first paint from one hourly build, shards from the next — where a
      // slightly different tally would otherwise reshuffle the grid under the
      // shopper. (A pinned car the fresher index no longer carries simply
      // isn't in `results` — delisted beats stable.) Filters lift the pin:
      // a filtered order is being asked for, not swapped underneath anyone.
      // And a payload that lost the race to the index never pins at all —
      // adopting its order mid-session would repage a grid the shopper has
      // already been paging under the index's own ordering.
      const pin =
        first && firstPaintWonRace() && activeKeys.length === 0
          ? new Map(first.rows.map((r, i) => [r.id, i]))
          : null;
      const scored = results.map((r) => ({
        r,
        k:
          pin?.has(r.id)
            ? 1e6 - pin.get(r.id)!
            : featuredScore(r, counts.get(`${r.make} ${r.model}`.toLowerCase()) ?? 0, day) +
              (identityHit(r) ? 1000 : 0),
      }));
      scored.sort((a, b) => b.k - a.k);
      for (let i = 0; i < scored.length; i++) results[i] = scored[i].r;
    }

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

    // What each quick toggle would leave, and out of how many cars it can
    // actually judge — counted against everything else that's on, with its own
    // key lifted the way the spec facets lift theirs, so a toggle still counts
    // honestly when the panel has set that key to some other value.
    //
    // `of` deliberately excludes cars with no answer on that axis
    // (QUICK_KNOWS). A toggle that "excludes" 19 Lightnings only because their
    // range was never resolved has divided nothing about range, and the rail
    // must not read that as the button doing work. The rail turns n/of into
    // the show-or-hide call (components/Filters.tsx).
    const quickCounts: Record<string, { n: number; of: number }> = {};
    for (const t of QUICK_TOGGLES) {
      // Built with the same context as the grid's own tests, so a Pro-only
      // toggle (rebate, since 01ad0a8) gets a count for a pass-holder. For
      // anyone else the builder returns no test for it, and the toggle gets
      // no count — which is how the rail hides it. Calling the missing test
      // crashed the whole browse page ("test is not a function") for every
      // visitor on main between 01ad0a8 and this commit.
      const test = buildTests((k) => (k === t.key ? t.value : ""), matchCtx)[t.key];
      if (!test) continue;
      const knows = QUICK_KNOWS[t.key];
      const pool = activeKeys.includes(t.key)
        ? all.filter((r) => activeKeys.every((k) => k === t.key || tests[k]!(r)))
        : results;
      let n = 0;
      let of = 0;
      for (const r of pool) {
        if (knows && !knows(r)) continue;
        of++;
        if (test(r)) n++;
      }
      quickCounts[`${t.key}=${t.value}`] = { n, of };
    }

    // "Which version of this car?" is only a question once there's one car in
    // question, so the spec rail is keyed on the results — however they got
    // narrowed — being a single model. The pool it describes is everything the
    // other filters allow, with the spec facets themselves lifted: the rail has
    // to keep offering the versions you didn't pick, not just the one you did.
    // `drive` is lifted alongside the model-scoped facet keys: on a model
    // whose curated rail offers a drivetrain row (lib/listings/facetSpec.ts),
    // picking AWD must not empty the row of the RWD it still has to offer.
    const specKeys = new Set<string>([...SPEC_FACETS.map((f) => f.key), "drive"]);
    const base = all.filter((r) => activeKeys.every((k) => specKeys.has(k) || tests[k]!(r)));

    const byModel = new Map<string, CardRow[]>();
    for (const r of base) {
      // Case-insensitive, same as the tally above: feeds disagree on casing
      // ("MODEL 3" / "Model 3") and one model's cars belong in one group.
      const k = `${r.make} ${r.model}`.toLowerCase();
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
    // Which axes, in what order, is the model's call (facetSpec.ts curates,
    // SPEC_FACETS is the standing default); whether each row renders is still
    // the data's call, via the two-distinct-values gate below.
    const facetDefs = specPool.length ? facetsFor(specPool[0].make, specPool[0].model) : [];
    for (const f of facetDefs) {
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
      const others = facetDefs.filter((o) => o.key !== f.key && tests[o.key]);
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
      // Numbers read in their own order; trims and drivetrains have none, so
      // the deepest stock leads and anything ruled out falls to the end.
      if (f.key === "trim" || f.key === "drive") values.sort((a, b) => b.n - a.n || a.v.localeCompare(b.v));
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

    // Fact-sheet links ride the same gate as the spec rail: the results are
    // one model, so the sheets that answer for that model belong on the page.
    const factLinks: FactLink[] = specPool.length ? factLinksFor(specPool[0].make, specPool[0].model) : [];
    const factModel = specPool.length ? `${specPool[0].make} ${specPool[0].model}`.toLowerCase() : "";

    // Which make, then which model, a filtered result spans — the rows the
    // owner asked for on 2026-09-05, when a pressed toggle left thousands of
    // cars and the only way to a make was the panel's <select>. Counted
    // against everything else that's on (lib/listings/narrow.ts).
    const narrow = narrowFacets(all, tests, activeKeys, s, makesModels);

    return { results, dist, relief, activeCount: activeKeys.length, facets, quickCounts, factLinks, factModel, narrow };
    // `first` is read but deliberately not a dependency: it can only change
    // once (null -> loaded), and if that happens after the index already
    // painted, re-sorting a grid the shopper is looking at is exactly the
    // reshuffle this file works to prevent. The next interaction re-runs the
    // memo and picks it up.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- s() reads sp, listed
  }, [rows, sp, origin, counts, pro, makesModels]);

  // 5,000 cards in one document is not a page anyone can use, and the cards
  // are photo-first. One screenful of grid at a time, paged through the URL.
  // The size is the first-paint payload's, so the server's slice IS page one.
  const PAGE_SIZE = FIRST_PAGE_SIZE;
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
        <PopularBand popular={band} q={q} />
      </div>

      {/* Both counts wait on an answer: "0 cars" and a rail stripped of every
          toggle are wrong answers while loading, not pending ones. In the
          pristine state the first-paint payload already holds the answer —
          computed over the same hourly index, so it is the count, not a guess.
          A filtered arrival has no answer until the index lands. */}
      <FilterRail
        makesModels={makesModels}
        inferred={inferred}
        count={rows !== null ? results.length : firstView ? firstView.total : undefined}
        quickCounts={rows !== null ? quickCounts : firstView ? firstView.quick : undefined}
        pro={pro}
      />

      <SpecFacets facets={facets} narrow={narrow} />

      <FactLinksNav links={factLinks} model={factModel} />

      {firstView ? (
        // The first-paint grid: the same 60 cards, in the same order, that the
        // full computation below reproduces once the index lands — so the
        // handoff is invisible. Paging or filtering away from here before then
        // gets the honest pending skeleton, never a result computed from 60
        // cards standing in for the country.
        <>
          <div className="grid grid-cols-1 border-t-[3px] border-l-[3px] border-ink sm:grid-cols-2 lg:grid-cols-3">
            {firstView.rows.map((r, i) => (
              <ListingCard
                key={r.id}
                r={r}
                distanceMi={origin && r.loc ? Math.round(milesBetween(origin, r.loc)) : undefined}
                index={i}
                grounds={grounds}
                pro={pro}
              />
            ))}
          </div>
          <div className="flex flex-wrap border-l-[3px] border-ink">
            <span className={`${CELL} flex flex-1 items-center bg-paper px-5 py-4 text-[12.5px] font-bold tracking-[0.06em] text-ink/60 uppercase tabular-nums`}>
              1–{firstView.rows.length} of {firstView.total.toLocaleString()}
            </span>
            {firstView.total > PAGE_SIZE && (
              <button type="button" onClick={() => goPage(2)} className={`${CELL} bg-ink text-paper hover:bg-cobalt ${PAGE_BTN}`}>
                Next {Math.min(PAGE_SIZE, firstView.total - PAGE_SIZE)} →
              </button>
            )}
          </div>
          <AlertSignup />
        </>
      ) : rows === null ? (
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
              <ListingCard key={r.id} r={r} distanceMi={dist.get(r.id)} index={i} grounds={grounds} pro={pro} />
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

          <AlertSignup />
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
          {/* Zero matches is the strongest alert case: "tell me when one appears". */}
          <AlertSignup />
        </div>
      )}
    </div>
  );
}
