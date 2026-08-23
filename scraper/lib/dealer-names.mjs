// Domain-candidate generation from a dealer's licensed name. Shared by
// resolve-dealers.mjs (the roll→registry resolver) and its tests; the
// transforms are deterministic so recall can be measured offline against
// the name→domain pairs the registry already knows.
// ── candidate generation ────────────────────────────────────────────────────
export const ABBREV = {
  volkswagen: ["vw"], chevrolet: ["chevy", "chev"], mercedesbenz: ["mb", "mercedes", "benz"],
  mercedes: ["mb", "benz"], harleydavidson: ["harley", "hd"], mitsubishi: ["mitsu"],
  international: ["intl"], automotive: ["auto"], performance: ["perf"], enterprises: ["ent"],
  chryslerdodgejeepram: ["cdjr"], chryslerjeepdodgeram: ["cjdr"], chryslerdodgejeep: ["cdj"], dodgechryslerjeep: ["dcj"],
};
export const squash = (s) => String(s ?? "").toLowerCase()
  .replace(/\([^)]*\)/g, " ")
  .replace(/&/g, " and ")
  .replace(/\b(llc|inc|ltd|corp|co|incorporated|corporation|company|limited|liability|lp|llp|pa|pllc|dba)\b\.?/g, "")
  .replace(/[^a-z0-9 ]/g, " ")
  .replace(/\s+/g, " ").trim();

// Brand tokens, for the one permutation that is genuinely a naming
// convention rather than a guess: US franchise stores write themselves both
// ways round ("Genesis of Portland" → portlandgenesis.com, "Audi Rochester"
// → rochesteraudi.com), so the brand word moves to either end.
export const BRANDS = new Set(["ford", "chevrolet", "chevy", "toyota", "honda", "nissan", "hyundai",
  "kia", "subaru", "volkswagen", "vw", "bmw", "audi", "mercedes", "benz", "lexus", "acura", "mazda",
  "infiniti", "buick", "gmc", "cadillac", "chrysler", "dodge", "jeep", "ram", "genesis", "lincoln",
  "porsche", "jaguar", "volvo", "mitsubishi", "tesla", "mini", "rivian", "polestar", "lucid"]);

export function candidates(name, city, state) {
  const words = squash(name).split(" ").filter(Boolean).filter((w) => w !== "the");
  if (!words.length) return [];
  const out = new Set();
  const add = (arr) => { const j = Array.isArray(arr) ? arr.join("") : String(arr); if (j.length >= 4 && j.length <= 35) out.add(j); };
  const subs = [];
  for (let i = 0; i < words.length; i++)
    for (let j = i + 1; j <= words.length; j++) {
      const raw = words.slice(i, j);
      const sub = raw.filter((w) => w !== "of" && w !== "and");
      if (sub.length && !(sub.length === 1 && sub[0].length < 6)) subs.push(sub);
      // "Brand of City" is the standard US franchise-dealer naming pattern
      // (toyotaofbayridge.com, vwoforchardpark.com) and plenty of dealers'
      // real domains keep the "of" rather than dropping it — but the sub
      // above always drops it, so that whole naming convention was
      // unreachable regardless of DNS budget. Keep "of" as its own variant
      // (verified against a hand-checked sample of NY license-roll misses,
      // 2026-08-20) without touching the drop-it default the rest of the
      // corpus already resolves 52% of names against.
      if (raw.length !== sub.length && raw.includes("of")) {
        const withOf = raw.filter((w) => w !== "and");
        if (withOf.length >= 2) subs.push(withOf);
      }
    }
  const full = words.filter((w) => w !== "of" && w !== "and");
  for (let k = 1; k < full.length - 1; k++) subs.push(full.filter((_, i) => i !== k));
  for (const sub of subs) {
    add(sub);
    for (let k = 0; k < sub.length; k++)
      for (const f of ABBREV[sub[k]] ?? []) { const v = [...sub]; v[k] = f; add(v); }
  }
  for (const c of [...out]) {
    out.add(c.replace(/autosales$/, "auto")); out.add(c.replace(/autosales$/, "autos"));
    out.add(c.replace(/motors$/, "motor")); out.add(c.replace(/motor$/, "motors"));
    out.add(c.replace(/automotive$/, "auto"));
  }
  const cty = city ? squash(city).replace(/ /g, "") : null;
  if (cty) {
    const first = full.slice(0, 2);
    for (const base of [first.join(""), ...(ABBREV[first[0]] ?? [])]) { out.add(base + cty); out.add(cty + base); }
  }

  // Four more transforms, each kept because it paid for its DNS+fetch cost on
  // the registry's own known name→domain pairs (7,432 pairs that this
  // generator did NOT create — rows written by resolve-dealers.mjs itself are
  // excluded as circular; placeholder names like "Dealership Website" and
  // bare brand names are excluded as nameless). Baseline 64.57%, and on the
  // 1,698 of those pairs that carry a state — the condition every roll row
  // meets — 78.56% → 83.22%. Measured 2026-08-23.
  const core = full.join("");
  // The name exactly as licensed, legal suffix and all: "Stan's Auto Sales
  // LLC" really is stansautosalesllc.com. squash() strips those suffixes for
  // every other variant, which made the whole class unreachable. +2.20pp for
  // two extra candidates — the best ratio of anything tried.
  const rawJoin = String(name ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
  add(rawJoin);
  for (const s of ["llc", "inc"]) add(core + s);
  // The roll always knows the state; small lots disambiguate with it
  // (nileautosalesnc.com, libertyautolandny.com). +2.12pp on state-bearing
  // pairs for two candidates.
  const st = String(state ?? "").toLowerCase().replace(/[^a-z]/g, "");
  if (st.length === 2) { add(core + st); add(st + core); }
  // Hyphenated two-word forms (concord-nissan.com, doherty-ford.com): +0.78pp.
  for (const sub of subs) if (sub.length === 2 && sub.join("").length >= 5) add(sub.join("-"));
  // Brand moved to the other end of the name: +0.67pp for under one candidate.
  const bi = full.findIndex((w) => BRANDS.has(w));
  if (bi >= 0 && full.length >= 2) {
    const br = full[bi], rest = full.filter((_, i) => i !== bi);
    add(br + rest.join("")); add(rest.join("") + br);
  }
  // Singular/plural drift on the whole name (GREENLINE AUTO →
  // greenlineautos.com): +0.37pp.
  add(core.replace(/s$/, "")); add(core + "s");

  // Rejected after measuring, so nobody re-opens them: appending generic
  // words to the core (auto/autos/cars/motors/online/usa/sales/co) buys
  // +0.95pp but costs 7.8 extra candidates per name — a 50% larger fetch
  // load on other people's servers for a fraction of what "raw" gives for
  // two; prefixes (my/the/drive/shop/go) +0.39pp for 4.9; core+city +0.04pp;
  // and more TLDs than .com/.net/.biz/.us — the whole registry holds 31 .org
  // and 9 .co domains against 19,744 .com, so a fifth TLD would add a
  // quarter more DNS for ~0.15pp.
  return [...out].filter((c) => c.length >= 4 && c.length <= 35);
}

