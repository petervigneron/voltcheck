import { Panel } from "./EnrichmentReport";
import { vinHistoryRows, type VinHistory as VinHistoryData } from "@/lib/listings/vinHistory";

// "This VIN's history": where this exact car was listed before, and when it
// was off the market. Pro-only — the listing page wraps it in ProOnly, so a
// stranger sees no block, no heading and no teaser.
//
// The rows are decided in lib/listings/vinHistory.ts; this file prints them
// and nothing else. No empty state: 881 of 172,003 live cars have anything
// here (0085), and a line telling the other 171,122 that their car has no
// recorded history is the line the copy rule deleted twice already.
//
// The summary card's Spec dialect — label left, value right, hairline
// between — rather than tiles: these values are dates and domains, and a
// domain is too long to read as a chip.
//
// It overlaps the price sparkline on purpose and only just: that chart draws
// the earlier listing's price as a grey step with no words, by the owner's
// rule for that surface (components/PriceSparkline.tsx). The one thing it
// deliberately does not carry is WHERE, which is the shopper's actual
// question here.
export function VinHistory({
  history,
  realPrice,
}: {
  history?: VinHistoryData;
  realPrice: (priceUsd: number) => boolean;
}) {
  const rows = vinHistoryRows(history, realPrice);
  if (rows.length === 0) return null;
  return (
    <Panel title="This VIN's history">
      <div>
        {rows.map((r, i) => (
          <div
            key={i}
            className="flex justify-between gap-4 border-b border-ink/10 py-2 text-[14px] last:border-0"
          >
            <span className="shrink-0 text-ink/60">{r.label}</span>
            <span className="min-w-0 text-right font-semibold break-words tabular-nums">{r.value}</span>
          </div>
        ))}
      </div>
    </Panel>
  );
}
