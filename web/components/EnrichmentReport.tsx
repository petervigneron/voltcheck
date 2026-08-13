import type { EnrichmentRow, HeatPump } from "@/lib/types";
import { FactRow } from "./FactRow";

export const HEAT_PUMP_LABEL: Record<HeatPump, string> = {
  standard: "Standard",
  optional: "Factory option — window sticker is the only authority",
  awd_only: "AWD only — RWD cars have none",
  none: "None",
};

export const NOTE_STYLES = {
  trap: "border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/40",
  warning: "border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40",
  info: "border-sky-300 dark:border-sky-800 bg-sky-50 dark:bg-sky-950/40",
} as const;

export const NOTE_TAG = { trap: "TRAP", warning: "CAUTION", info: "WORTH KNOWING" } as const;

const DCFC_LABEL = {
  standard: "Standard",
  optional: "Factory option — varies per car",
  none: "Not capable",
  fitted: "Fitted — confirmed on this car",
  not_fitted: "Not fitted on this car",
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
      {row.buyerNotes?.map((n) => (
        <div key={n.headline} className={`mb-3 rounded-lg border p-4 ${NOTE_STYLES[n.severity]}`}>
          <div className="text-[11px] font-bold tracking-wider">{NOTE_TAG[n.severity]}</div>
          <div className="mt-1 font-semibold text-sm">{n.headline}</div>
          <p className="mt-1 text-sm text-zinc-700 dark:text-zinc-300">{n.body}</p>
          {n.learnMore && (
            <details className="mt-2">
              <summary className="cursor-pointer text-xs font-semibold text-zinc-600 dark:text-zinc-400 hover:text-emerald-600 dark:hover:text-emerald-400">
                How we know this — and what it means for you
              </summary>
              <p className="mt-2 text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
                {n.learnMore}
              </p>
            </details>
          )}
        </div>
      ))}

      <div className="grid gap-x-10 sm:grid-cols-2">
        <div>
          <h3 className="mt-2 text-xs font-semibold text-zinc-400">Battery & range</h3>
          <FactRow label="Usable capacity" fact={row.battery?.packUsableKwh} format={(v) => `${v} kWh`} />
          <FactRow label="Gross capacity" fact={row.battery?.packGrossKwh} format={(v) => `${v} kWh`} />
          <FactRow label="Chemistry" fact={row.battery?.chemistry} />
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

          <h3 className="mt-5 text-xs font-semibold text-zinc-400">Warranty, for the next owner</h3>
          <FactRow
            label="HV battery coverage"
            fact={row.warranty?.batteryYears}
            format={(v) => `${v} yr / ${row.warranty?.batteryMiles?.value.toLocaleString() ?? "—"} mi`}
          />
          <FactRow label="Capacity floor" fact={row.warranty?.sohFloorPct} format={(v) => `${v}% SOH`} />
          <FactRow label="Battery coverage transfers" fact={row.warranty?.batteryTransfers} format={(v) => (v ? "Yes — in full" : "No")} />
          <FactRow label="Powertrain coverage transfers" fact={row.warranty?.powertrainTransfers} format={(v) => (v ? "Yes" : "No — drops for a second owner")} />
          <FactRow label="Extended coverage" fact={row.warranty?.extendedCoverage} />
        </div>
      </div>
    </div>
  );
}
