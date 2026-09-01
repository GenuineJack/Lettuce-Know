/* EU/US regulatory divergence reference.
 * Scope is intentionally narrow: only additives with a clear, citable
 * difference in legal status. This is not a "danger score" — it states
 * what each regulator currently permits and why they diverged, and
 * leaves the judgment to the reader.
 *
 * matchTags: Open Food Facts / FDC use different vocabularies for the
 * same substance. Each entry lists the tag fragments and plain-text
 * ingredient-line phrases we check for.
 *
 * Last reviewed: September 2026. Regulatory status changes — recheck
 * periodically against the sources linked in each entry.
 *
 * This file is also the source Airtable's EU_US_Divergence table was
 * seeded from and should stay reasonably in sync with — the live app reads
 * from Airtable via api/divergence.js and only falls back to this file if
 * that's unreachable, but scripts/build-eu-us-page.mjs (the shareable
 * static page) reads this file directly, not Airtable. Add new entries to
 * both places, or the static page and the offline fallback will drift from
 * what's actually live.
 */
const EU_US_DIVERGENCE = [
  {
    id: "titanium-dioxide",
    name: "Titanium dioxide",
    eNumber: "E171",
    matchTags: ["e171", "titanium-dioxide", "titanium dioxide", "ci 77891"],
    usStatus: "Permitted, up to 1% by weight",
    euStatus: "Banned in food since August 2022",
    note: "EFSA concluded in 2021 it could not rule out genotoxicity (DNA damage) from nanoscale particles and could not establish a safe daily intake. The FDA has not changed its position; a 2023 citizen petition asking it to revisit titanium dioxide remains pending.",
    source: "https://www.efsa.europa.eu/en/news/titanium-dioxide-e171-no-longer-considered-safe-when-used-food-additive"
  },
  {
    id: "potassium-bromate",
    name: "Potassium bromate",
    eNumber: null,
    matchTags: ["potassium bromate", "e924", "bromated flour"],
    usStatus: "Permitted as a flour treatment agent; not banned federally",
    euStatus: "Banned since 1990",
    note: "Classified by IARC as a possible human carcinogen (Group 2B). Baking converts most bromate to bromide, but residues can remain if underbaked. The FDA has asked bakers to stop using it voluntarily since 1991 but has not enacted a ban. California requires a Prop 65 warning on bread made with it.",
    source: "https://www.iarc.who.int/"
  },
  {
    id: "azodicarbonamide",
    name: "Azodicarbonamide (ADA)",
    eNumber: null,
    matchTags: ["azodicarbonamide", "e927", "ada"],
    usStatus: "Permitted, up to 45 ppm in flour",
    euStatus: "Banned as a food additive",
    note: "Also used as a foaming agent in yoga mats and shoe soles, which drove US media attention circa 2014. The health concern is a breakdown product, semicarbazide, formed during baking. The EU bans it outright in food; the US allows it within a concentration limit.",
    source: "https://ec.europa.eu/food/food-feed-portal/screen/food-additives"
  },
  {
    id: "propylparaben",
    name: "Propylparaben",
    eNumber: "E216",
    matchTags: ["e216", "propylparaben", "propyl paraben"],
    usStatus: "Permitted (GRAS)",
    euStatus: "Banned in food since 2006",
    note: "The EU's ban followed studies raising endocrine-disruption concerns, primarily around estrogenic activity at high doses. The FDA has not revisited its GRAS status for food use.",
    source: "https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32006R1935"
  },
  {
    id: "bha",
    name: "BHA (Butylated hydroxyanisole)",
    eNumber: "E320",
    matchTags: ["e320", "bha", "butylated hydroxyanisole"],
    usStatus: "Permitted (GRAS)",
    euStatus: "Restricted; not permitted in food intended for infants and young children",
    note: "IARC lists BHA as a Group 2B possible human carcinogen based on animal studies. The FDA opened a fresh postmarket safety assessment of BHA in 2025; as of this data's last review that assessment had not concluded.",
    source: "https://www.iarc.who.int/"
  },
  {
    id: "bht",
    name: "BHT (Butylated hydroxytoluene)",
    eNumber: "E321",
    matchTags: ["e321", "bht", "butylated hydroxytoluene"],
    usStatus: "Permitted (GRAS)",
    euStatus: "Banned in food since 2004 over endocrine-disruption concerns",
    note: "Used to keep fats and oils from going rancid in crackers and cereals. The FDA launched a postmarket safety assessment of BHT in August 2025; no US restriction has followed yet.",
    source: "https://ec.europa.eu/food/food-feed-portal/screen/food-additives"
  },
  {
    id: "red3",
    name: "Red No. 3 (Erythrosine)",
    eNumber: "E127",
    matchTags: ["red 3", "red no. 3", "e127", "fd&c red no. 3", "erythrosine"],
    usStatus: "Banned by the FDA, effective January 2025 (phase-out through 2027 for some uses)",
    euStatus: "Permitted, restricted to specific uses (e.g. cocktail cherries)",
    note: "An unusual reversal: the FDA banned this dye after animal studies linked it to cancer, a threshold the US Delaney Clause requires; the EU still permits limited use. Listed here because products made before the compliance deadline may still be on shelves.",
    source: "https://www.fda.gov/food/hfp-constituent-updates/fda-revokes-authorization-use-red-no-3-food-and-ingested-drugs"
  },
  {
    id: "dye-warning-trio",
    name: "Red 40, Yellow 5, Yellow 6",
    eNumber: "E129 / E102 / E110",
    matchTags: ["red 40", "e129", "allura red", "yellow 5", "e102", "tartrazine", "yellow 6", "e110", "sunset yellow"],
    usStatus: "Permitted, no warning label required",
    euStatus: "Permitted, but must carry a warning label linking the dye to hyperactivity in children",
    note: "Not a ban — the EU allows these dyes but requires the label \"may have an adverse effect on activity and attention in children,\" following a 2007 UK study (McCann et al., The Lancet). Many manufacturers reformulate for the EU market with natural colorants rather than carry the label. The FDA reviewed the same study and did not require action.",
    source: "https://www.thelancet.com/journals/lancet/article/PIIS0140-6736(07)61306-3/fulltext"
  },
  {
    id: "rbgh-rbst",
    name: "Recombinant Bovine Growth Hormone (rBGH/rBST)",
    eNumber: null,
    matchTags: ["rbgh", "rbst", "recombinant bovine somatotropin", "recombinant bovine growth hormone", "bovine somatotropin", "posilac", "artificial growth hormone", "bgh", "rbst-free", "no artificial growth hormones", "hormone-free milk"],
    usStatus: "FDA-approved since 1993 for use in dairy cows; no special labeling required, though many processors voluntarily label milk \"rBST-free.\"",
    euStatus: "Not authorized in any EU member state; prohibited under Directive 2003/74/EC, which bans hormonal growth promoters in livestock.",
    note: "The FDA's 1993 approval followed its own safety review and has never been revisited; the EU's ban rests officially on animal-welfare grounds (mastitis, reproductive stress) rather than a claimed human-health risk. In practice most major US retailers now source rBST-free milk anyway. Matching note: this won't appear as a positive ingredient — it only shows up via voluntary \"rBST-free\" label claims, an absence signal rather than a presence one.",
    source: "https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=celex%3A32003L0074"
  },
  {
    id: "ractopamine",
    name: "Ractopamine",
    eNumber: null,
    matchTags: ["ractopamine", "ractopamine hydrochloride", "paylean", "optaflexx", "ractopamine-free", "no ractopamine"],
    usStatus: "FDA-approved as a feed additive for finishing swine and cattle (21 CFR 558.500), used before slaughter to increase leanness.",
    euStatus: "Not authorized for use in EU livestock production, prohibited as a beta-agonist growth promoter under Directive 96/22/EC; the EU also restricts imports of meat from ractopamine-fed animals.",
    note: "Ractopamine is banned or restricted in roughly 160 countries, including the EU, China, and Russia, which is why many large US pork processors voluntarily went ractopamine-free starting around 2019-2020 to preserve export access. FDA has denied recent petitions to reconsider its approval. Matching note: as a feed additive it's essentially never listed on a meat product's ingredient panel — a scan would need to key off voluntary \"ractopamine-free\" claims rather than direct disclosure.",
    source: "https://www.ecfr.gov/current/title-21/chapter-I/subchapter-E/part-558/subpart-B/section-558.500"
  },
  {
    id: "beef-growth-hormones",
    name: "Growth-Promoting Hormones in Beef Cattle",
    eNumber: null,
    matchTags: ["hormone-free beef", "no hormones added", "raised without added hormones", "grass-fed hormone-free", "estradiol", "trenbolone acetate", "zeranol", "melengestrol acetate", "hormone implant", "growth-promoting hormone"],
    usStatus: "USDA/FDA permit six growth-promoting hormones as ear implants or feed additives in beef cattle; no residue disclosure is required on the label.",
    euStatus: "Bans all growth-promoting hormones in livestock and prohibits import of meat from hormone-treated animals, in force since 1981 (consolidated into Directive 96/22/EC).",
    note: "This is the original US/EU meat trade fight — the WTO ruled against the EU's ban as not scientifically justified under trade rules, but the EU kept it anyway, eventually settling by trading a larger EU import quota for certified hormone-free US beef rather than lifting the ban. Same directive family as ractopamine's, covering steroid hormones instead of beta-agonists. Matching note: hormone use isn't a labeled ingredient, so a scan would realistically only catch \"hormone-free\"/\"no hormones added\" claims, common on US beef packaging precisely because of this divergence.",
    source: "https://www.everycrsreport.com/reports/RS20142.html"
  },
  {
    id: "nitrites-nitrates",
    name: "Nitrite & Nitrate Curing Agents",
    eNumber: "E249 / E250 / E251 / E252",
    matchTags: ["sodium nitrite", "potassium nitrite", "sodium nitrate", "potassium nitrate", "e249", "e250", "e251", "e252", "curing salt", "prague powder"],
    usStatus: "USDA/FDA permit sodium/potassium nitrite and nitrate as curing agents in meat and poultry, with maximum ingoing levels set by product/cure type (up to 200 ppm nitrite in most cured products).",
    euStatus: "Permits the same additives but lowered maximum addition levels in 2023 (Regulation (EU) 2023/2108) — e.g. to 80 mg/kg for most cured meat products — phased in from October 2025 through 2027.",
    note: "Both sides allow the same curing chemistry; the divergence is in the ceiling, not the permission. The EU's 2023 tightening followed EFSA concern that nitrites can form nitrosamines during curing and cooking, compounds IARC links to the same \"processed meat\" classification cited for bacon generally. Because the EU's phase-in runs through 2027, the practical gap is still widening as of 2026 rather than settled.",
    source: "https://eur-lex.europa.eu/eli/reg/2023/2108/oj"
  },
  {
    id: "carrageenan-infant-formula",
    name: "Carrageenan in Infant Formula",
    eNumber: "E407",
    matchTags: ["carrageenan", "e407", "e407a", "irish moss extract", "processed eucheuma seaweed"],
    usStatus: "FDA GRAS (21 CFR 172.620) for general food use, including in infant formula, as an emulsifier/stabilizer/thickener.",
    euStatus: "Permitted as a general-purpose food additive but specifically excluded from use in infant formula and follow-on formula under Regulation (EU) 2016/127.",
    note: "A narrow, use-specific restriction rather than a blanket ban — carrageenan is fine in ice cream, deli meat, and plant milks on both sides of the Atlantic. The EU's infant-formula-only exclusion is precautionary: some studies raised concerns about carrageenan's effect on an immature infant gut, though mainstream toxicology reviews generally regard it as safe at normal use levels elsewhere in the food supply.",
    source: "https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:02016R0127-20230317"
  },
  {
    id: "partially-hydrogenated-oils",
    name: "Partially Hydrogenated Oils (Industrial Trans Fat)",
    eNumber: null,
    matchTags: ["partially hydrogenated oil", "partially hydrogenated vegetable oil", "partially hydrogenated soybean oil", "pho", "trans fat", "hydrogenated oil"],
    usStatus: "FDA revoked GRAS status for partially hydrogenated oils in 2015 (compliance required by June 2018); any remaining use now requires premarket approval, which FDA has not granted — effectively an outright ban.",
    euStatus: "Permits industrially produced trans fat up to a cap of 2g per 100g of fat, under Regulation (EU) 2019/649, effective since April 2021 — a quantitative ceiling rather than a ban.",
    note: "One of the panel's rarer \"reverse\" cases, like Red No. 3 — the US moved earlier and harder here, eliminating PHOs almost entirely, while the EU opted for a permissive numeric threshold that still allows some industrial trans fat rather than banning the substance itself. A product could legally carry \"partially hydrogenated oil\" on an EU ingredient list today in a way it essentially cannot in the US anymore. Real-world hits will skew toward imported or EU-labeled products.",
    source: "https://eur-lex.europa.eu/eli/reg/2019/649/oj"
  }
];

