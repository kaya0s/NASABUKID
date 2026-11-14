import { suggestDrainage } from "@/lib/fieldshift-demo";
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import type { Coordinates } from "@/lib/nasa-power";
import {
  fetchPublicContext,
  parsePlace,
  parseSoil,
  placeRequestUrl,
  soilRequestUrl,
  terrainRequestUrl,
  parseTerrain,
} from "@/lib/farm-context";

export type ContextFields = {
  place?: string;
  ph?: string;
  soil?: string;
  drainage?: "Poor" | "Good";
};
export function FarmPublicData({
  location,
  confirmed,
  onApply,
}: {
  location: Coordinates;
  confirmed: boolean;
  onApply: (fields: ContextFields) => void;
}) {
  const key = `${location.latitude},${location.longitude}`;
  const [ready, setReady] = useState("");
  const apply = useRef(onApply);
  apply.current = onApply;
  useEffect(() => {
    const timer = window.setTimeout(() => setReady(key), 1200);
    return () => window.clearTimeout(timer);
  }, [key]);
  const options = {
    enabled: confirmed && ready === key,
    staleTime: 7 * 86400000,
    gcTime: 7 * 86400000,
    retry: false as const,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  };
  const place = useQuery({
    ...options,
    queryKey: ["farm-place", key],
    queryFn: async ({ signal }) => {
      const result = await fetchPublicContext(placeRequestUrl(location), signal);
      return {
        ...parsePlace(result.payload),
        sourceUrl: result.sourceUrl,
        retrievedAt: result.retrievedAt,
      };
    },
  });
  const soil = useQuery({
    ...options,
    queryKey: ["farm-soil", key],
    queryFn: async ({ signal }) => {
      const result = await fetchPublicContext(soilRequestUrl(location), signal);
      return {
        ...parseSoil(result.payload),
        sourceUrl: result.sourceUrl,
        retrievedAt: result.retrievedAt,
      };
    },
  });
  const terrain = useQuery({
    ...options,
    queryKey: ["farm-terrain", key],
    queryFn: async ({ signal }) => {
      const result = await fetchPublicContext(terrainRequestUrl(location), signal);
      return {
        ...parseTerrain(result.payload),
        sourceUrl: result.sourceUrl,
        retrievedAt: result.retrievedAt,
      };
    },
  });
  const drainage = suggestDrainage(
    soil.data?.clay ?? null,
    soil.data?.sand ?? null,
    terrain.data?.slopePercent ?? null,
  );
  useEffect(() => {
    if (confirmed && ready === key && place.data) apply.current({ place: place.data.municipality });
  }, [confirmed, key, ready, place.data]);
  useEffect(() => {
    if (confirmed && ready === key && soil.data)
      apply.current({
        ...(soil.data.ph === null ? {} : { ph: String(soil.data.ph) }),
        ...(soil.data.texture ? { soil: soil.data.texture } : {}),
      });
  }, [confirmed, key, ready, soil.data]);
  return (
    <section className="public-data-panel" aria-label="Farm location and soil sources">
      <h3>Farm context</h3>
      {!confirmed && <p>Select a farm point or finish its boundary to look up public context.</p>}
      <div aria-live="polite">
        {confirmed && ready !== key && <p>Waiting for your location selection…</p>}
        {(place.isFetching || soil.isFetching || terrain.isFetching) && (
          <p>Loading public farm context…</p>
        )}
        {place.error && <p className="integration-error">City lookup: {place.error.message}</p>}
        {soil.error && (
          <p className="integration-error">
            Soil lookup: {soil.error.message} No sample estimates substituted.
          </p>
        )}
        {terrain.error && (
          <p className="integration-error">
            Terrain lookup: {terrain.error.message} Drainage remains field-confirmed.
          </p>
        )}
      </div>
      {confirmed && place.data && (
        <p>
          <strong>Detected municipality / city: {place.data.municipality}</strong> ·{" "}
          {place.data.region}
        </p>
      )}
      {confirmed && soil.data && (
        <p>
          <strong>Predicted soil pH (water): {soil.data.ph ?? "Unavailable"}</strong>
          <br />
          {soil.data.texture ?? "Texture coverage incomplete"} · ISRIC SoilGrids, 5–15 cm depth.
          Mapped estimates, not a soil test.
        </p>
      )}
      {confirmed && (
        <div className="drainage-suggestion">
          <p>
            <strong>Drainage screening · low confidence · demo rule</strong>
            <br />
            {drainage.reason}
          </p>
          {drainage.suggestion && (
            <>
              <p>
                Suggested field category to check: <strong>{drainage.suggestion}</strong>. Confirm
                after inspecting the field; ditches, compaction and groundwater are not measured.
              </p>
              <Button
                type="button"
                variant="outline"
                onClick={() => onApply({ drainage: drainage.suggestion! })}
              >
                I checked the field — use {drainage.suggestion.toLowerCase()} drainage
              </Button>
            </>
          )}
          <p>
            Terrain context: Open-Meteo / Copernicus DEM. Irrigation stays farmer-confirmed.
            Regional maps cannot establish your irrigation method, operational equipment or
            available water.
          </p>
        </div>
      )}
      <details className="api-sources">
        <summary>Sources &amp; API details</summary>
        <p>
          Empty location/soil fields fill automatically; manual corrections are preserved. Moving
          the farm clears previous location-derived values. Drainage changes only when you confirm a
          suggestion.
        </p>
        {place.data && (
          <p>
            <a href={place.data.sourceUrl} target="_blank" rel="noreferrer">
              Exact Photon / OpenStreetMap response ↗
            </a>{" "}
            · Retrieved {new Date(place.data.retrievedAt).toLocaleString()} · Nearest mapped
            address, not verified administrative boundaries.
          </p>
        )}
        {soil.data && (
          <p>
            <a href={soil.data.sourceUrl} target="_blank" rel="noreferrer">
              Exact SoilGrids JSON request ↗
            </a>{" "}
            · Retrieved {new Date(soil.data.retrievedAt).toLocaleString()} · 250 m grid, 5–15 cm
            depth, mean predictions at one farm reference point, not a boundary-wide average.{" "}
            {soil.data.phRange && `pH 5th–95th percentile: ${soil.data.phRange.join("–")}.`} Texture
            fractions are not a verified soil classification.
          </p>
        )}
        {terrain.data && (
          <p>
            <a href={terrain.data.sourceUrl} target="_blank" rel="noreferrer">
              Exact Open-Meteo elevation request ↗
            </a>{" "}
            · Retrieved {new Date(terrain.data.retrievedAt).toLocaleString()} · Elevation{" "}
            {terrain.data.elevation.toFixed(1)} m; approximate terrain gradient{" "}
            {terrain.data.slopePercent.toFixed(1)}%. Copernicus GLO-90 (90 m); centre and four
            surrounding samples at approximately 90 m spacing. This is not a measured field slope or
            drainage class.
          </p>
        )}
        <p>
          Demo screening rule: clay ≥40% and gradient &lt;2% flags potentially slow drainage; sand
          ≥65%, clay ≤15%, and gradient 2–15% flags potentially faster drainage. Otherwise no
          category is suggested. These thresholds are unvalidated demo assumptions, not SoilGrids or
          Copernicus classifications.
        </p>
        <p>
          <a href="https://github.com/komoot/photon" target="_blank" rel="noreferrer">
            Photon ↗
          </a>{" "}
          / ©{" "}
          <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">
            OpenStreetMap contributors ↗
          </a>{" "}
          ·{" "}
          <a
            href="https://docs.isric.org/globaldata/soilgrids/SoilGrids_faqs_01.html"
            target="_blank"
            rel="noreferrer"
          >
            ISRIC SoilGrids methodology, units and uncertainty ↗
          </a>{" "}
          ·{" "}
          <a
            href="https://docs.isric.org/globaldata/soilgrids/SoilGrids_faqs_02.html"
            target="_blank"
            rel="noreferrer"
          >
            SoilGrids access / CC BY 4.0 ↗
          </a>{" "}
          ·{" "}
          <a href="https://open-meteo.com/en/docs/elevation-api" target="_blank" rel="noreferrer">
            Open-Meteo / Copernicus DEM ↗
          </a>
        </p>
      </details>
      {confirmed && (
        <Button
          type="button"
          variant="outline"
          disabled={place.isFetching || soil.isFetching || terrain.isFetching || ready !== key}
          onClick={() => {
            void place.refetch();
            void soil.refetch();
            void terrain.refetch();
          }}
        >
          Retry public data lookups
        </Button>
      )}
    </section>
  );
}
