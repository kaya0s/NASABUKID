import { describe, expect, it } from "vitest";
import { classifyFarmSignals, parsePlace, parseSoil, soilRequestUrl } from "./farm-context";
const layer = (name: string, mean: number | null) => ({
  name,
  unit_measure: { d_factor: 10 },
  depths: [
    {
      label: "5-15cm",
      values: {
        mean,
        "Q0.05": name === "phh2o" ? 49 : null,
        "Q0.95": name === "phh2o" ? 68 : null,
      },
    },
  ],
});
describe("Public farm context", () => {
  it("uses municipality/city data rather than substituting a province or village", () => {
    expect(
      parsePlace({
        features: [
          { properties: { city: "Malaybalay", state: "Bukidnon", country: "Philippines" } },
        ],
      }).municipality,
    ).toBe("Malaybalay");
    expect(() =>
      parsePlace({
        features: [{ properties: { name: "Village", osm_value: "village", state: "Bukidnon" } }],
      }),
    ).toThrow("No municipality");
  });
  it("converts pH×10 and texture g/kg to pH and percentages, with uncertainty", () => {
    const data = parseSoil({
      properties: {
        layers: [layer("phh2o", 61), layer("sand", 400), layer("silt", 350), layer("clay", 250)],
      },
    });
    expect(data.ph).toBe(6.1);
    expect(data.phRange).toEqual([4.9, 6.8]);
    expect(data.texture).toBe("Sand 40.0% · Silt 35.0% · Clay 25.0%");
    const url = new URL(soilRequestUrl({ latitude: 8.3, longitude: 125 }));
    expect(url.searchParams.getAll("property")).toEqual(["phh2o", "sand", "silt", "clay"]);
    expect(url.searchParams.get("depth")).toBe("5-15cm");
  });
  it("leaves unavailable properties missing and rejects unexpected units and unusable data", () => {
    const data = parseSoil({
      properties: { layers: [layer("phh2o", -32768), layer("sand", 400)] },
    });
    expect(data.ph).toBeNull();
    expect(data.texture).toBeNull();
    expect(() => parseSoil({ properties: { layers: [] } })).toThrow("no usable estimates");
    expect(() =>
      parseSoil({
        properties: { layers: [{ ...layer("phh2o", 61), unit_measure: { d_factor: 100 } }] },
      }),
    ).toThrow("Unexpected soil units");
  });
});

import { terrainRequestUrl, parseTerrain, classifyOverpassLandUse } from "./farm-context";
it("samples centre and four neighbours and computes a terrain gradient without treating missing values as flat", () => {
  const url = new URL(terrainRequestUrl({ latitude: 8.3, longitude: 125 }));
  expect(url.searchParams.get("latitude")!.split(",")).toHaveLength(5);
  expect(parseTerrain({ elevation: [100, 100, 100, 100, 100] }).slopePercent).toBe(0);
  expect(parseTerrain({ elevation: [100, 102, 98, 100, 100] }).slopePercent).toBeCloseTo(2.2222);
  expect(() => parseTerrain({ elevation: [100, null, 100, 100, 100] })).toThrow();
  expect(() => parseTerrain({ elevation: [100, -9999, 100, 100, 100] })).toThrow();
  expect(() => terrainRequestUrl({ latitude: 89, longitude: 125 })).toThrow();
});

describe("3-tier farm lot land-use classification", () => {
  it("hard-blocks water, residential, commercial, and building features", () => {
    expect(
      classifyOverpassLandUse({ elements: [{ tags: { natural: "water" } }] }),
    ).toMatchObject({
      tier: "hard_block",
      message: "Non-arable area detected (urban structure or water body). Please select a farm plot.",
    });
    expect(
      classifyOverpassLandUse({ elements: [{ tags: { landuse: "residential" } }] }).tier,
    ).toBe("hard_block");
    expect(
      classifyOverpassLandUse({ elements: [{ tags: { building: "yes" } }] }).tier,
    ).toBe("hard_block");
    expect(
      classifyOverpassLandUse({ elements: [{ tags: { amenity: "school" } }] }).tier,
    ).toBe("hard_block");
    expect(
      classifyOverpassLandUse({ elements: [{ tags: { leisure: "park" } }] }).tier,
    ).toBe("hard_block");
    expect(
      classifyOverpassLandUse({ elements: [{ tags: { highway: "residential" } }] }).tier,
    ).toBe("hard_block");
    expect(
      classifyOverpassLandUse({ elements: [{ tags: { natural: "wood" } }] }).tier,
    ).toBe("hard_block");
  });

  it("allows farmland even when an adjacent road tag is also returned", () => {
    expect(
      classifyOverpassLandUse({
        elements: [{ tags: { landuse: "farmland" } }, { tags: { highway: "secondary" } }],
      }).tier,
    ).toBe("pass");
  });

  it("instantly passes farmland, orchard, and plantation tags", () => {
    expect(
      classifyOverpassLandUse({ elements: [{ tags: { landuse: "farmland" } }] }),
    ).toMatchObject({
      tier: "pass",
      message: null,
    });
    expect(
      classifyOverpassLandUse({ elements: [{ tags: { landuse: "orchard" } }] }).tier,
    ).toBe("pass");
  });

  it("soft-confirms untagged rural land", () => {
    expect(classifyOverpassLandUse({ elements: [] })).toMatchObject({
      tier: "soft_confirm",
      message: "Unmapped rural parcel — verify crop boundary before saving.",
    });
  });

  it("blocks non-arable areas using elevation, SoilGrids, Photon, and MODIS NDVI", () => {
    expect(
      classifyFarmSignals({ elevationM: 0, soilAvailable: true, peakNdvi: 0.4 }).tier,
    ).toBe("hard_block");
    expect(
      classifyFarmSignals({ elevationM: 320, soilAvailable: false, peakNdvi: 0.4 }).tier,
    ).toBe("hard_block");
    expect(
      classifyFarmSignals({ elevationM: 320, soilAvailable: true, peakNdvi: 0.09 }).tier,
    ).toBe("hard_block");
    expect(
      classifyFarmSignals({
        elevationM: 320,
        soilAvailable: true,
        peakNdvi: 0.5,
        photonOsmKey: "building",
        photonOsmValue: "yes",
      }).tier,
    ).toBe("hard_block");
  });

  it("soft-confirms low NDVI fallow fields and passes vegetated farmland", () => {
    expect(
      classifyFarmSignals({ elevationM: 320, soilAvailable: true, peakNdvi: 0.19 }).tier,
    ).toBe("soft_confirm");
    expect(
      classifyFarmSignals({ elevationM: 320, soilAvailable: true, peakNdvi: 0.58 }).tier,
    ).toBe("pass");
  });
});
