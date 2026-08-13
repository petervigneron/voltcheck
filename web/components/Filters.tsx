"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useState } from "react";
import { REMOVABLE, describeFilter } from "@/lib/filters";

const CELL = "border-r-[3px] border-b-[3px] border-ink";
const BLOCK = `${CELL} flex items-center gap-2 px-4 py-2.5 text-[13px] font-bold uppercase tracking-[0.04em]`;
const FIELD =
  "w-full border-[3px] border-ink bg-paper px-2.5 py-1.5 text-[13px] font-semibold text-ink focus:outline-none focus:ring-[3px] focus:ring-cobalt";
const FIELD_LABEL = "text-[10px] font-extrabold uppercase tracking-[0.14em] text-ink/55";

export function SearchBar() {
  const router = useRouter();
  const sp = useSearchParams();
  // Keyed on the URL's own value, so navigating back or clearing a filter
  // refills the box without an effect syncing two copies of the same string.
  const current = sp.get("q") ?? "";

  return (
    <form
      className="flex border-b-[3px] border-ink"
      onSubmit={(e) => {
        e.preventDefault();
        const q = String(new FormData(e.currentTarget).get("q") ?? "").trim();
        const params = new URLSearchParams(sp.toString());
        if (q) params.set("q", q);
        else params.delete("q");
        router.push(`/?${params.toString()}`);
      }}
    >
      <input
        key={current}
        name="q"
        defaultValue={current}
        aria-label="Search electric cars"
        placeholder="Make, model, or trim"
        className="min-w-0 flex-1 border-r-[3px] border-ink bg-paper px-5 py-4 text-[17px] font-medium text-ink placeholder:text-ink/40 focus:outline-none focus:ring-[3px] focus:ring-inset focus:ring-cobalt"
      />
      <button
        type="submit"
        className="bg-cobalt px-7 py-4 text-[15px] font-extrabold tracking-[0.06em] text-paper uppercase focus:outline-none focus:ring-[3px] focus:ring-inset focus:ring-ink"
      >
        Search
      </button>
    </form>
  );
}

