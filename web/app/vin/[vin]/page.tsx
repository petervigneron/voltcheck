import Link from "next/link";
import { notFound } from "next/navigation";
import { decodeVin, isValidVin } from "@/lib/vpic";
import { decodeTeslaVin, isTeslaVin } from "@/lib/tesla-vin";
import { matchEnrichment } from "@/lib/enrichment/match";
import { buildChecklist } from "@/lib/checklist";
import { FactRow } from "@/components/FactRow";
import { EnrichmentFacts, Section, NOTE_STYLE } from "@/components/EnrichmentReport";
import { AskSeller } from "@/components/AskSeller";

export const dynamic = "force-dynamic";

export default async function VinPage(props: PageProps<"/vin/[vin]">) {
  const { vin: rawVin } = await props.params;
  const vin = decodeURIComponent(rawVin).toUpperCase();
  if (!isValidVin(vin)) notFound();

  const decode = await decodeVin(vin);
  const tesla = isTeslaVin(vin) ? decodeTeslaVin(vin) : null;
  const enrichment = matchEnrichment(decode, tesla);
  const checklist = buildChecklist(decode);

  const identity = [decode.modelYear, decode.make, decode.model, decode.trim]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="mx-auto max-w-4xl space-y-5 px-4 py-10">
      <div>
        <Link href="/" className="text-xs text-zinc-400 hover:text-emerald-500">
          ← new search
        </Link>
        <div className="mt-1 font-mono text-sm text-zinc-500 dark:text-zinc-400">{vin}</div>
        <h1 className="text-2xl font-bold tracking-tight">
          {decode.usMarket ? identity || "Decoded vehicle" : "Not a US-market vehicle"}
        </h1>
        {decode.electrificationLevel && (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">{decode.electrificationLevel}</p>
        )}
      </div>

      {!decode.usMarket && (
        <div className={`rounded-lg border p-4 ${NOTE_STYLE}`}>
          <div className="text-sm font-semibold">
            NHTSA has no record of this manufacturer — likely a grey import
          </div>
          <p className="mt-1 text-sm text-zinc-700 dark:text-zinc-300">
            This VIN pattern (e.g. Shanghai-built LRW… or Berlin-built XP7… Teslas) is not a
            US-market car. Parts, warranty, software region, and Supercharger access may
            differ.
          </p>
        </div>
      )}

      {decode.usMarket && (
        <Section title="What the VIN itself proves">
          <div className="grid gap-x-10 sm:grid-cols-2">
            <div>
              <FactRow
                label="Assembly plant"
                fact={
                  tesla?.plant
                    ? { value: `${tesla.plant.name} (VIN pos. 11 = ${tesla.plant.code})`, source: "vin", asOf: "—", confidence: "high" }
                    : decode.plantCity
                      ? { value: [decode.plantCity, decode.plantState, decode.plantCountry].filter(Boolean).join(", "), source: "vpic", asOf: "—", confidence: "high" }
                      : undefined
                }
              />
              {tesla?.chemistryHint && (
                <FactRow
                  label="Cell type (VIN pos. 7)"
                  fact={{
                    value: tesla.chemistryHint === "LFP" ? "LFP" : "Ternary lithium-ion (NCA/NCM)",
                    source: "vin",
                    asOf: "—",
                    confidence: "high",
                  }}
                />
              )}
            </div>
            <div>
              {decode.trim && (
                <FactRow label="Trim (VIN hint — verify)" fact={{ value: decode.trim, source: "vpic", asOf: "—", confidence: "medium" }} />
              )}
              {decode.driveType && (
                <FactRow label="Drive type (VIN hint — verify)" fact={{ value: decode.driveType, source: "vpic", asOf: "—", confidence: "medium" }} />
              )}
              {decode.batteryKwhHint !== undefined && (
                <FactRow
                  label="Battery kWh (VIN hint — unreliable)"
                  fact={{
                    value: decode.batteryKwhHint,
                    source: "vpic",
                    asOf: "—",
                    confidence: "low",
                    note: "vPIC battery figures are pattern-level, not per-car; a single- and dual-motor car can return the same number. Superseded by the research row below when present.",
                  }}
                />
              )}
            </div>
          </div>
        </Section>
      )}

      {enrichment.exact && (
        <Section title="This exact configuration — researched">
          <EnrichmentFacts row={enrichment.exact} />
        </Section>
      )}

      {enrichment.candidates && (
        <Section title="Two materially different cars wear this badge">
          {enrichment.discriminator && (
            <p className="mb-4 rounded-lg border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 p-3 text-sm">
              {enrichment.discriminator}
            </p>
          )}
          <div className="space-y-6">
            {enrichment.candidates.map((row) => (
              <div key={row.id} className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-4">
                <div className="mb-2 text-sm font-semibold">
                  {row.range?.epaRangeMi
                    ? `${row.range.epaRangeMi.value} mi version${row.battery?.packUsableKwh ? ` · ≈${Math.round(row.battery.packUsableKwh.value)} kWh` : ""}`
                    : row.trim ?? row.id}
                </div>
                <EnrichmentFacts row={row} />
              </div>
            ))}
          </div>
        </Section>
      )}

      {decode.usMarket && !enrichment.exact && !enrichment.candidates && (
        <Section title="This exact configuration — researched">
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            No researched row for this model yet. The seed corpus currently covers Tesla Model Y
            and Model 3, Chevrolet Bolt EV, Hyundai Ioniq 5, and Kia EV6 — coverage grows model
            by model, and nothing here is ever auto-filled from aggregators.
          </p>
        </Section>
      )}

      <AskSeller items={checklist} />
    </div>
  );
}
