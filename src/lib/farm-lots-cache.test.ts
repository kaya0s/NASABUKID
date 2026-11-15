import { describe, expect, it } from "vitest";
import {
  buildLotReportSnapshot,
  computeSafeLossPhp,
  createDefaultDisasterRecoveryState,
  createEmptyLotsCache,
  loadFarmLotsCache,
  renameFarmLot,
  removeFarmLot,
  saveFarmLotsCache,
  selectFarmLot,
  upsertFarmLot,
  type CachedFarmLot,
} from "./farm-lots-cache";

function makeSampleLot(id: string, name: string, lat = 7.89, lng = 125.09): CachedFarmLot {
  const now = "2026-11-15T00:00:00.000Z";
  return {
    id,
    name,
    location: { latitude: lat, longitude: lng },
    locationConfirmed: true,
    boundary: [
      { latitude: lat, longitude: lng },
      { latitude: lat + 0.001, longitude: lng },
      { latitude: lat + 0.001, longitude: lng + 0.001 },
    ],
    terrain: { elevation: 298, slopePercent: 2.1 },
    farm: {
      place: "Valencia, Bukidnon",
      area: "1.2500",
      crop: "Corn",
      previous: "Mungbean",
      ph: "5.8",
      soil: "Clay loam",
      irrigation: "Rainfed",
      drainage: "Moderate",
      planted: "2026-12-01",
    },
    cropRotation: {
      plannedDate: "2026-12-01",
      plannerResult: null,
    },
    disasterRecovery: createDefaultDisasterRecoveryState({
      hazard: "Flooding",
      estimatedLossPhp: 42500,
    }),
    createdAt: now,
    updatedAt: now,
  };
}

describe("farm-lots-cache", () => {
  it("stores, renames, selects, and removes multiple farm lots cleanly", () => {
    let state = createEmptyLotsCache();
    const lotA = makeSampleLot("lot-a", "Upper Corn Lot", 7.89, 125.09);
    const lotB = makeSampleLot("lot-b", "Riverbank Rice", 7.91, 125.11);

    state = upsertFarmLot(state, lotA);
    state = upsertFarmLot(state, lotB);

    expect(state.lots).toHaveLength(2);
    expect(state.activeLotId).toBe("lot-b");

    state = selectFarmLot(state, "lot-a");
    expect(state.activeLotId).toBe("lot-a");

    state = renameFarmLot(state, "lot-a", "North Ridge Parcel");
    expect(state.lots.find((l) => l.id === "lot-a")?.name).toBe("North Ridge Parcel");

    state = removeFarmLot(state, "lot-a");
    expect(state.lots).toHaveLength(1);
    expect(state.activeLotId).toBe("lot-b");
  });

  it("persists and restores lots including crop rotation and disaster recovery via storage", () => {
    const store = new Map<string, string>();
    const storage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => {
        store.set(k, v);
      },
    };

    let state = createEmptyLotsCache();
    const lot = makeSampleLot("lot-1", "Maramag Parcel A", 7.76, 124.99);
    lot.cropRotation = {
      plannedDate: "2027-01-10",
      plannerResult: {
        inputKey: "k-1",
        climateMonths: [],
        result: {
          planted: "2027-01-10",
          suggestions: [
            {
              crop: "Mungbean",
              reasons: ["Nitrogen fixation after corn"],
              conditions: [],
              sourceUrl: "https://example.com",
              longTerm: false,
            },
          ],
          gaps: [],
          excluded: [],
          climateSourceUrl: "https://power.larc.nasa.gov/",
          startYear: 2015,
          endYear: 2025,
        },
      },
    };
    state = upsertFarmLot(state, lot);
    saveFarmLotsCache(state, storage);

    const restored = loadFarmLotsCache(storage);
    expect(restored.lots).toHaveLength(1);
    expect(restored.activeLotId).toBe("lot-1");
    expect(restored.lots[0]?.name).toBe("Maramag Parcel A");
    expect(restored.lots[0]?.disasterRecovery.estimatedLossPhp).toBe(42500);
    expect(restored.lots[0]?.cropRotation.plannerResult?.result.suggestions[0]?.crop).toBe(
      "Mungbean",
    );

    const report = buildLotReportSnapshot(restored.lots[0]!);
    expect(report.lotName).toBe("Maramag Parcel A");
    expect(report.topRecommendedCrop).toBe("Mungbean");
    expect(report.estimatedLossPhp).toBe(42500);
  });

  it("computes safe disaster recovery loss estimates", () => {
    const loss = computeSafeLossPhp({
      area: "2",
      affected: 50,
      expectedYield: "4000",
      yieldLoss: 25,
      price: "20",
    });
    expect(loss).toBe(20000);
  });

  it("ignores boundaryless pointed-location entries when loading from storage", () => {
    const store = new Map<string, string>();
    const storage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => {
        store.set(k, v);
      },
    };
    const validLot = makeSampleLot("lot-valid", "Plotted Lot", 7.89, 125.09);
    const pointOnlyLot: CachedFarmLot = {
      ...makeSampleLot("lot-point", "Lot 1", 7.76, 124.99),
      boundary: [],
    };
    saveFarmLotsCache(
      {
        version: 1,
        activeLotId: "lot-point",
        lots: [pointOnlyLot, validLot],
      },
      storage,
    );

    const restored = loadFarmLotsCache(storage);
    expect(restored.lots.map((l) => l.id)).toEqual(["lot-valid"]);
    expect(restored.activeLotId).toBe("lot-valid");
  });
});
