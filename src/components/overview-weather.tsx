import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import {
  Cloud,
  CloudDrizzle,
  CloudLightning,
  CloudOff,
  CloudRain,
  CloudSun,
  LocateFixed,
  MapPin,
  RefreshCw,
  Sun,
} from "lucide-react";
import type { Coordinates } from "@/lib/nasa-power";

export type CurrentWeather = {
  temperature: number;
  apparentTemperature: number;
  relativeHumidity: number;
  precipitation: number;
  windSpeed: number;
  weatherCode: number;
  isDay: number;
  time: string;
};

export function interpretWeatherCode(code: number): { label: string; icon: typeof Sun } {
  if (code === 0) return { label: "Clear / Sunny", icon: Sun };
  if (code === 1 || code === 2) return { label: "Partly Cloudy", icon: CloudSun };
  if (code === 3) return { label: "Overcast", icon: Cloud };
  if ([51, 53, 55, 56, 57].includes(code)) return { label: "Light Drizzle", icon: CloudDrizzle };
  if ([61, 63, 65, 80, 81, 82].includes(code)) return { label: "Rain Showers", icon: CloudRain };
  if ([95, 96, 99].includes(code)) return { label: "Thunderstorm", icon: CloudLightning };
  return { label: "Cloudy", icon: Cloud };
}

export async function fetchCurrentWeather(
  location: Coordinates,
  signal?: AbortSignal,
): Promise<CurrentWeather> {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${location.latitude.toFixed(4)}&longitude=${location.longitude.toFixed(4)}&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,wind_speed_10m&timezone=auto`;
  const res = await fetch(url, { signal: signal ?? null });
  if (!res.ok) throw new Error("Could not load weather data.");
  const json = await res.json();
  const current = json.current;
  return {
    temperature: Math.round(current.temperature_2m),
    apparentTemperature: Math.round(current.apparent_temperature),
    relativeHumidity: current.relative_humidity_2m,
    precipitation: current.precipitation,
    windSpeed: Math.round(current.wind_speed_10m),
    weatherCode: current.weather_code,
    isDay: current.is_day,
    time: current.time,
  };
}

function observationTime(time?: string) {
  const match = time?.match(/T(\d{2}):(\d{2})/);
  return match ? `${match[1]}:${match[2]}` : null;
}

export function OverviewWeatherWidget({
  location,
  placeName,
  onLocationFound,
  onOpenFarm,
}: {
  location: Coordinates;
  placeName?: string;
  onLocationFound?: (coords: Coordinates) => void;
  onOpenFarm?: () => void;
}) {
  const [detecting, setDetecting] = useState(false);
  const [locationBlocked, setLocationBlocked] = useState(false);
  const isTestEnv = typeof process !== "undefined" && process.env["NODE_ENV"] === "test";
  const [loaded] = useState(!isTestEnv);

  const query = useQuery({
    queryKey: ["current-weather", location.latitude.toFixed(3), location.longitude.toFixed(3)],
    queryFn: ({ signal }) => fetchCurrentWeather(location, signal),
    enabled: loaded,
    staleTime: 10 * 60 * 1000,
    retry: 1,
  });

  const handleUseCurrentLocation = () => {
    if (!navigator?.geolocation) {
      setLocationBlocked(true);
      return;
    }
    setLocationBlocked(false);
    setDetecting(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setDetecting(false);
        const coords: Coordinates = {
          latitude: Number(pos.coords.latitude.toFixed(4)),
          longitude: Number(pos.coords.longitude.toFixed(4)),
        };
        onLocationFound?.(coords);
      },
      () => {
        setDetecting(false);
        setLocationBlocked(true);
      },
      { timeout: 10000, enableHighAccuracy: false },
    );
  };

  const weather = query.data;
  const { label: conditionLabel, icon: WeatherIcon } = weather
    ? interpretWeatherCode(weather.weatherCode)
    : { label: "Weather unavailable", icon: CloudOff };
  const updatedAt = observationTime(weather?.time);
  const today = new Intl.DateTimeFormat("en-PH", {
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(new Date());

  return (
    <section className="agri-weather-card" aria-labelledby="overview-weather-heading">
      <div className="agri-weather-top">
        <div>
          <span className="agri-weather-eyebrow">CURRENT WEATHER</span>
          <h2 id="overview-weather-heading" className="agri-weather-place">
            <MapPin size={16} aria-hidden="true" />
            {placeName?.trim() || "Location not set"}
          </h2>
          <span className="agri-weather-date">{today}</span>
        </div>
        <button
          type="button"
          className="agri-locate-btn"
          onClick={handleUseCurrentLocation}
          disabled={detecting}
        >
          <LocateFixed size={15} className={detecting ? "animate-spin" : ""} aria-hidden="true" />
          {detecting ? "Locating…" : "Use my location"}
        </button>
      </div>

      {locationBlocked && (
        <p className="agri-weather-alert">
          Location permission blocked. Pick your farm point on the map instead.
          {onOpenFarm && (
            <button type="button" onClick={onOpenFarm}>
              Open My Farm
            </button>
          )}
        </p>
      )}

      {query.isError ? (
        <div className="agri-weather-state" role="status">
          <CloudOff size={26} aria-hidden="true" />
          <div>
            <strong>Weather unavailable</strong>
            <span>Could not reach Open-Meteo for this field.</span>
          </div>
          <button
            type="button"
            className="agri-weather-retry"
            onClick={() => void query.refetch()}
            disabled={query.isFetching}
          >
            <RefreshCw size={14} aria-hidden="true" /> Try again
          </button>
        </div>
      ) : !weather ? (
        <div className="agri-weather-state agri-weather-skeleton" aria-busy="true">
          <span className="sr-only">Loading current weather…</span>
          <i />
          <i />
          <i />
        </div>
      ) : (
        <>
          <div className="agri-weather-body">
            <WeatherIcon
              size={40}
              className="agri-weather-icon"
              strokeWidth={1.7}
              aria-hidden="true"
            />
            <span className="agri-temp-display">
              <span className="agri-temp-val">{weather.temperature}</span>
              <span className="agri-temp-deg">°C</span>
            </span>
            <div className="agri-condition-block">
              <strong className="agri-condition-name">{conditionLabel}</strong>
              <span className="agri-condition-feels">
                Feels like {weather.apparentTemperature}°
              </span>
            </div>
          </div>
          <dl className="agri-weather-stats">
            <div>
              <dt>Humidity</dt>
              <dd>{weather.relativeHumidity}%</dd>
            </div>
            <div>
              <dt>Rain now</dt>
              <dd>{weather.precipitation} mm</dd>
            </div>
            <div>
              <dt>Wind</dt>
              <dd>{weather.windSpeed} km/h</dd>
            </div>
          </dl>
          <p className="agri-weather-foot">
            Open-Meteo{updatedAt ? ` · updated ${updatedAt}` : ""} · refreshes every 10 minutes
          </p>
        </>
      )}
    </section>
  );
}
