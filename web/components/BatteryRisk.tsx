import type { Fact } from "@/lib/types";
import type { BatteryRisk as BatteryRiskData } from "@/lib/nhtsa/battery";
import { Section } from "./EnrichmentReport";
import { SourceBadge } from "./SourceBadge";

/** NHTSA's component paths are colon-delimited and long —
 *  "ELECTRICAL SYSTEM:PROPULSION SYSTEM:TRACTION BATTERY:MANAGEMENT
 *  SYSTEM/ENERGY CONTROL MODULE (BMS/BECM):SOFTWARE". Their words, unedited;
 *  the colons become middots so the line reads, it truncates rather than
 *  wraps, and the whole path is on the hover. Picking one segment out would
 *  be us deciding what the recall was about. */
function componentLine(component: string): string {
  return component.split(":").join(" · ");
}

/** What NHTSA has on file for this car's make, model and year.
 *
 *  Recalls are the government's own per-cohort claim, so they render bare.
 *  The complaint count is ours — our classification of their rows — so it
 *  carries the same qualifier every other aggregate on the site carries.
 *
 *  Nothing here is a rating. Complaint counts have no fleet size under them
 *  (NHTSA publishes no denominator), so they are never coloured, ranked, or
 *  set next to another car's. They are a count of filings and they say so.
 *
 *  Renders nothing at all when the cohort is unresolved or absent from the
 *  refresh — no empty state, no "no data". See lib/nhtsa/battery.ts. */
export function BatteryRisk({ data, vin }: { data: BatteryRiskData | null; vin: string }) {
  if (!data) return null;

  const counted: Fact<number> = {
    value: data.complaintsBattery,
    source: "agg",
    asOf: data.asOf,
    confidence: "medium",
  };

  return (
    <Section title="Battery recalls & complaints">
      {data.recalls.length > 0 && (
        <ul>
          {data.recalls.map((r) => (
            <li
              key={r.campaign}
              className="flex items-baseline gap-3 border-b border-zinc-100 py-2 text-sm last:border-0"
            >
              <span className="w-24 shrink-0 font-medium tabular-nums">{r.campaign}</span>
              {/* min-w-0 so truncate can shrink this: without it the full
                  component path is the row's minimum width and the page grid
                  goes past a phone screen. */}
              <span className="min-w-0 truncate text-zinc-700" title={r.component}>
                {componentLine(r.component)}
              </span>
            </li>
          ))}
        </ul>
      )}

      <div
        className={`flex items-baseline justify-between gap-4 py-2 text-sm ${
          data.recalls.length > 0 ? "border-t border-zinc-100" : ""
        }`}
      >
        <span className="text-zinc-500">Battery complaints filed</span>
        <span className="text-right">
          <span className="font-medium tabular-nums">
            {data.complaintsBattery.toLocaleString()} ({data.complaintsPack.toLocaleString()} pack-level)
          </span>{" "}
          <SourceBadge fact={counted} />
        </span>
      </div>

      {/* Attribution and the shopper's own next step in one line: a recall is
          answered per VIN, and this car's VIN is the answer NHTSA will give. */}
      <p className="mt-1 border-t border-zinc-100 pt-2 text-[11px] text-zinc-400">
        <a
          href={`https://www.nhtsa.gov/recalls?vin=${encodeURIComponent(vin)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-emerald-600"
        >
          NHTSA — check this VIN ↗
        </a>
      </p>
    </Section>
  );
}
