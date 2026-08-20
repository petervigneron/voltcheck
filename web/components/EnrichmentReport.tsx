import type { EnrichmentRow, HeatPump, SuperchargerAccess } from "@/lib/types";
import type { BatteryWarranty } from "@/lib/listings/warranty";
import { FactRow } from "./FactRow";

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

const SUPERCHARGER_LABEL: Record<SuperchargerAccess, string> = {
  native: "Native",
  adapter: "Adapter",
  none: "None",
};

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

export function EnrichmentFacts({
  row,
  warranty,
}: {
  row: EnrichmentRow;
  /** This car's own battery-warranty standing, when it can be settled.
   *  Absent on the candidate rows, where there is no single car to settle. */
  warranty?: BatteryWarranty;
}) {
  // A dead warranty has nothing to transfer to a second owner and no capacity
  // floor to hold the pack to, so those rows go with it rather than sitting
  // underneath reading "Yes".
  const expired = warranty?.state === "expired";
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
          <FactRow
            label="Supercharger access"
            fact={row.charging?.superchargerAccess}
            format={(v) => SUPERCHARGER_LABEL[v as SuperchargerAccess] ?? String(v)}
          />

          <h3 className="mt-5 text-xs font-semibold text-zinc-400">Warranty</h3>
          {/* What the shopper is buying is one car's remaining coverage, not
              the terms it was sold under. Where this car's own odometer and
              model year settle it (lib/listings/warranty.ts) the answer takes
              the row and the terms move to the tooltip; where they do not, the
              terms are the honest answer and stand as before. */}
          {warranty && warranty.state !== "unknown" ? (
            <FactRow
              label="HV battery coverage"
              title={warranty.why}
              fact={{
                // Provenance rides on whichever term settled it — a warranty
                // can expire on mileage alone, on a row that carries a mileage
                // limit and no year term, so neither may be assumed present.
                ...(row.warranty?.batteryYears ?? row.warranty?.batteryMiles),
                value: warranty.label,
                note: undefined,
                source: (row.warranty?.batteryYears ?? row.warranty?.batteryMiles)?.source ?? "mfr",
                asOf: (row.warranty?.batteryYears ?? row.warranty?.batteryMiles)?.asOf ?? "—",
                confidence: "high",
              }}
            />
          ) : (
            <FactRow
              label="HV battery coverage"
              fact={row.warranty?.batteryYears}
              format={(v) => `${v} yr / ${row.warranty?.batteryMiles?.value.toLocaleString() ?? "—"} mi`}
            />
          )}
          {!expired && (
            <>
              <FactRow label="Capacity floor" fact={row.warranty?.sohFloorPct} format={(v) => `${v}% SOH`} />
              {/* The label already says "transfers", so the answer is the answer. */}
              <FactRow label="Battery coverage transfers" fact={row.warranty?.batteryTransfers} format={(v) => (v ? "Yes" : "No")} />
              <FactRow label="Powertrain" fact={row.warranty?.powertrainTerms} />
            </>
          )}
          <FactRow label="Extended coverage" fact={row.warranty?.extendedCoverage} />
        </div>
      </div>
    </div>
  );
}
