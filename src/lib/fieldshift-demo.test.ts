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
