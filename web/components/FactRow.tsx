import type { Fact } from "@/lib/types";
import { SourceBadge } from "./SourceBadge";

export function FactRow({
  label,
  fact,
  format,
}: {
  label: string;
  fact?: Fact<unknown>;
  format?: (v: unknown) => string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2 border-b border-zinc-100 dark:border-zinc-800 last:border-0">
      <div className="text-sm text-zinc-500 dark:text-zinc-400">{label}</div>
      <div className="text-right">
        {fact ? (
          <>
            <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
              {format ? format(fact.value) : String(fact.value)}
            </span>{" "}
            <SourceBadge fact={fact} />
            {fact.note && (
              <div className="mt-0.5 max-w-xs text-xs text-zinc-500 dark:text-zinc-400">{fact.note}</div>
            )}
          </>
        ) : (
          <span className="text-sm text-zinc-400 dark:text-zinc-500 italic">unknown — we won’t guess</span>
        )}
      </div>
    </div>
  );
}
