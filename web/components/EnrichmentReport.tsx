import type { Chemistry, EnrichmentRow, HeatPump, SuperchargerAccess } from "@/lib/types";
import type { BatteryWarranty } from "@/lib/listings/warranty";
import type { TileKind } from "./Tile";
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

/** A titled block in the browse page's dialect: square, a 3px ink keyline,
 *  the tracked uppercase label the grid and filter rail use. The listing,
 *  delisted and /vin pages are built from these. */
export function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="min-w-0 border-[3px] border-ink bg-paper p-5">
      <h2 className="text-[10.5px] font-extrabold tracking-[0.14em] text-ink/55 uppercase">{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

/** The versions a badge could be ("Two versions wear this badge" on a listing,
 *  "Possible configurations" on /vin), each a keylined box of spec tiles,
 *  under the one fact that tells them apart — saffron, the look-closer colour
 *  the card's range-span tile wears for these cars. */
export function CandidateRows({
  rows,
  discriminator,
  plugIn = false,
}: {
  rows: EnrichmentRow[];
  discriminator?: string;
  plugIn?: boolean;
}) {
  return (
    <>
      {discriminator && <p className="mb-4 bg-saffron p-3 text-[14px] font-semibold text-ink">{discriminator}</p>}
      <div className="space-y-5">
        {rows.map((row) => (
          <div key={row.id} className="border-[3px] border-ink p-4">
            <div className="mb-3 text-[15px] font-extrabold tracking-[-0.01em]">
              {row.range?.epaRangeMi
                ? `${row.range.epaRangeMi.value} mi version${row.battery?.packUsableKwh ? ` · ≈${Math.round(row.battery.packUsableKwh.value)} kWh` : ""}`
                : (Array.isArray(row.trim) ? row.trim[0] : row.trim) ?? row.id}
            </div>
            <EnrichmentFacts tiles plugIn={plugIn} row={row} />
          </div>
        ))}
      </div>
    </>
  );
}

/** A group heading and its facts. As rows (/vin): a small grey heading over
 *  label/value lines. As tiles (the listing page): a label on a 3px ink rule
 *  over a wrap of solid tiles, two to a line, any tile left on its own taking
 *  the whole line. */
function Group({
  title,
  tiles,
  first,
  children,
}: {
  title: string;
  tiles: boolean;
  first?: boolean;
  children: React.ReactNode;
}) {
  if (tiles) {
    return (
      <div>
        <h3 className="border-b-[3px] border-ink pb-1.5 text-[10.5px] font-extrabold tracking-[0.14em] text-ink uppercase">
          {title}
        </h3>
        <div className="mt-2 flex flex-wrap gap-1.5">{children}</div>
      </div>
    );
  }
  return (
    <>
      <h3 className={`${first ? "mt-2" : "mt-5"} text-xs font-semibold text-zinc-400`}>{title}</h3>
      {children}
    </>
  );
}

export function EnrichmentFacts({
  row,
  warranty,
  tiles = false,
  plugIn = false,
}: {
  row: EnrichmentRow;
  /** This car's own battery-warranty standing, when it can be settled.
   *  Absent on the candidate rows, where there is no single car to settle. */
  warranty?: BatteryWarranty;
  /** Render each fact as a solid tile (the listing page) instead of a row. */
  tiles?: boolean;
  /** The car is a plug-in hybrid (lib/listings/kind.ts). Only changes a
   *  tile's colour: a missing heat pump or DC port is no alarm on a PHEV. */
  plugIn?: boolean;
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
    row.range?.mfrRangeMi ||
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
    row.charging?.chargeTimeTo80Min ||
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

  // Tile colours, by the same rules the card's tiles follow (components/
  // Tile.tsx, lib/listings/tiles.ts), so a fact wears one colour wherever it
  // appears: range ochre; equipment present teal; an absence vermilion, held
  // back on a plug-in hybrid exactly as the card holds it back; a factory
  // option that varies per car saffron where the card flags it; everything
  // else putty. Rows ignore tone.
  const noAlarm = plugIn || isPhevRange;
  const heatPumpTone = (v?: HeatPump): TileKind =>
    v === "standard" ? "kit" : v === "none" && !noAlarm ? "miss" : "spec";
  const dcTone = (v?: string): TileKind =>
    v === "standard" || v === "fitted"
      ? "kit"
      : (v === "none" || v === "not_fitted") && !noAlarm
        ? "miss"
        : v === "optional" && !noAlarm
          ? "flag"
          : "spec";
  const portTone = (v?: string): TileKind => (v === "NACS" ? "kit" : v === "CHAdeMO" ? "flag" : "spec");
  const t = { tile: tiles };

  return (
    <div className={tiles ? "grid gap-6 sm:grid-cols-2" : "grid gap-x-10 sm:grid-cols-2"}>
      <div className={tiles ? "flex min-w-0 flex-col gap-6" : "min-w-0"}>
        {hasBatteryRange && (
          <Group title="Battery & range" tiles={tiles} first>
            <FactRow {...t} label="Usable capacity" fact={row.battery?.packUsableKwh} format={(v) => `${v} kWh`} />
            <FactRow {...t} label="Gross capacity" fact={row.battery?.packGrossKwh} format={(v) => `${v} kWh`} />
            <FactRow
              {...t}
              label="Chemistry"
              fact={row.battery?.chemistry}
              hint={row.battery?.chemistry ? chemistryHint(row.battery.chemistry.value) : undefined}
            />
            <FactRow
              {...t}
              tone="range"
              label={isPhevRange ? "Electric-only range" : "EPA range"}
              fact={row.range?.epaRangeMi}
              format={(v) => `${v} mi`}
            />
            {/* Vehicles EPA never rated at all — over the labelling
                threshold — where the maker publishes its own simulation.
                A separate row with its own label, never merged into the
                one above: "EPA range" and "manufacturer estimate" are
                different claims and the label is the only place that
                difference can live. */}
            <FactRow
              {...t}
              tone="range"
              label="Range (manufacturer estimate)"
              fact={row.range?.mfrRangeMi}
              format={(v) => `${v} mi`}
            />
            {/* PHEV-only: the total, gas-assisted figure, always a separate
                row from the one above and never blended into it — a
                shopper needs both numbers, not just the bigger one. */}
            <FactRow
              {...t}
              tone="range"
              label="Total range (gas + electric)"
              fact={row.range?.epaRangeTotalMi}
              format={(v) => `${v} mi`}
            />
            <FactRow {...t} tone="range" label="Real-world tested range" fact={row.range?.testedRangeMi} format={(v) => `${v} mi`} />
            <FactRow {...t} label="MPGe (electric)" fact={row.range?.mpgeElectric} format={(v) => `${v} MPGe`} />
            <FactRow {...t} label="MPGe (EPA composite)" fact={row.range?.mpgeCombined} format={(v) => `${v} MPGe`} />
            <FactRow
              {...t}
              label="MPG (gasoline, after battery depletes)"
              fact={row.range?.mpgGasoline}
              format={(v) => `${v} MPG`}
            />
          </Group>
        )}

        {hasThermal && (
          <Group title="Thermal" tiles={tiles}>
            <FactRow
              {...t}
              tone={heatPumpTone(row.thermal?.heatPump?.value)}
              label="Heat pump"
              fact={row.thermal?.heatPump}
              format={(v) => HEAT_PUMP_LABEL[v as HeatPump]}
              yesNo
            />
          </Group>
        )}

        {/* Thin field (one model so far) — silent when absent rather than
            one more "Unknown" row on every other car. See gaps 1/2 note
            on architectureV/chargeTime1080Min above. */}
        {row.specs?.towRatingLb && (
          <Group title="Towing" tiles={tiles}>
            <FactRow {...t} label="Tow rating" fact={row.specs.towRatingLb} format={(v) => `${(v as number).toLocaleString()} lb braked`} />
          </Group>
        )}
      </div>
      <div className={tiles ? "flex min-w-0 flex-col gap-6" : "min-w-0"}>
        {hasCharging && (
          <Group title="Charging" tiles={tiles} first>
            {/* A peak DC rate already implies the car can DC fast charge, so
                this row would just repeat that as a second line — "DC fast
                charging: Unknown" sitting directly above "Peak DC rate: 200
                kW" is exactly the self-contradicting duplication this guards
                against. Only shown for rows with no peak-kW fact, where it's
                the one piece of information the page has on the subject. */}
            {!row.charging?.dcPeakKw && (
              <FactRow
                {...t}
                tone={dcTone(row.charging?.dcFastCharging?.value)}
                label="DC fast charging"
                fact={row.charging?.dcFastCharging}
                format={(v) => DCFC_LABEL[v as keyof typeof DCFC_LABEL] ?? String(v)}
                yesNo
              />
            )}
            <FactRow {...t} label="Peak DC rate" fact={row.charging?.dcPeakKw} format={(v) => `${v} kW`} />
            {/* Both fields below are thin (20% and ~3% of the corpus today) —
                unlike the rest of this grid, an absent value stays silent
                instead of adding another "Unknown" row; the surface should
                read as "no data yet" for a field most rows will never carry,
                not as one more line to scan past. See
                docs/agents/enrichment-gaps-2026-08-20.md gaps 1 and 2. */}
            {row.charging?.architectureV && (
              <FactRow {...t} label="Pack architecture" fact={row.charging.architectureV} format={(v) => `${v}V`} />
            )}
            {row.charging?.chargeTime1080Min && (
              <FactRow {...t} label="10–80% charge time" fact={row.charging.chargeTime1080Min} format={(v) => `${v} min`} />
            )}
            {/* Makers who state a looser starting point than 10% get their
                own label rather than borrowing the row above; GM defines
                its "low" as 15-20 miles of range remaining, which is not
                10%. See lib/types.ts. */}
            {row.charging?.chargeTimeTo80Min && (
              <FactRow {...t} label="Charge time to 80%" fact={row.charging.chargeTimeTo80Min} format={(v) => `${v} min`} />
            )}
            {row.charging?.acOnboardKw && (
              <FactRow {...t} label="AC onboard charger" fact={row.charging.acOnboardKw} format={(v) => `${v} kW`} />
            )}
            {row.charging?.plugAndCharge && (
              <FactRow {...t} label="Plug & Charge" fact={row.charging.plugAndCharge} format={(v) => (v ? "Yes" : "No")} />
            )}
            <FactRow {...t} tone={portTone(row.charging?.portStandard?.value)} label="Port" fact={row.charging?.portStandard} />
            <FactRow
              {...t}
              label="Supercharger access"
              fact={row.charging?.superchargerAccess}
              format={(v) => SUPERCHARGER_LABEL[v as SuperchargerAccess] ?? String(v)}
            />
          </Group>
        )}

        {hasWarranty && (
          <Group title="Warranty" tiles={tiles}>
            {/* What the shopper is buying is one car's remaining coverage, not
                the terms it was sold under. Where this car's own odometer and
                model year settle it (lib/listings/warranty.ts) the answer takes
                the row and the terms move to the tooltip; where they do not, the
                terms are the honest answer and stand as before. */}
            {warranty && warranty.state !== "unknown" ? (
              <FactRow
                {...t}
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
                {...t}
                label="HV battery coverage"
                fact={row.warranty?.batteryYears}
                format={(v) => `${v} yr / ${row.warranty?.batteryMiles?.value.toLocaleString() ?? "—"} mi`}
              />
            )}
            {!expired && (
              <>
                <FactRow {...t} label="Capacity floor" fact={row.warranty?.sohFloorPct} format={(v) => `${v}% SOH`} />
                {/* The label already says "transfers", so the answer is the answer. */}
                <FactRow {...t} label="Battery coverage transfers" fact={row.warranty?.batteryTransfers} format={(v) => (v ? "Yes" : "No")} />
                <FactRow {...t} label="Powertrain" fact={row.warranty?.powertrainTerms} />
              </>
            )}
            <FactRow {...t} label="Extended coverage" fact={row.warranty?.extendedCoverage} />
          </Group>
        )}
      </div>

      {/* buyerNotes do not render. They are the researcher's flags on a
          model — "no EPA range exists", "towing not recommended", recall
          summaries — and they reached the page here as a "Notes" block with
          Warning / Watch for labels until 2026-09-05, when the owner found
          four of them under a Ram ProMaster EV. They are the same class of
          copy as a Fact's note (lib/enrichment/noteRule.ts): the value is
          the answer, and a sentence about a car is never ours to write. The
          data stays on the row for audit and for enrich.ts's trap count;
          scripts/note-hygiene.mjs fails if a component reads it again. */}
    </div>
  );
}
