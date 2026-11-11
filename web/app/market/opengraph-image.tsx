// /market's link preview: the page's own heading under the wordmark. No
// figure on it — the page deliberately prints no single headline number for
// "used EV prices" (see page.tsx), so the card does not invent one.
import { ogCard, OG_SIZE, OG_TYPE } from "@/lib/og/card";

export const alt = "Used EV prices on Census EV";
export const size = OG_SIZE;
export const contentType = OG_TYPE;

export default function Image() {
  return ogCard({ headline: "Used EV prices" });
}
