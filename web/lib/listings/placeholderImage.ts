// A dealer's "no photo yet" image is not a photo of the car. Served as one, it
// tells a shopper (or an agent rendering a card) that this is what the car
// looks like: a stock render of some other car, a "coming soon" tile, a brand
// logo. Measured 2026-11-18 on 30,510 cars from the public API: about 3.6% of
// image URLs were one of these.
//
// Exactly the patterns verified in that data, each anchored as tightly as the
// observed URLs allow. Not on the list, deliberately: maker configurator
// renders (cgi.chevrolet.com image.gen, cgi.cadillac.com, scene7 Hyundai,
// mazdausa.com, nissanusa.com, prod.cosy.bmw.cloud, lucidmotors.com portalapi)
// — they render the car's own build, and dealer.com's /autodata/…/color/
// swatches. A pattern added here has to be one seen in the data, with a test.
//
// Client-safe: pure, no imports.

/** True when `url` is a seller's stand-in image rather than a photo. */
export function isPlaceholderImage(url: string | undefined | null): boolean {
  if (!url) return false;
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  const host = u.hostname.toLowerCase();
  // Decoded, so "coming%20soon"-style escaping cannot hide a word; a path
  // that will not decode is read as it came.
  let path = u.pathname;
  try {
    path = decodeURIComponent(path);
  } catch {
    /* keep the raw path */
  }
  const file = path.slice(path.lastIndexOf("/") + 1);

  if (host === "images.dealer.com") {
    // https://images.dealer.com/unavailable_stockphoto.png
    if (/^unavailable_stockphoto\.png$/i.test(file)) return true;
    // https://images.dealer.com/autodata/us/large_stockphoto/2027/USD70MBCDP1A0.jpg
    if (/^\/autodata\/.*stockphoto/i.test(path)) return true;
  }
  // https://pictures.dealer.com/generic-toyota-OEM_VIN_STOCK_PHOTOS/<hash>.png
  if (host === "pictures.dealer.com" && /^\/generic-[^/]*-OEM_VIN_STOCK_PHOTOS\//i.test(path)) return true;
  // https://www.darcars.com/assets/stock/colormatched_01/transparent/1280/…
  if (/^\/assets\/stock\/colormatched/i.test(path)) return true;
  // …/Photos/comingsoon/<hash>.jpg, …/uploads/…/coming-soon-gw.webp
  if (/coming[-_]?soon/i.test(path)) return true;
  // …/cadillac-cpo-no-image.png, …/Photo-Not-Available-PreOwned.png,
  // …/jaguar-cars-placeholder.jpg
  if (/no-image|photo-not-available|placeholder/i.test(file)) return true;
  return false;
}
