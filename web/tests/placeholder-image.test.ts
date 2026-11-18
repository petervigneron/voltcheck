// isPlaceholderImage (lib/listings/placeholderImage.ts): exactly the stand-in
// patterns verified in the 2026-11-18 API sample, and none of the maker
// configurator renders that look like stock art but are the car's own build.
import { test } from "node:test";
import assert from "node:assert/strict";
import { isPlaceholderImage } from "../lib/listings/placeholderImage";

test("every verified placeholder pattern is caught", () => {
  for (const url of [
    "https://images.dealer.com/unavailable_stockphoto.png",
    "https://IMAGES.DEALER.COM/Unavailable_StockPhoto.PNG",
    "https://pictures.dealer.com/generic-toyota-OEM_VIN_STOCK_PHOTOS/cd130960d6c3193f763abf3f747c0dc2.png",
    "https://pictures.dealer.com/generic-hyundai-oem_vin_stock_photos/8081e26848e738138ec7af759c5bcea3.png?impolicy=resize&w=640",
    "https://images.dealer.com/autodata/us/large_stockphoto/2027/USD70MBCDP1A0.jpg",
    "https://www.darcars.com/assets/stock/colormatched_01/transparent/1280/cc_2024cas09_01_1280/cc_2024cas092057112_01_1280_gb8.png",
    "https://www.fitzmall.com/assets/stock/ColorMatched_01/white/640/cc_2025cas11_01_640/x.png",
    "https://images.dealersync.com/2074/Photos/comingsoon/62a1c0cae8e9459ab266df104e53e0ac.jpg",
    "https://www.greenwaveev.com/wp-content/uploads/sites/50/2026/11/coming-soon-gw.webp",
    "https://cdn.example-dealer.com/img/coming_soon.jpg",
    "https://cdn.example-dealer.com/img/Coming-Soon/x.jpg",
    "https://www.cadillacofbentonville.com/wp-content/plugins/dealerinspire-gm-integration/assets/images/cadillac-cpo-no-image.png",
    "https://cdn.dlron.us/static/brand-cadillac/logos/Photo-Not-Available-PreOwned.png",
    "https://www.jaguarexample.com/static/jaguar-cars-placeholder.jpg",
  ]) {
    assert.equal(isPlaceholderImage(url), true, url);
  }
});

test("maker configurator renders, real dealer photos and near misses are not placeholders", () => {
  for (const url of [
    // Configurator renders of the car's own build.
    "https://cgi.chevrolet.com/mmgprod-us/dynres/prove/image.gen?i=2025/1MB48/1MB48__2LT/GAZ_0ST_1SZ_5FC.jpg",
    "https://cgi.cadillac.com/mmgprod-us/dynres/prove/image.gen?i=2025/6DE26/6DE26__3LT/GBA_0ST_1SG.jpg",
    "https://s7d1.scene7.com/is/image/hyundai/2025-ioniq-5-limited-awd-atlas-white-profile",
    "https://www.mazdausa.com/siteassets/vehicles/2025/cx-70-phev/vlp/trims/premium-plus.png",
    "https://www.nissanusa.com/content/dam/Nissan/us/vehicles/ariya/2025/overview/ariya-platinum.png",
    "https://prod.cosy.bmw.cloud/bmwweb/cosySec?COSY-EU-100-7331cqgv2Z7d%25i02uCaY3MuO2kOHUtWPfbYfvRgB",
    "https://lucidmotors.com/portalapi/images/air/grand-touring/exterior.png",
    // A real dealer.com photo, and dealer.com's own colour swatch.
    "https://pictures.dealer.com/t/texascars/1234/abc.jpg",
    "https://images.dealer.com/autodata/us/color/2023/USD30MBSA41A0/696.jpg",
    // "stockphoto" off images.dealer.com is not on the list.
    "https://dtstockphotos.azureedge.net/stockitems/1040314999/a2dac9ef-6a7c-4c53-b568-f5e568e4ddf3_Medium.webp",
    // "placeholder" in a folder, not the file name.
    "https://cdn.example-dealer.com/placeholder-free/photos/123.jpg",
    // OEM_VIN_STOCK_PHOTOS without the generic- folder, or on another host.
    "https://pictures.dealer.com/t/texascars/OEM_VIN_STOCK_PHOTOS/abc.jpg",
    "https://cdn.example.com/generic-toyota-OEM_VIN_STOCK_PHOTOS/abc.png",
    // colormatched outside /assets/stock/.
    "https://www.darcars.com/inventory/colormatched/abc.png",
    "not a url",
    "",
    undefined,
    null,
  ]) {
    assert.equal(isPlaceholderImage(url), false, String(url));
  }
});
