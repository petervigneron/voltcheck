// One fact, one tile. The colour is decided by what kind of fact it is, never
// by how it looks next to its neighbours:
//
//   range   the number a shopper is actually comparing — one per card, first
//   spec    hardware you read second: pack size, drivetrain
//   kit     equipment present (heat pump, fast charging)
//   miss    something absent — the only alarm in the system, so it stays rare
//   flag    an outlier in either direction (4,000 miles, or 149,000)
//   cut     the price came down — states the amount the ground announces
export type TileKind = "range" | "spec" | "kit" | "miss" | "flag" | "cut";

const KIND: Record<TileKind, string> = {
  range: "bg-cobalt text-paper",
  spec: "bg-putty text-ink",
  kit: "bg-teal text-paper",
  miss: "bg-vermilion text-paper",
  flag: "bg-saffron text-ink",
  cut: "bg-violet text-paper",
};

// On a card that has taken a solid ground, tiles knock out to white so the
// ground keeps its meaning — except the alarm, which stays loud on purpose.
const ON_COBALT: Record<TileKind, string> = {
  range: "bg-paper text-cobalt",
  spec: "bg-paper text-cobalt",
  kit: "bg-paper text-cobalt",
  miss: "bg-ink text-paper",
  flag: "bg-saffron text-ink",
  cut: "bg-paper text-violet",
};

const ON_SAFFRON: Record<TileKind, string> = {
  range: "bg-cobalt text-paper",
  spec: "bg-ink text-saffron",
  kit: "bg-ink text-saffron",
  miss: "bg-vermilion text-paper",
  flag: "bg-ink text-saffron",
  cut: "bg-violet text-paper",
};

const ON_TEAL: Record<TileKind, string> = {
  range: "bg-paper text-teal",
  spec: "bg-paper text-teal",
  kit: "bg-paper text-teal",
  miss: "bg-ink text-paper",
  flag: "bg-saffron text-ink",
  cut: "bg-paper text-teal",
};

export type TileGround = "paper" | "cobalt" | "saffron" | "teal";

export function Tile({
  kind = "spec",
  ground = "paper",
  title,
  wrap = false,
  children,
}: {
  kind?: TileKind;
  ground?: TileGround;
  title?: string;
  /** Tiles keep to one line so the row reads as chips; a tile whose text is
   *  longer than a narrow card (the manufacturer-repurchase disclosure) opts
   *  into wrapping instead of overflowing the card edge. */
  wrap?: boolean;
  children: React.ReactNode;
}) {
  const palette =
    ground === "cobalt" ? ON_COBALT : ground === "saffron" ? ON_SAFFRON : ground === "teal" ? ON_TEAL : KIND;
  return (
    <span
      title={title}
      className={`inline-flex items-center ${wrap ? "whitespace-normal" : "whitespace-nowrap"} px-2 py-1 text-[11px] font-extrabold tracking-[0.05em] uppercase ${palette[kind]}`}
    >
      {children}
    </span>
  );
}
