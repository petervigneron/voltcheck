// Identify which website platform a dealer site runs on, from its homepage
// HTML. Platform → extractor strategy; one fingerprint covers thousands of
// rooftops. Signatures chosen from pages actually crawled in this project.
const SIGNATURES = [
  // DealerOn first: their sites often serve images from pictures.dealer.com,
  // which would false-positive the Dealer.com check (bit us on lehmers.com).
  { platform: "dealeron", res: [/dealeron-js\.aspx/i, /DealerOn/i, /searchused\.aspx/i, /sdDataLayer/] },
  { platform: "dealer.com", res: [/DDC\.dataLayer/, /ddc-/i, /Dealer\.com/i] },
  { platform: "dealerinspire", res: [/dealerinspire/i, /window\.DI_/i, /di-widget/i] },
  { platform: "sincro", res: [/sincro/i, /cdk_?global/i] },
  { platform: "dealerfire", res: [/dealerfire/i] },
  { platform: "dealereprocess", res: [/dealereprocess/i] },
  { platform: "team-velocity", res: [/teamvelocityportal\.com/i, /vdpVehicleExteriorColor/] },
];

export function fingerprint(html) {
  for (const { platform, res } of SIGNATURES) {
    if (res.some((re) => re.test(html))) return platform;
  }
  return "unknown";
}
