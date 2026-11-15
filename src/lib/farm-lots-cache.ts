import type { PlannerResult } from "@/components/next-crop-planner";
import {
  calculateEstimatedLoss,
  SAMPLE_CORN_PRICE_PER_KG,
  SAMPLE_YIELD_KG_PER_HA,
} from "./fieldshift-demo";
import { coordinatesSchema, type Coordinates } from "./nasa-power";

export const FARM_LOTS_CACHE_STORAGE_KEY = "nasabukid-farm-lots-v1";
export const MAX_LOT_NAME_LENGTH = 48;

export type LotHazard = "Flooding" | "Drought" | "Typhoon" | "Heat" | "Human-caused";

export type CachedFarmProfile = {
  place: string;
  area: string;
  crop: string;
  previous: string;
  ph: string;
  soil: string;
  irrigation: string;
  drainage: string;
  planted: string;
};

export type CachedCropRotationState = {
  plannedDate: string;
  plannerResult: PlannerResult | null;
};

export type CachedDisasterRecoveryState = {
  hazard: LotHazard;
  damageDate: string;
  affected: number;
  yieldLoss: number;
  price: string;
  expectedYield: string;
  assumptionsEdited: boolean;
  actualPlantingDate: string;
  growthStage: string;
  durationHours: string;
  observations: string;
  estimatedLossPhp: number;
};

