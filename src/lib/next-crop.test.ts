import { describe, expect, it } from "vitest";
import { CROP_REQUIREMENTS } from "./crop-requirements";
import {
  localPlanningDate,
  nextCropInputKey,
  suggestNextCrops,
  validNextPlantingDate,
  type NextCropField,
} from "./fieldshift-demo";
import { parseRotationClimate, rotationClimateUrl, type RotationClimate } from "./nasa-power";
const farm: NextCropField = {
  crop: "Corn",
  previous: "Corn",
  planted: "2027-12-15",
  ph: "6",
  soil: "Loam",
  drainage: "Good",
  irrigation: "Rain-fed",
};
const terrain = { elevation: 300, slopePercent: 3 };
const climate: RotationClimate = {
  months: Array.from({ length: 12 }, (_, i) => ({
    month: i + 1,
    validYears: 10,
    rainfallMm: 100,
    rainfallMinMm: 70,
    rainfallMaxMm: 140,
    temperatureC: 25,
  })),
  annualRainfallMm: 1200,
  completeYears: 10,
  startYear: 2016,
  endYear: 2025,
  sourceUrl: "https://power.larc.nasa.gov/history",
  retrievedAt: "2026-11-15T00:00:00Z",
};
const screen = (field = farm, data = climate) =>
  suggestNextCrops(field, data, terrain, "2026-11-15");
function payload() {
  const rain: Record<string, number> = {},
    temp: Record<string, number> = {};
  for (let y = 2016; y <= 2025; y++)
    for (let m = 1; m <= 12; m++) {
      const k = `${y}${String(m).padStart(2, "0")}`;
      rain[k] = 2;
      temp[k] = 25;
    }
  return {
    header: { fill_value: -999 },
    parameters: { PRECTOTCORR: { units: "mm/day" }, T2M: { units: "C" } },
    properties: { parameter: { PRECTOTCORR: rain, T2M: temp } },
  };
}
describe("ten-year climate", () => {
  it("requests complete years and validates coordinates and ranges", () => {
    const url = new URL(rotationClimateUrl({ latitude: 8.3, longitude: 125 }, 2025));
    expect(url.searchParams.get("start")).toBe("2016");
    expect(url.searchParams.get("end")).toBe("2025");
    expect(() => rotationClimateUrl({ latitude: 91, longitude: 125 }, 2025)).toThrow();
    expect(() => rotationClimateUrl({ latitude: 8, longitude: 125 }, 2099)).toThrow();
  });
  it("converts rates using leap years, excludes annual entries, and preserves missing metadata", () => {
    const data = payload();
    data.properties.parameter.PRECTOTCORR["201613"] = 99999;
    const parsed = parseRotationClimate(data, 2025, "https://example.com");
    expect(parsed.months[1]!.rainfallMaxMm).toBe(58);
    expect(parsed.months[1]!.rainfallMinMm).toBe(56);
    expect(parsed.completeYears).toBe(10);
    expect(parsed.annualRainfallMm).toBe(730.6);
    data.header.fill_value = -777;
    data.properties.parameter.PRECTOTCORR["201601"] = -777;
    const missing = parseRotationClimate(data, 2025, "https://example.com");
    expect(missing.completeYears).toBe(9);
    expect(missing.months[0]!.validYears).toBe(9);
  });
  it("accepts monthly totals without multiplying and rejects unexpected units", () => {
    const data = payload();
    data.parameters.PRECTOTCORR.units = "mm/month";
    expect(parseRotationClimate(data, 2025, "").annualRainfallMm).toBe(24);
    data.parameters.PRECTOTCORR.units = "inches";
    expect(() => parseRotationClimate(data, 2025, "")).toThrow();
  });
});
describe("next-crop screening", () => {
  it("evaluates all eight sourced crop rules without sample scores", () => {
    expect(CROP_REQUIREMENTS).toHaveLength(8);
    for (const rule of CROP_REQUIREMENTS) {
      const data = {
        ...climate,
        annualRainfallMm: rule.annualRainfallMm[0],
        months: climate.months.map((month) => ({ ...month, temperatureC: rule.temperatureC[0] })),
      };
      const result = screen(
        { ...farm, ph: String(rule.ph[0]), drainage: rule.drainage === "wet" ? "Poor" : "Good" },
        data,
      );
      expect(result.excluded.find((crop) => crop.crop === rule.crop)).toBeUndefined();
      expect([...result.suggestions, ...result.excluded].every((crop) => !("scores" in crop))).toBe(
        true,
      );
    }
    expect(screen().suggestions.length).toBeLessThanOrEqual(3);
    expect(screen()).toEqual(screen());
  });
  it("preserves unknown field conditions and rejects invalid dates and pH", () => {
    expect(
      screen({
        ...farm,
        ph: "",
        soil: "",
        drainage: "Unknown",
        irrigation: "Unknown",
      }).suggestions[0]?.conditions.join(" "),
    ).toContain("unknown");
    expect(screen({ ...farm, ph: "15" }).suggestions).toEqual([]);
    expect(validNextPlantingDate("2027-02-30", "2026-11-15")).toBe(false);
    expect(validNextPlantingDate("2025-12-01", "2026-11-15")).toBe(false);
    expect(localPlanningDate(new Date(2026, 10, 15))).toBe("2026-11-15");
  });
  it("checks coverage across December and January and withholds all conflicts", () => {
    const missing = {
      ...climate,
      months: climate.months.map((month) =>
        month.month === 1 ? { ...month, validYears: 7 } : month,
      ),
    };
    expect(screen(farm, missing).suggestions).toEqual([]);
    expect(screen(farm, { ...climate, completeYears: 7 }).suggestions).toEqual([]);
    expect(screen(farm, { ...climate, annualRainfallMm: 6000 }).suggestions).toEqual([]);
    expect(
      screen({ ...farm, drainage: "Poor" }).suggestions.every((crop) => crop.crop === "Rice"),
    ).toBe(true);
  });
  it("tracks changed inputs for stale-result protection", () => {
    const location = { latitude: 8, longitude: 125 };
    expect(nextCropInputKey(location, farm, terrain)).not.toBe(
      nextCropInputKey(location, { ...farm, planted: "2027-11-15" }, terrain),
    );
    expect(nextCropInputKey(location, farm, terrain)).not.toBe(
      nextCropInputKey({ ...location, latitude: 9 }, farm, terrain),
    );
  });
});
