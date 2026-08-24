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
  // OneAudi before dealer.com: Audi's own platform loads a "labels-prod…
  // /dealer.com.js" tag on inventory pages and serves some assets through
  // dealer.com hosts, so 20 of the 21 Audi rooftops that reached "working"
  // fingerprinted "dealer.com" — which sends the crawl down the DDC inventory
  // API on a site that has none. Its renderer and graph hosts are the signal.
  { platform: "oneaudi", res: [/renderer\.one\.audi|omnigraph\.audi\.com|apps\.one\.audi/i] },
  // Motive (app.ridemotive.com) before the big three: its rooftops embed
  // dealer.com pictures, Dealer Inspire widgets and DealerOn tags, and a loose
  // match on any of those beats them to the answer — subaruoftwinfalls.com and
  // mercedesbenzbrooklyn.com both fingerprinted "dealerinspire" while their
  // whole lot was in Motive's Algolia index. The signal is the platform's own
  // app hosts, not the brand name.
  { platform: "ridemotive", res: [/(?:api|assets|images|echo|bronco)\.app\.ridemotive\.com/i] },
  // Remora, also before dealer.com: their rooftops serve some images from
  // pictures.dealer.com and bozard.com fingerprinted "dealer.com" because of
  // it, which would send the crawl down the DDC inventory-API path on a site
  // that has none. Remora server-renders full schema.org Car JSON-LD on every
  // VDP, so the generic extractor handles it — this label only stops the
  // wrong one being tried. Its own hosts are the signal.
  { platform: "remora", res: [/(?:r|images)\.remorainc\.com|(?:vimg|s3|websites\.api)\.remora\.inc/i] },
  // DealerOn first: their sites often serve images from pictures.dealer.com,
  // which would false-positive the Dealer.com check (bit us on lehmers.com).
  { platform: "dealeron", res: [/dealeron-js\.aspx/i, /DealerOn/i, /searchused\.aspx/i, /sdDataLayer/] },
  // Before dealer.com: an Overfuel rooftop whose sister domain is
  // "…autodealer.com" (somersetautodealer.com) trips the loose /Dealer\.com/i
  // substring check, and Overfuel sites also serve some images from
  // pictures.dealer.com. static.overfuel.com is the specific, load-bearing
  // signal, so it wins the tie.
  { platform: "overfuel", res: [/overfuel\.com/i] },
  // dealr.cloud: server-rendered SaaS for independents; its JSON-LD carries
  // no VIN, so lib/platforms/dealrcloud.mjs reads the tile markup instead.
  { platform: "dealrcloud", res: [/cdn\.dealrcloud\.com|dealr-dealer-id/i] },
  { platform: "dealer.com", res: [/DDC\.dataLayer/, /ddc-/i, /Dealer\.com/i] },
  { platform: "dealerinspire", res: [/dealerinspire/i, /window\.DI_/i, /di-widget/i] },
  { platform: "sincro", res: [/sincro/i, /cdk_?global/i] },
  // Most DealerFire rooftops never say "dealerfire" anywhere in their markup
  // — beavertoncarcompany.com does not — so the platform's own asset host and
  // the per-car data layer it pushes are the signatures that actually fire.
  { platform: "dealerfire", res: [/dealerfire/i, /cdn-ds\.com/i, /pushData\(\s*['"]VehicleObject_/] },
  { platform: "dealereprocess", res: [/dealereprocess/i] },
  // AutoManager WebManager: its own CDN, photo blob and admin host. Pages carry
  // no JSON-LD at all, so lib/platforms/automanager.mjs reads the SRP tiles.
  { platform: "automanager", res: [/automanagerprodcdn\.azureedge\.net|automanager\.blob\.core\.windows\.net|wm\.automanager\.com/i] },
  // AutoFunds / DealerWebsites.com — one product, two names: the pages load
  // "DW_Common" stylesheets through HttpCombiner.ashx and the footer credits
  // autofunds.com. lib/platforms/autofunds.mjs reads the whole lot out of
  // /rss.aspx (one request) and follows the VDP of the cars that could be
  // electrified for the price, fuel and condition the feed omits. The SRP is
  // robots-disallowed on these rooftops, so the feed is the only door.
  { platform: "autofunds", res: [/\bautofunds\.com|images\.autofunds\.net|HttpCombiner\.ashx\?s=DW_/i] },
  // Motorcar Marketing: a vendor that hosts its rooftops on its own apex
  // (amgmotorsllc.motorcarsites.com), which is why nothing else in this list
  // has ever seen one. No JSON-LD anywhere and the theme markup changes per
  // rooftop, so lib/platforms/motorcarsites.mjs walks /vehicle_listings and
  // reads the VDPs. Its own asset and CDN hosts are the signature — never the
  // brand word, since a dealer is free to be named "Motorcar …".
  { platform: "motorcarsites", res: [/\b(?:www\.)?motorcarsites\.com\/(?:dealers|template|img)\//i, /\bwww\.motorcarmarketing\.com\b/i] },
  { platform: "team-velocity", res: [/teamvelocityportal\.com/i, /vdpVehicleExteriorColor/] },
  // Wayne Reaves: every asset is same-origin, so the vendor's only mark on the
  // page is the footer credit that links waynereaves.com/.net. The whole lot
  // comes out of /service/inventory/website — see lib/platforms/waynereaves.mjs.
  { platform: "waynereaves", res: [/waynereaves\.(?:com|net)/i] },
  // Auto Dealers Digital: a WordPress product whose rooftops publish clean
  // JSON-LD on every VDP and a hardcoded "NewCondition" inside it, on used
  // lots. The label is what stops the generic reader taking that at face value
  // — see lib/platforms/autodealersdigital.mjs. Its CDN hosts and its theme
  // directory are the signal; never the brand words, since a dealer is free to
  // be named "Auto Dealers Digital".
  {
    platform: "autodealersdigital",
    // Kept byte-identical to VENDOR_RE in that module; test/autodealersdigital
    // .test.mjs asserts the two agree, because a fingerprint that fires where
    // the extractor does not would send the crawl down a path with no reader.
    res: [
      /\b(?:cdn-(?:thumbor|websites|chat)\.)?autodealersdigital\.com\//i,
      /\/wp-content\/themes\/website-theme-wp-v2\b/i,
      /\bwp-theme-website-theme-wp-v2\b/i,
    ],
  },
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
