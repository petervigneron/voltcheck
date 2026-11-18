// The /shop questions themselves (lib/listings/shop.ts says why the pages
// exist and what rules their figures obey): the registry, each question's
// heading and address, and its neighbours. Data-free, so the home page, the
// sitemaps and llms.txt can list the set without reading anything.

/** Cars listed under the model table, cheapest first. */
export const SHOP_CARS = 20;

export interface ShopQuestion {
  /** The page's address under /shop. Never change one that has shipped. */
  slug: string;
  /** "used" includes certified pre-owned (lib/listings/near.ts conditionSet). */
  condition: "used" | "new";
  kind: "BEV" | "PHEV";
  /** Asking price strictly under this many dollars. */
  under: number;
  /** EPA range at least this many miles; an estimated range does not count. */
  rangeMin?: number;
  heatPump?: true;
  /** The maker's own port; an estimated port does not count. */
  port?: "NACS";
  body?: "suv" | "truck";
  drive?: "AWD";
}

// Adding a question is one entry. The heading is built from the fields
// (shopHeading), so a new entry cannot say something its filter does not do.
//
// Not here: three-row EVs and PHEVs. Nothing the published records carry is a
// seat count — not the slim index, not the make partitions — so "three-row"
// could only be a guess from the model name, which is the kind of claim this
// site does not make.
export const SHOP_QUESTIONS: ShopQuestion[] = [
  { slug: "used-ev-under-15000", condition: "used", kind: "BEV", under: 15_000 },
  { slug: "used-ev-under-20000", condition: "used", kind: "BEV", under: 20_000 },
  { slug: "used-ev-under-25000", condition: "used", kind: "BEV", under: 25_000 },
  { slug: "used-ev-under-30000", condition: "used", kind: "BEV", under: 30_000 },
  { slug: "used-ev-under-40000", condition: "used", kind: "BEV", under: 40_000 },
  { slug: "used-plug-in-hybrid-under-20000", condition: "used", kind: "PHEV", under: 20_000 },
  { slug: "used-plug-in-hybrid-under-30000", condition: "used", kind: "PHEV", under: 30_000 },
  { slug: "used-ev-250-miles-range-under-30000", condition: "used", kind: "BEV", under: 30_000, rangeMin: 250 },
  { slug: "used-ev-250-miles-range-under-40000", condition: "used", kind: "BEV", under: 40_000, rangeMin: 250 },
  { slug: "used-ev-300-miles-range-under-30000", condition: "used", kind: "BEV", under: 30_000, rangeMin: 300 },
  { slug: "used-ev-300-miles-range-under-40000", condition: "used", kind: "BEV", under: 40_000, rangeMin: 300 },
  { slug: "used-ev-heat-pump-under-30000", condition: "used", kind: "BEV", under: 30_000, heatPump: true },
  { slug: "used-ev-nacs-under-30000", condition: "used", kind: "BEV", under: 30_000, port: "NACS" },
  { slug: "used-electric-suv-under-30000", condition: "used", kind: "BEV", under: 30_000, body: "suv" },
  { slug: "used-electric-truck-under-50000", condition: "used", kind: "BEV", under: 50_000, body: "truck" },
  { slug: "used-awd-ev-under-25000", condition: "used", kind: "BEV", under: 25_000, drive: "AWD" },
  { slug: "new-ev-under-35000", condition: "new", kind: "BEV", under: 35_000 },
  { slug: "new-ev-under-45000", condition: "new", kind: "BEV", under: 45_000 },
];

export const SHOP_PATH = "/shop";
export const shopPath = (q: Pick<ShopQuestion, "slug">) => `${SHOP_PATH}/${q.slug}`;

export function findShopQuestion(slug: string): ShopQuestion | undefined {
  return SHOP_QUESTIONS.find((q) => q.slug === slug);
}

const nf = new Intl.NumberFormat("en-US");
const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

/** "Used electric cars under $25,000", built from the question's own fields. */
export function shopHeading(q: ShopQuestion): string {
  const noun =
    q.kind === "PHEV"
      ? q.body === "suv"
        ? "plug-in hybrid SUVs"
        : q.body === "truck"
          ? "plug-in hybrid trucks"
          : "plug-in hybrids"
      : q.body === "suv"
        ? "electric SUVs"
        : q.body === "truck"
          ? "electric trucks"
          : "electric cars";
  const withs: string[] = [];
  if (q.rangeMin !== undefined) withs.push(`${nf.format(q.rangeMin)}+ miles of EPA range`);
  if (q.heatPump) withs.push("a heat pump");
  if (q.port) withs.push(`a ${q.port} charge port`);
  const cond = q.condition === "new" ? "New" : "Used";
  const awd = q.drive === "AWD" ? "all-wheel-drive " : "";
  const w = withs.length ? ` with ${withs.join(" and ")}` : "";
  return `${cond} ${awd}${noun}${w} under ${money.format(q.under)}`;
}

export interface ShopLink {
  label: string;
  href: string;
}

/** The same question one budget down and one budget up: every registry entry
 *  that differs from this one in `under` alone. */
export function shopNeighbours(q: ShopQuestion): { lower?: ShopLink; higher?: ShopLink } {
  const family = (x: ShopQuestion) => JSON.stringify({ ...x, slug: undefined, under: undefined });
  const f = family(q);
  const kin = SHOP_QUESTIONS.filter((x) => family(x) === f).sort((a, b) => a.under - b.under);
  const i = kin.findIndex((x) => x.slug === q.slug);
  const link = (x: ShopQuestion | undefined): ShopLink | undefined =>
    x ? { label: `Under ${money.format(x.under)}`, href: shopPath(x) } : undefined;
  const out: { lower?: ShopLink; higher?: ShopLink } = {};
  const lower = link(kin[i - 1]);
  const higher = link(kin[i + 1]);
  if (lower) out.lower = lower;
  if (higher) out.higher = higher;
  return out;
}
