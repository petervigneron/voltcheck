import type { Chemistry, EnrichmentRow, HeatPump } from "@/lib/types";
import { FactRow } from "./FactRow";
import { CHEMISTRY_INFO } from "@/lib/enrichment/chemistry-info";

// The Chemistry row's hover/focus tooltip: what this cell chemistry means for
// the shopper, framed as general family traits rather than a claim about this
// specific car.
function chemistryHint(value: Chemistry) {
  const info = CHEMISTRY_INFO[value];
  if (!info) return undefined;
  return (
    <div>
      <div className="font-semibold text-zinc-900 dark:text-zinc-100">
        {value} — {info.full}
      </div>
      <ul className="mt-2 space-y-0.5">
        {info.pros.map((p) => (
          <li key={p} className="flex gap-1.5">
            <span aria-hidden className="text-emerald-600 dark:text-emerald-500">+</span>
            <span>{p}</span>
          </li>
        ))}
        {info.cons.map((c) => (
          <li key={c} className="flex gap-1.5">
            <span aria-hidden className="text-amber-600 dark:text-amber-500">−</span>
            <span>{c}</span>
          </li>
        ))}
      </ul>
      <div className="mt-2 text-[10px] uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
        General traits of this battery family, not a measurement of this car
      </div>
    </div>
  );
}

export const HEAT_PUMP_LABEL: Record<HeatPump, string> = {
  standard: "Standard",
  // "Varies per car" is the whole point of this value: it means go check THIS
  // one. Kept short enough to read as a value, not a sentence.
  optional: "Varies per car",
  awd_only: "AWD only",
  none: "None",
};

export const NOTE_STYLE =
  "border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/60";

const DCFC_LABEL = {
  standard: "Standard",
  optional: "Varies per car",
  none: "Not capable",
  fitted: "Fitted",
  not_fitted: "Not fitted",
} as const;

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        {title}
      </h2>
      <div className="mt-2">{children}</div>
    </section>
  );
}

export function EnrichmentFacts({ row }: { row: EnrichmentRow }) {
  return (
    <div>
      {row.buyerNotes && row.buyerNotes.length > 0 && (
        <ul className="mb-3 text-sm text-zinc-700 dark:text-zinc-300">
          {row.buyerNotes.map((n) => (
            <li key={n.headline} className="py-0.5">
              {n.headline}
            </li>
          ))}
        </ul>
      )}

      <div className="grid gap-x-10 sm:grid-cols-2">
        <div>
          <h3 className="mt-2 text-xs font-semibold text-zinc-400">Battery & range</h3>
          <FactRow label="Usable capacity" fact={row.battery?.packUsableKwh} format={(v) => `${v} kWh`} />
          <FactRow label="Gross capacity" fact={row.battery?.packGrossKwh} format={(v) => `${v} kWh`} />
          <FactRow
            label="Chemistry"
            fact={row.battery?.chemistry}
            hint={row.battery?.chemistry ? chemistryHint(row.battery.chemistry.value) : undefined}
          />
          <FactRow label="EPA range" fact={row.range?.epaRangeMi} format={(v) => `${v} mi`} />
          <FactRow label="Real-world tested range" fact={row.range?.testedRangeMi} format={(v) => `${v} mi`} />

          <h3 className="mt-5 text-xs font-semibold text-zinc-400">Thermal</h3>
          <FactRow
            label="Heat pump"
            fact={row.thermal?.heatPump}
            format={(v) => HEAT_PUMP_LABEL[v as HeatPump]}
          />
        </div>
        <div>
          <h3 className="mt-2 text-xs font-semibold text-zinc-400">Charging</h3>
          <FactRow
            label="DC fast charging"
            fact={row.charging?.dcFastCharging}
            format={(v) => DCFC_LABEL[v as keyof typeof DCFC_LABEL] ?? String(v)}
          />
          <FactRow label="Peak DC rate" fact={row.charging?.dcPeakKw} format={(v) => `${v} kW`} />
          <FactRow label="Port" fact={row.charging?.portStandard} />
          <FactRow label="Supercharger access" fact={row.charging?.superchargerAccess} />

          <h3 className="mt-5 text-xs font-semibold text-zinc-400">Warranty</h3>
          <FactRow
            label="HV battery coverage"
            fact={row.warranty?.batteryYears}
            format={(v) => `${v} yr / ${row.warranty?.batteryMiles?.value.toLocaleString() ?? "—"} mi`}
          />
          <FactRow label="Capacity floor" fact={row.warranty?.sohFloorPct} format={(v) => `${v}% SOH`} />
          {/* The label already says "transfers", so the answer is the answer. */}
          <FactRow label="Battery coverage transfers" fact={row.warranty?.batteryTransfers} format={(v) => (v ? "Yes" : "No")} />
          <FactRow label="Powertrain coverage transfers" fact={row.warranty?.powertrainTransfers} format={(v) => (v ? "Yes" : "No")} />
          <FactRow label="Extended coverage" fact={row.warranty?.extendedCoverage} />
        </div>
      </div>
    </div>
  );
}
