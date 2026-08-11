import type { Fact } from "@/lib/types";

const LABELS: Record<string, { text: string; cls: string }> = {
  mfr: { text: "manufacturer", cls: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300" },
  vpic: { text: "NHTSA vPIC", cls: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300" },
  vin: { text: "VIN decode", cls: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300" },
  photo: { text: "photo-verified", cls: "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300" },
  dealer: { text: "dealer data", cls: "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300" },
  tested: { text: "measured tests", cls: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300" },
  est: { text: "estimate", cls: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300" },
  agg: { text: "unverified", cls: "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300" },
  unknown: { text: "unknown", cls: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400" },
};

export function SourceBadge({ fact }: { fact: Fact<unknown> }) {
  const l = LABELS[fact.source] ?? LABELS.unknown;
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${l.cls}`}
      title={`Source: ${l.text} · checked ${fact.asOf}${fact.sourceUrl ? ` · ${fact.sourceUrl}` : ""}`}
    >
      {l.text}
    </span>
  );
}
