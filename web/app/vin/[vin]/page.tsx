import { cache } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { decodeVin, isValidVin } from "@/lib/vpic";
import { decodeTeslaVin, isTeslaVin } from "@/lib/tesla-vin";
import { matchEnrichment, vpicTrimIsPatternArtifact } from "@/lib/enrichment/match";
import { vpicEvModelAliases } from "@/lib/enrichment/vpicEvAlias";
import { withTeslaCollisionAbstention } from "@/lib/listings/teslaRangeAbstain";
import type { EnrichmentResult, Fact, VinDecode } from "@/lib/types";
import { buildChecklist } from "@/lib/checklist";
import { FactRow } from "@/components/FactRow";
import { CandidateRows, EnrichmentFacts, Panel } from "@/components/EnrichmentReport";
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

// The same dialect as the listing page (owner, 2026-09-10): the ink header
// runs on into a band carrying what the VIN decodes to, the specifications
// are solid tiles under an ink bar in the card-tile colours, and every other
// block is a square 3px-ink panel.
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
  // vPIC's own electrification field. It only changes a spec tile's colour:
  // a missing heat pump or DC port is no alarm on a plug-in hybrid.
  const plugIn = /PHEV/i.test(decode.electrificationLevel ?? "");

  const plant: Fact<string> | undefined = tesla?.plant
    ? { value: `${tesla.plant.name} (VIN pos. 11 = ${tesla.plant.code})`, source: "vin", asOf: "—", confidence: "high" }
    : decode.plantCity
      ? { value: [decode.plantCity, decode.plantState, decode.plantCountry].filter(Boolean).join(", "), source: "vpic", asOf: "—", confidence: "high" }
      : undefined;
  const trim = decode.trim && !trimIsArtifact ? decode.trim : undefined;
  // A heading with nothing under it is a label the shopper scans for nothing.
  const fromVin = decode.usMarket && (plant || trim || decode.driveType);

  return (
    <div className="pb-2">
      <div className="bg-ink text-paper">
        <div className="mx-auto max-w-[1100px] px-4 pt-5 pb-8">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 border-[3px] border-paper/50 px-3.5 py-2 text-[12px] font-extrabold tracking-[0.08em] text-paper uppercase hover:border-paper hover:bg-cobalt focus:outline-none focus-visible:border-paper focus-visible:bg-cobalt"
          >
            ← new search
          </Link>
          <div className="mt-6 font-mono text-[13px] tracking-[0.06em] text-paper/60">{vin}</div>
          <h1 className="mt-1.5 text-[30px] leading-[1.05] font-extrabold tracking-[-0.03em] sm:text-[42px]">
            {decode.usMarket ? identity || "Decoded vehicle" : "Not a US-market vehicle"}
          </h1>
          {decode.electrificationLevel && (
            <p className="mt-2 text-[16px] font-semibold text-paper/65">{decode.electrificationLevel}</p>
          )}
        </div>
      </div>

      <div className="mx-auto max-w-[1100px] space-y-5 px-4 pt-5">
        {!decode.usMarket && (
          <div className="border-[3px] border-ink bg-paper p-4 text-[14px]">
            <div className="font-semibold">Likely a grey import</div>
            <p className="mt-1 text-ink/75">
              This VIN pattern (e.g. Shanghai-built LRW… or Berlin-built XP7… Teslas) is not a
              US-market car. Parts, warranty, software region, and Supercharger access may
              differ.
            </p>
          </div>
        )}

        {fromVin && (
          <Panel title="From the VIN">
            <div className="flex flex-wrap gap-1.5">
              <FactRow tile label="Assembly plant" fact={plant} />
              {trim && <FactRow tile label="Trim" fact={{ value: trim, source: "vpic", asOf: "—", confidence: "medium" }} />}
              {decode.driveType && (
                <FactRow tile label="Drive type" fact={{ value: decode.driveType, source: "vpic", asOf: "—", confidence: "medium" }} />
              )}
            </div>
          </Panel>
        )}

        {enrichment.exact && (
          <section className="border-[3px] border-ink bg-paper">
            <h2 className="bg-ink px-5 py-3 text-[13px] font-extrabold tracking-[0.06em] text-paper uppercase">
              Specifications
            </h2>
            <div className="p-5">
              <EnrichmentFacts tiles plugIn={plugIn} row={enrichment.exact} />
            </div>
          </section>
        )}

        {enrichment.candidates && (
          <Panel title="Possible configurations">
            <CandidateRows rows={enrichment.candidates} discriminator={enrichment.discriminator} plugIn={plugIn} />
          </Panel>
        )}

        <AskSeller items={checklist} keyline />
      </div>
    </div>
  );
}
