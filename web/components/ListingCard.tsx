import Link from "next/link";
import type { EnrichedListing } from "@/lib/listings/enrich";
import { Tile, type TileGround, type TileKind } from "./Tile";
import { hasRealPrice } from "@/lib/listings/price";

// The key facts a shopper compares — range, heat pump, drivetrain — come
// first and always survive the cap; extras (fast charging, new battery, pack
// size, mileage outliers) fill whatever room is left.
export function listingTiles(
  e: EnrichedListing,
  max?: number
): { kind: TileKind; text: string; title?: string }[] {
  const l = e.listing;
  const t: { kind: TileKind; text: string; title?: string }[] = [];

  if (e.enrichment.candidates) {
    const ranges = e.enrichment.candidates
      .map((r) => r.range?.epaRangeMi?.value)
      .filter((v): v is number => v !== undefined)
      .sort((a, b) => a - b);
    if (ranges.length >= 2) {
      t.push({
        kind: "flag",
        text: `${ranges[0]}–${ranges[ranges.length - 1]} mi`,
        title: e.enrichment.discriminator ?? "This listing doesn't say which version it is",
      });
    }
  } else if (e.realRangeMi) {
    t.push({ kind: "range", text: `${e.realRangeMi.value} mi`, title: e.realRangeMi.note ?? undefined });
  }

  if (e.heatPump?.status === "no") t.push({ kind: "miss", text: "No heat pump", title: e.heatPump.detail });
  else if (e.heatPump?.status === "verify") t.push({ kind: "flag", text: "Heat pump?", title: e.heatPump.detail });
  else if (e.heatPump?.status === "yes") t.push({ kind: "kit", text: "Heat pump", title: e.heatPump.detail });

  if (l.drive) t.push({ kind: "spec", text: l.drive });

  if (e.fastCharge.status === "no") t.push({ kind: "miss", text: "No fast charging", title: e.fastCharge.detail });
  else if (e.fastCharge.status === "verify") t.push({ kind: "flag", text: "Fast charging?", title: e.fastCharge.detail });

  if (l.campaignCheck?.packReplaced) {
    t.push({
      kind: "kit",
      text: `New battery ${l.campaignCheck.packReplacedDate?.slice(0, 4) ?? ""}`.trim(),
      title: `GM program ${l.campaignCheck.gmProgramNumber} · ${l.campaignCheck.packReplacedDate}`,
    });
  }

  if (e.usableKwh) t.push({ kind: "spec", text: `${Math.round(e.usableKwh.value)} kWh`, title: e.usableKwh.note ?? undefined });

  if (l.mileage != null && l.mileage > 0 && l.mileage < 15000) t.push({ kind: "flag", text: "Low miles" });
  else if (l.mileage != null && l.mileage > 100000) t.push({ kind: "flag", text: "High miles" });

  return max ? t.slice(0, max) : t;
}

function subtitle(e: EnrichedListing, distanceMi?: number) {
  const l = e.listing;
  const bits: string[] = [];
  if (l.condition === "new") bits.push("New");
  else if (l.mileage != null) bits.push(`${l.mileage.toLocaleString()} mi${l.mileage === 0 ? " (dealer-listed)" : ""}`);
  if (l.city) bits.push(`${l.city}, ${l.state}`);
  if (distanceMi !== undefined) bits.push(`${distanceMi} mi away`);
  return bits.join(" · ");
}

// One card in five takes a solid ground, alternating cobalt and saffron. It's
// the rhythm that keeps a long grid from flattening, and the ceiling that keeps
// it from shouting.
function groundFor(index: number): TileGround {
  if (index % 5 !== 1) return "paper";
  return Math.floor(index / 5) % 2 === 0 ? "cobalt" : "saffron";
}

const GROUND_CLS: Record<TileGround, string> = {
  paper: "bg-paper text-ink",
  cobalt: "bg-cobalt text-paper",
  saffron: "bg-saffron text-ink",
};

const META_CLS: Record<TileGround, string> = {
  paper: "text-ink/60",
  cobalt: "text-paper/70",
  saffron: "text-ink/70",
};

export function ListingCard({
  e,
  distanceMi,
  index = 0,
}: {
  e: EnrichedListing;
  distanceMi?: number;
  index?: number;
}) {
  const l = e.listing;
  const ground = groundFor(index);
  const tiles = listingTiles(e, 5);

  return (
    <Link
      href={`/listing/${l.id}`}
      className={`group relative flex flex-col border-r-[3px] border-b-[3px] border-ink focus:outline-none ${GROUND_CLS[ground]}`}
    >
      {/* A missing photo gets a band, not an empty 3:2 hole — three grey voids
          in a row is a worse first impression than three short cards. */}
      {l.imageUrl ? (
        <div className="aspect-[3/2] overflow-hidden border-b-[3px] border-ink bg-putty">
          {/* eslint-disable-next-line @next/next/no-img-element -- external dealer CDN */}
          <img src={l.imageUrl} alt="" loading="lazy" className="photo-overscan h-full w-full object-cover" />
        </div>
      ) : (
        <div className="border-b-[3px] border-ink bg-putty px-4 py-2 text-[10.5px] font-extrabold tracking-[0.14em] text-ink/55 uppercase">
          No photo from the dealer
        </div>
      )}

      <div className="flex flex-1 flex-col gap-2 p-4">
        {hasRealPrice(l) ? (
          <div className="text-[32px] leading-none font-extrabold tracking-[-0.035em] tabular-nums">
            ${l.priceUsd.toLocaleString()}
          </div>
        ) : (
          <div
            className="text-[22px] leading-none font-extrabold tracking-[-0.02em]"
            title={`The dealer feed listed $${l.priceUsd.toLocaleString()}, which is a lease payment rather than a price`}
          >
            Price not posted
          </div>
        )}
        <div>
          <h2 className="text-[15px] leading-tight font-bold">
            {l.year} {l.make} {l.model}
            {l.trim ? ` ${l.trim}` : ""}
          </h2>
          <p className={`mt-0.5 text-[12.5px] tabular-nums ${META_CLS[ground]}`}>{subtitle(e, distanceMi)}</p>
        </div>

        {tiles.length > 0 && (
          <div className="mt-auto flex flex-wrap gap-1.5 pt-1">
            {tiles.map((t, i) => (
              <Tile key={i} kind={t.kind} ground={ground} title={t.title}>
                {t.text}
              </Tile>
            ))}
          </div>
        )}
      </div>

      {/* Hover and keyboard focus both draw the same inset keyline — no shadow,
          nothing that moves the card off the grid. */}
      <span className="pointer-events-none absolute inset-0 ring-0 ring-inset ring-cobalt transition-none group-hover:ring-[6px] group-focus-visible:ring-[6px]" />
    </Link>
  );
}
