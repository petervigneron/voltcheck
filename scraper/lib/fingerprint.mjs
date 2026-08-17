// Identify which website platform a dealer site runs on, from its homepage
// HTML. Platform → extractor strategy; one fingerprint covers thousands of
// rooftops. Signatures chosen from pages actually crawled in this project.
const SIGNATURES = [
  // Dealer Venom (bucket.dealervenom.com assets): WordPress shell, Algolia/
  // Typesense client-rendered SRPs, server-rendered VDPs behind a vdp_gate
  // cookie redirect, and a sitemap that enumerates every VDP by VIN. Checked
  // first because its pages also carry dealer.com/dealerinspire strings
  // (harrtoyota.com fingerprinted as both across two probes, 2026-08-16).
  { platform: "dealervenom", res: [/dealervenom/i] },
  // dealr.cloud: server-rendered SaaS for independents; its JSON-LD carries
  // no VIN, so lib/platforms/dealrcloud.mjs reads the tile markup instead.
  { platform: "dealrcloud", res: [/cdn\.dealrcloud\.com|dealr-dealer-id/i] },
  // DealerOn next: their sites often serve images from pictures.dealer.com,
  // which would false-positive the Dealer.com check (bit us on lehmers.com).
  { platform: "dealeron", res: [/dealeron-js\.aspx/i, /DealerOn/i, /searchused\.aspx/i, /sdDataLayer/] },
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
