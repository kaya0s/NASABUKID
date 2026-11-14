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
  monthlyRainfall?: number[];
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
      if (rainfall !== undefined) {
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
