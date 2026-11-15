import { CROP_REQUIREMENTS, cropRequirementUrl, type CropRange } from "./crop-requirements";
import type { RotationClimate } from "./nasa-power";

export const SAMPLE_RECOVERY = { affected: 65, yieldLoss: 35 } as const;

export type ClimateScenario = "Typical" | "El Niño-like" | "Wet";

export type Rotation = {
  id: string;
  name: string;
  sequence: string[];
  note: string;
  scores: { water: number; soil: number; income: number; resilience: number };
};

export const SCORE_WEIGHTS = {
  water: 0.3,
  soil: 0.3,
  income: 0.25,
  resilience: 0.15,
} as const;

export function calculateRotationScore(scores: Rotation["scores"]): number {
  const total = Object.entries(SCORE_WEIGHTS).reduce(
    (sum, [factor, weight]) => sum + scores[factor as keyof typeof SCORE_WEIGHTS] * weight,
    0,
  );
  return Math.round(total * 10) / 10;
}

export function calculateEstimatedLoss({
  areaHectares,
  affectedFraction,
  expectedYieldKgPerHectare,
  yieldLossFraction,
  pricePerKg,
}: {
  areaHectares: number;
  affectedFraction: number;
  expectedYieldKgPerHectare: number;
  yieldLossFraction: number;
  pricePerKg: number;
}): number {
  if (
    ![areaHectares, expectedYieldKgPerHectare, pricePerKg].every(
      (value) => Number.isFinite(value) && value >= 0,
    ) ||
    ![affectedFraction, yieldLossFraction].every(
      (value) => Number.isFinite(value) && value >= 0 && value <= 1,
    )
  ) {
    throw new Error("Loss assumptions must be nonnegative and fractions must be between 0 and 1.");
  }
  const total =
    areaHectares * affectedFraction * expectedYieldKgPerHectare * yieldLossFraction * pricePerKg;
  if (!Number.isFinite(total) || total > Number.MAX_SAFE_INTEGER)
    throw new Error("Loss estimate exceeds the supported range.");
  return Math.round(total);
}

export const ROTATIONS: Rotation[] = [
  {
    id: "legume",
    name: "Corn → Mungbean → Sorghum",
    sequence: ["Corn", "Mungbean", "Sorghum"],
    note: "A legume break supports soil nitrogen and diversifies harvest windows.",
    scores: { water: 82, soil: 88, income: 76, resilience: 90 },
  },
  {
    id: "root-crop",
    name: "Corn → Sweet potato → Mungbean",
    sequence: ["Corn", "Sweet potato", "Mungbean"],
    note: "A hardy root crop diversifies harvests and spreads weather exposure.",
    scores: { water: 88, soil: 82, income: 81, resilience: 85 },
  },
  {
    id: "cover",
    name: "Sorghum → Mungbean → Corn",
    sequence: ["Sorghum", "Mungbean", "Corn"],
    note: "A drought-tolerant opener buys flexibility before the main corn season.",
    scores: { water: 92, soil: 85, income: 72, resilience: 86 },
  },
];

export const CLIMATE_DATA: Record<
  ClimateScenario,
  { rainfall: number[]; temperature: number[]; summary: string }
> = {
  Typical: {
    rainfall: [116, 94, 87, 124, 168, 205, 219, 211, 228, 202, 174, 153],
    temperature: [24.1, 24.4, 25.0, 25.5, 25.7, 25.4, 25.1, 25.0, 24.8, 24.5, 24.0, 23.8],
    summary: "Seasonal baseline · balanced rainfall distribution",
  },
  "El Niño-like": {
    rainfall: [83, 67, 59, 79, 109, 132, 145, 138, 151, 128, 112, 98],
    temperature: [24.6, 25.0, 25.8, 26.4, 26.7, 26.3, 26.0, 25.9, 25.7, 25.4, 24.9, 24.6],
    summary: "Illustrative dry-shift scenario · not an official ENSO forecast",
  },
  Wet: {
    rainfall: [157, 130, 121, 180, 226, 279, 295, 284, 310, 267, 229, 201],
    temperature: [23.8, 24.0, 24.6, 25.1, 25.4, 25.1, 24.8, 24.7, 24.5, 24.2, 23.8, 23.6],
    summary: "Illustrative wet-season scenario · sample values only",
  },
};

export function rotationsForScenario(
  scenario: ClimateScenario,
): Array<Rotation & { total: number }> {
  const modifiers: Record<ClimateScenario, Record<string, Partial<Rotation["scores"]>>> = {
    Typical: {},
    "El Niño-like": {
      legume: { water: -8, resilience: -3 },
      "root-crop": { water: -3, income: -1 },
      cover: { water: 3, resilience: 4 },
    },
    Wet: {
      legume: { water: -2, resilience: -3 },
      "root-crop": { water: 3, resilience: 2 },
      cover: { water: -7, resilience: -4 },
    },
  };

  return ROTATIONS.map((rotation) => {
    const adjustment = modifiers[scenario][rotation.id] ?? {};
    const scores = Object.fromEntries(
      Object.entries(rotation.scores).map(([key, value]) => [
        key,
        Math.max(0, Math.min(100, value + (adjustment[key as keyof typeof adjustment] ?? 0))),
      ]),
    ) as Rotation["scores"];
    return { ...rotation, scores, total: calculateRotationScore(scores) };
  }).sort((a, b) => b.total - a.total);
}

export const SAMPLE_YIELD_KG_PER_HA = 6_000;
export const SAMPLE_CORN_PRICE_PER_KG = 18;

export type DemoFarmContext = {
  ph: number;
  drainage: string;
  irrigation: string;
  planted: string;
  monthlyRainfall?: (number | null)[];
};

// shortcut: these thresholds and adjustments are illustrative, replace with locally validated crop rules before advisory use.
export function rotationsForFarm(scenario: ClimateScenario, farm: DemoFarmContext) {
  const month = Number(farm.planted.slice(5, 7)) - 1;
  const rainfall = farm.monthlyRainfall?.[month];
  return rotationsForScenario(scenario)
    .map((rotation) => {
      const scores = { ...rotation.scores };
      const reasons: string[] = [];
      if (Number.isFinite(farm.ph) && (farm.ph < 5.5 || farm.ph > 7.5)) {
        scores.soil -= 15;
        reasons.push(
          "Demo pH range 5.5–7.5 exceeded: soil rating −15. Confirm suitability locally.",
        );
      }
      if (farm.drainage === "Poor") {
        const penalty = rotation.id === "root-crop" ? 20 : 10;
        scores.soil -= penalty;
        reasons.push(`Poor drainage: demo soil rating −${penalty}. Field assessment required.`);
      }
      if (["Gravity-fed", "Pump-irrigated", "Drip irrigation"].includes(farm.irrigation)) {
        scores.water += 5;
        reasons.push("Reported irrigation: demo water rating +5; actual capacity is unverified.");
      }
      if (rainfall != null) {
        const sampleMonthlyNeed =
          rotation.id === "cover" ? 90 : rotation.id === "root-crop" ? 110 : 130;
        scores.water = Math.min(100, (rainfall / sampleMonthlyNeed) * 100);
        reasons.push(
          `Historical planting-month rain ${rainfall.toFixed(1)} mm ÷ demo threshold ${sampleMonthlyNeed} mm. This is not a soil-water balance.`,
        );
        if (["Gravity-fed", "Pump-irrigated", "Drip irrigation"].includes(farm.irrigation))
          scores.water += 5;
      }
      for (const key of Object.keys(scores) as Array<keyof typeof scores>)
        scores[key] = Math.round(Math.max(0, Math.min(100, scores[key])) * 10) / 10;
      return {
        ...rotation,
        scores,
        total: calculateRotationScore(scores),
        note: [rotation.note, ...reasons].join(" "),
      };
    })
    .sort((a, b) => b.total - a.total);
}

