import { describe, expect, it, vi, afterEach } from "vitest";
import {
  calendarWeather,
  fetchRecentNasaClimate,
  fetchHistoricalWeather,
  parseWeather,
  summarizeWeather,
  weatherRequestUrl,
} from "./nasa-power";

const location = { latitude: 8.3, longitude: 125 };
const payload = {
  properties: {
    parameter: {
      PRECTOTCORR: { "20240101": 5, "20240102": -999 },
      T2M: { "20240101": 24, "20240102": 25 },
    },
  },
};
afterEach(() => vi.unstubAllGlobals());
describe("NASA POWER historical observations", () => {
  it("constructs a keyless UTC point request with selected coordinates", () => {
    const url = new URL(weatherRequestUrl(location, "2024-01-01", "2024-12-31"));
    expect(url.searchParams.get("latitude")).toBe("8.3");
    expect(url.searchParams.get("start")).toBe("20240101");
    expect(url.searchParams.get("parameters")).toBe("PRECTOTCORR,T2M");
    expect(url.searchParams.get("time-standard")).toBe("UTC");
  });
  it("rejects invalid coordinates, impossible dates, reversed and excessive ranges", () => {
    expect(() =>
      weatherRequestUrl({ ...location, latitude: 91 }, "2024-01-01", "2024-01-02"),
    ).toThrow();
    for (const [start, end] of [
      ["2024-02-30", "2024-03-01"],
      ["2024-02-01", "2024-01-01"],
      ["2020-01-01", "2024-01-01"],
      ["1980-01-01", "1980-12-31"],
      ["2099-01-01", "2099-12-31"],
    ]) {
      expect(() => weatherRequestUrl(location, start!, end!)).toThrow();
    }
  });
  it("keeps missing days and NASA fill values missing, never treating them as dry weather", () => {
    const days = parseWeather(payload, "2024-01-01", "2024-01-03");
    expect(days).toEqual([
      { date: "2024-01-01", rainfall: 5, temperature: 24 },
      { date: "2024-01-02", rainfall: null, temperature: 25 },
      { date: "2024-01-03", rainfall: null, temperature: null },
    ]);
    expect(summarizeWeather(days)).toEqual({ rainfall: null, temperature: null, missingDays: 2 });
  });
  it("sums precipitation and averages temperature across complete leap-day data", () => {
    const days = parseWeather(
      {
        properties: {
          parameter: {
            PRECTOTCORR: { "20240228": 0, "20240229": 12 },
            T2M: { "20240228": 22, "20240229": 24 },
          },
        },
      },
      "2024-02-28",
      "2024-02-29",
    );
    expect(summarizeWeather(days)).toEqual({ rainfall: 12, temperature: 23, missingDays: 0 });
  });
  it("rejects malformed or wholly unavailable responses", () => {
    expect(() => parseWeather({}, "2024-01-01", "2024-01-02")).toThrow();
    expect(() => parseWeather(payload, "2024-02-01", "2024-02-02")).toThrow(
      "no usable observations",
    );
  });
  it("reports rate limiting without fabricating weather", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 429 }));
    await expect(fetchHistoricalWeather(location, "2024-01-01", "2024-01-02")).rejects.toThrow(
      "limit reached",
    );
  });
  it("returns provenance alongside parsed NASA observations", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => payload }));
    const result = await fetchHistoricalWeather(location, "2024-01-01", "2024-01-02");
    expect(result.latitude).toBe(8.3);
    expect(result.days[0]?.rainfall).toBe(5);
    expect(result.sourceUrl).toContain("power.larc.nasa.gov");
    expect(Number.isFinite(Date.parse(result.retrievedAt))).toBe(true);
  });
  it("extracts soil moisture, skin temperature, 30-day rain and NASA elevation, ignoring fill values", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          geometry: { coordinates: [125, 8.3, 340.4] },
          properties: {
            parameter: {
              PRECTOTCORR: { "20240101": 5, "20240102": 7 },
              T2M: { "20240101": 24, "20240102": 25 },
              GWETTOP: { "20240101": 0.5, "20240102": 0.34 },
              TS: { "20240101": 27, "20240102": -999 },
            },
          },
        }),
      }),
    );
    const result = await fetchHistoricalWeather(
      location,
      "2024-01-01",
      "2024-01-02",
      undefined,
      "PRECTOTCORR,T2M,GWETTOP,TS",
    );
    expect(result.soilMoisturePercent).toBe(34);
    expect(result.surfaceTempC).toBe(27);
    expect(result.recent30dRainfallMm).toBe(12);
    expect(result.nasaElevationM).toBe(340);
    expect(vi.mocked(fetch).mock.calls[0]?.[0]).toContain("GWETTOP");
  });
});

import { monthlyWeather, parseModisNdviSeries, toModisDate } from "./nasa-power";
describe("Monthly chart aggregation", () => {
  it("sums complete months and preserves incomplete calendar coverage", () => {
    const january = Array.from({ length: 31 }, (_, index) => ({
      date: `2024-01-${String(index + 1).padStart(2, "0")}`,
      rainfall: 2,
      temperature: 24,
    }));
    expect(
      monthlyWeather([...january, { date: "2024-02-01", rainfall: null, temperature: 22 }]),
    ).toEqual([
      { month: "2024-01", label: "Jan", rainfall: 62, temperature: 24, missingDays: 0 },
      { month: "2024-02", label: "Feb", rainfall: null, temperature: null, missingDays: 29 },
    ]);
  });

  it("formats MODIS dates and parses scaled MOD13Q1 NDVI series", () => {
    expect(toModisDate(new Date("2025-02-01T00:00:00Z"))).toBe("A2025032");
    expect(
      parseModisNdviSeries({
        subset: [
          { calendar_date: "2025-01-17", data: [-3000] },
          { calendar_date: "2025-02-02", data: [7400] },
          { calendar_date: "2025-01-01", data: [4200] },
        ],
      }),
    ).toEqual([
      { date: "2025-01-01", ndvi: 0.42 },
      { date: "2025-02-02", ndvi: 0.74 },
    ]);
  });
});

it("aligns cross-year weather by calendar month and preserves missing coverage", () => {
  const days = Array.from({ length: 31 }, (_, i) => ({
    date: `2024-12-${String(i + 1).padStart(2, "0")}`,
    rainfall: 2,
    temperature: 24,
  }));
  const result = calendarWeather([...days, { date: "2025-01-01", rainfall: 0, temperature: 25 }]);
  expect(result.monthlyRainfall).toEqual([...Array(11).fill(null), 62]);
  expect(result.monthlyTemperature[11]).toBe(24);
  expect(
    calendarWeather(days.map((day, i) => ({ ...day, rainfall: i === 0 ? null : 2 })))
      .monthlyRainfall[11],
  ).toBeNull();
  expect(calendarWeather(days.map((day) => ({ ...day, rainfall: 0 }))).monthlyRainfall[11]).toBe(0);
});

it("does not substitute last year's data when recent weather fails", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 503 }));
  await expect(fetchRecentNasaClimate(location)).rejects.toThrow("503");
  expect(fetch).toHaveBeenCalledTimes(1);
});