/* Matching is word-boundary aware, not a bare substring test. Short tags
 * like "ada" and "bha" otherwise hit inside ordinary words — "macadamia"
 * contains "ada", which used to flag macadamia nuts as containing a dough
 * conditioner. A false positive here is worse than a miss: the whole panel
 * is meant to state regulatory fact.
 */
const RX_CACHE = new Map();
function boundaryRx(tag) {
  let rx = RX_CACHE.get(tag);
  if (!rx) {
    const lit = tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "[\\s-]+");
    // Not preceded or followed by another word character, so "ada" matches
    // "ADA" and "water, ada," but not "macadamia".
    rx = new RegExp("(?:^|[^a-z0-9])" + lit + "(?![a-z0-9])", "i");
    RX_CACHE.set(tag, rx);
  }
  return rx;
}

function findDivergence(offAdditiveTags, ingredientsText) {
  const tagSet = new Set(
    (Array.isArray(offAdditiveTags) ? offAdditiveTags : [])
      .map(t => String(t).toLowerCase().replace(/^[a-z]{2}:/, "").trim())
      .filter(Boolean)
  );
  const text = String(ingredientsText || "").toLowerCase();
  const hits = [];
  EU_US_DIVERGENCE.forEach(entry => {
    const found = entry.matchTags.some(tag => {
      const t = String(tag).toLowerCase();
      const hyphen = t.replace(/\s+/g, "-");
      if (tagSet.has(t) || tagSet.has(hyphen)) return true;
      return text ? boundaryRx(t).test(text) : false;
    });
    if (found) hits.push(entry);
  });
  return hits;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { EU_US_DIVERGENCE, findDivergence };
}