export type CachedFarmLot = {
  id: string;
  name: string;
  location: Coordinates;
  locationConfirmed: boolean;
  boundary: Coordinates[];
  terrain: { elevation: number; slopePercent: number } | null;
  farm: CachedFarmProfile;
  cropRotation: CachedCropRotationState;
  disasterRecovery: CachedDisasterRecoveryState;
  /** Reserved timestamp for future flood-prone NASA / NOAH SMS alert module. */
  floodRiskCheckedAt?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type FarmLotsCacheState = {
  version: 1;
  activeLotId: string | null;
  lots: CachedFarmLot[];
};

export type LotReportSnapshot = {
  lotId: string;
  lotName: string;
  place: string;
  areaHectares: string;
  location: Coordinates;
  boundaryPoints: number;
  currentCrop: string;
  previousCrop: string;
  plannedPlantingDate: string;
  topRecommendedCrop: string | null;
  cropRotationSuggestions: string[];
  hazard: LotHazard;
  damageDate: string;
  estimatedLossPhp: number;
  generatedAt: string;
};

export function createEmptyLotsCache(): FarmLotsCacheState {
  return {
    version: 1,
    activeLotId: null,
    lots: [],
  };
}

export function generateLotId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `lot-${crypto.randomUUID().slice(0, 8)}`;
  }
  return `lot-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

export function defaultLotName(index: number, _place?: string): string {
  const safeIndex = Number.isFinite(index) && index >= 1 ? Math.floor(index) : 1;
  return `Lot ${safeIndex}`;
}

export function normalizeLotName(raw: string, fallback: string): string {
  const trimmed = raw.replace(/\s+/g, " ").trim().slice(0, MAX_LOT_NAME_LENGTH);
  return trimmed || fallback;
}

export function computeSafeLossPhp({
  area,
  affected,
  expectedYield,
  yieldLoss,
  price,
}: {
  area: string;
  affected: number;
  expectedYield: string;
  yieldLoss: number;
  price: string;
}): number {
  const areaNum = Number(area);
  const expectedNum = Number(expectedYield);
  const priceNum = Number(price);
  if (
    !Number.isFinite(areaNum) ||
    areaNum < 0 ||
    !Number.isFinite(expectedNum) ||
    expectedNum < 0 ||
    !Number.isFinite(priceNum) ||
    priceNum < 0
  ) {
    return 0;
  }
  try {
    return calculateEstimatedLoss({
      areaHectares: areaNum,
      affectedFraction: Math.min(1, Math.max(0, affected / 100)),
      expectedYieldKgPerHectare: expectedNum,
      yieldLossFraction: Math.min(1, Math.max(0, yieldLoss / 100)),
      pricePerKg: priceNum,
    });
  } catch {
    return 0;
  }
}

export function createDefaultDisasterRecoveryState(
  overrides?: Partial<CachedDisasterRecoveryState>,
): CachedDisasterRecoveryState {
  const base: CachedDisasterRecoveryState = {
    hazard: "Flooding",
    damageDate: "2026-10-29",
    affected: 65,
    yieldLoss: 35,
    price: String(SAMPLE_CORN_PRICE_PER_KG),
    expectedYield: String(SAMPLE_YIELD_KG_PER_HA),
    assumptionsEdited: false,
    actualPlantingDate: "",
    growthStage: "",
    durationHours: "",
    observations: "",
    estimatedLossPhp: 0,
    ...overrides,
  };
  return base;
}

export function upsertFarmLot(
  state: FarmLotsCacheState,
  incoming: CachedFarmLot,
): FarmLotsCacheState {
  const idx = state.lots.findIndex((item) => item.id === incoming.id);
  const now = new Date().toISOString();
  const normalized: CachedFarmLot = {
    ...incoming,
    name: normalizeLotName(incoming.name, defaultLotName(idx >= 0 ? idx + 1 : state.lots.length + 1)),
    updatedAt: now,
  };
  const nextLots =
    idx >= 0
      ? state.lots.map((item, i) => (i === idx ? normalized : item))
      : [...state.lots, normalized];
  return {
    version: 1,
    activeLotId: normalized.id,
    lots: nextLots,
  };
}

export function renameFarmLot(
  state: FarmLotsCacheState,
  lotId: string,
  nextName: string,
): FarmLotsCacheState {
  const idx = state.lots.findIndex((item) => item.id === lotId);
  if (idx < 0) return state;
  const normalized = normalizeLotName(nextName, defaultLotName(idx + 1));
  const now = new Date().toISOString();
  return {
    ...state,
    lots: state.lots.map((item) =>
      item.id === lotId ? { ...item, name: normalized, updatedAt: now } : item,
    ),
  };
}

export function selectFarmLot(state: FarmLotsCacheState, lotId: string): FarmLotsCacheState {
  if (!state.lots.some((item) => item.id === lotId)) return state;
  return {
    ...state,
    activeLotId: lotId,
  };
}

export function removeFarmLot(state: FarmLotsCacheState, lotId: string): FarmLotsCacheState {
  const remaining = state.lots.filter((item) => item.id !== lotId);
  const nextActive =
    state.activeLotId === lotId
      ? remaining[0]?.id ?? null
      : state.activeLotId && remaining.some((item) => item.id === state.activeLotId)
        ? state.activeLotId
        : remaining[0]?.id ?? null;
  return {
    version: 1,
    activeLotId: nextActive,
    lots: remaining,
  };
}

export function getActiveFarmLot(state: FarmLotsCacheState): CachedFarmLot | null {
  if (!state.lots.length) return null;
  return state.lots.find((item) => item.id === state.activeLotId) ?? state.lots[0] ?? null;
}

function isValidCachedLot(raw: unknown): raw is CachedFarmLot {
  if (!raw || typeof raw !== "object") return false;
  const candidate = raw as Partial<CachedFarmLot>;
  if (typeof candidate.id !== "string" || !candidate.id.trim()) return false;
  if (typeof candidate.name !== "string") return false;
  const loc = coordinatesSchema.safeParse(candidate.location);
  if (!loc.success) return false;
  if (!Array.isArray(candidate.boundary) || candidate.boundary.length < 3) return false;
  for (const pt of candidate.boundary) {
    if (!coordinatesSchema.safeParse(pt).success) return false;
  }
  if (!candidate.farm || typeof candidate.farm !== "object") return false;
  if (!candidate.cropRotation || typeof candidate.cropRotation !== "object") return false;
  if (!candidate.disasterRecovery || typeof candidate.disasterRecovery !== "object") return false;
  return true;
}

export function loadFarmLotsCache(storage?: Pick<Storage, "getItem"> | null): FarmLotsCacheState {
  const store =
    storage ?? (typeof window !== "undefined" ? window.localStorage : null);
  if (!store) return createEmptyLotsCache();
  try {
    const raw = store.getItem(FARM_LOTS_CACHE_STORAGE_KEY);
    if (!raw) return createEmptyLotsCache();
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return createEmptyLotsCache();
    const obj = parsed as Partial<FarmLotsCacheState>;
    const validLots = Array.isArray(obj.lots) ? obj.lots.filter(isValidCachedLot) : [];
    const activeId =
      typeof obj.activeLotId === "string" && validLots.some((l) => l.id === obj.activeLotId)
        ? obj.activeLotId
        : validLots[0]?.id ?? null;
    return {
      version: 1,
      activeLotId: activeId,
      lots: validLots,
    };
  } catch {
    return createEmptyLotsCache();
  }
}

export function saveFarmLotsCache(
  state: FarmLotsCacheState,
  storage?: Pick<Storage, "setItem"> | null,
): void {
  const store =
    storage ?? (typeof window !== "undefined" ? window.localStorage : null);
  if (!store) return;
  try {
    store.setItem(FARM_LOTS_CACHE_STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* Ignore storage quota errors cleanly. */
  }
}

/**
 * Pure structured extractor consumed by future PDF reporting module.
 */
export function buildLotReportSnapshot(lot: CachedFarmLot): LotReportSnapshot {
  const suggestions = lot.cropRotation.plannerResult?.result.suggestions ?? [];
  return {
    lotId: lot.id,
    lotName: lot.name,
    place: lot.farm.place,
    areaHectares: lot.farm.area,
    location: lot.location,
    boundaryPoints: lot.boundary.length,
    currentCrop: lot.farm.crop,
    previousCrop: lot.farm.previous,
    plannedPlantingDate: lot.cropRotation.plannedDate || lot.farm.planted,
    topRecommendedCrop: suggestions[0]?.crop ?? null,
    cropRotationSuggestions: suggestions.map((s) => s.crop),
    hazard: lot.disasterRecovery.hazard,
    damageDate: lot.disasterRecovery.damageDate,
    estimatedLossPhp: lot.disasterRecovery.estimatedLossPhp,
    generatedAt: new Date().toISOString(),
  };
}
