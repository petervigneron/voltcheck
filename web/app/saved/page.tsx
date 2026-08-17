import type { Metadata } from "next";
import { Saved } from "@/components/Saved";

export const metadata: Metadata = { title: "Saved cars — Voltcheck" };

// Static shell, like the browse page: the saved set lives in the visitor's
// localStorage and the inventory arrives client-side from the same /api/index
// shards the browse grid already caches, so the server has nothing
// per-visitor to render.
export default function SavedPage() {
  return <Saved />;
}
