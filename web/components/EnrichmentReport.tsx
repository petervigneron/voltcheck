import type { Chemistry, EnrichmentRow, HeatPump, SuperchargerAccess } from "@/lib/types";
import type { BatteryWarranty } from "@/lib/listings/warranty";
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

const SEVERITY_LABEL: Record<"info" | "warning" | "trap", string> = {
  info: "Note",
  warning: "Warning",
  trap: "Watch for",
};

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

  // FactRow now renders nothing for an absent fact (see FactRow.tsx), which
  // clears the field-level "Unknown" rows on their own. That leaves one more
  // place the same complaint applies at a coarser grain: a section heading
  // with every row under it gone is still a label the shopper scans for
  // nothing. Each heading below is gated on at least one fact in its group
  // actually being present for THIS row, computed from the same optional
  // chains the rows themselves read — not a second source of truth, just
  // whether any of them resolve to something.
  const hasBatteryRange = !!(
    row.battery?.packUsableKwh ||
    row.battery?.packGrossKwh ||
    row.battery?.chemistry ||
    row.range?.epaRangeMi ||
    row.range?.epaRangeTotalMi ||
    row.range?.testedRangeMi ||
    row.range?.mpgeElectric ||
    row.range?.mpgeCombined ||
    row.range?.mpgGasoline
  );
  // A PHEV row is any row carrying at least one fact that only exists for a
  // plug-in hybrid. Once true, epaRangeMi stops being labeled "EPA range" —
  // on a BEV that's the whole story, but on a PHEV it is only the
  // electric-only figure, and printing it under the BEV's label right next
  // to (or instead of) the total range is exactly the confusion a PHEV page
  // cannot afford. See docs/agents/phev-enrichment-2026-08-21.md §2.
  const isPhevRange = !!(
    row.range?.epaRangeTotalMi ||
    row.range?.mpgeElectric ||
    row.range?.mpgeCombined ||
    row.range?.mpgGasoline
  );
  const hasThermal = !!row.thermal?.heatPump;
  const hasCharging = !!(
    row.charging?.dcFastCharging ||
    row.charging?.dcPeakKw ||
    row.charging?.architectureV ||
    row.charging?.chargeTime1080Min ||
    row.charging?.acOnboardKw ||
    row.charging?.plugAndCharge ||
    row.charging?.portStandard ||
    row.charging?.superchargerAccess
  );
  // A settled warranty state (warranty.state !== "unknown") always rests on
  // a batteryYears or batteryMiles fact — see lib/listings/warranty.ts — so
  // it counts as content on its own; the raw fields cover candidate rows,
  // which get no `warranty` prop at all (see the JSDoc above).
  const hasWarranty = !!(
    (warranty && warranty.state !== "unknown") ||
    row.warranty?.batteryYears ||
    row.warranty?.sohFloorPct ||
    row.warranty?.batteryTransfers ||
    row.warranty?.powertrainTerms ||
    row.warranty?.extendedCoverage
  );
  return (
    <div>
      <div className="grid gap-x-10 sm:grid-cols-2">
        <div>
          {hasBatteryRange && (
            <>
              <h3 className="mt-2 text-xs font-semibold text-zinc-400">Battery & range</h3>
              <FactRow label="Usable capacity" fact={row.battery?.packUsableKwh} format={(v) => `${v} kWh`} />
              <FactRow label="Gross capacity" fact={row.battery?.packGrossKwh} format={(v) => `${v} kWh`} />
              <FactRow
                label="Chemistry"
                fact={row.battery?.chemistry}
                hint={row.battery?.chemistry ? chemistryHint(row.battery.chemistry.value) : undefined}
              />
              <FactRow
                label={isPhevRange ? "Electric-only range" : "EPA range"}
                fact={row.range?.epaRangeMi}
                format={(v) => `${v} mi`}
              />
              {/* PHEV-only: the total, gas-assisted figure, always a separate
                  row from the one above and never blended into it — a
                  shopper needs both numbers, not just the bigger one. */}
              <FactRow
                label="Total range (gas + electric)"
                fact={row.range?.epaRangeTotalMi}
                format={(v) => `${v} mi`}
              />
              <FactRow label="Real-world tested range" fact={row.range?.testedRangeMi} format={(v) => `${v} mi`} />
              <FactRow label="MPGe (electric)" fact={row.range?.mpgeElectric} format={(v) => `${v} MPGe`} />
              <FactRow label="MPGe (EPA composite)" fact={row.range?.mpgeCombined} format={(v) => `${v} MPGe`} />
              <FactRow
                label="MPG (gasoline, after battery depletes)"
                fact={row.range?.mpgGasoline}
                format={(v) => `${v} MPG`}
              />
            </>
          )}

          {hasThermal && (
            <>
              <h3 className="mt-5 text-xs font-semibold text-zinc-400">Thermal</h3>
              <FactRow
                label="Heat pump"
                fact={row.thermal?.heatPump}
                format={(v) => HEAT_PUMP_LABEL[v as HeatPump]}
              />
            </>
          )}

          {/* Thin field (one model so far) — silent when absent rather than
              one more "Unknown" row on every other car. See gaps 1/2 note
              on architectureV/chargeTime1080Min above. */}
          {row.specs?.towRatingLb && (
            <>
              <h3 className="mt-5 text-xs font-semibold text-zinc-400">Towing</h3>
              <FactRow label="Tow rating" fact={row.specs.towRatingLb} format={(v) => `${(v as number).toLocaleString()} lb braked`} />
            </>
          )}
        </div>
        <div>
          {hasCharging && (
            <>
              <h3 className="mt-2 text-xs font-semibold text-zinc-400">Charging</h3>
              {/* A peak DC rate already implies the car can DC fast charge, so
                  this row would just repeat that as a second line — "DC fast
                  charging: Unknown" sitting directly above "Peak DC rate: 200
                  kW" is exactly the self-contradicting duplication this guards
                  against. Only shown for rows with no peak-kW fact, where it's
                  the one piece of information the page has on the subject. */}
              {!row.charging?.dcPeakKw && (
                <FactRow
                  label="DC fast charging"
                  fact={row.charging?.dcFastCharging}
                  format={(v) => DCFC_LABEL[v as keyof typeof DCFC_LABEL] ?? String(v)}
                />
              )}
              <FactRow label="Peak DC rate" fact={row.charging?.dcPeakKw} format={(v) => `${v} kW`} />
              {/* Both fields below are thin (20% and ~3% of the corpus today) —
                  unlike the rest of this grid, an absent value stays silent
                  instead of adding another "Unknown" row; the surface should
                  read as "no data yet" for a field most rows will never carry,
                  not as one more line to scan past. See
                  docs/agents/enrichment-gaps-2026-08-20.md gaps 1 and 2. */}
              {row.charging?.architectureV && (
                <FactRow
                  label="Pack architecture"
                  fact={row.charging.architectureV}
                  format={(v) => `${v}V`}
                />
              )}
              {row.charging?.chargeTime1080Min && (
                <FactRow
                  label="10–80% charge time"
                  fact={row.charging.chargeTime1080Min}
                  format={(v) => `${v} min`}
                />
              )}
              {row.charging?.acOnboardKw && (
                <FactRow label="AC onboard charger" fact={row.charging.acOnboardKw} format={(v) => `${v} kW`} />
              )}
              {row.charging?.plugAndCharge && (
                <FactRow label="Plug & Charge" fact={row.charging.plugAndCharge} format={(v) => (v ? "Yes" : "No")} />
              )}
              <FactRow label="Port" fact={row.charging?.portStandard} />
              <FactRow
                label="Supercharger access"
                fact={row.charging?.superchargerAccess}
                format={(v) => SUPERCHARGER_LABEL[v as SuperchargerAccess] ?? String(v)}
              />
            </>
          )}

          {hasWarranty && (
            <>
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
            </>
          )}
        </div>
      </div>

      {/* Below the grid, not above it — a buyer note used to render as a
          bullet list leading the whole page, ahead of every fact. Same
          label/value row language as the grid above it now, just with the
          severity standing in for a label, so a trap or a warning about
          this car reads as one more line to scan, not a headline. */}
      {row.buyerNotes && row.buyerNotes.length > 0 && (
        <div className="mt-5">
          <h3 className="text-xs font-semibold text-zinc-400">Notes</h3>
          {row.buyerNotes.map((n) => (
            <div
              key={n.headline}
              className="flex items-baseline justify-between gap-4 py-2 border-b border-zinc-100 dark:border-zinc-800 last:border-0"
            >
              <div className="text-sm text-zinc-500 dark:text-zinc-400 shrink-0">
                {SEVERITY_LABEL[n.severity] ?? "Note"}
              </div>
              <div className="text-right text-sm font-medium text-zinc-900 dark:text-zinc-100">
                {n.headline}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
