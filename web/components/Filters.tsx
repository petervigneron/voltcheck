"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

export interface FilterState {
  q?: string;
  make?: string;
  model?: string;
  cond?: string;
  drive?: string;
  minPrice?: string;
  maxPrice?: string;
  minYear?: string;
  maxYear?: string;
  maxMiles?: string;
  minRange?: string;
  heatPump?: string;
  sort?: string;
}

const selectCls =
  "mt-1 w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2 py-1.5 text-sm";
const labelCls = "text-xs font-semibold text-zinc-500 dark:text-zinc-400";

export function Filters({ makesModels }: { makesModels: Record<string, string[]> }) {
  const router = useRouter();
  const sp = useSearchParams();
  const get = (k: string) => sp.get(k) ?? "";
  const [q, setQ] = useState(get("q"));

  useEffect(() => setQ(get("q")), [sp]); // eslint-disable-line react-hooks/exhaustive-deps

  const apply = useCallback(
    (updates: Record<string, string>) => {
      const params = new URLSearchParams(sp.toString());
      for (const [k, v] of Object.entries(updates)) {
        if (v) params.set(k, v);
        else params.delete(k);
      }
      // model depends on make
      if ("make" in updates) params.delete("model");
      router.push(`/?${params.toString()}`);
    },
    [router, sp]
  );

  const make = get("make");
  const models = make ? (makesModels[make] ?? []) : [];
  const makes = Object.keys(makesModels).sort();

  return (
    <div className="space-y-4">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          apply({ q });
        }}
      >
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search make, model, trim…"
          className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-emerald-500"
        />
      </form>

      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <label className={labelCls}>Make</label>
          <select className={selectCls} value={make} onChange={(e) => apply({ make: e.target.value })}>
            <option value="">All makes</option>
            {makes.map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
        </div>
        <div className="col-span-2">
          <label className={labelCls}>Model</label>
          <select
            className={selectCls}
            value={get("model")}
            onChange={(e) => apply({ model: e.target.value })}
            disabled={!make}
          >
            <option value="">{make ? `All ${make} models` : "Choose a make first"}</option>
            {models.map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
        </div>

        <div>
          <label className={labelCls}>Near ZIP</label>
          <input className={selectCls} inputMode="numeric" placeholder="94568" maxLength={5} defaultValue={get("zip")} onBlur={(e) => apply({ zip: e.target.value })} />
        </div>
        <div>
          <label className={labelCls}>Within</label>
          <select className={selectCls} value={get("radius") || "50"} onChange={(e) => apply({ radius: e.target.value })}>
            <option value="25">25 miles</option>
            <option value="50">50 miles</option>
            <option value="100">100 miles</option>
            <option value="250">250 miles</option>
            <option value="any">Nationwide</option>
          </select>
        </div>
        <div className="col-span-2">
          <label className={labelCls}>Condition</label>
          <select className={selectCls} value={get("cond")} onChange={(e) => apply({ cond: e.target.value })}>
            <option value="">New & used</option>
            <option value="new">New</option>
            <option value="used">Used & certified</option>
          </select>
        </div>

        <div>
          <label className={labelCls}>Min price</label>
          <input className={selectCls} inputMode="numeric" placeholder="$" defaultValue={get("minPrice")} onBlur={(e) => apply({ minPrice: e.target.value })} />
        </div>
        <div>
          <label className={labelCls}>Max price</label>
          <input className={selectCls} inputMode="numeric" placeholder="$" defaultValue={get("maxPrice")} onBlur={(e) => apply({ maxPrice: e.target.value })} />
        </div>
        <div>
          <label className={labelCls}>Min year</label>
          <input className={selectCls} inputMode="numeric" placeholder="2018" defaultValue={get("minYear")} onBlur={(e) => apply({ minYear: e.target.value })} />
        </div>
        <div>
          <label className={labelCls}>Max year</label>
          <input className={selectCls} inputMode="numeric" placeholder="2026" defaultValue={get("maxYear")} onBlur={(e) => apply({ maxYear: e.target.value })} />
        </div>
        <div>
          <label className={labelCls}>Max mileage</label>
          <input className={selectCls} inputMode="numeric" placeholder="60,000" defaultValue={get("maxMiles")} onBlur={(e) => apply({ maxMiles: e.target.value })} />
        </div>
        <div>
          <label className={labelCls} title="Only cars whose drivetrain we know are included when this is set">
            Drivetrain
          </label>
          <select className={selectCls} value={get("drive")} onChange={(e) => apply({ drive: e.target.value })}>
            <option value="">Any</option>
            <option>AWD</option>
            <option>RWD</option>
            <option>FWD</option>
          </select>
        </div>

        <div className="col-span-2">
          <label className={labelCls}>Min EPA range (for this exact version)</label>
          <input className={selectCls} inputMode="numeric" placeholder="e.g. 250" defaultValue={get("minRange")} onBlur={(e) => apply({ minRange: e.target.value })} />
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={get("heatPump") === "1"}
          onChange={(e) => apply({ heatPump: e.target.checked ? "1" : "" })}
        />
        Heat pump, confirmed
      </label>

      {(sp.size > 0) && (
        <button
          onClick={() => router.push("/")}
          className="text-xs text-zinc-500 hover:text-emerald-600 underline"
        >
          Clear all filters
        </button>
      )}
    </div>
  );
}

export function SortSelect() {
  const router = useRouter();
  const sp = useSearchParams();
  return (
    <select
      className="rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2 py-1.5 text-sm"
      value={sp.get("sort") ?? "price"}
      onChange={(e) => {
        const params = new URLSearchParams(sp.toString());
        params.set("sort", e.target.value);
        router.push(`/?${params.toString()}`);
      }}
    >
      <option value="price">Price: low to high</option>
      <option value="price-desc">Price: high to low</option>
      <option value="year-desc">Year: newest</option>
      <option value="miles">Mileage: lowest</option>
      <option value="range-desc">EPA range: highest</option>
      <option value="distance">Distance: nearest</option>
    </select>
  );
}
