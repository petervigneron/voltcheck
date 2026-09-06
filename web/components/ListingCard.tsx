import Link from "next/link";
import { Tile, type TileGround, type TileKind } from "./Tile";
import { SaveToggle } from "./SaveToggle";
import { askVsMarketTile, type CardRow, type CardTile } from "@/lib/listings/card";
import { INCENTIVE_COPY, INCENTIVES_COPY_READY } from "@/lib/incentives/copy";

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

// A card's ground is paper unless it states a card-level fact:
//
//   plain — every card on paper. The original scheme gave one card in five a
//           cobalt or saffron ground as pure pacing ("rhythm"); the owner
//           turned that off on 2026-09-03 — a colour that means nothing on
//           one card in five undermines every card where it means something.
//   fact  — the ground IS a card-level fact: teal = the battery pack was
//           replaced, violet = the price came down (≥$500 within 14 days,
//           see lib/listings/price.ts; violet is the money colour). Everything
//           else stays paper, and the rarity is the point — a colored card is
//           an event. Still behind ?grounds=fact.
//
// The fact never rides on colour alone: a teal card carries the "New
// battery" tile, a violet card gets a "−$2,100" tile prepended.
export type GroundsMode = "plain" | "fact";

const GROUND_CLS: Record<TileGround, string> = {
  paper: "bg-paper text-ink",
  violet: "bg-violet text-paper",
  saffron: "bg-saffron text-ink",
  teal: "bg-teal text-paper",
};

const META_CLS: Record<TileGround, string> = {
  paper: "text-ink/60",
  violet: "text-paper/70",
  saffron: "text-ink/70",
  teal: "text-paper/70",
};

const CUT_DATE_FMT = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

export function ListingCard({
  r,
  distanceMi,
  index = 0,
  grounds = "plain",
  pro,
}: {
  r: CardRow;
  distanceMi?: number;
  index?: number;
  grounds?: GroundsMode;
  /** Whether this browser holds a Pro pass (lib/useProState.ts), passed
   *  down by the client grid that already asked. The rebate tag is Pro
   *  (owner, 2026-09-03: "paywalled like price trends are"); absent or
   *  unknown reads as no pass, so the tag never flashes on and off. */
  pro?: boolean | null;
}) {
  const cut = grounds === "fact" ? r.cut : undefined;
  const ground: TileGround =
    grounds === "fact" ? (r.packReplaced ? "teal" : cut ? "violet" : "paper") : "paper";
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
      t: "Manufacturer repurchase",
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
  // A purchase program names this car (buildIndex → cardIncentive). One
  // short tag in the owner's pattern — "CA resident rebate" — and nothing
  // else: the figure-and-name tile it replaces ("$4,000 California Clean
  // Cars 4 All") overran a narrow card, and the figures, caps and
  // conditions belong to the car's own page (owner, 2026-09-03). Pro only,
  // and off while the copy gate is shut. A body packed before the state
  // rode with the summary prints no tag until the next publish.
  if (r.incentive?.state && INCENTIVES_COPY_READY && pro === true) {
    const tpl = r.incentive.utility ? INCENTIVE_COPY.utilityTag : INCENTIVE_COPY.residentTag;
    lead.push({ k: "rebate" as TileKind, t: tpl.replace("{ST}", r.incentive.state) });
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
