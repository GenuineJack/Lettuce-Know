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
 * Last reviewed: August 2026. Regulatory status changes — recheck
 * periodically against the sources linked in each entry.
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