// shortcut: texture/slope thresholds are demo screening rules, validate locally before advisory use.
export function suggestDrainage(
  clay: number | null,
  sand: number | null,
  slopePercent: number | null,
) {
  if (
    clay === null ||
    sand === null ||
    slopePercent === null ||
    ![clay, sand, slopePercent].every(Number.isFinite) ||
    clay < 0 ||
    sand < 0 ||
    clay > 100 ||
    sand > 100 ||
    clay + sand > 101 ||
    slopePercent < 0
  ) {
    return {
      suggestion: null,
      reason: "Insufficient soil or terrain coverage. Confirm drainage in the field.",
    };
  }
  if (clay >= 40 && slopePercent < 2)
    return {
      suggestion: "Poor" as const,
      reason: "High predicted clay and nearly flat terrain flag potentially slow drainage.",
    };
  if (sand >= 65 && clay <= 15 && slopePercent >= 2 && slopePercent <= 15)
    return {
      suggestion: "Good" as const,
      reason:
        "Sandy predicted texture and a gentle terrain gradient flag potentially faster drainage.",
    };
  return {
    suggestion: null,
    reason: "No clear texture/terrain signal. Use field observations to choose drainage.",
  };
}

// Screening flags are demo review gates, not validated crop exclusions.
export function planningReviewFlags(farm: {
  crop: string;
  previous: string;
  ph: string;
  drainage: string;
  irrigation: string;
  planted: string;
}) {
  const flags: string[] = [];
  if (!farm.crop.trim() || !farm.previous.trim())
    flags.push("Confirm current crop and crop history before comparing sequences.");
  if (!farm.ph.trim() || !Number.isFinite(Number(farm.ph)))
    flags.push("Soil pH is unknown; obtain a local measurement.");
  if (farm.drainage === "Unknown" || farm.drainage === "Poor")
    flags.push(
      "Drainage needs field assessment before selecting a next crop, especially sweetpotato.",
    );
  if (farm.irrigation === "Unknown")
    flags.push("Water availability is unknown; irrigation cannot be assumed.");
  if (!farm.planted) flags.push("Enter a planned next planting date to assess the crop calendar.");
  return flags;
}

// Offline pilot metrics only; observed outcomes must be independently collected.
export function evaluateYieldPilot(
  rows: Array<{
    predicted: number;
    observed: number;
    baseline: number;
    lower?: number;
    upper?: number;
  }>,
) {
  if (!rows.length) throw new Error("At least one held-out outcome is required.");
  for (const row of rows) {
    if (
      ![row.predicted, row.observed, row.baseline].every(
        (value) => Number.isFinite(value) && value >= 0,
      )
    )
      throw new Error("Yields must be finite, nonnegative kg/ha.");
    if (
      (row.lower === undefined) !== (row.upper === undefined) ||
      (row.lower !== undefined &&
        row.upper !== undefined &&
        (!Number.isFinite(row.lower) ||
          !Number.isFinite(row.upper) ||
          row.lower < 0 ||
          row.lower > row.upper))
    )
      throw new Error("Supply a valid interval or neither bound.");
  }
  const intervals = rows.filter((row) => row.lower !== undefined && row.upper !== undefined);
  return {
    count: rows.length,
    maeKgPerHa:
      rows.reduce((sum, row) => sum + Math.abs(row.predicted - row.observed), 0) / rows.length,
    baselineMaeKgPerHa:
      rows.reduce((sum, row) => sum + Math.abs(row.baseline - row.observed), 0) / rows.length,
    biasKgPerHa: rows.reduce((sum, row) => sum + row.predicted - row.observed, 0) / rows.length,
    intervalCount: intervals.length,
    intervalCoverage: intervals.length
      ? intervals.filter((row) => row.observed >= row.lower! && row.observed <= row.upper!).length /
        intervals.length
      : null,
  };
}

export type CropPestRisk = {
  name: string;
  riskLevel: "High" | "Moderate" | "Low";
  riskWindow: string;
  mitigation: string;
};

export type CropProfile = {
  name: string;
  localName: string;
  scientificName: string;
  image: string;
  category: string;
  cycleDays: string;
  plantingWindow: string;
  soilImpact: string;
  verificationTags: string[];
  pestsAndDiseases: CropPestRisk[];
  pros: string[];
  cons: string[];
  layFallowNote: string;
  baseScores: Rotation["scores"];
};

