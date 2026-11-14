// Published findings are reference evidence, not calibrated inputs to the demo scoring engine.
export const CROP_RESEARCH = {
  water: {
    citation: "FAO · Irrigation Water Management, Training Manual No. 3, Chapter 3, Table 14",
    kind: "Technical guidance",
    url: "https://www.fao.org/4/S2022E/s2022e07.htm",
    finding:
      "Indicative crop-water needs: maize 500–800 mm and sorghum/millet 450–650 mm per total growing period. FAO classifies maize drought sensitivity as medium–high and sorghum/millet as low.",
    relevance: "Supports examining sorghum when water availability is limited.",
    limitation:
      "These are broad seasonal evapotranspiration requirements, not monthly rainfall thresholds, irrigation prescriptions, or a farm forecast. Ranges overlap and vary with climate and crop duration.",
  },
  mungbean: {
    citation:
      "Gatan & Gatan (2019) · Improved Integrated Crop Management System of Mungbean Production in Central Luzon · Recoletos Multidisciplinary Research Journal",
    kind: "Philippine field experiment",
    url: "https://rmrj.usjr.edu.ph/rmrj/index.php/RMRJ/article/download/760/201",
    finding:
      "In the corn–mungbean trial in Pampanga (October 2016–May 2017), Pagasa 19 mungbean was planted after harvest. Table 2 reports 1.36 t/ha with carrageenan and 1.04 t/ha for the untreated control.",
    relevance:
      "Provides Philippine field evidence that mungbean can be grown after corn under the tested management.",
    limitation:
      "The authors reported no statistically significant treatment differences in this trial. These yields are not the benefit caused by rotation alone, a treatment recommendation, or a farm yield prediction. It did not test adding sorghum or compare our three full sequences in Bukidnon.",
  },
  residues: {
    citation:
      "Dinesh et al. (2024) · Frontiers in Sustainable Food Systems · DOI: 10.3389/fsufs.2024.1259607",
    kind: "Peer-reviewed field experiment",
    url: "https://www.frontiersin.org/journals/sustainable-food-systems/articles/10.3389/fsufs.2024.1259607/full",
    finding:
      "In a maize–wheat–mungbean system in northwestern India, residue retention under zero tillage was associated with 7.4% higher soil organic carbon at 0–15 cm than zero tillage without retained residues. The field study ran from 2018 to 2020 on a long-term experimental site.",
    relevance:
      "Supports considering residue management when discussing soil benefits in a cereal–mungbean system.",
    limitation:
      "The comparison tested residue and nitrogen management within a different rotation; it does not isolate a mungbean rotation benefit or establish our crop ordering. The result is not a guaranteed soil-carbon gain in Bukidnon.",
  },
  waterlogging: {
    citation:
      "Yang et al. (2025) · Effects of waterlogging at different growth stages on sweet potato · Acta Agronomica Sinica · DOI: 10.3724/SP.J.1006.2025.44116",
    kind: "Controlled experiment",
    url: "https://zwxb.chinacrops.org/EN/10.3724/SP.J.1006.2025.44116",
    finding:
      "For sweetpotato cultivar Yuhongxin 98, waterlogging during storage-root bulking reduced yield by 40.05% in 2022 and 40.80% in 2023 relative to normally watered controls.",
    relevance:
      "Shows why sweetpotato requires a drainage check, especially in recovery planning after flooding.",
    limitation:
      "These are cultivar- and treatment-specific experimental losses, not loss estimates for this farm. This study does not validate the corn–sweetpotato–mungbean sequence or show it is flood-tolerant.",
  },
} as const;

export const ROTATION_RESEARCH: Record<
  string,
  { rationale: string; sources: Array<keyof typeof CROP_RESEARCH> }
> = {
  legume: {
    rationale:
      "The corn-to-mungbean step has Philippine field evidence. Sorghum adds a crop with lower drought sensitivity in FAO guidance; placing it third still needs local calendar and variety checks.",
    sources: ["mungbean", "water"],
  },
  "root-crop": {
    rationale:
      "This is a diversification candidate, not a proven best sequence. Research makes drainage a key condition for sweetpotato; cereal–mungbean soil benefits also depend on management.",
    sources: ["waterlogging", "residues"],
  },
  cover: {
    rationale:
      "Starting with sorghum is worth discussing when water is limited, based on FAO drought-sensitivity guidance. The later mungbean/corn steps require local timing and residue-management checks.",
    sources: ["water", "residues"],
  },
};

// Evidence follows the actual next crop, not a legacy strategy identifier.
export const NEXT_CROP_RESEARCH: Record<
  string,
  { rationale: string; sources: Array<keyof typeof CROP_RESEARCH> }
> = {
  Corn: {
    rationale:
      "FAO describes seasonal maize water needs. This does not establish suitability for this farm.",
    sources: ["water"],
  },
  Sorghum: {
    rationale:
      "FAO discusses sorghum's drought sensitivity. Local varieties and planting dates still need review.",
    sources: ["water"],
  },
  Mungbean: {
    rationale:
      "A Philippine corn–mungbean experiment supports discussing this crop break under its tested conditions.",
    sources: ["mungbean", "residues"],
  },
  "Sweet potato": {
    rationale:
      "Waterlogging studies make drainage an essential check before considering sweetpotato.",
    sources: ["waterlogging"],
  },
};
