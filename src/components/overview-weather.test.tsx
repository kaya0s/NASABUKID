import { expect, it, vi } from "vitest";
import { fetchCurrentWeather } from "./overview-weather";

it("rejects missing weather measurements rather than converting null to zero", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ current: { temperature_2m: null } }) }),
  );
  await expect(fetchCurrentWeather({ latitude: 8.3, longitude: 125 })).rejects.toThrow();
  vi.unstubAllGlobals();
});
