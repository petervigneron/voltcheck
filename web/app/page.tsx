import Link from "next/link";
import { allListings } from "@/lib/listings/source";
import { enrichListing, type EnrichedListing } from "@/lib/listings/enrich";
import { ListingCard } from "@/components/ListingCard";
import { SearchBar, FilterRail } from "@/components/Filters";
import { REMOVABLE, describeFilter } from "@/lib/filters";
import { hasRealPrice } from "@/lib/listings/price";
import { featuredKey } from "@/lib/listings/featured";
import { milesBetween, zipCoords } from "@/lib/geo";

const CELL = "border-r-[3px] border-b-[3px] border-ink";

// The band under the search box: the four deepest models in inventory, each a
// one-click search. Deep inventory is the popularity signal we actually have.
const BAND_GROUNDS = ["bg-saffron", "bg-putty", "bg-putty", "bg-teal text-paper"];

export default async function Browse(props: PageProps<"/">) {
  const sp = await props.searchParams;
  const s = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
  const n = (k: string) => Number(s(k)) || undefined;

  const q = s("q").toLowerCase().trim();
  const make = s("make");
  const model = s("model");
  const cond = s("cond");
  const drive = s("drive");
  const minPrice = n("minPrice");
  const maxPrice = n("maxPrice");
  const minYear = n("minYear");
  const maxYear = n("maxYear");
  const maxMiles = n("maxMiles");
  const minRange = n("minRange");
  const heatPump = s("heatPump") === "1";
  const zip = s("zip");
  const radius = s("radius") || "50";
  const sort = s("sort") || "featured";
  const origin = zipCoords(zip);

  const listings = await allListings();
  const all = listings.map(enrichListing);

  const makesModels: Record<string, string[]> = {};
  for (const l of listings) {
    (makesModels[l.make] ??= []).push(l.model);
  }
  for (const k of Object.keys(makesModels)) makesModels[k] = [...new Set(makesModels[k])].sort();

  // Per-model tally, case-insensitive because dealer feeds disagree on casing
  // ("Nissan ARIYA" / "Nissan Ariya"); the most common form is the display one.
  const tally = new Map<string, { count: number; forms: Map<string, { make: string; model: string; n: number }> }>();
  for (const l of listings) {
    const form = `${l.make} ${l.model}`;
    const t = tally.get(form.toLowerCase()) ?? { count: 0, forms: new Map() };
    t.count += 1;
    const f = t.forms.get(form) ?? { make: l.make, model: l.model, n: 0 };
    f.n += 1;
    t.forms.set(form, f);
    tally.set(form.toLowerCase(), t);
  }
  const canon = [...tally.values()]
    .map((t) => {
      const best = [...t.forms.values()].sort((a, b) => b.n - a.n)[0];
      return { make: best.make, model: best.model, count: t.count };
    })
    .sort((a, b) => b.count - a.count);
  const popular = canon.slice(0, 4);
  // A model listed once is as likely a feed typo as a car — not suggestion material.
  const suggestions = canon.filter((c) => c.count >= 2).map((c) => ({ label: `${c.make} ${c.model}`, count: c.count }));

  const dist = new Map<string, number>();
  if (origin) {
    for (const e of all) {
      const c = zipCoords(e.listing.zip);
      if (c) dist.set(e.listing.id, Math.round(milesBetween(origin, c)));
    }
  }

  // Each active filter is its own predicate, which is what lets an empty result
  // say how many cars dropping any single one would give back.
  const tests: Partial<Record<(typeof REMOVABLE)[number], (e: EnrichedListing) => boolean>> = {};
  if (origin && radius !== "any") {
    tests.zip = (e) => {
      const d = dist.get(e.listing.id);
      return d !== undefined && d <= Number(radius);
    };
  }
  if (q) {
    tests.q = (e) => {
      const l = e.listing;
      const hay = `${l.year} ${l.make} ${l.model} ${l.trim ?? ""} ${l.exteriorColor ?? ""}`.toLowerCase();
      return q.split(/\s+/).every((tok) => hay.includes(tok));
    };
  }
  if (make) tests.make = (e) => e.listing.make === make;
  if (model) tests.model = (e) => e.listing.model === model;
  if (cond === "new") tests.cond = (e) => e.listing.condition === "new";
  else if (cond === "used")
    tests.cond = (e) => e.listing.condition === "used" || e.listing.condition === "certified" || !e.listing.condition;
  if (drive) tests.drive = (e) => e.listing.drive === drive;
  // A price filter is about price, so a car whose feed gave us a lease payment
  // instead of one can't satisfy it either way.
  if (minPrice) tests.minPrice = (e) => hasRealPrice(e.listing) && e.listing.priceUsd >= minPrice;
  if (maxPrice) tests.maxPrice = (e) => hasRealPrice(e.listing) && e.listing.priceUsd <= maxPrice;
  if (minYear) tests.minYear = (e) => e.listing.year >= minYear;
  if (maxYear) tests.maxYear = (e) => e.listing.year <= maxYear;
  if (maxMiles) tests.maxMiles = (e) => e.listing.mileage != null && e.listing.mileage <= maxMiles;
  if (minRange) tests.minRange = (e) => !!e.realRangeMi && e.realRangeMi.value >= minRange;
  if (heatPump) tests.heatPump = (e) => e.heatPump?.status === "yes";

  const activeKeys = REMOVABLE.filter((k) => tests[k]);
  const matches = (e: EnrichedListing, skip?: string) => activeKeys.every((k) => k === skip || tests[k]!(e));

  const results = all.filter((e) => matches(e));

  // Cars without a usable price sort to the end either way — they can't lead a
  // price-sorted page in either direction.
  const priceKey = (e: EnrichedListing, low: boolean) =>
    hasRealPrice(e.listing) ? e.listing.priceUsd : low ? Infinity : -Infinity;

  // Anything that isn't an explicit sort falls back to the featured order.
  const explicitSorts = new Set(["price", "price-desc", "year-desc", "miles", "range-desc", ...(origin ? ["distance"] : [])]);
  // eslint-disable-next-line react-hooks/purity -- server-rendered per request; the once-a-day reshuffle is the point
  const day = Math.floor(Date.now() / 86400000);
  const feat = explicitSorts.has(sort)
    ? null
    : new Map(
        all.map((e) => [
          e.listing.id,
          featuredKey(e, tally.get(`${e.listing.make} ${e.listing.model}`.toLowerCase())?.count ?? 0, day),
        ])
      );

  results.sort((a, b) => {
    if (origin && sort === "distance") {
      return (dist.get(a.listing.id) ?? Infinity) - (dist.get(b.listing.id) ?? Infinity);
    }
    switch (sort) {
      case "price":
        return priceKey(a, true) - priceKey(b, true);
      case "price-desc":
        return priceKey(b, false) - priceKey(a, false);
      case "year-desc":
        return b.listing.year - a.listing.year || a.listing.priceUsd - b.listing.priceUsd;
      case "miles":
        return (a.listing.mileage ?? Infinity) - (b.listing.mileage ?? Infinity);
      case "range-desc":
        return (b.realRangeMi?.value ?? -1) - (a.realRangeMi?.value ?? -1);
      default:
        return (feat!.get(b.listing.id) ?? -Infinity) - (feat!.get(a.listing.id) ?? -Infinity);
    }
  });

  // What each filter is costing, only worth computing when nothing matched.
  const relief =
    results.length === 0
      ? activeKeys
          .map((k) => ({
            key: k,
            label: describeFilter(k, s(k)) ?? k,
            n: all.filter((e) => matches(e, k)).length,
          }))
          .sort((a, b) => b.n - a.n)
      : [];

  // 5,000 cards in one document is not a page anyone can use, and the cards are
  // photo-first now. One screenful of grid at a time, paged through the URL.
  const PAGE_SIZE = 60;
  const pageCount = Math.max(1, Math.ceil(results.length / PAGE_SIZE));
  const page = Math.min(Math.max(1, n("page") ?? 1), pageCount);
  const shown = results.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const pageHref = (p: number) => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(sp)) if (typeof v === "string" && k !== "page") params.set(k, v);
    if (p > 1) params.set("page", String(p));
    const qs = params.toString();
    return qs ? `/?${qs}` : "/";
  };

  // Shortcut hrefs keep every other filter; a new search resets paging.
  const modelHref = (label: string, pressed: boolean) => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(sp)) if (typeof v === "string" && k !== "page" && k !== "q") params.set(k, v);
    if (!pressed) params.set("q", label);
    const qs = params.toString();
    return qs ? `/?${qs}` : "/";
  };

  return (
    <div className="mx-auto max-w-[1400px] px-0 sm:px-6 sm:py-6">
      <div className="border-t-[3px] border-l-[3px] border-ink">
        <div className="border-r-[3px] border-ink">
          <SearchBar suggestions={suggestions} />
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4">
          {popular.map((p, i) => {
            const label = `${p.make} ${p.model}`;
            const pressed = q === label.toLowerCase();
            return (
              <Link
                key={label}
                href={modelHref(label, pressed)}
                title={pressed ? `Stop showing only ${label}` : `Show every ${label}`}
                className={`${CELL} flex flex-col px-5 py-3 hover:ring-[3px] hover:ring-inset hover:ring-cobalt ${
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
              </Link>
            );
          })}
        </div>
      </div>

      <FilterRail makesModels={makesModels} />

      {results.length > 0 ? (
        <>
          <div className="grid grid-cols-1 border-t-[3px] border-l-[3px] border-ink sm:grid-cols-2 lg:grid-cols-3">
            {shown.map((e, i) => (
              <ListingCard key={e.listing.id} e={e} distanceMi={dist.get(e.listing.id)} index={i} />
            ))}
          </div>

          <div className="flex flex-wrap border-l-[3px] border-ink">
            {page > 1 && (
              <Link
                href={pageHref(page - 1)}
                className={`${CELL} bg-paper px-5 py-4 text-[13px] font-extrabold tracking-[0.06em] uppercase hover:bg-putty`}
              >
                ← Previous
              </Link>
            )}
            <span className={`${CELL} flex flex-1 items-center bg-paper px-5 py-4 text-[12.5px] font-bold tracking-[0.06em] text-ink/60 uppercase tabular-nums`}>
              {(page - 1) * PAGE_SIZE + 1}–{(page - 1) * PAGE_SIZE + shown.length} of {results.length.toLocaleString()}
            </span>
            {page < pageCount && (
              <Link
                href={pageHref(page + 1)}
                className={`${CELL} bg-ink px-5 py-4 text-[13px] font-extrabold tracking-[0.06em] text-paper uppercase hover:bg-cobalt`}
              >
                Next {Math.min(PAGE_SIZE, results.length - page * PAGE_SIZE)} →
              </Link>
            )}
          </div>
        </>
      ) : (
        <div className="border-t-[3px] border-l-[3px] border-ink">
          <div className={`${CELL} bg-vermilion px-6 py-8 text-paper`}>
            <p className="text-[26px] leading-[1.1] font-extrabold tracking-[-0.025em]">
              Nothing matches all {activeKeys.length} filter{activeKeys.length === 1 ? "" : "s"}.
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
