import type { ChecklistItem } from "@/lib/types";

// Deliberately low-key: collapsed by default, plain list, no alarm styling.
export function AskSeller({ items }: { items: ChecklistItem[] }) {
  if (items.length === 0) return null;
  return (
    <details className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-5 py-4">
      <summary className="cursor-pointer text-sm font-medium text-zinc-600 dark:text-zinc-400 hover:text-emerald-600 dark:hover:text-emerald-400">
        Questions for the seller ({items.length})
      </summary>
      <ul className="mt-3 space-y-2">
        {items.map((item, i) => (
          <li key={i} className="text-sm">
            <span className="font-medium text-zinc-800 dark:text-zinc-200">{item.question}</span>
            {item.why && <span className="text-zinc-500 dark:text-zinc-400"> {item.why}</span>}
          </li>
        ))}
      </ul>
    </details>
  );
}
