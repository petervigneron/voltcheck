// The Open Graph block a page hands to link previews (iMessage, Slack,
// Reddit, X, LinkedIn). Until 2026-11-11 only listing pages had one: a link to
// the home page, a model page or /market unfurled as a bare URL, which is the
// worst possible showing for the one channel the site currently has —
// someone pasting a link.
//
// Why a helper rather than a block in the root layout: Next merges metadata
// shallowly, so a page that sets `openGraph` at all REPLACES the parent's
// whole object, siteName and type included. Every page therefore builds the
// complete block here.
//
// The picture is the trap, in both directions (both measured in dev,
// 2026-11-11):
//   * a page that sets `openGraph` and has no opengraph-image file in its own
//     segment does NOT fall back to the root file — the replaced block takes
//     the root picture with it, and /ev came out with no og:image at all. So
//     the block names the root picture itself;
//   * but a block that names a picture beats the segment's own file: with the
//     default always present, every model page and /market showed the
//     wordmark card instead of their own. So a page whose segment has a file
//     says OWN_IMAGE, and the block leaves `images` out for the file to fill.
import type { Metadata } from "next";

export const SITE_NAME = "Census EV";
/** app/opengraph-image.tsx, the wordmark card. */
export const DEFAULT_IMAGE = { url: "/opengraph-image", width: 1200, height: 630, alt: "Census EV. Every electric car. One site." };

/** The part every page shares; also what the root layout hands to pages that build no block. */
export const OG_BASE = { siteName: SITE_NAME, type: "website", locale: "en_US" } as const;

/** "This segment has its own opengraph-image file; leave the picture to it." */
export const OWN_IMAGE = Symbol("own opengraph-image file");

export function openGraph(
  title: string,
  description: string | undefined,
  path: string,
  image?: string | typeof OWN_IMAGE,
): NonNullable<Metadata["openGraph"]> {
  const block = { ...OG_BASE, title, description, url: path };
  return image === OWN_IMAGE ? block : { ...block, images: [image ?? DEFAULT_IMAGE] };
}
