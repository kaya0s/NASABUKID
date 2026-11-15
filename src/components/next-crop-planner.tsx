import { useFarmSoil } from "@/hooks/use-farm-soil";
import {
  translateCropName,
  translateFieldOption,
  translateRotationText,
  useAppLocale,
} from "@/lib/i18n";
import { useEffect, useId, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  Bot,
  CalendarDays,
  ChevronDown,
  FlaskConical,
  Loader2,
  Pencil,
  RotateCcw,
  Sprout,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CROP_REQUIREMENTS, DRAINAGE_SOURCES } from "@/lib/crop-requirements";
import {
  CROP_PROFILES,
  localPlanningDate,
  nextCropInputKey,
  suggestNextCrops,
  validNextPlantingDate,
  type NextCropField,
  type NextCropResult,
} from "@/lib/fieldshift-demo";
import { coordinatesSchema, fetchRotationClimate, type ClimateMonth, type Coordinates } from "@/lib/nasa-power";

export type PlannerResult = {
  inputKey: string;
  result: NextCropResult;
  climateMonths: ClimateMonth[];
  sourceUrl?: string;
  retrievedAt?: string;
};
type Terrain = { elevation: number | null; slopePercent: number | null } | null;
export function NextCropPlanner({
  location,
  locationConfirmed = false,
  farm,
  onUpdate,
  terrain = null,
  onResult,
  onAskAdvisor,
  activeLotId = null,
  cachedResult = null,
  cachedPlannedDate = "",
  onPlannedDateChange,
}: {
  location: Coordinates;
  locationConfirmed?: boolean;
  farm: NextCropField;
  onUpdate: (key: keyof NextCropField, value: string) => void;
  terrain?: Terrain;
  onResult?: ((value: PlannerResult | null) => void) | undefined;
  onAskAdvisor?: (() => void) | undefined;
  activeLotId?: string | null;
  cachedResult?: PlannerResult | null;
  cachedPlannedDate?: string;
  onPlannedDateChange?: ((value: string) => void) | undefined;
}) {
  const { locale } = useAppLocale();
  const isCeb = locale === "ceb";
  const id = useId();
  const resultRef = useRef<HTMLDivElement>(null);
  const soil = useFarmSoil(location, locationConfirmed);
  const update = useRef(onUpdate);
  update.current = onUpdate;
  useEffect(() => {
    if (locationConfirmed && !farm.ph.trim() && soil.data?.ph != null)
      update.current("ph", String(soil.data.ph));
  }, [locationConfirmed, farm.ph, soil.data]);
  const queryClient = useQueryClient();
  const [date, setDate] = useState(cachedPlannedDate || "");
  const [submitted, setSubmitted] = useState(cachedResult?.inputKey || "");
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState("");
  const prevLotIdRef = useRef<string | null>(activeLotId);
  useEffect(() => {
    if (prevLotIdRef.current !== activeLotId) {
      prevLotIdRef.current = activeLotId;
      setDate(cachedPlannedDate || "");
      setSubmitted(cachedResult?.inputKey || "");
      setEditing(false);
      setError("");
    }
  }, [activeLotId, cachedPlannedDate, cachedResult]);
  const today = localPlanningDate();
  const endYear = new Date().getUTCFullYear() - 1;
  const plannedFarm = { ...farm, planted: date };
  const key = nextCropInputKey(location, plannedFarm, terrain);
  const hasMatchingCache =
    Boolean(cachedResult) && cachedResult?.inputKey === key && locationConfirmed;
  const active =
    submitted === key &&
    locationConfirmed &&
    validNextPlantingDate(date, today) &&
    !hasMatchingCache;
  const query = useQuery({
    queryKey: ["rotation-climate", location.latitude, location.longitude, endYear],
    enabled: active,
    staleTime: 86400000,
    gcTime: 86400000,
    retry: false,
    refetchOnWindowFocus: false,
    queryFn: ({ signal }) => fetchRotationClimate(location, endYear, signal),
  });
  useEffect(() => {
    const queryKey = ["rotation-climate", location.latitude, location.longitude, endYear];
    if (!active) void queryClient.cancelQueries({ queryKey, exact: true });
    return () => {
      void queryClient.cancelQueries({ queryKey, exact: true });
    };
  }, [active, location.latitude, location.longitude, endYear, queryClient]);
  const liveResult =
    active && query.data && !query.isFetching && !query.error
      ? suggestNextCrops(plannedFarm, query.data, terrain, today)
      : null;
  const effectiveResult =
    liveResult ?? (!editing && hasMatchingCache && cachedResult ? cachedResult.result : null);
  const showResult = Boolean(effectiveResult) && !editing;
  const showingResult = showResult;
  useEffect(() => {
    if (showingResult) resultRef.current?.focus();
  }, [showingResult]);
  const liveResultKey = liveResult ? JSON.stringify(liveResult) : "";
  const climateMonths = query.data?.months;
  useEffect(() => {
    if (liveResultKey && climateMonths) {
      onResult?.({
        inputKey: key,
        result: JSON.parse(liveResultKey) as NextCropResult,
        climateMonths,
        ...(query.data?.sourceUrl ? { sourceUrl: query.data.sourceUrl } : {}),
        ...(query.data?.retrievedAt ? { retrievedAt: query.data.retrievedAt } : {}),
      });
      return;
    }
    if (!hasMatchingCache) {
      onResult?.(null);
    }
  }, [liveResultKey, key, onResult, climateMonths, query.data?.sourceUrl, query.data?.retrievedAt, hasMatchingCache]);
  const displayMonths = query.data?.months ?? cachedResult?.climateMonths ?? [];
  const month = displayMonths[Number(date.slice(5, 7)) - 1];
  const displaySourceUrl =
    query.data?.sourceUrl ?? cachedResult?.sourceUrl ?? effectiveResult?.climateSourceUrl ?? "";
  const displayRetrievedAt = query.data?.retrievedAt ?? cachedResult?.retrievedAt ?? "";
  return (
    <section className="panel next-crop-planner">
      {!showResult && (
        <>
          <div className="next-crop-intro">
            <span className="eyebrow">
              <Sprout size={12} />
              {isCeb ? "PLANO SA SUNOD NGA TANOM" : "PLAN YOUR NEXT PLANTING"}
            </span>
            <h2>{isCeb ? "Unsa ang angay itanom sunod?" : "What should I plant next?"}</h2>
            <p>
              {isCeb
                ? "Kumpirmaha ang kaagi sa imong tanom ug petsa sa pagtanom. Gitandi namo ang nangaging panahon ug kondisyon sa yuta sa walo ka tanom."
                : "Confirm your crop history and planting date. We compare past weather patterns and field conditions across eight crops."}
            </p>
          </div>
          {!locationConfirmed && (
            <p className="next-crop-location-note" role="note">
              {isCeb
                ? "Itakda ug kumpirmaha una ang lokasyon sa imong uma. Ang sampol nga lokasyon dili magpamatuod sa kahimtang sa imong yuta."
                : "Set and confirm your farm location first. Sample coordinates cannot establish your field conditions."}
            </p>
          )}
          {locationConfirmed && (
            <div className="next-crop-soil-status" aria-live="polite">
              <div className="next-crop-soil-head">
                <p>
                  <FlaskConical size={13} className="next-crop-inline-icon" />
                  <strong>
                    {isCeb ? "pH sa Yuta" : "Soil pH"}:{" "}
                    {farm.ph || (isCeb ? "Wala mahibal-i" : "Unknown")}
                  </strong>
                  {soil.isFetching
                    ? isCeb
                      ? " · Gipangita sa SoilGrids…"
                      : " · Looking up SoilGrids…"
                    : soil.data?.ph != null
                      ? isCeb
                        ? ` · Banabana sa SoilGrids: ${soil.data.ph} (tubig, 5–15 cm)`
                        : ` · SoilGrids mapped estimate: ${soil.data.ph} (water, 5–15 cm)`
                      : isCeb
                        ? " · Walay mapa nga banabana nga magamit"
                        : " · No mapped estimate available"}
                </p>
                <Button
                  type="button"
                  variant="outline"
                  className="next-crop-refresh-btn"
                  disabled={soil.isFetching}
                  onClick={() => void soil.refetch()}
                >
                  <RotateCcw size={12} />
                  {isCeb ? "Bag-oha ang banabana" : "Refresh soil estimate"}
                </Button>
              </div>
              {soil.data?.ph != null && (
                <p className="next-crop-soil-sub">
                  {isCeb
                    ? "Awtomatikong gibutang kon wala mahibal-i. Usba sa kondisyon sa yuta kon adunay laboratory soil test. "
                    : "Automatically filled when unknown. Edit under soil and field conditions if you have a soil test. "}
                  {soil.data.phRange &&
                    (isCeb
                      ? `Gilatid nga sukdanan: ${soil.data.phRange.join("–")}. `
                      : `Mapped interval: ${soil.data.phRange.join("–")}. `)}
                  <a href={soil.data.sourceUrl} target="_blank" rel="noreferrer">
                    {isCeb ? "Tinubdan sa yuta ↗" : "Soil source ↗"}
                  </a>
                </p>
              )}
              {soil.error && (
                <p className="next-crop-soil-sub">
                  {isCeb
                    ? "Dili maabot ang SoilGrids karon. Biyai nga wala mahibal-i ang pH o isulod ang resulta sa soil test."
                    : "Soil lookup is unavailable. Keep pH unknown or enter your soil-test value."}
                </p>
              )}
            </div>
          )}
          <form
            className="next-crop-form"
            onSubmit={(event) => {
              event.preventDefault();
              if (!locationConfirmed || !coordinatesSchema.safeParse(location).success) {
                setError(
                  isCeb
                    ? "Kumpirmaha una ang hustong lokasyon sa uma."
                    : "Confirm a valid farm location first.",
                );
                return;
              }
              if (!validNextPlantingDate(date, today)) {
                setError(
                  isCeb
                    ? "Pagpili og hustong petsa sa pagtanom gikan karon padayon."
                    : "Choose a valid planting date from today onward.",
                );
                return;
              }
              if (
                farm.ph.trim() &&
                (!Number.isFinite(Number(farm.ph)) || Number(farm.ph) < 0 || Number(farm.ph) > 14)
              ) {
                setError(
                  isCeb
                    ? "Isulod ang pH gikan 0 hangtod 14, o biyai lang nga blangko."
                    : "Enter pH from 0 to 14, or leave it blank.",
                );
                return;
              }
              setError("");
              onUpdate("planted", date);
              setSubmitted(key);
              setEditing(false);
            }}
          >
            {(["crop", "previous"] as const).map((field) => (
              <div className="form-field" key={field}>
                <Label htmlFor={`${id}-${field}`}>
                  {field === "crop"
                    ? isCeb
                      ? "Karon nga tanom"
                      : "Current crop"
                    : isCeb
                      ? "Naunang tanom"
                      : "Previous crop"}
                </Label>
                <select
                  id={`${id}-${field}`}
                  className="form-select"
                  value={farm[field]}
                  onChange={(event) => onUpdate(field, event.target.value)}
                >
                  {[
                    ...CROP_REQUIREMENTS.map((rule) => rule.crop),
                    ...(field === "previous" ? ["Fallow", "Unknown"] : []),
                  ].map((crop) => (
                    <option key={crop} value={crop}>
                      {translateCropName(crop, locale)}
                    </option>
                  ))}
                </select>
              </div>
            ))}
            <div className="form-field">
              <Label htmlFor={`${id}-date`}>
                {isCeb ? "Kanus-a ka mananom sunod?" : "When will you plant next?"}
              </Label>
              <Input
                id={`${id}-date`}
                type="date"
                required
                min={today}
                value={date}
                onChange={(event) => {
                  setDate(event.target.value);
                  onPlannedDateChange?.(event.target.value);
                  setError("");
                }}
              />
            </div>
            <details className="next-crop-field-details">
              <summary>
                <span>{isCeb ? "Kondisyon sa yuta ug uma" : "Soil and field conditions"}</span>
                <ChevronDown size={14} className="next-crop-chevron" />
              </summary>
              <div className="next-crop-details-body">
                <p>
                  {isCeb
                    ? "Ang nakuha nga datos sa yuta ug bakilid mga banabana lamang. Usba kini kon adunay sukdanan gikan sa uma."
                    : "Imported soil and terrain are estimates. Correct them if you have field measurements; unknown values stay unknown."}
                </p>
                <div className="next-crop-form">
                  <div className="form-field">
                    <Label htmlFor={`${id}-ph`}>
                      {isCeb ? "pH sa yuta (awtomatik, mausab)" : "Soil pH (automatic, editable)"}
                    </Label>
                    <Input
                      id={`${id}-ph`}
                      type="number"
                      min="0"
                      max="14"
                      step="0.1"
                      value={farm.ph}
                      placeholder={isCeb ? "Wala mahibal-i" : "Unknown"}
                      onChange={(event) => onUpdate("ph", event.target.value)}
                    />
                  </div>
                  <div className="form-field">
                    <Label htmlFor={`${id}-soil`}>
                      {isCeb ? "Klase sa yuta (opsiyonal)" : "Soil texture (optional)"}
                    </Label>
                    <select
                      id={`${id}-soil`}
                      className="form-select"
                      value={farm.soil}
                      onChange={(event) => onUpdate("soil", event.target.value)}
                    >
                      <option value="">{isCeb ? "Wala mahibal-i" : "Unknown"}</option>
                      {farm.soil && !["Loam", "Sand", "Clay", "Organic"].includes(farm.soil) && (
                        <option value={farm.soil}>{farm.soil}</option>
                      )}
                      {["Loam", "Sand", "Clay", "Organic"].map((value) => (
                        <option key={value} value={value}>
                          {translateFieldOption(value, locale)}
                        </option>
                      ))}
                    </select>
                  </div>
                  {(["drainage", "irrigation"] as const).map((field) => (
                    <div className="form-field" key={field}>
                      <Label htmlFor={`${id}-${field}`}>
                        {field === "drainage"
                          ? isCeb
                            ? "Agianan sa tubig"
                            : "Drainage"
                          : isCeb
                            ? "Patubig"
                            : "Irrigation"}
                      </Label>
                      <select
                        id={`${id}-${field}`}
                        className="form-select"
                        value={farm[field]}
                        onChange={(event) => onUpdate(field, event.target.value)}
                      >
                        {(field === "drainage"
                          ? ["Unknown", "Good", "Moderate", "Poor"]
                          : [
                              "Unknown",
                              "Rain-fed",
                              "Gravity-fed",
                              "Pump-irrigated",
                              "Drip irrigation",
                            ]
                        ).map((value) => (
                          <option key={value} value={value}>
                            {translateFieldOption(value, locale)}
                          </option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
                <p className="next-crop-terrain-line">
                  {isCeb ? "Terrain" : "Terrain"}:{" "}
                  {terrain?.elevation != null
                    ? isCeb
                      ? `${Math.round(terrain.elevation)} m gihabogon`
                      : `${Math.round(terrain.elevation)} m elevation`
                    : isCeb
                      ? "wala mahibal-i ang gihabogon"
                      : "elevation unknown"}
                  ;{" "}
                  {terrain?.slopePercent != null
                    ? isCeb
                      ? `${terrain.slopePercent.toFixed(1)}% bakilid`
                      : `${terrain.slopePercent.toFixed(1)}% slope`
                    : isCeb
                      ? "wala mahibal-i ang bakilid"
                      : "slope unknown"}
                  .
                </p>
              </div>
            </details>
            {error && <p className="next-crop-form-error" role="alert">{error}</p>}
            <Button
              type="submit"
              className="next-crop-submit-btn"
              disabled={!locationConfirmed || (active && query.isFetching)}
            >
              {active && query.isFetching ? (
                <>
                  <Loader2 size={15} className="next-crop-spin" />
                  <span>
                    {isCeb ? "Ginasusi ang nangaging panahon…" : "Checking historical patterns…"}
                  </span>
                </>
              ) : (
                <>
                  <span>
                    {submitted
                      ? isCeb
                        ? "Bag-oha ang sugyot"
                        : "Update suggestion"
                      : isCeb
                        ? "Irekomendar ang sunod nga tanom"
                        : "Suggest my next crop"}
                  </span>
                  <ArrowRight size={15} />
                </>
              )}
            </Button>
          </form>
        </>
      )}
      <div aria-live="polite">
        {active && query.isFetching && (
          <p className="next-crop-loading-box">
            <Loader2 size={14} className="next-crop-spin" />
            <span>
              {isCeb
                ? `Gikarga ang datos sa NASA POWER alang sa ${endYear - 9}–${endYear}…`
                : `Loading NASA POWER history for ${endYear - 9}–${endYear}…`}
            </span>
          </p>
        )}
        {active && query.error && (
          <div className="next-crop-error-box" role="alert">
            <p>{query.error.message}</p>
            <Button variant="outline" onClick={() => void query.refetch()}>
              <RotateCcw size={13} />
              {isCeb ? "Sulayi pag-usab ang panahon" : "Retry weather history"}
            </Button>
          </div>
        )}
        {showResult && effectiveResult && (
          <div ref={resultRef} tabIndex={-1} className="next-crop-results">
            <div className="next-crop-results-bar">
              <Button
                type="button"
                variant="outline"
                className="next-crop-edit-btn"
                onClick={() => setEditing(true)}
              >
                <Pencil size={13} />
                {isCeb ? "Usba ang detalye sa pagtanom" : "Edit planting details"}
              </Button>
            </div>
            <p className="next-crop-disclaimer">
              {isCeb
                ? "Pagsusi base sa nangaging panahon · Demo nga datos, wala pa napamatud-i sa uma. Kumpirmaha ang barayti, patubig, ug kahimtang sa yuta."
                : "Historical-pattern screening · Not a forecast or verified agronomic recommendation. Confirm variety, water supply and field suitability locally."}
            </p>
            <p className="next-crop-month-summary">
              <CalendarDays size={14} className="next-crop-inline-icon" />
              <span>
                {isCeb ? "Giplano nga pagtanom" : "Planned planting"}: <strong>{date}</strong>.{" "}
                {month && month.validYears >= 8 && (
                  <>
                    {isCeb
                      ? `Kini nga bulan kasagaran adunay ${month.rainfallMm?.toFixed(0)} mm nga ulan ug ${month.temperatureC?.toFixed(1)} °C sulod sa ${month.validYears} ka tuig.`
                      : `This calendar month averaged ${month.rainfallMm?.toFixed(0)} mm rain and ${month.temperatureC?.toFixed(1)} °C across ${month.validYears} years.`}
                  </>
                )}
              </span>
            </p>
            <div
              className="next-crop-history-ref"
              data-testid="next-crop-history-ref"
              aria-label={isCeb ? "Karon ug naunang tanom" : "Current and previous crop reference"}
            >
              <div className="next-crop-history-item">
                <span className="next-crop-history-label">
                  {isCeb ? "Karon nga tanom" : "Current crop"}
                </span>
                <strong>
                  {translateCropName(farm.crop, locale) || (isCeb ? "Wala matakda" : "Not set")}
                </strong>
              </div>
              <div className="next-crop-history-item">
                <span className="next-crop-history-label">
                  {isCeb ? "Naunang tanom" : "Previous crop"}
                </span>
                <strong>
                  {translateCropName(farm.previous, locale) || (isCeb ? "Wala matakda" : "Not set")}
                </strong>
              </div>
            </div>
            {effectiveResult.suggestions.length ? (
              effectiveResult.suggestions.map((suggestion, index) => {
                const profile = CROP_PROFILES[suggestion.crop]!;
                return (
                  <article
                    className={`next-crop-option ${index === 0 ? "next-crop-primary" : ""}`}
                    key={suggestion.crop}
                  >
                    <div className="next-crop-option-top">
                      <span className="next-crop-rank">{index + 1}</span>
                      <span className="eyebrow">
                        {index === 0
                          ? isCeb
                            ? "PINAKAMAAYO NGA SUNOD NGA TANOM"
                            : "NEXT CROP TO CONSIDER"
                          : isCeb
                            ? "LAIN NGA KAPILIAN"
                            : "ALTERNATIVE"}
                      </span>
                    </div>
                    <div className="next-crop-option-heading">
                      <img src={profile.image} alt={suggestion.crop} width="72" height="72" />
                      <div>
                        <h3>
                          {isCeb ? profile.localName : suggestion.crop}{" "}
                          <span className="next-crop-local-name">
                            / {isCeb ? suggestion.crop : profile.localName}
                          </span>
                        </h3>
                      </div>
                    </div>
                    <ul className="next-crop-reasons">
                      {suggestion.reasons.map((reason) => (
                        <li key={reason}>{translateRotationText(reason, locale)}</li>
                      ))}
                    </ul>
                    {suggestion.conditions.length > 0 && (
                      <details className="next-crop-checks" open={index === 0}>
                        <summary>
                          <span>{isCeb ? "Susiha una magtanom" : "Check before planting"}</span>
                          <ChevronDown size={13} className="next-crop-chevron" />
                        </summary>
                        <ul>
                          {suggestion.conditions.map((condition) => (
                            <li key={condition}>{translateRotationText(condition, locale)}</li>
                          ))}
                        </ul>
                      </details>
                    )}
                    <div className="next-crop-option-foot">
                      <a href={suggestion.sourceUrl} target="_blank" rel="noreferrer">
                        {isCeb ? "Giya sa FAO alang sa tanom ↗" : "FAO crop requirements ↗"}
                      </a>
                    </div>
                  </article>
                );
              })
            ) : (
              <div className="next-crop-gaps-card">
                <h3>
                  {isCeb
                    ? "Nagkinahanglan pa og dugang impormasyon una makarekomendar"
                    : "We need more information before suggesting a crop"}
                </h3>
                <ul>
                  {effectiveResult.gaps.map((gap) => (
                    <li key={gap}>{translateRotationText(gap, locale)}</li>
                  ))}
                </ul>
              </div>
            )}
            <details className="next-crop-sources-details">
              <summary>
                <span>
                  {isCeb
                    ? "Tinubdan sa datos ug giunsa pagpili"
                    : "Data sources and how suggestions work"}
                </span>
                <ChevronDown size={14} className="next-crop-chevron" />
              </summary>
              <div className="next-crop-details-body">
                <p>
                  {isCeb
                    ? "Isalikway namo ang mga tanom nga dili angay sa limitasyon, dayon itandi ang mga kondisyon ug pagbag-o sa pamilya sa tanom. Sampol nga giya lamang kini ug dili opisyal nga beripikasyon."
                    : "We exclude known conflicts with published limits, then compare unresolved conditions, matches to optimal ranges, and crop-family changes. Ties keep catalog order. This ordering is illustrative screening, not a validated suitability model."}
                </p>
                <p>
                  {isCeb
                    ? "Ang tinuig nga ulan ug binulan nga temperatura itandi sa giya sa matag tanom sulod sa panahon sa pagtubo."
                    : "Annual rainfall is compared with annual requirements. Monthly mean temperatures are checked over the published maximum growing period, including months across year boundaries. Variety-specific establishment water needs, daily extremes, soil depth, fertility and pest history are not established by this comparison. Annual limits can exclude a crop that could grow locally in a managed seasonal window."}
                </p>
                <p>
                  {isCeb
                    ? "Mga tuig lamang nga adunay kompletong datos sa ulan ang apil sa kwentada. Walay giimbento nga datos."
                    : "Only years with complete rainfall contribute to the annual average. Each growing-period month needs at least eight years of usable rainfall and temperature. No weather is fabricated for missing records."}
                </p>
                {displaySourceUrl && (
                  <a href={displaySourceUrl} target="_blank" rel="noreferrer">
                    {isCeb
                      ? `Binulan nga rekord sa NASA POWER, ${effectiveResult.startYear}–${effectiveResult.endYear} ↗`
                      : `NASA POWER monthly records, ${effectiveResult.startYear}–${effectiveResult.endYear} ↗`}
                  </a>
                )}
                {displayRetrievedAt && (
                  <p>
                    {isCeb
                      ? `Nakuha niadtong ${new Date(displayRetrievedAt).toLocaleString()}.`
                      : `Retrieved ${new Date(displayRetrievedAt).toLocaleString()}. Monthly rainfall variation is the observed range across available years, not a forecast interval.`}
                  </p>
                )}
                <div className="next-crop-weather-table">
                  <table>
                    <caption>
                      {isCeb ? "Nangaging sumbanan matag bulan" : "Historical calendar-month patterns"}
                    </caption>
                    <thead>
                      <tr>
                        <th>{isCeb ? "Bulan" : "Month"}</th>
                        <th>{isCeb ? "Kasagarang ulan" : "Mean rain"}</th>
                        <th>{isCeb ? "Sukdanan sa ulan" : "Rain range"}</th>
                        <th>{isCeb ? "Kasagarang °C" : "Mean °C"}</th>
                        <th>{isCeb ? "Tuig" : "Years"}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {displayMonths.map((row) => (
                        <tr key={row.month}>
                          <th>
                            {new Date(Date.UTC(2000, row.month - 1, 1)).toLocaleString("en", {
                              month: "short",
                              timeZone: "UTC",
                            })}
                          </th>
                          <td>
                            {row.rainfallMm?.toFixed(0) ?? (isCeb ? "Wala mahibal-i" : "Unknown")} mm
                          </td>
                          <td>
                            {row.rainfallMinMm?.toFixed(0) ?? "?"}–
                            {row.rainfallMaxMm?.toFixed(0) ?? "?"} mm
                          </td>
                          <td>
                            {row.temperatureC?.toFixed(1) ?? (isCeb ? "Wala mahibal-i" : "Unknown")}
                          </td>
                          <td>{row.validYears}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {effectiveResult.excluded.length > 0 && (
                  <>
                    <h4>{isCeb ? "Mga tanom nga wala ilakip" : "Crops withheld"}</h4>
                    <ul>
                      {effectiveResult.excluded.map((crop) => (
                        <li key={crop.crop}>
                          <strong>{translateCropName(crop.crop, locale)}:</strong>{" "}
                          {crop.reasons.map((r) => translateRotationText(r, locale)).join(" ")}
                        </li>
                      ))}
                    </ul>
                  </>
                )}
                <p>
                  {isCeb ? "Tinubdan sa agianan sa tubig: " : "Drainage references: "}
                  {DRAINAGE_SOURCES.map((url, index) => (
                    <a key={url} href={url} target="_blank" rel="noreferrer">
                      {index ? " · " : ""}
                      {isCeb ? `Tinubdan ${index + 1}` : `Source ${index + 1}`}
                    </a>
                  ))}
                </p>
                <p>
                  {isCeb
                    ? "Ang SoilGrids ug terrain mga banabana lang. Ang giya sa tanom gikan sa FAO ECOCROP."
                    : "SoilGrids and mapped terrain are estimates. Crop rules were sourced from FAO ECOCROP; the comparison has not been locally validated."}
                </p>
              </div>
            </details>
            {onAskAdvisor && (
              <Button variant="outline" className="next-crop-advisor-btn" onClick={onAskAdvisor}>
                <Bot size={16} />
                {isCeb
                  ? "Pangutana sa AI advisor bahin niini"
                  : "Ask AI advisor about this result"}
              </Button>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