// Illustrative Bukidnon crop reference profiles for demo rotation comparison; not verified agronomy.
export const CROP_PROFILES: Record<string, CropProfile> = {
  Corn: {
    name: "Corn",
    localName: "Mais",
    scientificName: "Zea mays",
    image: "/crops/corn.jpg",
    category: "Cereal",
    cycleDays: "105–120 Days",
    plantingWindow: "May – Aug / Oct – Jan",
    soilImpact: "High nitrogen feeder (~45 kg N/ha drawdown). Benefits from a legume break.",
    verificationTags: ["DA-ATI Region 10", "BPI IPM", "FAO EcoCrop"],
    pestsAndDiseases: [
      {
        name: "Fall armyworm (Spodoptera frugiperda)",
        riskLevel: "High",
        riskWindow: "Dry-to-wet transition & warm spells (25–30 °C)",
        mitigation: "Scout whorls weekly from V2–V6; avoid back-to-back corn monoculture.",
      },
      {
        name: "Downy mildew & stalk rot",
        riskLevel: "Moderate",
        riskWindow: "High humidity and prolonged wet periods",
        mitigation: "Use treated seed, improve field drainage, and rotate with legumes.",
      },
    ],
    pros: [
      "Strong local Bukidnon feed & grain market demand",
      "Fits upland rainfed schedules with clear 105–120 day harvest windows",
    ],
    cons: [
      "High nitrogen demand depletes soil fertility if repeated without legumes",
      "Continuous corn increases fall armyworm and soil-borne disease carryover",
    ],
    layFallowNote: "Rest 2–3 weeks with retained stover mulch before sowing the next crop.",
    baseScores: { water: 76, soil: 72, income: 85, resilience: 74 },
  },
  Rice: {
    name: "Rice",
    localName: "Palay / Humay",
    scientificName: "Oryza sativa",
    image: "/crops/rice.jpg",
    category: "Cereal",
    cycleDays: "110–125 Days",
    plantingWindow: "Jun – Oct / Nov – Feb",
    soilImpact: "Moderate-to-high N & K uptake; puddling can compact subsoil for upland roots.",
    verificationTags: ["PhilRice", "DA-ATI Region 10", "BPI IPM"],
    pestsAndDiseases: [
      {
        name: "Rice blast & bacterial leaf blight",
        riskLevel: "High",
        riskWindow: "Cool, humid mornings and heavy monsoon rains",
        mitigation: "Avoid excess nitrogen, maintain spacing, and rotate with upland legumes.",
      },
      {
        name: "Brown planthopper & stem borer",
        riskLevel: "Moderate",
        riskWindow: "Dense canopy during vegetative to booting stage",
        mitigation: "Preserve beneficial spiders, synchronize planting, and break continuous rice.",
      },
    ],
    pros: [
      "Staple household & local market security",
      "Tolerates bunded or wetter lowland pockets where upland roots rot",
    ],
    cons: [
      "High water requirement; vulnerable during El Niño-like dry shifts",
      "Repeated wet puddling can compact subsoil for following upland crops",
    ],
    layFallowNote: "Allow 3–4 weeks soil aeration and drying after harvest before upland planting.",
    baseScores: { water: 68, soil: 74, income: 82, resilience: 70 },
  },
  Mungbean: {
    name: "Mungbean",
    localName: "Mongo",
    scientificName: "Vigna radiata",
    image: "/crops/mungbean.jpg",
    category: "Legume",
    cycleDays: "60–65 Days",
    plantingWindow: "Dec – Feb / Dry Transition",
    soilImpact: "Fixes ~45–60 kg N/ha via root nodules and breaks cereal pest cycles.",
    verificationTags: ["DA-ATI Region 10", "BPI IPM", "FAO EcoCrop"],
    pestsAndDiseases: [
      {
        name: "Pod borer & aphids",
        riskLevel: "Moderate",
        riskWindow: "Warm dry flowering-to-podding weeks",
        mitigation: "Monitor flower buds early; harvest promptly and plow under residues.",
      },
      {
        name: "Powdery mildew & Cercospora leaf spot",
        riskLevel: "Low",
        riskWindow: "Prolonged high humidity or late-season rains",
        mitigation: "Avoid waterlogged beds and widen row spacing for airflow.",
      },
    ],
    pros: [
      "Fixes atmospheric nitrogen, reducing synthetic N needs for the next cereal crop",
      "Short 60–70 day cycle fits residual moisture after harvest",
    ],
    cons: [
      "Lower gross revenue per hectare than high-input corn or pineapple",
      "Pods shatter or mold if heavy rain hits right at maturity",
    ],
    layFallowNote: "Incorporate legume biomass and rest 1–2 weeks before planting heavy feeders.",
    baseScores: { water: 85, soil: 90, income: 74, resilience: 86 },
  },
  "Sweet potato": {
    name: "Sweet potato",
    localName: "Camote",
    scientificName: "Ipomoea batatas",
    image: "/crops/sweetpotato.jpg",
    category: "Root crop",
    cycleDays: "90–110 Days",
    plantingWindow: "Mar – May / Sep – Nov",
    soilImpact: "Scavenges residual nitrogen; dense vines shield soil against rain splash erosion.",
    verificationTags: ["DA-ATI Region 10", "BPI IPM", "FAO EcoCrop"],
    pestsAndDiseases: [
      {
        name: "Sweet potato weevil (Cylas formicarius)",
        riskLevel: "High",
        riskWindow: "Dry cracked soils during tuber bulking",
        mitigation:
          "Hill up soil over cracks, use clean vine cuttings, and rotate away from roots.",
      },
      {
        name: "Storage-root rot",
        riskLevel: "Moderate",
        riskWindow: "Waterlogged or poorly drained clay pockets",
        mitigation: "Plant on raised ridges and avoid fields with poor drainage.",
      },
    ],
    pros: [
      "Dense vine canopy suppresses weeds and shields sloping soil from erosion",
      "Diversifies food and market income with moderate fertilizer input",
    ],
    cons: [
      "Sensitive to waterlogging during root bulking (40%+ loss risk in saturated soils)",
      "Bulkier harvest logistics compared to bagged grain",
    ],
    layFallowNote: "Clear old vines to break weevil cycles and rest soil 2–3 weeks.",
    baseScores: { water: 86, soil: 82, income: 79, resilience: 84 },
  },
  Cassava: {
    name: "Cassava",
    localName: "Kamoteng Kahoy / Balanghoy",
    scientificName: "Manihot esculenta",
    image: "/crops/cassava.jpg",
    category: "Root crop",
    cycleDays: "240–300 Days",
    plantingWindow: "May – Jul / Oct – Dec",
    soilImpact: "Heavy potassium user; tolerates acidic upland soils and dry spells.",
    verificationTags: ["DA-ATI Region 10", "FAO EcoCrop"],
    pestsAndDiseases: [
      {
        name: "Cassava mealybug & red spider mite",
        riskLevel: "Moderate",
        riskWindow: "Extended dry spells (>26 °C)",
        mitigation: "Inspect planting stakes before setting; avoid moving infested cuttings.",
      },
      {
        name: "Root rot (Phytophthora)",
        riskLevel: "Moderate",
        riskWindow: "Standing water in low-lying clay fields",
        mitigation: "Use well-drained ridges and avoid poorly drained depressions.",
      },
    ],
    pros: [
      "Strong drought tolerance and steady industrial starch demand in Bukidnon",
      "Produces on moderately acidic upland soils (pH 5.0–6.5)",
    ],
    cons: [
      "Long 8–12 month cycle ties up land and slows short-season rotation",
      "Heavy potassium removal requires replenishment after harvest",
    ],
    layFallowNote: "Rest 3–4 weeks with organic mulch or legume cover after root harvest.",
    baseScores: { water: 89, soil: 76, income: 80, resilience: 88 },
  },
  Sorghum: {
    name: "Sorghum",
    localName: "Batad",
    scientificName: "Sorghum bicolor",
    image: "/crops/sorghum.jpg",
    category: "Cereal",
    cycleDays: "95–110 Days",
    plantingWindow: "Nov – Feb / Dry Transition",
    soilImpact: "Deep roots scavenge residual moisture and nutrients during dry shifts.",
    verificationTags: ["FAO EcoCrop", "DA-ATI Region 10"],
    pestsAndDiseases: [
      {
        name: "Sorghum shoot fly & head bug",
        riskLevel: "Moderate",
        riskWindow: "Late planting into warm, humid flowering windows",
        mitigation: "Plant early with uniform emergence and rotate with legumes.",
      },
      {
        name: "Grain mold",
        riskLevel: "Low",
        riskWindow: "Heavy rain during grain fill",
        mitigation: "Time maturity for drier months; harvest promptly at physiological maturity.",
      },
    ],
    pros: [
      "Lower drought sensitivity than corn (FAO 450–650 mm seasonal need)",
      "Deep roots scavenge residual nutrients and tolerate dry spells",
    ],
    cons: [
      "Smaller local buyer network in some Bukidnon barangays than yellow corn",
      "Bird pressure on small isolated plots near ripening",
    ],
    layFallowNote: "Cut stalks for mulch and rest 2 weeks before legume establishment.",
    baseScores: { water: 92, soil: 81, income: 72, resilience: 88 },
  },
  Pineapple: {
    name: "Pineapple",
    localName: "Pinya",
    scientificName: "Ananas comosus",
    image: "/crops/pineapple.jpg",
    category: "Plantation",
    cycleDays: "14–18 Months",
    plantingWindow: "May – Sep / Year-round w/ moisture",
    soilImpact: "High organic-matter & K demand; continuous beds raise nematode pressure.",
    verificationTags: ["DA-ATI Region 10", "BPI IPM", "FAO EcoCrop"],
    pestsAndDiseases: [
      {
        name: "Mealybug wilt & Phytophthora heart rot",
        riskLevel: "High",
        riskWindow: "Warm wet months with poor surface drainage",
        mitigation: "Use clean suckers, raised beds, and control ant vectors.",
      },
      {
        name: "Nematode buildup",
        riskLevel: "Moderate",
        riskWindow: "Continuous multi-cycle pineapple without break crops",
        mitigation: "Rotate with legumes or fallow cover between ratoon cycles.",
      },
    ],
    pros: [
      "High market value in Bukidnon's highland volcanic soils (tolerates pH 4.5–5.8)",
      "Well-established processing and fresh-market supply chains",
    ],
    cons: [
      "Long 14–18 month cycle with high upfront planting material and labor cost",
      "Continuous beds deplete soil organic matter and increase nematode pressure",
    ],
    layFallowNote: "Allow 4–8 weeks bed breakdown and cover-crop rest after ratoon termination.",
    baseScores: { water: 79, soil: 71, income: 88, resilience: 76 },
  },
  Banana: {
    name: "Banana",
    localName: "Saging",
    scientificName: "Musa acuminata",
    image: "/crops/banana.jpg",
    category: "Plantation",
    cycleDays: "10–12 Months (First Bunch)",
    plantingWindow: "May – Oct",
    soilImpact: "High potassium & moisture user; deep roots help stabilize gentle slopes.",
    verificationTags: ["DA-ATI Region 10", "BPI IPM", "FAO EcoCrop"],
    pestsAndDiseases: [
      {
        name: "Fusarium wilt (TR4) & Black Sigatoka",
        riskLevel: "High",
        riskWindow: "Warm, humid months with splash-borne rain",
        mitigation: "De-leaf infected foliage, sanitize tools, and avoid waterlogged soils.",
      },
      {
        name: "Banana weevil & burrowing nematode",
        riskLevel: "Moderate",
        riskWindow: "Aging mats with poor sanitation",
        mitigation: "Use tissue-cultured plantlets and rotate infected blocks to non-hosts.",
      },
    ],
    pros: [
      "Continuous harvest cash flow once established",
      "Deep root system stabilizes gentle-to-moderate upland slopes",
    ],
    cons: [
      "High windthrow and flood-siltation vulnerability during severe storms",
      "Soil-borne wilt can persist for years if blocks are not rested or rotated",
    ],
    layFallowNote: "Rest and solarize/cover-crop 6–8 weeks before replanting blocks.",
    baseScores: { water: 74, soil: 76, income: 86, resilience: 73 },
  },
  "Sugar Cane": {
    name: "Sugar Cane",
    localName: "Tubo",
    scientificName: "Saccharum officinarum",
    image: "/crops/sugarcane.jpg",
    category: "Plantation",
    cycleDays: "10–12 Months",
    plantingWindow: "Nov – Mar / May – Jun",
    soilImpact:
      "Multi-year ratoons compact soil and deplete N & K; trash mulching protects topsoil.",
    verificationTags: ["DA-ATI Region 10", "BPI IPM", "FAO EcoCrop"],
    pestsAndDiseases: [
      {
        name: "Sugarcane borer & white grubs",
        riskLevel: "Moderate",
        riskWindow: "Warm dry-to-wet transitions in ratoon fields",
        mitigation:
          "Trash-mulch, release Trichogramma if available, and break ratoons with legumes.",
      },
      {
        name: "Smut & red rot",
        riskLevel: "Moderate",
        riskWindow: "Waterlogged ratoon stools after heavy rain",
        mitigation:
          "Rogue infected stools early and replant with clean setts after a legume break.",
      },
    ],
    pros: [
      "Strong Bukidnon milling infrastructure and ratooning reduces annual land prep",
      "Dense canopy protects soil once closed",
    ],
    cons: [
      "Multi-year ratoon compaction and nitrogen/potassium drawdown",
      "Burning trash accelerates organic matter loss and erosion on slopes",
    ],
    layFallowNote: "After final ratoon, rest 4–6 weeks or sow mungbean before replanting.",
    baseScores: { water: 75, soil: 70, income: 83, resilience: 77 },
  },
  Fallow: {
    name: "Fallow",
    localName: "Pahuway sa Yuta / Cover Rest",
    scientificName: "Cover / Rest Cycle",
    image: "/crops/fallow.jpg",
    category: "Cover / Rest",
    cycleDays: "30–60 Days",
    plantingWindow: "Any Post-Harvest Recovery Window",
    soilImpact: "Restores soil structure, organic carbon, and disrupts host-specific pests.",
    verificationTags: ["DA-ATI Region 10", "FAO EcoCrop"],
    pestsAndDiseases: [
      {
        name: "Volunteer weed & pest host carryover",
        riskLevel: "Low",
        riskWindow: "Unmanaged regrowth during wet months",
        mitigation: "Slash weeds before seeding or sow a deliberate legume cover.",
      },
    ],
    pros: [
      "Breaks pest/disease cycles and lets compacted or waterlogged soil recover",
      "Reduces erosion risk on steep slopes when cover vegetation is maintained",
    ],
    cons: [
      "Zero direct crop revenue during the resting window",
      "Requires light slashing so aggressive weeds do not set seed",
    ],
    layFallowNote: "Active 4–8 week recovery rest with cover mulch before resuming cash crops.",
    baseScores: { water: 94, soil: 95, income: 40, resilience: 94 },
  },
};

