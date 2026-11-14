import { z } from "zod";

export const coordinatesSchema = z.object({
  latitude: z.number().finite().min(-90).max(90),
  longitude: z.number().finite().min(-180).max(180),
});
export type Coordinates = z.infer<typeof coordinatesSchema>;
export type WeatherDay = { date: string; rainfall: number | null; temperature: number | null };
export type HistoricalWeather = {
  days: WeatherDay[];
  sourceUrl: string;
  retrievedAt: string;
  latitude: number;
  longitude: number;
  start: string;
  end: string;
};
const responseSchema = z.object({
  properties: z.object({
    parameter: z.object({
      PRECTOTCORR: z.record(z.number()),
      T2M: z.record(z.number()),
    }),
  }),
});

export function weatherRequestUrl(location: Coordinates, start: string, end: string): string {
  coordinatesSchema.parse(location);
  const validDate = (value: string) =>
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString().slice(0, 10) === value;
  if (
    !validDate(start) ||
    !validDate(end) ||
    start > end ||
    start < "1981-01-01" ||
    end > new Date().toISOString().slice(0, 10) ||
    Date.parse(end) - Date.parse(start) > 366 * 86400000
  ) {
    throw new Error("Choose a historical date range from 1981 onward, no longer than one year.");
  }
  const query = new URLSearchParams({
    parameters: "PRECTOTCORR,T2M",
    community: "AG",
    latitude: String(location.latitude),
    longitude: String(location.longitude),
    start: start.replaceAll("-", ""),
    end: end.replaceAll("-", ""),
    format: "JSON",
    "time-standard": "UTC",
  });
  return `https://power.larc.nasa.gov/api/temporal/daily/point?${query}`;
}

export function parseWeather(payload: unknown, start: string, end: string): WeatherDay[] {
  const { PRECTOTCORR: rain, T2M: temperature } =
    responseSchema.parse(payload).properties.parameter;
  const days: WeatherDay[] = [];
  for (let time = Date.parse(start); time <= Date.parse(end); time += 86400000) {
    const date = new Date(time).toISOString().slice(0, 10);
    const key = date.replaceAll("-", "");
    const r = rain[key];
    const t = temperature[key];
    days.push({
      date,
      rainfall: r !== undefined && Number.isFinite(r) && r >= 0 ? r : null,
      temperature: t !== undefined && Number.isFinite(t) && t !== -999 ? t : null,
    });
  }
  if (!days.some((day) => day.rainfall !== null || day.temperature !== null)) {
    throw new Error("NASA returned no usable observations for this period. Try an earlier period.");
  }
  return days;
}

export async function fetchHistoricalWeather(
  location: Coordinates,
  start: string,
  end: string,
  signal?: AbortSignal,
): Promise<HistoricalWeather> {
  const sourceUrl = weatherRequestUrl(location, start, end);
  const response = await fetch(sourceUrl, {
    signal: signal
      ? AbortSignal.any([signal, AbortSignal.timeout(45000)])
      : AbortSignal.timeout(45000),
  });
  if (!response.ok)
    throw new Error(
      response.status === 429
        ? "NASA request limit reached. Please wait before retrying."
        : `NASA POWER request failed (${response.status}). Please retry later.`,
    );
  return {
    days: parseWeather(await response.json(), start, end),
    sourceUrl,
    retrievedAt: new Date().toISOString(),
    ...location,
    start,
    end,
  };
}

export function summarizeWeather(days: WeatherDay[]) {
  const rain = days.flatMap((day) => (day.rainfall === null ? [] : [day.rainfall]));
  const temp = days.flatMap((day) => (day.temperature === null ? [] : [day.temperature]));
  return {
    rainfall:
      rain.length === days.length && rain.length > 0 ? rain.reduce((a, b) => a + b, 0) : null,
    temperature:
      temp.length === days.length && temp.length > 0
        ? temp.reduce((a, b) => a + b, 0) / temp.length
        : null,
    missingDays: days.filter((day) => day.rainfall === null || day.temperature === null).length,
  };
}

export function monthlyWeather(days: WeatherDay[]) {
  const months = new Map<string, WeatherDay[]>();
  for (const day of days) {
    const key = day.date.slice(0, 7);
    const group = months.get(key) ?? [];
    group.push(day);
    months.set(key, group);
  }
  return Array.from(months, ([month, observations]) => {
    const expectedDays = new Date(
      Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5)), 0),
    ).getUTCDate();
    const summary = summarizeWeather(observations);
    const omittedDays = Math.max(0, expectedDays - observations.length);
    return {
      month,
      label: new Date(`${month}-01T00:00:00Z`).toLocaleString("en", {
        month: "short",
        timeZone: "UTC",
      }),
      rainfall: omittedDays ? null : summary.rainfall,
      temperature: omittedDays ? null : summary.temperature,
      missingDays: summary.missingDays + omittedDays,
    };
  });
}
