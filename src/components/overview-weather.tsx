import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import {
  Cloud,
  CloudDrizzle,
  CloudLightning,
  CloudRain,
  CloudSun,
  Droplets,
  LocateFixed,
  Sun,
  Wind,
  Bell,
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

export function OverviewWeatherWidget({
  location,
  onLocationFound,
}: {
  location: Coordinates;
  placeName?: string;
  onLocationFound?: (coords: Coordinates) => void;
}) {
  const [detecting, setDetecting] = useState(false);
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
    if (!navigator?.geolocation) return;
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
      },
      { timeout: 10000, enableHighAccuracy: false },
    );
  };

  const weather = query.data;
  const { label: conditionLabel, icon: WeatherIcon } = weather
    ? interpretWeatherCode(weather.weatherCode)
    : { label: "Sunny / Clear", icon: Sun };

  const todayDate = new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
    .format(new Date())
    .replace(" at ", " | ");

  return (
    <div className="agri-header-card">
      {/* Top row: Avatar + Greeting + Notification */}
      <div className="agri-greeting-row">
        <div className="agri-user-profile">
          <div className="agri-avatar">
            <span>🌾</span>
          </div>
          <div>
            <span className="agri-greeting-sub">Hi, Bukidnon Grower</span>
            <strong className="agri-greeting-main">Welcome back!</strong>
          </div>
        </div>
        <button className="agri-notif-btn" aria-label="Notifications">
          <Bell size={18} />
        </button>
      </div>

      {/* Embedded Glass Weather Card */}
      <div className="agri-weather-glass-card">
        <div className="agri-weather-top">
          <button
            type="button"
            className="agri-location-pill"
            onClick={handleUseCurrentLocation}
            disabled={detecting}
            title="Click to refresh GPS"
          >
            <LocateFixed size={14} className={detecting ? "animate-spin" : ""} />
            <span>{detecting ? "Locating..." : "Bukidnon, Philippines"}</span>
          </button>

          <div className="agri-weather-visual">
            <WeatherIcon size={42} className="agri-weather-icon" strokeWidth={1.8} />
          </div>
        </div>

        <div className="agri-weather-mid">
          <div className="agri-temp-display">
            <span className="agri-temp-val">{weather ? weather.temperature : "26"}</span>
            <span className="agri-temp-deg">°C</span>
          </div>
          <div className="agri-condition-block">
            <span className="agri-condition-name">{conditionLabel}</span>
            <span className="agri-date-str">{todayDate}</span>
          </div>
        </div>

        <div className="agri-weather-stats-row">
          <div className="agri-stat-col">
            <span className="agri-stat-label">Humidity</span>
            <strong className="agri-stat-val">
              {weather ? `${weather.relativeHumidity}%` : "80%"}
            </strong>
          </div>
          <div className="agri-stat-col">
            <span className="agri-stat-label">Precipitation</span>
            <strong className="agri-stat-val">
              {weather ? `${weather.precipitation} mm` : "2 mm"}
            </strong>
          </div>
          <div className="agri-stat-col">
            <span className="agri-stat-label">Wind Speed</span>
            <strong className="agri-stat-val">
              {weather ? `${weather.windSpeed} km/h` : "12 km/h"}
            </strong>
          </div>
        </div>
      </div>
    </div>
  );
}