export type RotationStrategy = Rotation & {
  total: number;
  strategyLabel: string;
  isCurrentRotation: boolean;
  nextCrop: string;
  nextCropLocalName: string;
  nextCropScientificName: string;
  cycleDays: string;
  plantingWindow: string;
  verificationTags: string[];
  nextCropImage: string;
  pros: string[];
  cons: string[];
  pestsAndDiseases: CropPestRisk[];
  layFallowPeriod: string;
  satelliteWhy: string[];
  evidenceGaps: string[];
};

export function getCropProfile(name: string): CropProfile {
  return CROP_PROFILES[name] ?? CROP_PROFILES["Corn"]!;
}

// Pure typed demo logic comparing the farmer's current rotation against two alternatives.
export function buildRotationStrategies(
  scenario: ClimateScenario,
  farm: DemoFarmContext & {
    crop: string;
    previous: string;
    slopePercent?: number | null;
    soil?: string;
  },
): RotationStrategy[] {
  const currentCrop = farm.crop?.trim() || "Corn";
  const previousCrop = farm.previous?.trim() || "Mungbean";
  const isMonoculture = previousCrop.toLowerCase() === currentCrop.toLowerCase();
  const month = Number(farm.planted.slice(5, 7)) - 1;
  const rainfall = farm.monthlyRainfall?.[month];
  const ph = farm.ph;
  const slope = farm.slopePercent ?? null;

  const currentNext = isMonoculture
    ? currentCrop
    : previousCrop === "Fallow"
      ? currentCrop
      : previousCrop;
  const legumeNext = currentCrop === "Mungbean" ? "Corn" : "Mungbean";
  const legumeFollow =
    legumeNext === "Mungbean" ? (currentCrop === "Rice" ? "Rice" : "Corn") : "Mungbean";

  const resilientNext =
    slope !== null && slope >= 15
      ? "Fallow"
      : scenario === "El Niño-like"
        ? currentCrop === "Sorghum"
          ? "Cassava"
          : "Sorghum"
        : farm.drainage === "Poor"
          ? "Rice"
          : currentCrop === "Sweet potato"
            ? "Cassava"
            : "Sweet potato";

  const resilientFollow =
    resilientNext === "Fallow" ? "Mungbean" : resilientNext === "Rice" ? "Mungbean" : "Corn";

  const rawStrategies: Array<{
    id: string;
    strategyLabel: string;
    isCurrentRotation: boolean;
    sequence: string[];
    nextCrop: string;
    baseNote: string;
    extraWhy: string[];
  }> = [
    {
      id: "current-baseline",
      strategyLabel: "FARMER'S CURRENT ROTATION",
      isCurrentRotation: true,
      sequence: [previousCrop, currentCrop, currentNext],
      nextCrop: currentNext,
      baseNote: isMonoculture
        ? `Continuing ${currentCrop} after ${previousCrop} keeps familiar management but risks pest carryover and nutrient depletion.`
        : `Continuing your ${previousCrop} → ${currentCrop} → ${currentNext} pattern as the baseline benchmark.`,
      extraWhy: [
        isMonoculture
          ? `Repeated ${currentCrop} history flags higher pest/disease pressure and soil nutrient drawdown.`
          : `Baseline reflects your reported ${previousCrop} → ${currentCrop} field history.`,
      ],
    },
    {
      id: "legume-break",
      strategyLabel: "ALTERNATIVE 1 · NITROGEN & PEST BREAK",
      isCurrentRotation: false,
      sequence: [currentCrop, legumeNext, legumeFollow],
      nextCrop: legumeNext,
      baseNote:
        legumeNext === "Mungbean"
          ? `Inserts a short-cycle Mungbean break after ${currentCrop} to fix nitrogen and disrupt host-specific pests.`
          : `Follows ${currentCrop} with ${legumeNext} to utilize fixed nitrogen and diversify harvest timing.`,
      extraWhy: [
        "Legume break interrupts cereal/plantation pest cycles and supports topsoil nitrogen.",
      ],
    },
    {
      id: "resilient-diversification",
      strategyLabel: "ALTERNATIVE 2 · CLIMATE & TERRAIN FIT",
      isCurrentRotation: false,
      sequence: [currentCrop, resilientNext, resilientFollow],
      nextCrop: resilientNext,
      baseNote:
        resilientNext === "Fallow"
          ? "Recommends a restorative fallow/cover window before the next cash crop due to steeper terrain."
          : `Adapts to ${scenario} assumptions and field drainage by rotating ${currentCrop} into ${resilientNext}.`,
      extraWhy: [
        resilientNext === "Fallow"
          ? "Steeper slope increases runoff risk; cover rest protects topsoil before replanting."
          : `Selected for ${scenario} moisture/terrain tolerance relative to continuous ${currentCrop}.`,
      ],
    },
  ];

  return rawStrategies.map((item) => {
    const profile = getCropProfile(item.nextCrop);
    const scores = { ...profile.baseScores };
    const satelliteWhy = [...item.extraWhy];
    const evidenceGaps: string[] = [];

    if (item.isCurrentRotation && isMonoculture) {
      scores.soil -= 14;
      scores.resilience -= 12;
      satelliteWhy.push(
        "Monoculture penalty applied (−14 soil, −12 resilience) for demo comparison.",
      );
    }

    if (scenario === "El Niño-like") {
      if (
        item.nextCrop === "Sorghum" ||
        item.nextCrop === "Cassava" ||
        item.nextCrop === "Mungbean"
      ) {
        scores.water += 4;
        scores.resilience += 4;
      } else if (item.nextCrop === "Rice") {
        scores.water -= 14;
        scores.resilience -= 8;
      } else {
        scores.water -= 6;
      }
    } else if (scenario === "Wet") {
      if (item.nextCrop === "Sweet potato" && farm.drainage !== "Good") {
        scores.soil -= 10;
        scores.resilience -= 8;
      } else if (item.nextCrop === "Rice") {
        scores.water += 6;
      }
    }

    if (Number.isFinite(ph) && (ph < 5.5 || ph > 7.5)) {
      const phPenalty = item.nextCrop === "Pineapple" || item.nextCrop === "Cassava" ? 4 : 12;
      scores.soil -= phPenalty;
      satelliteWhy.push(
        `Reported or imported pH (${ph.toFixed(1)}) is outside 5.5–7.5; soil score adjusted −${phPenalty}.`,
      );
    } else if (Number.isFinite(ph)) {
      satelliteWhy.push(
        `Reported or imported pH (${ph.toFixed(1)}) falls within typical 5.5–7.5 demo range.`,
      );
    } else {
      evidenceGaps.push(
        "Soil pH is missing; obtain a local soil test before applying lime or fertilizer.",
      );
    }

    let noteText = item.baseNote;
    if (farm.drainage === "Poor") {
      const drainPenalty = item.nextCrop === "Sweet potato" || item.nextCrop === "Cassava" ? 18 : 8;
      scores.soil -= drainPenalty;
      noteText = `${noteText} Poor drainage: demo soil rating −${drainPenalty}. Field assessment required.`;
      satelliteWhy.push(`Poor drainage reduces ${item.nextCrop} soil score by −${drainPenalty}.`);
    } else if (farm.drainage === "Unknown") {
      evidenceGaps.push(
        "Field drainage is unconfirmed; check for standing water before planting roots or legumes.",
      );
    }

    if (slope !== null && Number.isFinite(slope)) {
      if (slope >= 15) {
        if (item.nextCrop !== "Fallow" && item.nextCrop !== "Banana") scores.soil -= 8;
        satelliteWhy.push(
          `Open-Meteo slope (${slope.toFixed(1)}%) flags erosion risk on tilled beds.`,
        );
      } else {
        satelliteWhy.push(
          `Terrain slope (${slope.toFixed(1)}%) is within manageable cultivation limits.`,
        );
      }
    } else {
      evidenceGaps.push(
        "Slope/elevation check not yet loaded; verify hillside runoff channels locally.",
      );
    }

    if (rainfall != null) {
      const sampleMonthlyNeed =
        item.nextCrop === "Sorghum" || item.nextCrop === "Mungbean"
          ? 95
          : item.nextCrop === "Sweet potato" || item.nextCrop === "Cassava"
            ? 110
            : 130;
      scores.water = Math.min(100, (rainfall / sampleMonthlyNeed) * 100);
      satelliteWhy.push(
        `NASA POWER planting-month rain (${rainfall.toFixed(1)} mm) compared against ${sampleMonthlyNeed} mm demo threshold.`,
      );
    } else {
      evidenceGaps.push(
        "Planting-month NASA POWER rainfall not yet applied; using scenario baseline.",
      );
    }

    if (["Gravity-fed", "Pump-irrigated", "Drip irrigation"].includes(farm.irrigation)) {
      scores.water += 5;
      satelliteWhy.push(`Reported ${farm.irrigation} adds +5 water score (capacity unverified).`);
    } else if (farm.irrigation === "Unknown") {
      evidenceGaps.push("Irrigation status is unknown; rainfed risk cannot be ruled out.");
    }

    evidenceGaps.push(
      "Local market prices, seed availability, and micro-climate require farmer/agronomist review.",
    );

    for (const key of Object.keys(scores) as Array<keyof typeof scores>) {
      scores[key] = Math.round(Math.max(0, Math.min(100, scores[key])) * 10) / 10;
    }

    return {
      id: item.id,
      name: item.sequence.join(" → "),
      strategyLabel: item.strategyLabel,
      isCurrentRotation: item.isCurrentRotation,
      sequence: item.sequence,
      nextCrop: item.nextCrop,
      nextCropLocalName: profile.localName,
      nextCropScientificName: profile.scientificName,
      cycleDays: profile.cycleDays,
      plantingWindow: profile.plantingWindow,
      verificationTags: profile.verificationTags,
      nextCropImage: profile.image,
      note: noteText,
      scores,
      total: calculateRotationScore(scores),
      pros: profile.pros,
      cons: profile.cons,
      pestsAndDiseases: profile.pestsAndDiseases,
      layFallowPeriod: profile.layFallowNote,
      satelliteWhy,
      evidenceGaps,
    };
  });
}

