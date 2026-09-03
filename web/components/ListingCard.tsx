import Link from "next/link";
import { Tile, type TileGround, type TileKind } from "./Tile";
import { SaveToggle } from "./SaveToggle";
import { askVsMarketTile, type CardRow, type CardTile } from "@/lib/listings/card";
import { INCENTIVES_COPY_READY } from "@/lib/incentives/copy";

// Renders one precomputed card-index row (lib/listings/card.ts). Everything a
// card says was decided server-side at index build; this component only lays
// it out — which is what lets the browse grid live entirely in the browser.

// listedOn exists only on rows whose appearance is honestly a listing date
// (migration 0028) — a few percent of inventory today, growing nightly — so
// "Just listed" is an event, not wallpaper. Module scope: one clock reading
// per page visit, stable across re-renders (and outside the render for the
// hooks purity rule); a visit long enough for it to matter is a tab left
// open overnight.
const JUST_LISTED_MS = 7 * 86_400_000;
const LOADED_AT = Date.now();

function subtitle(r: CardRow, distanceMi?: number) {
  const bits: string[] = [];
  if (r.listedOn && LOADED_AT - Date.parse(r.listedOn) < JUST_LISTED_MS) bits.push("Just listed");
  if (r.condition === "new") bits.push("New");
  else if (r.mileage != null) bits.push(`${r.mileage.toLocaleString()} mi${r.mileage === 0 ? " (dealer-listed)" : ""}`);
  // A city without a state printed "Fontana, undefined" (owner, 2026-09-03).
  if (r.city) bits.push(r.state ? `${r.city}, ${r.state}` : r.city);
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
      ti: `Was $${cut.prevUsd.toLocaleString()}, cut $${cut.amountUsd.toLocaleString()} on ${CUT_DATE_FMT.format(new Date(cut.at))}`,
    });
  }
  // The seller's own description discloses a manufacturer repurchase. The
  // fact leads the card, and it is the reason no price claim rides with it:
  // buildIndex.ts keeps these cars out of both price models entirely.
  if (r.buyback) {
    lead.push({
      k: "flag" as TileKind,
      t: "Manufacturer repurchase (dealer information)",
      ti: "The dealer's own listing discloses that this vehicle was repurchased by its manufacturer. Price comparisons are not shown for repurchased cars.",
      w: true,
    });
  }
  // 2026-08-20 (docs/agents/pricing-model-2026-08-20.md): the "$X below/above
  // what others paid" tile (r.askVsSold, fitted on Washington title records
  // alone) no longer renders here. That single-state model reached only 4.7%
  // of listings and, checked against California sale data on matched
  // cohorts, read 7-35% high outside the Northwest — a confident-looking
  // teal claim standing on less than its own visual treatment implied.
  // It stays withheld until a second regional dataset can validate an
  // offset (see the memo's migration path). The computation is untouched:
  // askVsMarket below still borrows its fitted usd_per_mile for the mileage
  // slope, and it keeps powering the "Recently sold" panel's raw rows on the
  // listing page. The other listings of the same variant are, for now, the
  // one comparison this card makes. Wording lives in askVsMarketTile so this
  // card and the listing page can never drift apart.
  if (r.askVsMarket != null) {
    lead.push(askVsMarketTile(r.askVsMarket));
  }
  // The rebate program this car leads with (buildIndex → cardIncentive). The
  // tile is data only: the program's own figure and name, or the program's
  // cap when the ask sits over it. No hover restating it (owner, 2026-09-03:
  // the value is the answer). Off while the copy gate is shut.
  if (r.incentive && INCENTIVES_COPY_READY) {
    const inc = r.incentive;
    const usd = (n: number) => `$${n.toLocaleString("en-US")}`;
    lead.push({
      k: "spec" as TileKind,
      t: inc.overCapUsd ? `${inc.name}: ${usd(inc.overCapUsd)} cap` : inc.usd ? `${usd(inc.usd)} ${inc.name}` : inc.name,
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
            title="Voltcheck couldn't confirm this car's advertised price from the dealer's feed; see the dealer's own page"
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
              <Tile key={i} kind={t.k} ground={ground} title={t.ti} wrap={t.w}>
                {t.t}
              </Tile>
            ))}
          </div>
        )}
      </div>

      {/* Save toggle, keylined into the top-right corner. It preventDefaults
          its own click so saving never navigates. */}
      <SaveToggle id={r.id} title={r.title} priceUsd={r.realPrice ? r.priceUsd : undefined} />

      {/* Hover and keyboard focus both draw the same inset keyline — no shadow,
          nothing that moves the card off the grid. */}
      <span className="pointer-events-none absolute inset-0 ring-0 ring-inset ring-cobalt transition-none group-hover:ring-[6px] group-focus-visible:ring-[6px]" />
    </Link>
  );
}
