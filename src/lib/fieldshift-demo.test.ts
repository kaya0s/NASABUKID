import { describe, expect, it } from "vitest";
import {
  calculateEstimatedLoss,
  calculateRotationScore,
  SAMPLE_CORN_PRICE_PER_KG,
  SAMPLE_YIELD_KG_PER_HA,
} from "@/lib/fieldshift-demo";

describe("FieldShift demo calculations", () => {
  it("calculates the weighted score using water 30%, soil 30%, income 25%, resilience 15%", () => {
    expect(calculateRotationScore({ water: 82, soil: 88, income: 76, resilience: 90 })).toBe(83.5);
  });

  it("calculates the default 4.2 hectare flood loss using 65%, sample yield 6,000 kg/ha, 35%, and ₱18/kg", () => {
    expect(SAMPLE_YIELD_KG_PER_HA).toBe(6000);
    expect(SAMPLE_CORN_PRICE_PER_KG).toBe(18);
    expect(
      calculateEstimatedLoss({
        areaHectares: 4.2,
        affectedFraction: 0.65,
        expectedYieldKgPerHectare: 6000,
        yieldLossFraction: 0.35,
        pricePerKg: 18,
      }),
    ).toBe(103194);
  });
});
import { rotationsForFarm } from "./fieldshift-demo";
const farm = { ph: 6.1, drainage: "Good", irrigation: "Rain-fed", planted: "2026-01-15" };
describe("Farm-aware demo comparison", () => {
  it("uses farmer-reported drainage and irrigation in the shared score", () => {
    const normal = rotationsForFarm("Typical", farm);
    const poor = rotationsForFarm("Typical", { ...farm, drainage: "Poor" });
    expect(poor.find((r) => r.id === "root-crop")!.scores.soil).toBe(
      normal.find((r) => r.id === "root-crop")!.scores.soil - 20,
    );
    expect(
      rotationsForFarm("Typical", { ...farm, irrigation: "Drip irrigation" }).find(
        (r) => r.id === "legume",
      )!.scores.water,
    ).toBe(87);
  });
  it("applies historical rainfall for the planned planting month and keeps ratings bounded", () => {
    const monthlyRainfall = [30, 300, ...Array<number>(10).fill(100)];
    const dry = rotationsForFarm("Typical", { ...farm, monthlyRainfall });
    const wet = rotationsForFarm("Typical", { ...farm, planted: "2026-02-15", monthlyRainfall });
    expect(dry[0]!.id).toBe("cover");
    expect(wet.every((rotation) => rotation.scores.water === 100)).toBe(true);
    expect(dry[0]!.note).toContain("not a soil-water balance");
    expect(
      dry.every((rotation) =>
        Object.values(rotation.scores).every((score) => score >= 0 && score <= 100),
      ),
    ).toBe(true);
  });
  it("rejects impossible loss assumptions rather than producing misleading amounts", () => {
    const inputs = {
      areaHectares: 1,
      affectedFraction: 1,
      expectedYieldKgPerHectare: 1000,
      yieldLossFraction: 0.5,
      pricePerKg: 18,
    };
    expect(() => calculateEstimatedLoss({ ...inputs, pricePerKg: -1 })).toThrow();
    expect(() => calculateEstimatedLoss({ ...inputs, affectedFraction: 1.1 })).toThrow();
    expect(() =>
      calculateEstimatedLoss({ ...inputs, expectedYieldKgPerHectare: Infinity }),
    ).toThrow();
    expect(calculateEstimatedLoss({ ...inputs, affectedFraction: 0 })).toBe(0);
  });
});

import { suggestDrainage } from "./fieldshift-demo";
it("only suggests drainage from complete screening inputs and never rewards unknown irrigation", () => {
  expect(suggestDrainage(45, 20, 1).suggestion).toBe("Poor");
  expect(suggestDrainage(10, 70, 4).suggestion).toBe("Good");
  expect(suggestDrainage(30, 40, 4).suggestion).toBeNull();
  expect(suggestDrainage(45, 20, null).suggestion).toBeNull();
  expect(suggestDrainage(45, 20, NaN).suggestion).toBeNull();
  expect(suggestDrainage(80, 80, 1).suggestion).toBeNull();
  const unknown = rotationsForFarm("Typical", { ...farm, irrigation: "Unknown" });
  const rainfed = rotationsForFarm("Typical", farm);
  expect(unknown.map((rotation) => rotation.scores.water)).toEqual(
    rainfed.map((rotation) => rotation.scores.water),
  );
});