export type FertilizerStage = {
  stage: string;
  timing: string;
  guidance: string;
};

export type SoilAndAgronomyAdvisory = {
  suitability: {
    status: "Suitable" | "Conditional" | "Not suitable for intensive tillage";
    summary: string;
    flags: string[];
  };
  soilProfile: {
    phLabel: string;
    phStatus: "Acidic" | "Optimal" | "Alkaline" | "Unknown";
    mineralsNeeded: string[];
    recommendedFertilizers: string[];
    avoidFertilizers: string[];
  };
  fertilizerStages: FertilizerStage[];
  climateTiming: {
    bestPlantingWindow: string;
    prominentPestClimate: string;
  };
};

// Illustrative demo screening logic for soil, fertilizer stages, and slope suitability; not a lab soil test.
export function buildSoilAndAgronomyAdvisory(input: {
  nextCrop: string;
  previousCrop: string;
  ph: number | null;
  soilTexture: string;
  drainage: string;
  irrigation: string;
  slopePercent: number | null;
  elevation: number | null;
  monthlyRainfall?: (number | null)[];
  monthlyTemperature?: (number | null)[];
}): SoilAndAgronomyAdvisory {
  const {
    nextCrop,
    previousCrop,
    ph,
    soilTexture,
    drainage,
    slopePercent,
    elevation,
    monthlyRainfall,
    monthlyTemperature,
  } = input;

  // 1. Planting suitability screening (slope, drainage, pH)
  const flags: string[] = [];
  let status: SoilAndAgronomyAdvisory["suitability"]["status"] = "Suitable";

  if (slopePercent !== null && Number.isFinite(slopePercent)) {
    if (slopePercent >= 18) {
      status = "Not suitable for intensive tillage";
      flags.push(
        `Steep slope (${slopePercent.toFixed(1)}%): high erosion risk for clean-tilled annuals. Prefer agroforestry, contour strips, or restorative fallow.`,
      );
    } else if (slopePercent >= 8) {
      status = "Conditional";
      flags.push(
        `Moderate slope (${slopePercent.toFixed(1)}%): plant along contour lines and retain mulch cover.`,
      );
    } else {
      flags.push(`Gentle slope (${slopePercent.toFixed(1)}%): low runoff risk for row crops.`);
    }
  } else {
    flags.push("Slope data unavailable: inspect field grade for runoff channels before tilling.");
  }

  if (drainage === "Poor") {
    if (status === "Suitable") status = "Conditional";
    flags.push(
      `Poor drainage: avoid flat-bed root crops (${nextCrop === "Sweet potato" || nextCrop === "Cassava" ? "high rot risk" : "use raised beds/canals"}).`,
    );
  }

  if (ph !== null && Number.isFinite(ph) && (ph < 4.8 || ph > 8.0)) {
    if (status === "Suitable") status = "Conditional";
    flags.push(
      `Extreme Reported or imported pH (${ph.toFixed(1)}): confirm with a local soil test before planting sensitive crops.`,
    );
  }

  if (elevation !== null && Number.isFinite(elevation)) {
    flags.push(
      `Elevation ~${Math.round(elevation)} m ASL: matches ${elevation >= 500 ? "Bukidnon mid-to-highland" : "lowland/valley"} thermal profile.`,
    );
  }

  const suitabilitySummary =
    status === "Not suitable for intensive tillage"
      ? "Satellite terrain flags steep-slope erosion risk. Avoid open tillage; use cover or perennial strips."
      : status === "Conditional"
        ? "Planting is possible with targeted soil/drainage mitigations listed below."
        : "No major terrain or drainage blockers detected in screening data; verify locally.";

  // 2. Soil pH, mineral needs & fertilizer guidance (use vs avoid)
  let phStatus: SoilAndAgronomyAdvisory["soilProfile"]["phStatus"] = "Unknown";
  let phLabel = "Unknown (local soil test needed)";
  const mineralsNeeded: string[] = [];
  const recommendedFertilizers: string[] = [];
  const avoidFertilizers: string[] = [];

  if (ph !== null && Number.isFinite(ph)) {
    if (ph < 5.5) {
      phStatus = "Acidic";
      phLabel = `pH ${ph.toFixed(1)} (Acidic)`;
      mineralsNeeded.push(
        "Calcium (Ca) & Magnesium (Mg) via agricultural lime",
        "Available Phosphorus (P) — often fixed in acidic volcanic soils",
      );
      recommendedFertilizers.push(
        "Dolomitic / agricultural lime (2–4 weeks pre-plant)",
        "Rock phosphate or 14-14-14 + organic compost",
      );
      avoidFertilizers.push(
        "Heavy straight Ammonium Sulfate (21-0-0) without liming (further lowers pH)",
      );
    } else if (ph <= 7.5) {
      phStatus = "Optimal";
      phLabel = `pH ${ph.toFixed(1)} (Balanced)`;
      mineralsNeeded.push(
        previousCrop === "Corn" || previousCrop === "Rice" || previousCrop === "Sugar Cane"
          ? "Nitrogen (N) & Potassium (K) replenishment after heavy cereal/cane uptake"
          : "Balanced N-P-K maintenance",
      );
      recommendedFertilizers.push(
        "Complete 14-14-14 basal + compost/vermicast",
        "Targeted Urea (46-0-0) split-applied",
      );
      avoidFertilizers.push(
        "Single-pass heavy nitrogen before heavy rain (leaching & lodging risk)",
      );
    } else {
      phStatus = "Alkaline";
      phLabel = `pH ${ph.toFixed(1)} (Alkaline)`;
      mineralsNeeded.push("Zinc (Zn), Iron (Fe), & Phosphorus availability check");
      recommendedFertilizers.push(
        "Ammonium sulfate (21-0-0) or organic mulch to gently buffer pH",
        "Foliar micronutrient check if chlorosis appears",
      );
      avoidFertilizers.push("Additional agricultural lime or wood ash (raises pH further)");
    }
  } else {
    mineralsNeeded.push("Run a barangay/DA soil kit check for N-P-K and pH before basal purchase");
    recommendedFertilizers.push(
      "Well-decomposed farmyard manure or compost as a safe soil-building base",
    );
    avoidFertilizers.push("Unverified high-rate synthetic blends without knowing baseline soil pH");
  }

  if (soilTexture.toLowerCase().includes("sand") && soilTexture.includes("6")) {
    mineralsNeeded.push(
      "Organic matter & Potassium (K) — sandy soils leach mobile nutrients quickly",
    );
    avoidFertilizers.push("Single heavy broadcast of soluble Urea (split into 2–3 smaller doses)");
  }

  if (nextCrop === "Mungbean") {
    recommendedFertilizers.push(
      "Rhizobium inoculant + low starter N (let legume nodules fix nitrogen)",
    );
    avoidFertilizers.push(
      "High nitrogen rates (>30 kg N/ha) — suppresses root nodulation and causes excess vine",
    );
  } else if (nextCrop === "Sweet potato" || nextCrop === "Cassava") {
    mineralsNeeded.push("Potassium (K) for root/tuber bulking");
    recommendedFertilizers.push("Muriate of Potash (0-0-60) or balanced K-rich blend");
    avoidFertilizers.push(
      "Excess late-stage Nitrogen (produces leafy vines at the expense of tubers)",
    );
  } else if (nextCrop === "Fallow") {
    mineralsNeeded.push("Organic carbon & surface residue retention");
    recommendedFertilizers.push(
      "Retain crop stover/mulch or sow cover legumes; skip synthetic fertilizer",
    );
    avoidFertilizers.push("Synthetic top-dressing during rest period");
  }

  // 3. Fertilizer timing stages by crop development
  const fertilizerStages: FertilizerStage[] =
    nextCrop === "Fallow"
      ? [
          {
            stage: "Rest & Cover Establishment",
            timing: "0–14 days post-harvest",
            guidance: "Slash residues evenly as surface mulch; avoid synthetic fertilizer.",
          },
          {
            stage: "Soil Recovery Window",
            timing: "Weeks 2–6",
            guidance:
              "Allow soil structure and beneficial microbes to recover; slash aggressive weeds before seeding.",
          },
        ]
      : nextCrop === "Mungbean"
        ? [
            {
              stage: "Basal (At Planting)",
              timing: "Day 0",
              guidance:
                "Apply light starter P & K (or 14-14-14) + Rhizobium inoculant in moist furrows.",
            },
            {
              stage: "Early Vegetative",
              timing: "14–21 DAS",
              guidance: "Check nodulation; skip top-dress N if pink active nodules are present.",
            },
            {
              stage: "Flowering to Pod Fill",
              timing: "30–45 DAS",
              guidance: "Keep soil evenly moist; foliar K/micronutrients only if deficiency shows.",
            },
          ]
        : nextCrop === "Sweet potato" || nextCrop === "Cassava"
          ? [
              {
                stage: "Basal (Ridge Prep)",
                timing: "Day 0–7",
                guidance: "Incorporate compost + balanced P/K basal along raised ridges.",
              },
              {
                stage: "Vegetative Canopy",
                timing: "25–35 DAP",
                guidance: "Side-dress moderate N + K and hill up soil to cover developing roots.",
              },
              {
                stage: "Root Bulking",
                timing: "55–75 DAP",
                guidance: "Stop nitrogen; ensure potassium availability and keep ridges drained.",
              },
            ]
          : [
              {
                stage: "Basal (At Planting)",
                timing: "Day 0",
                guidance:
                  "Band 14-14-14 + organic compost 5 cm beside seed/sett; apply lime 2–4 weeks earlier if pH < 5.5.",
              },
              {
                stage: "Vegetative (V4–V6 / Tillering)",
                timing: "21–30 DAP",
                guidance:
                  "Side-dress Urea (46-0-0) into moist soil before hilling up; avoid broadcasting before storms.",
              },
              {
                stage: "Pre-Tassel / Booting",
                timing: "45–55 DAP",
                guidance: "Final split N + K boost to support ear/panicle/stalk fill.",
              },
            ];

  // 4. Climate planting window & pest-prominent conditions
  const monthNames = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  let bestPlantingWindow =
    "May–June (onset of wet season) or Oct–Nov (second-crop residual moisture window) in typical Bukidnon calendars.";
  let prominentPestClimate =
    "Warm dry-to-wet transitions (25–30 °C) favor fall armyworm, aphids, and weevils; prolonged >250 mm wet months elevate fungal blight, downy mildew, and root rot.";

  if (monthlyRainfall?.length === 12) {
    const idealMonths = monthlyRainfall
      .map((mm, idx) => ({ mm, name: monthNames[idx]! }))
      .filter((m) => m.mm != null && m.mm >= 110 && m.mm <= 240)
      .map((m) => m.name);
    const wettest = monthlyRainfall
      .map((mm, idx) => ({ mm, name: monthNames[idx]! }))
      .filter((m): m is { mm: number; name: string } => m.mm != null)
      .sort((a, b) => b.mm - a.mm)[0];
    const warmest =
      monthlyTemperature?.length === 12
        ? monthlyTemperature
            .map((t, idx) => ({ t, name: monthNames[idx]! }))
            .filter((m): m is { t: number; name: string } => m.t != null)
            .sort((a, b) => b.t - a.t)[0]
        : null;

    if (idealMonths.length > 0) {
      bestPlantingWindow = `NASA POWER shows moderate moisture (110–240 mm/mo) in ${idealMonths.slice(0, 4).join(", ")} — favorable demo establishment windows.`;
    }
    if (wettest) {
      prominentPestClimate = `Peak rain (~${Math.round(wettest.mm)} mm in ${wettest.name}) raises fungal/waterlogging risk${warmest ? `; warmest month (${warmest.t.toFixed(1)} °C in ${warmest.name}) elevates insect pest pressure` : ""}.`;
    }
  }

  return {
    suitability: { status, summary: suitabilitySummary, flags },
    soilProfile: { phLabel, phStatus, mineralsNeeded, recommendedFertilizers, avoidFertilizers },
    fertilizerStages,
    climateTiming: { bestPlantingWindow, prominentPestClimate },
  };
}

