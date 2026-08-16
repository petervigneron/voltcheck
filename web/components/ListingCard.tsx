import Link from "next/link";
import { Tile, type TileGround, type TileKind } from "./Tile";
import type { CardRow, CardTile } from "@/lib/listings/card";

// Renders one precomputed card-index row (lib/listings/card.ts). Everything a
// card says was decided server-side at index build; this component only lays
// it out — which is what lets the browse grid live entirely in the browser.

function subtitle(r: CardRow, distanceMi?: number) {
  const bits: string[] = [];
  if (r.condition === "new") bits.push("New");
  else if (r.mileage != null) bits.push(`${r.mileage.toLocaleString()} mi${r.mileage === 0 ? " (dealer-listed)" : ""}`);
  if (r.city) bits.push(`${r.city}, ${r.state}`);
  if (distanceMi !== undefined) bits.push(`${distanceMi} mi away`);
  return bits.join(" · ");
}

// Two ways a card earns a solid ground:
//
//   rhythm — one card in five, alternating cobalt and saffron; pure pacing,
//            the colour says nothing about the car (the original scheme).
//   fact   — the ground IS a card-level fact: teal = the battery pack was
//            replaced, cobalt = the price came down (≥$500 within 14 days,
//            see lib/listings/price.ts). Everything else stays paper, and
//            the rarity is the point — a colored card is an event.
//
// The fact never rides on colour alone: a teal card carries the "New
// battery" tile, a cobalt card gets a "−$2,100" tile prepended.
export type GroundsMode = "rhythm" | "fact";

function rhythmGround(index: number): TileGround {
  if (index % 5 !== 1) return "paper";
  return Math.floor(index / 5) % 2 === 0 ? "cobalt" : "saffron";
}

const GROUND_CLS: Record<TileGround, string> = {
  paper: "bg-paper text-ink",
  cobalt: "bg-cobalt text-paper",
  saffron: "bg-saffron text-ink",
  teal: "bg-teal text-paper",
};

const META_CLS: Record<TileGround, string> = {
  paper: "text-ink/60",
  cobalt: "text-paper/70",
  saffron: "text-ink/70",
  teal: "text-paper/70",
};

const CUT_DATE_FMT = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

export function ListingCard({
  r,
  distanceMi,
  index = 0,
  grounds = "rhythm",
}: {
  r: CardRow;
  distanceMi?: number;
  index?: number;
  grounds?: GroundsMode;
}) {
  const cut = grounds === "fact" ? r.cut : undefined;
  const ground: TileGround =
    grounds === "fact" ? (r.packReplaced ? "teal" : cut ? "cobalt" : "paper") : rhythmGround(index);
  const lead: CardTile[] = [];
  if (cut) {
    lead.push({
      k: "cut" as TileKind,
      t: `−$${cut.amountUsd.toLocaleString()}`,
      ti: `Was $${cut.prevUsd.toLocaleString()} — cut $${cut.amountUsd.toLocaleString()} on ${CUT_DATE_FMT.format(new Date(cut.at))}`,
    });
  }
  // Asking price against what this exact variant actually sells for. Under
  // is the find, so it reads as a kit tile; over is a plain miss. The tile
  // only exists when the gap already cleared its cohort's error bar.
  if (r.askVsSold != null) {
    const under = r.askVsSold < 0;
    const amount = `$${Math.abs(r.askVsSold).toLocaleString()}`;
    lead.push({
      k: under ? ("kit" as TileKind) : ("miss" as TileKind),
      t: `${amount} ${under ? "under" : "over"} sold price`,
      ti: `Asks ${amount} ${under ? "less" : "more"} than these actually sell for — fitted on Washington State title records (data.wa.gov, ODbL)`,
    });
  }
  // Where no transaction model reaches — most of the site — the other listings
  // of the same variant are still a real comparison. Deliberately the quiet
  // putty tile, not the teal find: asking prices are what dealers want, they
  // run above what cars fetch, and live inventory over-represents the ones
  // that aren't selling. Never shown alongside the sold tile.
  else if (r.askVsMarket != null) {
    const under = r.askVsMarket.deltaUsd < 0;
    const amount = `$${Math.abs(r.askVsMarket.deltaUsd).toLocaleString()}`;
    // "this exact version" is a claim about the peers, and it was only ever
    // true where the VIN pins the trim. Where it doesn't, the peers are the
    // same year and configuration and the comparison still holds — the tile
    // exists precisely because their trims priced the same — but the tooltip
    // has to say which of the two it is.
    const peers = r.askVsMarket.trimMatched
      ? `the ${r.askVsMarket.peerN} of this exact version listed right now`
      : `the ${r.askVsMarket.peerN} closest matches listed right now — same year and configuration, trims that price alike`;
    lead.push({
      k: "spec" as TileKind,
      t: `${amount} ${under ? "under" : "over"} asking prices`,
      ti: `Asks ${amount} ${under ? "less" : "more"} than ${peers}, adjusted for mileage. Asking prices, not sales — no record of one of these selling covers this car.`,
    });
  }
  const tiles: CardTile[] = lead.length ? [...lead, ...r.tiles.slice(0, Math.max(0, 5 - lead.length))] : r.tiles;

  return (
    <Link
      href={`/listing/${r.id}`}
      className={`group relative flex flex-col border-r-[3px] border-b-[3px] border-ink focus:outline-none ${GROUND_CLS[ground]}`}
    >
      {/* A missing photo gets a band, not an empty 3:2 hole — three grey voids
          in a row is a worse first impression than three short cards. */}
      {r.imageUrl ? (
        <div className="aspect-[3/2] overflow-hidden border-b-[3px] border-ink bg-putty">
          {/* eslint-disable-next-line @next/next/no-img-element -- external dealer CDN */}
          <img
            src={r.imageUrl}
            alt=""
            loading={index < 3 ? "eager" : "lazy"}
            decoding="async"
            className="photo-overscan h-full w-full object-cover"
          />
        </div>
      ) : (
        <div className="border-b-[3px] border-ink bg-putty px-4 py-2 text-[10.5px] font-extrabold tracking-[0.14em] text-ink/55 uppercase">
          No photo from the dealer
        </div>
      )}

      <div className="flex flex-1 flex-col gap-2 p-4">
        {r.realPrice ? (
          <div className="text-[32px] leading-none font-extrabold tracking-[-0.035em] tabular-nums">
            ${r.priceUsd.toLocaleString()}
          </div>
        ) : (
          <div
            className="text-[22px] leading-none font-extrabold tracking-[-0.02em]"
            title={`The dealer's feed listed $${r.priceUsd.toLocaleString()}, which is not a plausible price for this car — see the dealer's own page`}
          >
            See dealer for price
          </div>
        )}
        <div>
          <h2 className="text-[15px] leading-tight font-bold">{r.title}</h2>
          <p className={`mt-0.5 text-[12.5px] tabular-nums ${META_CLS[ground]}`}>{subtitle(r, distanceMi)}</p>
        </div>

        {tiles.length > 0 && (
          <div className="mt-auto flex flex-wrap gap-1.5 pt-1">
            {tiles.map((t, i) => (
              <Tile key={i} kind={t.k} ground={ground} title={t.ti}>
                {t.t}
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
