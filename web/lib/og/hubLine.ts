// The one line under a model's name on its link preview. Kept apart from the
// image file so it can be tested without a renderer.
const nf = new Intl.NumberFormat("en-US");
const monthOf = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" });

/**
 * "3,445 for sale · November 2026". Nothing when there are no cars: a card
 * reading "0 for sale" advertises an empty page, and a count without its
 * month would go on being shown by whoever cached the picture.
 */
export function hubCardLine(total: number, asOf: string | undefined): string | undefined {
  if (!Number.isFinite(total) || total <= 0) return undefined;
  const d = asOf ? new Date(`${asOf}T00:00:00.000Z`) : undefined;
  if (!d || !Number.isFinite(d.getTime())) return undefined;
  return `${nf.format(total)} for sale · ${monthOf.format(d)}`;
}
