// Where this car was listed before it appeared on its current site, and at
// what price — the owner's "option 2" of 2026-09-03 (1FT6W3L78RWG27106 left
// hobsoncdjr.com at $41,581 and reappeared on recharged.com at $47,500; the
// price chart, which follows one seller, cannot say that and should not).
//
// The fact comes from listing_prior_site (migration 0061), which only names a
// site whose page went away before the car came back under another domain at
// another price, and never an OEM locator lane. It is a fact about a SITE:
// same-owner rooftop pairs survive the view's gates, so the line must not
// say "another dealer" or "sold".
//
// Dark until the owner writes the line. The owner writes all shopper-facing
// copy on this site (CLAUDE.md, "The house rule on copy"); the values the
// sentence can use are the three fields of `site`. Put the template in
// PRIOR_SITE_LINE using {domain}, {price} and {date}; while it is empty this
// renders nothing.
const PRIOR_SITE_LINE: string = "";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const monthDay = (iso: string) => {
  const d = new Date(iso);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
};

export function PriorSiteLine({
  site,
}: {
  site: { domain: string; priceUsd: number; lastSeenAt: string; delistedAt: string };
}) {
  if (!PRIOR_SITE_LINE) return null;
  const text = PRIOR_SITE_LINE.replace("{domain}", site.domain)
    .replace("{price}", `$${site.priceUsd.toLocaleString()}`)
    .replace("{date}", monthDay(site.delistedAt));
  return <p className="mt-2 text-[12px] leading-snug tabular-nums text-ink/55 dark:text-zinc-400">{text}</p>;
}
