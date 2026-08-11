import Link from "next/link";
import type { EnrichedListing } from "@/lib/listings/enrich";

const CHIP = {
  info: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  bad: "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300",
  verify: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  good: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
} as const;

function Chip({ kind, title, children }: { kind: keyof typeof CHIP; title?: string; children: React.ReactNode }) {
  return (
    <span title={title} className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-medium ${CHIP[kind]}`}>
      {children}
    </span>
  );
}

// Chips call out what's differentiated or wrong — not defaults. Fast charging
// and a transferable battery warranty are the norm; only their absence earns
// space on the card.
export function ListingCard({ e, distanceMi }: { e: EnrichedListing; distanceMi?: number }) {
  const l = e.listing;
  const chips: React.ReactNode[] = [];

  if (e.enrichment.candidates) {
    const ranges = e.enrichment.candidates
      .map((r) => r.range?.epaRangeMi?.value)
      .filter((v): v is number => v !== undefined)
      .sort((a, b) => a - b);
    chips.push(
      <Chip key="cand" kind="verify" title={e.enrichment.discriminator}>
        {ranges.length >= 2 ? `${ranges[0]} or ${ranges[ranges.length - 1]} mi — verify version` : "Version needs verifying"}
      </Chip>
    );
  } else if (e.realRangeMi) {
    chips.push(
      <Chip key="range" kind="info" title={e.realRangeMi.note ?? "Official EPA rating for this version"}>
        {e.realRangeMi.value} mi EPA
      </Chip>
    );
  }
  if (e.usableKwh) {
    chips.push(
      <Chip key="kwh" kind="info" title={e.usableKwh.note ?? undefined}>
        ≈{Math.round(e.usableKwh.value)} kWh
      </Chip>
    );
  }
  if (e.heatPump?.status === "no") chips.push(<Chip key="hp" kind="bad" title={e.heatPump.detail}>No heat pump</Chip>);
  if (e.heatPump?.status === "verify") chips.push(<Chip key="hp" kind="verify" title={e.heatPump.detail}>Heat pump: verify</Chip>);
  if (e.fastCharge.status === "no") chips.push(<Chip key="fc" kind="bad" title={e.fastCharge.detail}>No fast charging</Chip>);
  if (e.fastCharge.status === "verify") chips.push(<Chip key="fc" kind="verify" title={e.fastCharge.detail}>Fast charging: verify</Chip>);
  if (l.campaignCheck?.packReplaced) {
    chips.push(
      <Chip key="pack" kind="good" title={`GM program ${l.campaignCheck.gmProgramNumber} · ${l.campaignCheck.packReplacedDate}`}>
        New battery {l.campaignCheck.packReplacedDate?.slice(0, 4)}
      </Chip>
    );
  }

  return (
    <Link
      href={`/listing/${l.id}`}
      className="group flex gap-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-3 transition hover:border-emerald-500/50 hover:shadow-md"
    >
      <div className="h-28 w-40 flex-none overflow-hidden rounded-lg bg-zinc-100 dark:bg-zinc-800">
        {l.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- external dealer CDN
          <img src={l.imageUrl} alt="" className="h-full w-full object-cover transition group-hover:scale-[1.03]" loading="lazy" />
        ) : (
          <div className="flex h-full items-center justify-center text-2xl text-zinc-300 dark:text-zinc-600">⚡</div>
        )}
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="truncate font-semibold group-hover:text-emerald-600 dark:group-hover:text-emerald-400">
              {l.year} {l.make} {l.model}
              {l.trim ? <span className="text-zinc-500 dark:text-zinc-400 font-normal"> {l.trim}</span> : null}
            </div>
            <div className="mt-0.5 truncate text-xs text-zinc-500 dark:text-zinc-400">
              {l.condition === "new"
                ? "New"
                : l.condition === "certified"
                  ? `Certified${l.mileage != null ? ` · ${l.mileage.toLocaleString()} mi` : ""}`
                  : l.mileage != null
                    ? `${l.mileage.toLocaleString()} mi${l.mileage === 0 ? " (dealer-listed)" : ""}`
                    : "Used"}
              {l.city ? ` · ${l.city}, ${l.state}` : ""}
              {distanceMi !== undefined ? ` · ${distanceMi} mi away` : ""}
              {l.dealerName ? ` · ${l.dealerName}` : ""}
            </div>
          </div>
          <div className="text-right">
            <div className="text-lg font-bold tabular-nums">${l.priceUsd.toLocaleString()}</div>
            {e.trapCount > 0 && (
              <div className="text-[11px] font-semibold text-rose-600 dark:text-rose-400">
                {e.trapCount} thing{e.trapCount > 1 ? "s" : ""} to check
              </div>
            )}
          </div>
        </div>

        {chips.length > 0 && <div className="mt-auto flex flex-wrap gap-1.5 pt-2">{chips.slice(0, 5)}</div>}
      </div>
    </Link>
  );
}
