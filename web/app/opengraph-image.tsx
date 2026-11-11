// The site's default link preview: the wordmark and the tagline. Every page
// without a picture of its own (and every listing whose seller gave no
// photo) shows this. Static — no data, rendered once per deployment.
import { ogCard, OG_SIZE, OG_TYPE } from "@/lib/og/card";

export const alt = "Census EV. Every electric car. One site.";
export const size = OG_SIZE;
export const contentType = OG_TYPE;

export default function Image() {
  return ogCard({});
}
