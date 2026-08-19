// Identify which website platform a dealer site runs on, from its homepage
// HTML. Platform → extractor strategy; one fingerprint covers thousands of
// rooftops. Signatures chosen from pages actually crawled in this project.
const SIGNATURES = [
  // DealerVenom (WordPress front end, Toyota-heavy) renders no inventory in
  // HTML — it queries a Typesense index whose client config is inline on every
  // page. lib/platforms/dealervenom.mjs pulls the collection via the search
  // API. `typesenseSearchAdapter` is the vendor's search-client init; the
  // `dealervenom` brand token is the second signal.
  { platform: "dealervenom", res: [/typesenseSearchAdapter/i, /dealervenom/i] },
  // DealerOn first: their sites often serve images from pictures.dealer.com,
  // which would false-positive the Dealer.com check (bit us on lehmers.com).
  { platform: "dealeron", res: [/dealeron-js\.aspx/i, /DealerOn/i, /searchused\.aspx/i, /sdDataLayer/] },
  // Before dealer.com: an Overfuel rooftop whose sister domain is
  // "…autodealer.com" (somersetautodealer.com) trips the loose /Dealer\.com/i
  // substring check, and Overfuel sites also serve some images from
  // pictures.dealer.com. static.overfuel.com is the specific, load-bearing
  // signal, so it wins the tie.
  { platform: "overfuel", res: [/overfuel\.com/i] },
  // Dealr (small independent lots): no VIN'd JSON-LD, numeric-id VDP URLs —
  // lib/platforms/dealr.mjs pages its getInventorySubset JSON API instead. The
  // asset host cdn.dealrcloud.com is on every page including the homepage; the
  // inventory grid's card class and the API call name are the second signals.
  { platform: "dealr", res: [/cdn\.dealrcloud\.com/i, /getInventorySubset/, /dealr-inventory-list__vehicle/] },
  // DealerSync (small independent lots): renders a client-side shell — no
  // schema.org, numeric-id VDP URLs — but serves its whole lot from a same-origin
  // /Inventory/Search JSON API. lib/platforms/dealersync.mjs pages it. Its asset
  // host dealersync.com is on every page including the homepage.
  { platform: "dealersync", res: [/dealersync\.com/i] },
  // DealerWebsites: Angular SRP with no schema.org — lib/platforms/dealerwebsites
  // .mjs reads the whole lot out of its inline BootstrapService bootstrap. The
  // asset host is on every page; the factory name is the second signal.
  { platform: "dealerwebsites", res: [/dealerwebsites\.com/i, /app\.inventory["']\)\.factory\(\s*["']BootstrapService["']/] },
  { platform: "dealer.com", res: [/DDC\.dataLayer/, /ddc-/i, /Dealer\.com/i] },
  { platform: "dealerinspire", res: [/dealerinspire/i, /window\.DI_/i, /di-widget/i] },
  { platform: "sincro", res: [/sincro/i, /cdk_?global/i] },
  // Most DealerFire rooftops never say "dealerfire" anywhere in their markup
  // — beavertoncarcompany.com does not — so the platform's own asset host and
  // the per-car data layer it pushes are the signatures that actually fire.
  { platform: "dealerfire", res: [/dealerfire/i, /cdn-ds\.com/i, /pushData\(\s*['"]VehicleObject_/] },
  { platform: "dealereprocess", res: [/dealereprocess/i] },
  { platform: "team-velocity", res: [/teamvelocityportal\.com/i, /vdpVehicleExteriorColor/] },
  // No JSON-LD anywhere and numeric-id VDP URLs, so nothing generic hooks it;
  // lib/platforms/dealercarsearch.mjs reads its Tealium product list instead.
  // Its data layer names the platform on every page, homepages included.
  { platform: "dealercarsearch", res: [/"site_platform":\s*"dcs"/, /dealercarsearch\.com/i] },
];

export function fingerprint(html) {
  for (const { platform, res } of SIGNATURES) {
    if (res.some((re) => re.test(html))) return platform;
  }
  return "unknown";
}
