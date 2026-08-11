import { allListings } from "@/lib/listings/source";
import { enrichListing } from "@/lib/listings/enrich";
import { ListingCard } from "@/components/ListingCard";
import { Filters, SortSelect } from "@/components/Filters";
import { milesBetween, zipCoords } from "@/lib/geo";

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

  const results = all.filter((e) => {
    const l = e.listing;
    if (origin && radius !== "any") {
      const d = dist.get(l.id);
      if (d === undefined || d > Number(radius)) return false;
    }
    if (q) {
      const hay = `${l.year} ${l.make} ${l.model} ${l.trim ?? ""} ${l.exteriorColor ?? ""}`.toLowerCase();
      if (!q.split(/\s+/).every((tok) => hay.includes(tok))) return false;
    }
    if (make && l.make !== make) return false;
    if (model && l.model !== model) return false;
    if (cond === "new" && l.condition !== "new") return false;
    if (cond === "used" && !(l.condition === "used" || l.condition === "certified" || !l.condition)) return false;
    if (drive && l.drive !== drive) return false;
    if (minPrice && l.priceUsd < minPrice) return false;
    if (maxPrice && l.priceUsd > maxPrice) return false;
    if (minYear && l.year < minYear) return false;
    if (maxYear && l.year > maxYear) return false;
    if (maxMiles && (l.mileage == null || l.mileage > maxMiles)) return false;
    if (minRange && !(e.realRangeMi && e.realRangeMi.value >= minRange)) return false;
    if (heatPump && e.heatPump?.status !== "yes") return false;
    return true;
  });

  results.sort((a, b) => {
    if (origin && sort === "distance") {
      return (dist.get(a.listing.id) ?? Infinity) - (dist.get(b.listing.id) ?? Infinity);
    }
    switch (sort) {
      case "price-desc":
        return b.listing.priceUsd - a.listing.priceUsd;
      case "year-desc":
        return b.listing.year - a.listing.year || a.listing.priceUsd - b.listing.priceUsd;
      case "miles":
        return (a.listing.mileage ?? Infinity) - (b.listing.mileage ?? Infinity);
      case "range-desc":
        return (b.realRangeMi?.value ?? -1) - (a.realRangeMi?.value ?? -1);
      default:
        return a.listing.priceUsd - b.listing.priceUsd;
    }
  });

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <div className="grid gap-6 md:grid-cols-[260px_1fr]">
        <aside className="h-fit rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 md:sticky md:top-4">
          <Filters makesModels={makesModels} />
        </aside>

        <div>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-xl font-bold tracking-tight">
                {results.length.toLocaleString()} electric {results.length === 1 ? "vehicle" : "vehicles"}
                {make ? ` · ${make}${model ? ` ${model}` : ""}` : ""}
              </h1>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Every car shows the EPA range and battery of the version it actually is — with sources.
              </p>
            </div>
            <SortSelect />
          </div>

          <div className="space-y-3">
            {results.map((e) => (
              <ListingCard key={e.listing.id} e={e} distanceMi={dist.get(e.listing.id)} />
            ))}
            {results.length === 0 && (
              <p className="rounded-xl border border-dashed border-zinc-300 dark:border-zinc-700 p-10 text-center text-sm text-zinc-500">
                No cars match these filters.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
