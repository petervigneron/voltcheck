import type { BatteryRisk as BatteryRiskData } from "@/lib/nhtsa/battery";
import { Section } from "./EnrichmentReport";

/** What NHTSA has on file for this car's make, model and year.
 *
 *  A recall campaign is filed against a cohort, not a VIN: NHTSA's own
 *  recallsByVehicle API takes a make/model/year, never a VIN, and no free,
 *  no-bot-wall source resolves whether THIS car sat in the affected build
 *  window or was already fixed (surveyed 2026-08-09 in
 *  docs/OEM-PORTAL-SURVEY.md; every OEM portal with real completion history
 *  — Mercedes, Hyundai — sits behind reCAPTCHA, and re-checked 2026-08-21 in
 *  docs/agents/per-vin-options-2026-08-21.md, no other make exposes one
 *  free). The one place a genuine per-VIN answer exists is GM's owner
 *  centre, already wired in as `campaignCheck` (scraper/gm-warranty.mjs) —
 *  where that fact covers this car, it's the better answer and this panel
 *  steps aside for it rather than print a weaker version underneath.
 *
 *  So the line below states the one thing the cohort data actually
 *  supports — that NHTSA has a battery recall on file for this model — and
 *  hands the real question, does it apply to this car and is it fixed, to
 *  the one place that can actually answer it per VIN: NHTSA's own VIN
 *  lookup.
 *
 *  The complaint count that used to sit here is gone for the same reason
 *  the recall number and NHTSA's taxonomy string are gone from the
 *  headline: NHTSA publishes no fleet size behind a complaint count, so it
 *  cannot say this model is worse or better than any other, and it says
 *  nothing about this specific truck. A number a shopper can't act on
 *  doesn't belong on the page just because NHTSA happened to publish it.
 *
 *  Renders nothing when the cohort is unresolved, when NHTSA has no battery
 *  recall on file for it, or when a stronger per-VIN fact already covers
 *  it. No empty state, no "no recalls" — see lib/nhtsa/battery.ts on why a
 *  clean answer and an unasked one already look identical this far
 *  upstream, so neither is safe to assert. */
export function BatteryRisk({
  data,
  vin,
  packReplaced,
}: {
  data: BatteryRiskData | null;
  vin: string;
  /** This exact VIN already has a confirmed, dated pack replacement (GM's
   *  owner centre, surfaced elsewhere on this page as a per-VIN fact) — the
   *  thing this panel wishes it could say but can't reach on its own. */
  packReplaced?: boolean;
}) {
  if (!data || data.recalls.length === 0 || packReplaced) return null;

  const n = data.recalls.length;

  return (
    <Section title="Recalls">
      <p className="text-sm text-zinc-700">
        NHTSA has {n === 1 ? "a battery recall" : `${n} battery recalls`} on file for this model.
      </p>
      <a
        href={`https://www.nhtsa.gov/recalls?vin=${encodeURIComponent(vin)}`}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-2 inline-block text-sm font-medium text-emerald-700 hover:text-emerald-600"
      >
        Check this VIN on NHTSA ↗
      </a>
    </Section>
  );
}
