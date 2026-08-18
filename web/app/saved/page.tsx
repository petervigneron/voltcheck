import type { Metadata } from "next";
import { SavedView } from "@/components/SavedView";

export const metadata: Metadata = { title: "Saved — Voltcheck" };

// Static shell, like the browse page: the saved cars and saved searches both
// live in the visitor's localStorage and the inventory arrives client-side
// from the same /api/index shards the browse grid already caches, so the
// server has nothing per-visitor to render.
export default function SavedPage() {
  return <SavedView />;
}