export type NextCropField = {
  crop: string;
  previous: string;
  planted: string;
  ph: string;
  soil: string;
  drainage: string;
  irrigation: string;
};
export type NextCropSuggestion = {
  crop: string;
  reasons: string[];
  conditions: string[];
  sourceUrl: string;
  longTerm: boolean;
};
export type NextCropResult = {
  planted: string;
  suggestions: NextCropSuggestion[];
  gaps: string[];
  excluded: Array<{ crop: string; reasons: string[] }>;
  climateSourceUrl: string;
  startYear: number;
  endYear: number;
};
export function nextCropInputKey(
  location: { latitude: number; longitude: number },
  farm: NextCropField,
  terrain?: { elevation: number | null; slopePercent: number | null } | null,
) {
  return JSON.stringify([
    location.latitude,
    location.longitude,
    farm.crop,
    farm.previous,
    farm.planted,
    farm.ph,
    farm.soil,
    farm.drainage,
    farm.irrigation,
    terrain?.elevation ?? null,
    terrain?.slopePercent ?? null,
  ]);
}
export function localPlanningDate(now = new Date()) {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}
export function validNextPlantingDate(value: string, today = localPlanningDate()) {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString().slice(0, 10) === value &&
    value >= today
  );
}
// Pure demo screening of global reference ranges; matching is not verified local suitability.
export function suggestNextCrops(
  farm: NextCropField,
  climate: RotationClimate,
  terrain?: { elevation: number | null; slopePercent: number | null } | null,
  today = localPlanningDate(),
): NextCropResult {
  const result: NextCropResult = {
    planted: farm.planted,
    suggestions: [],
    gaps: [],
    excluded: [],
    climateSourceUrl: climate.sourceUrl,
    startYear: climate.startYear,
    endYear: climate.endYear,
  };
  if (!validNextPlantingDate(farm.planted, today)) {
    result.gaps.push("Enter a valid planting date from today onward.");
    return result;
  }
  if (
    !CROP_REQUIREMENTS.some((crop) => crop.crop === farm.crop) ||
    ![...CROP_REQUIREMENTS.map((crop) => crop.crop), "Fallow", "Unknown"].includes(farm.previous)
  ) {
    result.gaps.push("Confirm your current and previous crops.");
    return result;
  }
  const ph = farm.ph.trim() ? Number(farm.ph) : null;
  if (ph !== null && (!Number.isFinite(ph) || ph < 0 || ph > 14)) {
    result.gaps.push("Enter a soil pH from 0 to 14, or leave it unknown.");
    return result;
  }
  if (
    climate.completeYears < 8 ||
    climate.annualRainfallMm === null ||
    climate.months.length !== 12
  ) {
    result.gaps.push(
      "At least eight complete years of rainfall are needed; no sample data was substituted.",
    );
    return result;
  }
  const planting = Date.parse(farm.planted);
  const family = (name: string) => CROP_REQUIREMENTS.find((crop) => crop.crop === name)?.family;
  const ranked: Array<{
    suggestion: NextCropSuggestion;
    unresolved: number;
    optimal: number;
    rotation: number;
  }> = [];
  for (const rule of CROP_REQUIREMENTS) {
    const conflicts: string[] = [];
    const conditions: string[] = [];
    const reasons: string[] = [];
    let optimal = 0;
    const check = (value: number, range: CropRange, label: string) => {
      if (value < range[2] || value > range[3])
        conflicts.push(
          `${label} is outside the published absolute range (${range[2]}–${range[3]}).`,
        );
      else if (value >= range[0] && value <= range[1]) optimal++;
      else
        conditions.push(
          `${label} is within the broad limits but outside the published optimal range (${range[0]}–${range[1]}).`,
        );
    };
    check(climate.annualRainfallMm, rule.annualRainfallMm, "Historical annual rainfall (mm/year)");
    const monthIndices = new Set<number>();
    for (let day = 0; day < rule.maxCycleDays; day++)
      monthIndices.add(new Date(planting + day * 86400000).getUTCMonth());
    const months = [...monthIndices].map((index) => climate.months[index]!);
    if (
      months.some(
        (month) => month.validYears < 8 || month.temperatureC === null || month.rainfallMm === null,
      )
    ) {
      conflicts.push("Not enough historical observations for this crop's growing-period months.");
    } else {
      const temperatures = months.map((month) => month.temperatureC!);
      if (
        temperatures.some((value) => value < rule.temperatureC[2] || value > rule.temperatureC[3])
      )
        conflicts.push(
          "A growing-period monthly mean temperature falls outside the published limits.",
        );
      else if (
        temperatures.every(
          (value) => value >= rule.temperatureC[0] && value <= rule.temperatureC[1],
        )
      )
        optimal++;
      else
        conditions.push("Some growing-period monthly temperatures fall outside the optimal range.");
      reasons.push(
        `Historical growing-period monthly temperatures: ${Math.min(...temperatures).toFixed(1)}–${Math.max(...temperatures).toFixed(1)} °C.`,
      );
    }
    if (ph === null) conditions.push("Soil pH is unknown; confirm with a local soil test.");
    else check(ph, rule.ph, "Soil pH");
    if (!farm.drainage || farm.drainage === "Unknown")
      conditions.push("Confirm field drainage before planting.");
    else if (rule.drainage === "well" && farm.drainage === "Poor")
      conflicts.push("Poor drainage conflicts with this crop's drainage screening requirement.");
    else if (rule.drainage === "wet")
      conditions.push(
        "Rice reference describes wet-rice systems; confirm suitable water control and variety. Poor drainage alone does not establish suitability.",
      );
    else if (farm.drainage !== "Good")
      conditions.push("Confirm that drainage is adequate for this crop.");
    if (
      terrain?.elevation != null &&
      Number.isFinite(terrain.elevation) &&
      terrain.elevation > rule.maxElevationM
    )
      conflicts.push("Mapped elevation exceeds the reference altitude limit.");
    if (terrain?.elevation == null || !Number.isFinite(terrain.elevation))
      conditions.push("Elevation is unknown; verify locally against the crop reference.");
    if (terrain?.slopePercent == null || !Number.isFinite(terrain.slopePercent))
      conditions.push("Slope is unknown; verify erosion and field access locally.");
    else if (terrain.slopePercent >= 15)
      conditions.push(
        "Steep terrain: local erosion-control review is needed before cultivation (demo precaution).",
      );
    if (!farm.soil.trim() || farm.soil === "Unknown")
      conditions.push("Soil texture is unknown; verify locally.");
    else if (rule.optimalTextures.length) {
      if (rule.optimalTextures.includes(farm.soil)) optimal++;
      else
        conditions.push(
          "Confirm soil texture against the crop reference; imported percentages are not a field texture test.",
        );
    }
    if (farm.irrigation === "Unknown" || !farm.irrigation)
      conditions.push("Irrigation availability is unknown.");
    else if (farm.irrigation !== "Rain-fed")
      conditions.push(
        "Confirm irrigation capacity; reported irrigation does not override rainfall limits.",
      );
    if (rule.longTerm)
      conditions.push(
        "Long-term crop: confirm land availability, variety and full production cycle; not a short-season rotation.",
      );
    if (rule.crop === "Banana")
      conditions.push("Banana reference is Musa acuminata; confirm the intended local cultivar.");
    if (conflicts.length) {
      result.excluded.push({ crop: rule.crop, reasons: conflicts });
      continue;
    }
    const rotation =
      rule.crop === farm.crop || rule.crop === farm.previous
        ? 0
        : family(farm.crop) === rule.family
          ? 1
          : 2;
    if (rotation === 2)
      reasons.push(
        "Changes crop family from the current crop; local pest and disease history still needs review.",
      );
    else
      conditions.push(
        "Repeats a recent crop or crop family; check pest carryover before choosing it.",
      );
    reasons.unshift(
      `Historical annual rain averages ${Math.round(climate.annualRainfallMm)} mm across ${climate.completeYears} complete years, within this crop's broad reference limits.`,
    );
    ranked.push({
      suggestion: {
        crop: rule.crop,
        reasons: reasons.slice(0, 3),
        conditions,
        sourceUrl: cropRequirementUrl(rule.sourceId),
        longTerm: rule.longTerm,
      },
      unresolved: conditions.length,
      optimal,
      rotation,
    });
  }
  ranked.sort(
    (a, b) => a.unresolved - b.unresolved || b.optimal - a.optimal || b.rotation - a.rotation,
  );
  result.suggestions = ranked.slice(0, 3).map((item) => item.suggestion);
  if (!result.suggestions.length)
    result.gaps.push(
      "No listed crop cleared the available weather and field screening. Review the constraints with a local agricultural technician.",
    );
  return result;
}