import { planningReviewFlags, evaluateYieldPilot } from "./fieldshift-demo";
it("flags missing water and drainage evidence without inventing suitability", () => {
  expect(
    planningReviewFlags({
      crop: "Corn",
      previous: "",
      ph: "",
      drainage: "Poor",
      irrigation: "Unknown",
      planted: "",
    }),
  ).toHaveLength(5);
});
it("compares held-out predictions with a baseline and measures interval coverage", () => {
  expect(
    evaluateYieldPilot([
      { predicted: 100, observed: 120, baseline: 90, lower: 110, upper: 130 },
      { predicted: 120, observed: 100, baseline: 90, lower: 110, upper: 130 },
    ]),
  ).toEqual({
    count: 2,
    maeKgPerHa: 20,
    baselineMaeKgPerHa: 20,
    biasKgPerHa: 0,
    intervalCount: 2,
    intervalCoverage: 0.5,
  });
  expect(() => evaluateYieldPilot([])).toThrow();
  expect(() =>
    evaluateYieldPilot([{ predicted: 1, observed: 1, baseline: 1, lower: 2 }]),
  ).toThrow();
});

import { buildRotationStrategies } from "./fieldshift-demo";
it("compares farmer's current rotation with two alternatives including pests, trade-offs, and gaps", () => {
  const strategies = buildRotationStrategies("Typical", {
    ...farm,
    crop: "Corn",
    previous: "Corn",
    slopePercent: 16,
  });
  expect(strategies).toHaveLength(3);
  expect(strategies[0]!.isCurrentRotation).toBe(true);
  expect(strategies[1]!.nextCrop).toBe("Mungbean");
  expect(strategies[2]!.nextCrop).toBe("Fallow");
  for (const strategy of strategies) {
    expect(strategy.nextCropImage).toMatch(/^\/crops\/.*\.jpg$/);
    expect(strategy.pros.length).toBeGreaterThan(0);
    expect(strategy.cons.length).toBeGreaterThan(0);
    expect(strategy.pestsAndDiseases.length).toBeGreaterThan(0);
    expect(strategy.satelliteWhy.length).toBeGreaterThan(0);
    expect(strategy.evidenceGaps.length).toBeGreaterThan(0);
    expect(strategy.layFallowPeriod.length).toBeGreaterThan(0);
  }
});

import { buildSoilAndAgronomyAdvisory } from "./fieldshift-demo";
it("flags acidic soil, steep slope suitability, fertilizer stages, and pest climate", () => {
  const advisory = buildSoilAndAgronomyAdvisory({
    nextCrop: "Mungbean",
    previousCrop: "Corn",
    ph: 5.1,
    soilTexture: "Sand 30% · Silt 30% · Clay 40%",
    drainage: "Good",
    irrigation: "Rainfed",
    slopePercent: 20,
    elevation: 640,
  });
  expect(advisory.suitability.status).toBe("Not suitable for intensive tillage");
  expect(advisory.soilProfile.phStatus).toBe("Acidic");
  expect(
    advisory.soilProfile.avoidFertilizers.some((item) => item.includes("Ammonium Sulfate")),
  ).toBe(true);
  expect(advisory.fertilizerStages.length).toBeGreaterThanOrEqual(2);
  expect(advisory.climateTiming.bestPlantingWindow.length).toBeGreaterThan(0);
});

it("keeps unknown monthly rain on the demo baseline instead of treating it as drought", () => {
  expect(rotationsForFarm("Typical", { ...farm, monthlyRainfall: Array(12).fill(null) })).toEqual(
    rotationsForFarm("Typical", farm),
  );
});

it("compares rotation options using known rain and preserves assumptions for unknown rain", () => {
  const context = { ...farm, crop: "Corn", previous: "Corn" };
  const baseline = buildRotationStrategies("Typical", context);
  expect(buildRotationStrategies("Typical", { ...context, monthlyRainfall: Array(12).fill(null) }))
    .toEqual(baseline);
  const dry = buildRotationStrategies("Typical", { ...context, monthlyRainfall: Array(12).fill(0) });
  expect(dry.every((item) => item.scores.water === 0)).toBe(true);
  expect(buildRotationStrategies("El Niño-like", context).find((item) => item.id === "resilient-diversification")?.nextCrop).toBe("Sorghum");
  for (const item of baseline) {
    expect(item.total).toBe(calculateRotationScore(item.scores));
  }
});
