// A model page's link preview: the nameplate and how many are for sale,
// the same count and month the page's own description states, read from the
// same hub artifact at the same daily cadence — so the card cannot say a
// number the page does not.
//
// Rendered on first request and cached for a day, like the page; never at
// build time (the page's header says why 246 prerenders are off the table).
// One image per model, not per car: a picture per listing would be ~170,000
// cache writes, which is the 2026-09-19 billing incident again. Listings use
// the seller's own photo instead.
import { notFound } from "next/navigation";
import { findModelHub } from "@/lib/listings/modelHubs";
import { hubIndexKey } from "@/lib/listings/hubIndex";
import { hubEntry } from "@/lib/listings/hubSource";
import { ogCard, OG_SIZE, OG_TYPE } from "@/lib/og/card";
import { hubCardLine } from "@/lib/og/hubLine";

export const alt = "Electric cars for sale on Census EV";
export const size = OG_SIZE;
export const contentType = OG_TYPE;
export const revalidate = 86400;

export default async function Image({ params }: { params: Promise<{ make: string; model: string }> }) {
  const { make, model } = await params;
  const hub = findModelHub(make, model);
  if (!hub) notFound();
  const { total, stats } = await hubEntry(hubIndexKey(hub));
  return ogCard({ headline: `${hub.make} ${hub.model}`, line: hubCardLine(total, stats?.asOf) });
}
