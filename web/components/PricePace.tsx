import { Tile } from "@/components/Tile";
import { ProOnly } from "@/components/ProOnly";
import { pricePaceTiles, type DealerPace, type PricePoint } from "@/lib/listings/pace";

// How long this car has sat, and what the seller did about it — one keylined
// block of the band's own tiles, under the price and market panels.
//
// No heading and no sentence. Each tile says what it is ("23 days listed",
// "26% of this seller's EVs cut est"), so a line introducing them would be a
// line the shopper reads for nothing, and a block that explained its own
// numbers is the thing the copy rule was written about. A tile that has
// nothing to say is absent; when every tile is absent so is the block.
//
// Pro only, and absent rather than blurred for everyone else — the same
// stance as the ask-vs-market tile in the band above (components/ProOnly.tsx
// says why the Market-trends blur is the exception, not the rule).
export function PricePace({
  listedOn,
  history,
  dealer,
}: {
  listedOn?: string;
  history?: PricePoint[];
  dealer?: DealerPace | null;
}) {
  const tiles = pricePaceTiles({ listedOn, history, dealer });
  if (tiles.length === 0) return null;
  return (
    <ProOnly>
      <section className="min-w-0 border-[3px] border-ink bg-paper p-5">
        <div className="flex flex-wrap gap-1.5">
          {tiles.map((t, i) => (
            <Tile key={i} size="lg" kind={t.kind} title={t.title}>
              {t.text}
            </Tile>
          ))}
        </div>
      </section>
    </ProOnly>
  );
}