export function FilterRail({ makesModels }: { makesModels: Record<string, string[]> }) {
  const router = useRouter();
  const sp = useSearchParams();
  const [open, setOpen] = useState(false);
  const get = (k: string) => sp.get(k) ?? "";

  const apply = useCallback(
    (updates: Record<string, string>) => {
      const params = new URLSearchParams(sp.toString());
      for (const [k, v] of Object.entries(updates)) {
        if (v) params.set(k, v);
        else params.delete(k);
      }
      if ("make" in updates) params.delete("model");
      router.push(`/?${params.toString()}`);
    },
    [router, sp]
  );

  const make = get("make");
  const models = make ? (makesModels[make] ?? []) : [];
  const makes = Object.keys(makesModels).sort();

  const active = REMOVABLE.flatMap((k) => {
    const v = get(k);
    if (!v) return [];
    const label = describeFilter(k, v);
    return label ? [{ key: k, label }] : [];
  });

  const heatPumpOn = get("heatPump") === "1";
  const rangeOn = get("minRange") === "200";

  return (
    <div className="border-t-[3px] border-l-[3px] border-ink">
      <div className="flex flex-wrap items-stretch">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className={`${BLOCK} bg-ink text-paper`}
        >
          {open ? "Close filters" : "All filters"}
          <span aria-hidden="true">{open ? "▲" : "▼"}</span>
        </button>

        {active.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => apply({ [f.key]: "" })}
            title={`Remove: ${f.label}`}
            className={`${BLOCK} bg-vermilion text-paper`}
          >
            {f.label}
            <span aria-hidden="true">✕</span>
          </button>
        ))}

        {!heatPumpOn && (
          <button type="button" onClick={() => apply({ heatPump: "1" })} className={`${BLOCK} bg-paper text-ink`}>
            Heat pump
          </button>
        )}
        {!rangeOn && (
          <button type="button" onClick={() => apply({ minRange: "200" })} className={`${BLOCK} bg-paper text-ink`}>
            200+ mi
          </button>
        )}

        {/* Pushes sort to the right on a wide rail; on a phone the rail wraps
            and an empty stretched cell just reads as a gap. */}
        <div className={`${CELL} hidden flex-1 min-w-[40px] bg-paper sm:block`} aria-hidden="true" />

        <div className={`${CELL} flex items-center bg-paper`}>
          <label className="sr-only" htmlFor="sort">
            Sort results
          </label>
          <select
            id="sort"
            value={get("sort") || "price"}
            onChange={(e) => apply({ sort: e.target.value })}
            className="h-full cursor-pointer appearance-none bg-transparent px-4 py-2.5 text-[13px] font-bold tracking-[0.04em] uppercase focus:outline-none focus:ring-[3px] focus:ring-inset focus:ring-cobalt"
          >
            <option value="price">Price ↑</option>
            <option value="price-desc">Price ↓</option>
            <option value="year-desc">Year: newest</option>
            <option value="miles">Mileage: lowest</option>
            <option value="range-desc">Range: highest</option>
            <option value="distance">Distance: nearest</option>
          </select>
        </div>
      </div>

      {open && (
        <div className={`${CELL} grid grid-cols-2 gap-4 bg-putty p-5 md:grid-cols-4`}>
          <label className="col-span-2 flex flex-col gap-1 md:col-span-1">
            <span className={FIELD_LABEL}>Make</span>
            <select className={FIELD} value={make} onChange={(e) => apply({ make: e.target.value })}>
              <option value="">All makes</option>
              {makes.map((m) => (
                <option key={m}>{m}</option>
              ))}
            </select>
          </label>

          <label className="col-span-2 flex flex-col gap-1 md:col-span-1">
            <span className={FIELD_LABEL}>Model</span>
            <select
              className={FIELD}
              value={get("model")}
              onChange={(e) => apply({ model: e.target.value })}
              disabled={!make}
            >
              <option value="">{make ? `All ${make} models` : "Choose a make first"}</option>
              {models.map((m) => (
                <option key={m}>{m}</option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className={FIELD_LABEL}>Near ZIP</span>
            <input
              className={FIELD}
              inputMode="numeric"
              maxLength={5}
              placeholder="94568"
              defaultValue={get("zip")}
              onBlur={(e) => apply({ zip: e.target.value })}
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className={FIELD_LABEL}>Within</span>
            <select className={FIELD} value={get("radius") || "50"} onChange={(e) => apply({ radius: e.target.value })}>
              <option value="25">25 miles</option>
              <option value="50">50 miles</option>
              <option value="100">100 miles</option>
              <option value="250">250 miles</option>
              <option value="any">Nationwide</option>
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className={FIELD_LABEL}>Min price</span>
            <input
              className={FIELD}
              inputMode="numeric"
              placeholder="$"
              defaultValue={get("minPrice")}
              onBlur={(e) => apply({ minPrice: e.target.value })}
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className={FIELD_LABEL}>Max price</span>
            <input
              className={FIELD}
              inputMode="numeric"
              placeholder="$"
              defaultValue={get("maxPrice")}
              onBlur={(e) => apply({ maxPrice: e.target.value })}
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className={FIELD_LABEL}>Min year</span>
            <input
              className={FIELD}
              inputMode="numeric"
              placeholder="2018"
              defaultValue={get("minYear")}
              onBlur={(e) => apply({ minYear: e.target.value })}
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className={FIELD_LABEL}>Max year</span>
            <input
              className={FIELD}
              inputMode="numeric"
              placeholder="2026"
              defaultValue={get("maxYear")}
              onBlur={(e) => apply({ maxYear: e.target.value })}
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className={FIELD_LABEL}>Max mileage</span>
            <input
              className={FIELD}
              inputMode="numeric"
              placeholder="60,000"
              defaultValue={get("maxMiles")}
              onBlur={(e) => apply({ maxMiles: e.target.value })}
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className={FIELD_LABEL} title="Only cars whose drivetrain we know are included when this is set">
              Drivetrain
            </span>
            <select className={FIELD} value={get("drive")} onChange={(e) => apply({ drive: e.target.value })}>
              <option value="">Any</option>
              <option>AWD</option>
              <option>RWD</option>
              <option>FWD</option>
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className={FIELD_LABEL}>Condition</span>
            <select className={FIELD} value={get("cond")} onChange={(e) => apply({ cond: e.target.value })}>
              <option value="">New &amp; used</option>
              <option value="new">New</option>
              <option value="used">Used &amp; certified</option>
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className={FIELD_LABEL}>Min range for this version</span>
            <input
              className={FIELD}
              inputMode="numeric"
              placeholder="250"
              defaultValue={get("minRange")}
              onBlur={(e) => apply({ minRange: e.target.value })}
            />
          </label>

          <label className="col-span-2 flex items-center gap-2.5 md:col-span-4">
            <input
              type="checkbox"
              className="size-4 accent-cobalt"
              checked={heatPumpOn}
              onChange={(e) => apply({ heatPump: e.target.checked ? "1" : "" })}
            />
            <span className="text-[13px] font-bold uppercase tracking-[0.04em]">Heat pump, confirmed</span>
          </label>

          {sp.size > 0 && (
            <div className="col-span-2 md:col-span-4">
              <button
                type="button"
                onClick={() => router.push("/")}
                className="border-[3px] border-ink bg-ink px-4 py-2 text-[12px] font-extrabold uppercase tracking-[0.06em] text-paper"
              >
                Clear everything
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
