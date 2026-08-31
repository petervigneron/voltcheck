import { cache } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { decodeVin, isValidVin } from "@/lib/vpic";
import { decodeTeslaVin, isTeslaVin } from "@/lib/tesla-vin";
import { matchEnrichment, vpicTrimIsPatternArtifact } from "@/lib/enrichment/match";
import { vpicEvModelAliases } from "@/lib/enrichment/vpicEvAlias";
import { withTeslaCollisionAbstention } from "@/lib/listings/teslaRangeAbstain";
import type { EnrichmentResult, VinDecode } from "@/lib/types";
import { buildChecklist } from "@/lib/checklist";
import { FactRow } from "@/components/FactRow";
import { EnrichmentFacts, Section, NOTE_STYLE } from "@/components/EnrichmentReport";
import { AskSeller } from "@/components/AskSeller";

export const dynamic = "force-dynamic";

// Shared between generateMetadata and the page so a request decodes the VIN once.
const getDecode = cache(decodeVin);

// vPIC names some electrified cars after their combustion sibling ("Equinox"
// for an Equinox EV, "XC90" for the T8). When the electrification-gated alias
// (lib/enrichment/vpicEvAlias.ts) is what resolved the match and every matched
// row agrees on the showroom name, the heading should carry that name — the
// VIN itself proved the car is the electric one. Anywhere the rows disagree,
// or no alias was in play, vPIC's own string stands.
function resolvedModel(decode: VinDecode, enrichment: EnrichmentResult): string | undefined {
  if (vpicEvModelAliases(decode).length === 0) return decode.model;
  const rows = enrichment.exact ? [enrichment.exact] : enrichment.candidates ?? [];
  const models = new Set(rows.map((r) => r.model));
  return models.size === 1 ? [...models][0] : decode.model;
}

// VIN reports are a tool, not indexable content: the VIN space is effectively
// infinite and near-duplicate across cars, so these are marked noindex,follow
// (owner call). Real title/description still render for when someone shares a
// report link. Model-level indexable content lives on the spec pages instead.
export async function generateMetadata(props: PageProps<"/vin/[vin]">): Promise<Metadata> {
  const { vin: rawVin } = await props.params;
  const vin = decodeURIComponent(rawVin).toUpperCase();
  const noindex = { robots: { index: false, follow: true } };
  if (!isValidVin(vin)) return { title: "VIN check | Voltcheck", ...noindex };

  const decode = await getDecode(vin);
  const tesla = isTeslaVin(vin) ? decodeTeslaVin(vin) : null;
  const enrichment = withTeslaCollisionAbstention(decode, matchEnrichment(decode, tesla));
  const trim = vpicTrimIsPatternArtifact(decode) ? undefined : decode.trim;
  const identity = [decode.modelYear, decode.make, resolvedModel(decode, enrichment), trim]
    .filter(Boolean)
    .join(" ");
  const name = decode.usMarket ? identity || "Vehicle" : "Non-US-market vehicle";

  return {
    title: `${name} — VIN ${vin} | Voltcheck`,
    description: `What VIN ${vin} decodes to: ${name}. Battery pack, EPA range, and warranty for this configuration.`,
    openGraph: { title: `${name} — VIN check`, description: `The battery, range, and warranty behind VIN ${vin}.`, type: "website", url: `/vin/${vin}` },
    ...noindex,
  };
}

export default async function VinPage(props: PageProps<"/vin/[vin]">) {
  const { vin: rawVin } = await props.params;
  const vin = decodeURIComponent(rawVin).toUpperCase();
  if (!isValidVin(vin)) notFound();

  const decode = await getDecode(vin);
  const tesla = isTeslaVin(vin) ? decodeTeslaVin(vin) : null;
  // Tesla Model 3/Y VIN-8 buckets where several materially different cars
  // share this VIN pattern: show them as the candidates they are rather than
  // letting the trim-less match settle on one by elimination.
  const enrichment = withTeslaCollisionAbstention(decode, matchEnrichment(decode, tesla));
  const checklist = buildChecklist(decode);

  // A single-pattern filing artifact (every 2026 RAV4 PHEV decodes Trim
  // "GR Sport") is not this car's trim and must not be shown as it — the
  // matcher already refuses to let it pick a row.
  const trimIsArtifact = vpicTrimIsPatternArtifact(decode);
  const identity = [decode.modelYear, decode.make, resolvedModel(decode, enrichment), trimIsArtifact ? undefined : decode.trim]
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
            Likely a grey import
          </div>
          <p className="mt-1 text-sm text-zinc-700 dark:text-zinc-300">
            This VIN pattern (e.g. Shanghai-built LRW… or Berlin-built XP7… Teslas) is not a
            US-market car. Parts, warranty, software region, and Supercharger access may
            differ.
          </p>
        </div>
      )}

      {decode.usMarket && (
        <Section title="From the VIN">
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
            </div>
            <div>
              {decode.trim && !trimIsArtifact && (
                <FactRow label="Trim" fact={{ value: decode.trim, source: "vpic", asOf: "—", confidence: "medium" }} />
              )}
              {decode.driveType && (
                <FactRow label="Drive type" fact={{ value: decode.driveType, source: "vpic", asOf: "—", confidence: "medium" }} />
              )}
            </div>
          </div>
        </Section>
      )}

      {enrichment.exact && (
        <Section title="Specifications">
          <EnrichmentFacts row={enrichment.exact} />
        </Section>
      )}

      {enrichment.candidates && (
        <Section title="Possible configurations">
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
                    : (Array.isArray(row.trim) ? row.trim[0] : row.trim) ?? row.id}
                </div>
                <EnrichmentFacts row={row} />
              </div>
            ))}
          </div>
        </Section>
      )}

      <AskSeller items={checklist} />
    </div>
  );
}
