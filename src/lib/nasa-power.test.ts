import { describe, expect, it, vi, afterEach } from "vitest";
import {
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
});

import { monthlyWeather } from "./nasa-power";
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
});
