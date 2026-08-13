import Link from "next/link";
import { allListings } from "@/lib/listings/source";
import { enrichListing, type EnrichedListing } from "@/lib/listings/enrich";
import { ListingCard } from "@/components/ListingCard";
import { SearchBar, FilterRail } from "@/components/Filters";
import { REMOVABLE, describeFilter } from "@/lib/filters";
import { hasRealPrice } from "@/lib/listings/price";
import { milesBetween, zipCoords } from "@/lib/geo";

const CELL = "border-r-[3px] border-b-[3px] border-ink";

function Stat({ label, value, className = "" }: { label: string; value: string; className?: string }) {
  return (
    <div className={`${CELL} flex flex-col px-5 py-3 ${className}`}>
      <span className="text-[10.5px] font-extrabold tracking-[0.14em] uppercase">{label}</span>
      <span className="text-[19px] font-extrabold tracking-[-0.02em] tabular-nums">{value}</span>
    </div>
  );
}

export default async function Browse(props: PageProps<"/">) {
  const sp = await props.searchParams;
  const s = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
  const n = (k: string) => Number(s(k)) || undefined;

  const q = s("q").toLowerCase().trim();
  const make = s("make");
  const model = s("model");
  const cond = s("cond");
  const drive = s("drive");
  const sort = s("sort") || "price";
  const minPrice = n("minPrice");
  const maxPrice = n("maxPrice");
  const minYear = n("minYear");
  const maxYear = n("maxYear");
  const maxMiles = n("maxMiles");
  const minRange = n("minRange");
  const heatPump = s("heatPump") === "1";
  const zip = s("zip");
  const radius = s("radius") || "50";
  const origin = zipCoords(zip);

  const listings = await allListings();
  const all = listings.map(enrichListing);

  const makesModels: Record<string, string[]> = {};
  for (const l of listings) {
    (makesModels[l.make] ??= []).push(l.model);
  }
  for (const k of Object.keys(makesModels)) makesModels[k] = [...new Set(makesModels[k])].sort();

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

  results.sort((a, b) => {
    if (origin && sort === "distance") {
      return (dist.get(a.listing.id) ?? Infinity) - (dist.get(b.listing.id) ?? Infinity);
    }
    switch (sort) {
      case "price-desc":
        return priceKey(b, false) - priceKey(a, false);
      case "year-desc":
        return b.listing.year - a.listing.year || a.listing.priceUsd - b.listing.priceUsd;
      case "miles":
        return (a.listing.mileage ?? Infinity) - (b.listing.mileage ?? Infinity);
      case "range-desc":
        return (b.realRangeMi?.value ?? -1) - (a.realRangeMi?.value ?? -1);
      default:
        return priceKey(a, true) - priceKey(b, true);
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

  const longRange = all.filter((e) => (e.realRangeMi?.value ?? 0) >= 200).length;
  const prices = results
    .filter((e) => hasRealPrice(e.listing))
    .map((e) => e.listing.priceUsd)
    .sort((a, b) => a - b);
  const median = prices.length ? prices[Math.floor(prices.length / 2)] : null;

  return (
    <div className="mx-auto max-w-[1400px] px-0 sm:px-6 sm:py-6">
      <div className="border-t-[3px] border-l-[3px] border-ink">
        <div className="border-r-[3px] border-ink">
          <SearchBar />
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4">
          <Stat label="Cars listed" value={all.length.toLocaleString()} className="bg-saffron" />
          <Stat label="Matching now" value={results.length.toLocaleString()} className="bg-putty" />
          <Stat label="200+ mile range" value={longRange.toLocaleString()} className="bg-putty" />
          <Stat
            label={median ? "Median of these" : "Median price"}
            value={median ? `$${median.toLocaleString()}` : "—"}
            className="bg-teal text-paper"
          />
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
