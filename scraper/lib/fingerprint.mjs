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
  // Recharged, a single-rooftop lane: a used-EV specialist big enough to be
  // worth its own module (412 electrified cars). Anchored on a string that
  // CONTAINS its own host — its Organization JSON-LD names its logo — so it
  // cannot fire on anyone else's page, which is the precision a per-site label
  // needs. See lib/platforms/recharged.mjs.
  { platform: "recharged", res: [/https:\/\/recharged\.com\/logo\.svg/i] },
  // Ever, the same shape and for the same reason (1,130 electrified cars):
  // anchored on strings that contain its own host — its schema.org @ids and
  // its asset host. See lib/platforms/evercars.mjs.
  {
    platform: "evercars",
    res: [/evercars\.com\/#(?:organization|website|dealer-)|static\.production\.evercars\.live/i],
  },
  // DealerSync: an independents' website vendor whose rooftops serve on their
  // own apex and ship the vendor's Handlebars TEMPLATE inline — a VIN regex
  // over one of its pages finds `{{Vin}}`. Its own CDN and photo hosts are the
  // signal, never the brand word: a dealer is free to be named "… Sync".
  // lib/platforms/dealersync.mjs reads /Inventory/Search instead.
  { platform: "dealersync", res: [/\b(?:dealer-cdn|images)\.dealersync\.com/i] },
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
