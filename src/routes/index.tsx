import { AdvisorChat, type AdvisorMessage } from "@/components/advisor-chat";
import { NextCropPlanner, type PlannerResult } from "@/components/next-crop-planner";
import { RECOVERY_STEPS, type AdvisorRequest, type AdvisorLanguage } from "@/lib/advisor";
import { ROTATION_RESEARCH } from "@/lib/crop-research";
import { ApiSources } from "@/components/api-sources";
import { FarmPublicData, type ContextFields } from "@/components/farm-public-data";
import { measureFarmBoundary } from "@/lib/farm-boundary";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  Activity,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  BadgeCheck,
  BarChart3,
  Bot,
  CalendarDays,
  Camera,
  Check,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  CloudDrizzle,
  CloudSun,
  Compass,
  Droplets,
  FileText,
  FlaskConical,
  Flower2,
  HeartHandshake,
  ImagePlus,
  Layers,
  Leaf,
  Map as MapIcon,
  MapPin,
  Menu,
  MessageCircle,
  LogOut,
  Plus,
  RotateCcw,
  Send,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Sprout,
  Sun,
  Thermometer,
  Upload,
  Waves,
  Wheat,
  Wind,
  X,
} from "lucide-react";
import bukidnonFields from "@/assets/bukidnon-fields.jpg";
import floodCorn from "@/assets/sample-flooded-corn.jpg";
import heroFarmland from "@/assets/hero-farmland.jpg";
import landingHighlandFields from "@/assets/landing-highland-fields.jpg";
import landingTerracedHills from "@/assets/landing-terraced-hills.jpg";
import landingCornSky from "@/assets/landing-corn-sky.jpg";
import landingCarabaoPlow from "@/assets/landing-carabao-plow.jpg";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FarmMap } from "@/components/farm-map";
import { FullFarmMap } from "@/components/full-farm-map";
import { HistoricalWeatherPanel } from "@/components/historical-weather";
import { OverviewWeatherWidget } from "@/components/overview-weather";
import {
  coordinatesSchema,
  fetchRecentNasaClimate,
  type Coordinates,
  type HistoricalWeather,
} from "@/lib/nasa-power";
import {
  nextCropInputKey,
  calculateEstimatedLoss,
  type ClimateScenario,
  SAMPLE_CORN_PRICE_PER_KG,
  SAMPLE_YIELD_KG_PER_HA,
} from "@/lib/fieldshift-demo";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "NASABUKID | Climate-Ready Crop Planning" },
      {
        name: "description",
        content:
          "Explore a clearly labeled demo for Bukidnon crop rotation planning and crop damage recovery.",
      },
      {
        property: "og:title",
        content: "NASABUKID | Climate-Ready Crop Planning",
      },
      {
        property: "og:description",
        content:
          "A demo dashboard for climate-ready crop rotations and farm recovery in Bukidnon, Philippines.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: FieldShift,
});

type Page =
  | "landing"
  | "overview"
  | "farm"
  | "fullmap"
  | "prevention"
  | "recovery"
  | "evidence";
type Hazard = "Flooding" | "Drought" | "Typhoon" | "Heat";
type Farm = {
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
const NAV: Array<{
  id: Page;
  label: string;
  icon: typeof Leaf;
  section: string;
  isCenter?: boolean;
}> = [
    { id: "overview", label: "Overview", icon: Compass, section: "WORKSPACE" },
    { id: "fullmap", label: "Full Map", icon: MapIcon, section: "WORKSPACE" },
    {
      id: "evidence",
      label: "Evidence & sources",
      icon: FileText,
      section: "INSIGHTS",
    },
  ];
const SCENARIOS: ClimateScenario[] = ["Typical", "El Niño-like", "Wet"];
const CROP_OPTIONS = [
  "Pineapple",
  "Banana",
  "Sugar Cane",
  "Corn",
  "Rice",
  "Mungbean",
  "Sweet potato",
  "Cassava",
] as const;
const PREVIOUS_CROP_OPTIONS = [...CROP_OPTIONS, "Fallow"] as const;
const SEED_FARM: Farm = {
  place: "Location not identified",
  area: "4.2",
  crop: "Corn",
  previous: "Mungbean",
  ph: "",
  soil: "",
  irrigation: "Unknown",
  drainage: "Unknown",
  planted: "2026-06-15",
};

/**
 * Display toggles for footer and metadata sections.
 * Change to false to hide, or true to show.
 */
const SHOW_API_SOURCES = false;
const SHOW_FOOTER_NASA_INFO = false;
const HAZARD_RATES: Record<
  Hazard,
  {
    affected: number;
    yieldLoss: number;
    observation: string;
    icon: typeof Waves;
  }
> = {
  Flooding: {
    affected: 65,
    yieldLoss: 35,
    observation:
      "Standing water observed between rows; sample leaf yellowing and stem lodging visible.",
    icon: Waves,
  },
  Drought: {
    affected: 50,
    yieldLoss: 28,
    observation:
      "Sample observation: leaf curling and dry surface soil are consistent with water stress.",
    icon: Sun,
  },
  Typhoon: {
    affected: 75,
    yieldLoss: 42,
    observation:
      "Sample observation: wind lodging and damaged leaf tissue may reduce harvestable yield.",
    icon: Wind,
  },
  Heat: {
    affected: 45,
    yieldLoss: 25,
    observation:
      "Sample observation: leaf-edge scorch and midday wilting may indicate heat stress.",
    icon: Thermometer,
  },
};
const PHP = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
  maximumFractionDigits: 0,
});

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mql = window.matchMedia("(max-width: 780px)");
    const onChange = () => setIsMobile(mql.matches);
    setIsMobile(mql.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);
  return isMobile;
}

function FieldShift() {
  const isMobile = useIsMobile();
  const [plannerResult, setPlannerResult] = useState<PlannerResult | null>(null);
  const [advisorWorkflow, setAdvisorWorkflow] = useState<"recovery" | "prevention">("prevention");
  const [mapAdvisoryMode, setMapAdvisoryMode] = useState<"rotation" | "recovery">("rotation");
  const [recoveryCardStep, setRecoveryCardStep] = useState<1 | 2>(1);
  const [profileEdited, setProfileEdited] = useState(false);
  const [assumptionsEdited, setAssumptionsEdited] = useState(false);
  const [actualPlantingDate, setActualPlantingDate] = useState("");
  const [growthStage, setGrowthStage] = useState("");
  const [durationHours, setDurationHours] = useState("");
  const [observations, setObservations] = useState("");
  const [page, setPage] = useState<Page>("landing");
  const [farm, setFarm] = useState<Farm>(SEED_FARM);
  const [stored, setStored] = useState(false);
  const [location, setLocation] = useState<Coordinates>({
    latitude: 8.3,
    longitude: 125.0,
  });
  const [locationConfirmed, setLocationConfirmed] = useState(false);
  const [boundary, setBoundary] = useState<Coordinates[]>([]);
  const [eventWeather, setEventWeather] = useState<HistoricalWeather | null>(null);
  const [historical, setHistorical] = useState<HistoricalWeather | null>(null);
  const [climateLoading, setClimateLoading] = useState(false);
  const [terrain, setTerrain] = useState<{ elevation: number; slopePercent: number } | null>(null);
  const [price, setPrice] = useState(String(SAMPLE_CORN_PRICE_PER_KG));
  const [expectedYield, setExpectedYield] = useState(String(SAMPLE_YIELD_KG_PER_HA));
  const [scenario, setScenario] = useState<ClimateScenario>("Typical");
  const [hazard, setHazard] = useState<Hazard>("Flooding");
  const [damageDate, setDamageDate] = useState("2026-10-29");
  const [affected, setAffected] = useState(65);
  const [yieldLoss, setYieldLoss] = useState(35);
  const [photo, setPhoto] = useState<{
    src: string;
    name: string;
    sample: boolean;
  }>({
    src: floodCorn,
    name: "Sample · waterlogged corn",
    sample: true,
  });
  const [advisorLanguage, setAdvisorLanguage] = useState<AdvisorLanguage>("auto");
  const [advisorOpen, setAdvisorOpen] = useState(false);
  const explainedPlanKey = useRef<string | null>(null);
  const [chatInput, setChatInput] = useState("");
  const [chatMessages, setChatMessages] = useState<AdvisorMessage[]>([]);
  const [chatBusy, setChatBusy] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const uploadRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem("fieldshift-demo-farm");
      if (saved) {
        const parsed: unknown = JSON.parse(saved);
        if (parsed && typeof parsed === "object") {
          const fields = Object.fromEntries(
            Object.entries(parsed).filter(
              ([key, value]) => key in SEED_FARM && typeof value === "string",
            ),
          );
          setFarm({ ...SEED_FARM, ...fields });
        }
      }
      const savedLocation = window.localStorage.getItem("fieldshift-location");
      if (savedLocation) {
        const parsed = coordinatesSchema.safeParse(JSON.parse(savedLocation));
        if (parsed.success) setLocation(parsed.data);
      }
      setLocationConfirmed(window.localStorage.getItem("fieldshift-location-confirmed") === "true");
      const savedBoundary = window.localStorage.getItem("fieldshift-boundary");
      if (savedBoundary) {
        const points: unknown = JSON.parse(savedBoundary);
        if (Array.isArray(points) && points.length) {
          const measured = measureFarmBoundary(points);
          setBoundary(measured.points);
          setLocationConfirmed(true);
          setFarm((current) => ({
            ...current,
            area: measured.hectares.toFixed(4),
          }));
          setLocation(measured.reference);
        }
      }
    } catch {
      /* Keep the demo profile when browser storage is unavailable. */
    }
    setStored(true);
  }, []);

  useEffect(() => {
    if (!stored) return;
    try {
      window.localStorage.setItem("fieldshift-demo-farm", JSON.stringify(farm));
      window.localStorage.setItem("fieldshift-location", JSON.stringify(location));
      window.localStorage.setItem("fieldshift-boundary", JSON.stringify(boundary));
      window.localStorage.setItem("fieldshift-location-confirmed", String(locationConfirmed));
    } catch {
      /* Continue without persistence when browser storage is unavailable. */
    }
  }, [farm, location, boundary, locationConfirmed, stored]);

  function updateLocation(next: Coordinates) {
    setLocation(next);
    setBoundary([]);
    setHistorical(null);
    setEventWeather(null);
    setLocationConfirmed(true);
    setFarm((current) => ({
      ...current,
      place: "Location not identified",
      ph: "",
      soil: "",
      irrigation: "Unknown",
      drainage: "Unknown",
    }));
  }
  function updateBoundary(points: Coordinates[]) {
    setBoundary(points);
    if (points.length) {
      const measured = measureFarmBoundary(points);
      setFarm((current) => ({
        ...current,
        area: measured.hectares.toFixed(4),
      }));
      setLocation(measured.reference);
      setLocationConfirmed(true);
      setFarm((current) => ({
        ...current,
        place: "Location not identified",
        ph: "",
        soil: "",
        irrigation: "Unknown",
        drainage: "Unknown",
      }));
      setHistorical(null);
      setEventWeather(null);
    }
  }
  const currentPlannerResult = locationConfirmed && plannerResult?.inputKey === nextCropInputKey(location, farm, terrain) ? plannerResult.result : null;
  const validLossInputs =
    [farm.area, expectedYield, price].every(
      (value) => value.trim() !== "" && Number.isFinite(Number(value)) && Number(value) >= 0,
    ) && Number(farm.area) * Number(expectedYield) * Number(price) <= Number.MAX_SAFE_INTEGER;
  const area = validLossInputs ? Number(farm.area) : 0;
  const loss = calculateEstimatedLoss({
    areaHectares: area,
    affectedFraction: affected / 100,
    expectedYieldKgPerHectare: validLossInputs ? Number(expectedYield) : 0,
    yieldLossFraction: yieldLoss / 100,
    pricePerKg: validLossInputs ? Number(price) : 0,
  });

  const lossLabel = validLossInputs
    ? PHP.format(loss)
    : "unavailable until valid assumptions are entered";

  const HIDDEN_PAGES: ReadonlySet<Page> = new Set([
    "overview",
    "farm",
    "recovery",
    "evidence",
  ]);

  function goTo(next: Page) {
    if (next === "landing") setAdvisorOpen(false);
    const resolved: Page = HIDDEN_PAGES.has(next) ? "fullmap" : next;
    if (resolved === "recovery" || resolved === "prevention") setAdvisorWorkflow(resolved);
    setPage(resolved);
    setMobileNavOpen(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function applyContext(fields: ContextFields) {
    if (fields.elevation !== undefined && fields.slopePercent !== undefined) {
      setTerrain({ elevation: fields.elevation, slopePercent: fields.slopePercent });
    }
    setFarm((current) => ({
      ...current,
      ...((!current.place || current.place === "Location not identified") && fields.place
        ? { place: fields.place }
        : {}),
      ...(!current.ph && fields.ph !== undefined ? { ph: fields.ph } : {}),
      ...(!current.soil && fields.soil ? { soil: fields.soil } : {}),
      ...(fields.drainage ? { drainage: fields.drainage } : {}),
    }));
  }

  useEffect(() => {
    if (page !== "fullmap" || !locationConfirmed) return;
    if (
      historical &&
      Math.abs(historical.latitude - location.latitude) < 0.001 &&
      Math.abs(historical.longitude - location.longitude) < 0.001
    ) {
      return;
    }
    const controller = new AbortController();
    setClimateLoading(true);
    fetchRecentNasaClimate(location, controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) {
          setHistorical(data);
          setClimateLoading(false);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setClimateLoading(false);
        }
      });
    return () => controller.abort();
  }, [page, locationConfirmed, location.latitude, location.longitude]);

  function updateFarm(key: keyof Farm, value: string) {
    setProfileEdited(true);
    setFarm((current) => ({ ...current, [key]: value }));
  }

  function pickPhoto(file?: File) {
    if (!file || !file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string")
        setPhoto({ src: reader.result, name: file.name, sample: false });
    };
    reader.readAsDataURL(file);
  }

  function changeHazard(next: Hazard) {
    setHazard(next);
  }

  async function sendQuestion(question = chatInput, workflow = advisorWorkflow, language = advisorLanguage) {
    const text = question.trim();
    if (!text || chatBusy) return;
    const previousMessages = chatMessages.filter((message) => !message.error);
    if (chatMessages.at(-1)?.error && previousMessages.at(-1)?.role === "user" && previousMessages.at(-1)?.text === text) previousMessages.pop();
    setChatBusy(true);
    setChatMessages([...previousMessages, { role: "user", text }]);
    setChatInput("");
    try {
      const numberOrNull = (value: string) =>
        value.trim() && Number.isFinite(Number(value)) && Number(value) >= 0 ? Number(value) : null;
      const weather = workflow === "recovery" ? eventWeather : null;
      const currentPlan = currentPlannerResult && plannerResult
        ? { ...currentPlannerResult, climateMonths: plannerResult.climateMonths }
        : null;
      const payload: AdvisorRequest = {
        language,
        question: text,
        history: previousMessages
          .slice(-10)
          .map((message) => ({ role: message.role, content: message.text })),
        context: {
          workflow,
          farm,
          locationConfirmed,
          profileSource: profileEdited ? "edited-unverified" : "sample-or-saved-unverified",
          scenario,
          rotation: currentPlan?.suggestions[0]?.crop ?? "No current next-crop suggestion",
          nextCropPlan: currentPlan,
          recovery: workflow === "recovery" ? {
            hazard,
            damageDate,
            actualPlantingDate,
            growthStage,
            durationHours: numberOrNull(durationHours),
            observations,
            affectedFraction: affected / 100,
            yieldLossFraction: yieldLoss / 100,
            areaHectares: numberOrNull(farm.area),
            expectedYieldKgPerHectare: numberOrNull(expectedYield),
            pricePerKg: numberOrNull(price),
            assumptionsSource: assumptionsEdited ? "edited-unverified" : "sample",
            photo: photo.sample ? "sample-not-analyzed" : "uploaded-not-analyzed",
          } : undefined,
          weather: weather
            ? {
              start: weather.start,
              end: weather.end,
              sourceUrl: weather.sourceUrl,
              rainfallMm: weather.days.some((day) => day.rainfall === null)
                ? null
                : weather.days.reduce((sum, day) => sum + (day.rainfall ?? 0), 0),
              missingDays: weather.days.filter(
                (day) => day.rainfall === null || day.temperature === null,
              ).length,
              purpose:
                workflow === "recovery"
                  ? "historical-event-context-not-damage-proof"
                  : "historical-planning-context-not-event-evidence",
            }
            : null,
          terrain: terrain
            ? {
              elevation: terrain.elevation,
              slopePercent: terrain.slopePercent,
            }
            : undefined,

        },
      };
      const response = await fetch("/api/advisor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(65_000),
        body: JSON.stringify(payload),
      });
      if (!response.ok) throw new Error(await response.text());
      const { answer } = (await response.json()) as { answer: string };
      if (typeof answer !== "string" || !answer.trim())
        throw new Error("The advisor returned no answer.");
      setChatMessages((messages) => [...messages, { role: "assistant", text: answer }]);
    } catch (error) {
      setChatMessages((messages) => [
        ...messages,
        {
          role: "assistant",
          error: true,
          text:
            error instanceof Error && error.name === "TimeoutError"
              ? "The advisor took too long. Please try again."
              : error instanceof Error
                ? error.message
                : "The advisor is unavailable right now.",
        },
      ]);
    } finally {
      setChatBusy(false);
    }
  }

  function changeAdvisorLanguage(language: AdvisorLanguage) {
    setAdvisorLanguage(language);
    if (language === "bisaya" && !chatBusy && chatMessages.some((message) => message.role === "assistant" && !message.error)) {
      void sendQuestion("Ipasabot pag-usab sa Bisaya (Cebuano) ang imong katapusang tubag. Mubo ug yano lang.", advisorWorkflow, language);
    }
  }

  function askAboutResult() {
    setAdvisorWorkflow("prevention");
    setAdvisorOpen(true);
    const key = plannerResult?.inputKey;
    if (currentPlannerResult && key && (explainedPlanKey.current !== key || chatMessages.at(-1)?.error) && !chatBusy) {
      explainedPlanKey.current = key;
      void sendQuestion("Explain this next-crop result briefly: why this crop for my planting date, the relevant weather or soil evidence, and the most important check before planting.", "prevention");
    }
  }

  const pageTitle: Record<Page, string> = {
    landing: "Welcome to NASABUKID",
    overview: "Overview",
    farm: "My farm",
    fullmap: "Full Map (New)",
    prevention: "Crop planning",
    recovery: "Damage recovery",
    evidence: "Evidence & scoring",
  };

  const sharedRecoveryProps = {
    onWeather: setEventWeather,
    farm,
    hazard,
    setHazard: changeHazard,
    damageDate,
    setDamageDate: (value: string) => {
      setDamageDate(value);
      setEventWeather(null);
    },
    affected,
    setAffected: (value: number) => {
      setAssumptionsEdited(true);
      setAffected(value);
    },
    yieldLoss,
    setYieldLoss: (value: number) => {
      setAssumptionsEdited(true);
      setYieldLoss(value);
    },
    price,
    setPrice: (value: string) => {
      setAssumptionsEdited(true);
      setPrice(value);
    },
    expectedYield,
    setExpectedYield: (value: string) => {
      setAssumptionsEdited(true);
      setExpectedYield(value);
    },
    validLossInputs,
    onUpdateFarm: updateFarm,
    location,
    photo,
    pickPhoto,
    uploadRef,
    loss,
    onPlan: () => {
      if (page === "fullmap") {
        setMapAdvisoryMode("rotation");
        setAdvisorWorkflow("prevention");
      } else {
        goTo("prevention");
      }
    },
    onChat: () => setAdvisorOpen(true),
  };

  const recoveryContent = (
    <>
      <section className="panel">
        <h2>Current crop and event details</h2>
        <p>
          Optional farmer observations, not verified measurements. Blank fields stay
          unknown. Loss assumptions:{" "}
          {assumptionsEdited
            ? "edited, unverified; unchanged values may still be samples"
            : "sample defaults"}
          .
        </p>
        <div className="form-grid">
          <div className="form-field">
            <Label htmlFor="actual-planting">Actual planting date of damaged crop</Label>
            <Input
              id="actual-planting"
              type="date"
              max={damageDate}
              value={actualPlantingDate}
              onChange={(e) => setActualPlantingDate(e.target.value)}
            />
          </div>
          <div className="form-field">
            <Label htmlFor="growth-stage">Observed growth stage</Label>
            <Input
              id="growth-stage"
              maxLength={300}
              placeholder="Unknown"
              value={growthStage}
              onChange={(e) => setGrowthStage(e.target.value)}
            />
          </div>
          <div className="form-field">
            <Label htmlFor="event-duration">Event duration (hours)</Label>
            <Input
              id="event-duration"
              type="number"
              min="0"
              max="1000000000"
              value={durationHours}
              onChange={(e) => setDurationHours(e.target.value)}
            />
          </div>
          <div className="form-field">
            <Label htmlFor="event-observations">What did you observe?</Label>
            <Textarea
              id="event-observations"
              maxLength={1200}
              value={observations}
              onChange={(e) => setObservations(e.target.value)}
            />
          </div>
        </div>
      </section>
      <RecoveryPage {...sharedRecoveryProps} />
    </>
  );

  const cardRecoveryContent = (
    <RecoveryPage
      {...sharedRecoveryProps}
      embedStep={recoveryCardStep}
      onContinueStep={() => setRecoveryCardStep(2)}
      onBackStep={() => setRecoveryCardStep(1)}
    />
  );

  const advisorContent = (
<AdvisorChat
        open={advisorOpen}
        onOpenChange={setAdvisorOpen}
        messages={chatMessages}
        busy={chatBusy}
        input={chatInput}
        onInputChange={setChatInput}
        onSend={sendQuestion}
        language={advisorLanguage}
        onLanguageChange={changeAdvisorLanguage}
        workflow={advisorWorkflow}
        context={advisorWorkflow === "recovery"
          ? `${farm.crop} · ${hazard} · ${lossLabel} estimated revenue at risk`
          : currentPlannerResult?.suggestions[0]
            ? `${currentPlannerResult.suggestions[0].crop} · Planned planting ${currentPlannerResult.planted}`
            : "Your current field · No next-crop suggestion applied yet"}
      />
  );

  if (page === "landing") {
    return (
      <LandingPage
        onSelectMode={(mode) => {
          setMapAdvisoryMode(mode);
          setAdvisorWorkflow(mode === "recovery" ? "recovery" : "prevention");
          if (mode === "recovery") setRecoveryCardStep(1);
          goTo("fullmap");
        }}
      />
    );
  }

  return (
    <div className="app-shell app-shell-no-sidebar">
      <main className="main-area">
        {page === "fullmap" ? (
          <FullFarmMap
            location={location}
            boundary={boundary}
            onBoundary={updateBoundary}
            onChange={updateLocation}
            areaLabel={farm.area}
            farm={farm}
            onUpdateFarm={updateFarm}
            locationConfirmed={locationConfirmed}
            onPlannerResult={setPlannerResult}
            advisorOpen={advisorOpen}
            advisorContent={advisorContent}
            onAskAdvisor={askAboutResult}
            onBrandClick={() => goTo("landing")}
            advisoryMode={mapAdvisoryMode}
            onAdvisoryModeChange={(mode) => {
              setMapAdvisoryMode(mode);
              setAdvisorWorkflow(mode === "recovery" ? "recovery" : "prevention");
            }}
            hazard={hazard}
            onHazardChange={changeHazard}
            affected={affected}
            onAffectedChange={(value) => {
              setAssumptionsEdited(true);
              setAffected(value);
            }}
            yieldLoss={yieldLoss}
            onYieldLossChange={(value) => {
              setAssumptionsEdited(true);
              setYieldLoss(value);
            }}
            price={price}
            onPriceChange={(value) => {
              setAssumptionsEdited(true);
              setPrice(value);
            }}
            expectedYield={expectedYield}
            onExpectedYieldChange={(value) => {
              setAssumptionsEdited(true);
              setExpectedYield(value);
            }}
            damageDate={damageDate}
            onDamageDateChange={(value) => {
              setDamageDate(value);
              setEventWeather(null);
            }}
            legacyRecoveryContent={recoveryContent}
            cardRecoveryContent={cardRecoveryContent}
            onOpenRecovery={() => setRecoveryCardStep(1)}
            historical={historical}
            climateLoading={climateLoading}
            terrain={terrain}
            cropOptions={CROP_OPTIONS}
            previousCropOptions={PREVIOUS_CROP_OPTIONS}
          />
        ) : (
          <div className="page-wrap">
            <div className="glass-brand-row">
              <button
                type="button"
                className="glass-brand-pill"
                onClick={() => goTo(page === "overview" ? "landing" : "overview")}
                title={page === "overview" ? "Return to Landing Page" : "Return to Overview"}
              >
                <span className="glass-brand-mark">
                  <Sprout size={18} strokeWidth={2} />
                </span>
                <span className="brand-name">
                  <span className="brand-nasa">NASA</span>
                  <span className="brand-bukid">BUKID</span>
                </span>
              </button>
            </div>
            {page !== "overview" && (
              <div className="page-intro">
                <div>
                  <span className="eyebrow">
                    <MapPin size={13} className="eyebrow-icon" /> {farm.place || "Location not set"}
                  </span>
                  <h1>{pageTitle[page]}</h1>
                  <p className="intro-copy">
                    {page === "farm"
                      ? "Set your location, boundary, and field details for customized recommendations."
                      : page === "prevention"
                        ? "Compare climate-ready crop rotation plans for your field."
                        : page === "recovery"
                          ? "Estimate potential crop loss and planning next steps."
                          : page === "evidence"
                            ? "Methodology and data sources behind rotation scores."
                            : ""}
                  </p>
                </div>
                <Button variant="outline" className="intro-home" onClick={() => goTo("overview")}>
                  <ArrowLeft size={16} /> Overview
                </Button>
              </div>
            )}

            {page === "overview" && (
              <OverviewPage
                farm={farm}
                boundary={boundary}
                location={location}
                scenario={scenario}
                rotationName={plannerResult?.inputKey === nextCropInputKey(location, farm, terrain) ? plannerResult.result.suggestions[0]?.crop ?? "No crop cleared screening" : "Plan your next crop"}
                hazard={hazard}
                onLocationFound={(coords) => {
                  updateLocation(coords);
                }}
                onPlan={() => goTo("farm")}
                onFullMap={() => goTo("fullmap")}
                onRecover={() => goTo("recovery")}
                onPrevention={() => goTo("prevention")}
                onChat={() => setAdvisorOpen(true)}
              />
            )}
            {page === "farm" && (
              <FarmPage
                farm={farm}
                location={location}
                boundary={boundary}
                onBoundary={updateBoundary}
                onLocation={updateLocation}
                onUpdate={updateFarm}
                onContinue={() => goTo("prevention")}
              />
            )}
            {page === "prevention" && <><div hidden={advisorOpen}><NextCropPlanner location={location} locationConfirmed={locationConfirmed} farm={farm} onUpdate={updateFarm} terrain={terrain} onResult={setPlannerResult} onAskAdvisor={askAboutResult} /></div>{advisorContent}</>}
            {page === "recovery" && recoveryContent}
            {page === "evidence" && <section className="panel"><h2>Next-crop sources</h2><p>Open your next-crop result for the exact NASA history, crop requirements, conditions and crops withheld. Suggestions compare historical patterns and global reference ranges; they are not forecasts or validated local prescriptions.</p><Button onClick={() => goTo("prevention")}>Open crop planner</Button></section>}


            {SHOW_API_SOURCES && <ApiSources />}
            <footer className="page-footer">
              <span>
                <Sprout size={14} /> Made for the seasons ahead.
              </span>
              {SHOW_FOOTER_NASA_INFO && (
                <span>
                  NASABUKID <span className="footer-divider">·</span> NASA Space Apps demo{" "}
                  <span className="footer-divider">·</span> Historical NASA access · Crop screening ·
                  Gemini advisor
                </span>
              )}
            </footer>
          </div>
        )}
        <div hidden={page !== "farm"}><FarmPublicData location={location} confirmed={locationConfirmed} onApply={applyContext} /></div>

        {false && (
          <nav
            className="bottom-nav-dock"
            aria-label="Mobile navigation"
            aria-hidden={!isMobile ? "true" : undefined}
          >
            {NAV.filter((item) => item.id !== "evidence").map((item) => {
              const Icon = item.icon;
              const isActive = page === item.id;
              if (item.isCenter) {
                return (
                  <button
                    key={item.id}
                    className={`bottom-nav-item bottom-nav-center ${isActive ? "bottom-nav-center-active" : ""}`}
                    aria-label={item.label}
                    onClick={() => goTo(item.id)}
                  >
                    <span className="center-icon-wrap">
                      <Icon size={22} strokeWidth={2.4} />
                    </span>
                    <span className="bottom-nav-label">{item.label}</span>
                  </button>
                );
              }
              return (
                <button
                  key={item.id}
                  className={`bottom-nav-item ${isActive ? "bottom-nav-active" : ""}`}
                  aria-label={item.label}
                  onClick={() => goTo(item.id)}
                >
                  <span className="bottom-nav-icon">
                    <Icon size={20} strokeWidth={isActive ? 2.2 : 1.8} />
                    {item.id === "recovery" && <span className="nav-live-dot" />}
                  </span>
                  <span className="bottom-nav-label">{item.label}</span>
                </button>
              );
            })}
          </nav>
        )}
      </main>



    </div>
  );
}

const LANDING_BACKDROPS = [
  { src: landingHighlandFields, alt: "Highland farmland beneath mountain clouds" },
  { src: landingTerracedHills, alt: "Green terraced agricultural hills" },
  { src: landingCornSky, alt: "Cornfield tassels under bright blue sky" },
  { src: landingCarabaoPlow, alt: "Farmer plowing soil with a carabao" },
] as const;

function LandingPage({
  onSelectMode,
}: {
  onSelectMode: (mode: "rotation" | "recovery") => void;
}) {
  const [activeSlide, setActiveSlide] = useState(0);

  useEffect(() => {
    if (
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    ) {
      return;
    }
    const timer = window.setInterval(() => {
      setActiveSlide((prev) => (prev + 1) % LANDING_BACKDROPS.length);
    }, 6500);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <div className="landing-root">
      <div className="landing-backdrop-stage" aria-hidden="true">
        {LANDING_BACKDROPS.map((slide, index) => (
          <img
            key={slide.src}
            src={slide.src}
            alt=""
            loading={index === 0 ? "eager" : "lazy"}
            decoding="async"
            className={`landing-backdrop-slide ${index === activeSlide ? "is-active" : ""}`}
          />
        ))}
        <div className="landing-cloud-veil" />
        <div className="landing-backdrop-scrim" />
      </div>
      <div className="landing-ambient-glow" aria-hidden="true" />
      <div className="landing-ambient-grid" aria-hidden="true" />

      <main className="landing-center-stage">
        <div className="landing-brand-lockup">
          <div className="landing-emblem" aria-hidden="true">
            <svg viewBox="0 0 84 84" fill="none" xmlns="http://www.w3.org/2000/svg">
              <circle cx="42" cy="42" r="37" stroke="#F4C44E" strokeWidth="2.75" />
              <circle cx="42" cy="34" r="10.5" fill="#FACC5B" />
              <path
                d="M42 40V60"
                stroke="#6EE7B7"
                strokeWidth="3.8"
                strokeLinecap="round"
              />
              <path
                d="M42 50C42 42 33 36 25 36.5C25.5 45 33 51.5 42 50Z"
                fill="#86EFAC"
              />
              <path
                d="M42 47C42 39 51 33 59 33.5C58.5 42 51 48.5 42 47Z"
                fill="#6EE7B7"
              />
            </svg>
          </div>

          <h1 className="landing-title">
            <span className="landing-title-nasa">NASA</span>
            <span className="landing-title-bukid">Bukid</span>
          </h1>
        </div>

        <p className="landing-tagline">
          Bukidnon satellite field intelligence for seasonal crop planning &amp; post-disaster farm recovery.
        </p>

        <div className="landing-mode-actions" role="group" aria-label="Choose workspace mode">
          <button
            type="button"
            className="landing-mode-btn is-rotation"
            onClick={() => onSelectMode("rotation")}
          >
            <span className="landing-mode-icon">
              <Sprout size={20} strokeWidth={2.1} />
            </span>
            <span className="landing-mode-copy">
              <strong>Crop Rotation</strong>
              <small>Next-season plans &amp; soil health</small>
            </span>
            <ArrowRight size={17} className="landing-mode-arrow" />
          </button>

          <button
            type="button"
            className="landing-mode-btn is-recovery"
            onClick={() => onSelectMode("recovery")}
          >
            <span className="landing-mode-icon">
              <ShieldAlert size={20} strokeWidth={2.1} />
            </span>
            <span className="landing-mode-copy">
              <strong>Disaster Recovery</strong>
              <small>Storm check, loss estimate &amp; replanting</small>
            </span>
            <ArrowRight size={17} className="landing-mode-arrow" />
          </button>
        </div>
      </main>
    </div>
  );
}

function formatFarmDate(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return new Intl.DateTimeFormat("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function OverviewPage({
  farm,
  boundary,
  location,
  scenario,
  rotationName,
  hazard,
  onLocationFound,
  onPlan,
  onFullMap,
  onRecover,
  onPrevention,
  onChat,
}: {
  farm: Farm;
  boundary: Coordinates[];
  location: Coordinates;
  scenario: ClimateScenario;
  rotationName?: string;
  hazard: Hazard;
  onLocationFound: (coords: Coordinates) => void;
  onPlan: () => void;
  onFullMap: () => void;
  onRecover: () => void;
  onPrevention: () => void;
  onChat: () => void;
}) {
  const locationKnown = Boolean(farm.place) && farm.place !== "Location not identified";
  const plantingDate = formatFarmDate(farm.planted);
  const notes = [
    !locationKnown ? "Location not identified yet. Pick your farm point on the map." : null,
    !boundary.length ? "Area is entered manually. Draw a boundary for an exact measure." : null,
    !plantingDate ? "Add a planned planting date to compare seasons." : null,
  ].filter((note): note is string => Boolean(note));

  return (
    <div className="agri-overview-container">
      <OverviewWeatherWidget
        location={location}
        placeName={farm.place}
        onLocationFound={onLocationFound}
        onOpenFarm={onPlan}
      />

      {/* Quick Actions Row */}
      <div className="agri-quick-actions">
        <Button size="lg" className="agri-btn-primary" onClick={onFullMap}>
          <MapIcon size={18} /> Open Full Map
        </Button>
        <Button size="lg" className="agri-btn-secondary" variant="outline" onClick={onPlan}>
          <MapPin size={18} /> Set up my farm
        </Button>
      </div>

      <section className="overview-field panel" aria-labelledby="overview-field-heading">
        <div className="overview-section-head">
          <div>
            <span className="panel-eyebrow">
              <Sprout size={13} aria-hidden="true" /> YOUR FIELD
            </span>
            <h2 id="overview-field-heading">Field profile</h2>
          </div>
          <Button variant="outline" onClick={onPlan}>
            Open My Farm <ArrowRight size={15} aria-hidden="true" />
          </Button>
        </div>
        <dl className="overview-field-facts">
          <div>
            <dt>Location</dt>
            <dd>{locationKnown ? farm.place : "Not identified"}</dd>
          </div>
          <div>
            <dt>Area</dt>
            <dd>
              {farm.area ? `${farm.area} ha` : "Not set"}
              <small>{boundary.length ? "measured" : "manual"}</small>
            </dd>
          </div>
          <div>
            <dt>Current crop</dt>
            <dd>{farm.crop || "Not set"}</dd>
          </div>
          <div>
            <dt>Next planting</dt>
            <dd>{plantingDate ?? "Not set"}</dd>
          </div>
        </dl>
        {notes.length > 0 && (
          <p className="overview-field-note">
            <CircleHelp size={15} aria-hidden="true" />
            <span>{notes.join(" ")}</span>
          </p>
        )}
      </section>

      <section className="overview-tools" aria-labelledby="overview-tools-heading">
        <div className="overview-section-head">
          <div>
            <span className="panel-eyebrow">
              <Wheat size={13} aria-hidden="true" /> FARM TOOLS
            </span>
            <h2 id="overview-tools-heading">What do you need today?</h2>
          </div>
          <button type="button" className="overview-link-btn" onClick={onChat}>
            Ask the field advisor <ArrowUpRight size={15} aria-hidden="true" />
          </button>
        </div>

        <div className="agri-cards-scroller">
          <button type="button" className="agri-field-card" onClick={onPrevention}>
            <div className="agri-card-media">
              <img src={bukidnonFields} alt="Bukidnon crop planning field" />
              <span className="agri-bookmark-btn" aria-hidden="true">
                <Wheat size={16} />
              </span>
            </div>
            <div className="agri-card-info">
              <div className="agri-card-header-row">
                <div className="agri-card-tags">
                  <span className="agri-tag">
                    <Sprout size={12} aria-hidden="true" /> Crop Planning
                  </span>
                  <span className="agri-scenario-chip">{scenario}</span>
                </div>
              </div>
              <h3 className="agri-card-title">Compare next-season rotations</h3>
              <p className="agri-card-copy">
                Choose your planting date and compare next crops with historical weather and field conditions.
              </p>
              <div className="agri-card-foot">
                <span className="agri-card-status">
                  {rotationName ? `Last viewed · ${rotationName}` : "Open crop planning"}
                </span>
                <span className="agri-action-pill">
                  <span>Explore</span>
                  <ArrowRight size={13} aria-hidden="true" />
                </span>
              </div>
            </div>
          </button>

          {false && (
            <button type="button" className="agri-field-card" onClick={onRecover}>
              <div className="agri-card-media">
                <img src={floodCorn} alt="Bukidnon flood recovery field" />
                <span className="agri-bookmark-btn" aria-hidden="true">
                  <HeartHandshake size={16} />
                </span>
              </div>
              <div className="agri-card-info">
                <div className="agri-card-header-row">
                  <div className="agri-card-tags">
                    <span className="agri-tag tag-coral">
                      <HeartHandshake size={12} aria-hidden="true" /> Damage Recovery
                    </span>
                    <span className="agri-scenario-chip chip-coral">{hazard}</span>
                  </div>
                </div>
                <h3 className="agri-card-title">Estimate storm damage</h3>
                <p className="agri-card-copy">
                  Work out crop loss from rainfall and field reports, then plan the next step.
                </p>
                <div className="agri-card-foot">
                  <span className="agri-card-status">Open damage check</span>
                  <span className="agri-action-pill pill-coral">
                    <span>Assess</span>
                    <ArrowRight size={13} aria-hidden="true" />
                  </span>
                </div>
              </div>
            </button>
          )}
        </div>
      </section>
    </div>
  );
}

function FarmPage({
  farm,
  location,
  boundary,
  onBoundary,
  onLocation,
  onUpdate,
  onContinue,
}: {
  farm: Farm;
  boundary: Coordinates[];
  onBoundary: (points: Coordinates[]) => void;
  location: Coordinates;
  onLocation: (location: Coordinates) => void;
  onUpdate: (key: keyof Farm, value: string) => void;
  onContinue: () => void;
}) {
  return (
    <div className="farm-layout">
      <section className="panel farm-map-panel">
        <div className="panel-top">
          <div>
            <span className="panel-eyebrow">
              <MapPin size={13} /> FARM LOCATION
            </span>
            <h2>Select your farm.</h2>
          </div>
          <span className="sample-chip">LEAFLET · OPENSTREETMAP</span>
        </div>
        <FarmMap
          location={location}
          boundary={boundary}
          onBoundary={onBoundary}
          onChange={onLocation}
        />
      </section>
      <section className="panel farm-profile-panel">
        <div className="panel-top">
          <div>
            <span className="panel-eyebrow">
              <Sprout size={13} /> FARM PROFILE <span className="panel-demotag">DEMO</span>
            </span>
            <h2>Make it yours.</h2>
          </div>
          <span className="profile-status">
            <BadgeCheck size={14} /> SAVED HERE
          </span>
        </div>
        <div className="form-grid">
          <div className="form-field full-span">
            <Label htmlFor="farm-location">Municipality / city (automatic, editable)</Label>
            <Input
              id="farm-location"
              value={farm.place}
              onChange={(event) => onUpdate("place", event.target.value)}
            />
            <small>Detected from your selected farm point when public records are available.</small>
          </div>
          <div className="form-field">
            <Label htmlFor="area-ha">
              Farm area <span>ha</span>
            </Label>
            <div className="input-unit-wrap">
              <Input
                id="area-ha"
                readOnly={boundary.length > 0}
                aria-describedby="area-source"
                type="number"
                min="0"
                step="0.0001"
                value={farm.area}
                onChange={(e) => onUpdate("area", e.target.value)}
              />
              <span>hectares</span>
            </div>
            <small id="area-source">
              {boundary.length
                ? "Calculated from drawn boundary. Clear boundary to edit manually."
                : "Enter manually or draw your farm boundary."}
            </small>
          </div>
          <div className="form-field">
            <Label htmlFor="plant-date">Planned next planting</Label>
            <Input
              id="plant-date"
              type="date"
              value={farm.planted}
              onChange={(e) => onUpdate("planted", e.target.value)}
            />
          </div>
          <div className="form-field">
            <Label htmlFor="current-crop">Current crop</Label>
            <select
              id="current-crop"
              className="form-select"
              value={farm.crop}
              onChange={(e) => onUpdate("crop", e.target.value)}
            >
              {CROP_OPTIONS.map((crop) => (
                <option key={crop}>{crop}</option>
              ))}
            </select>
          </div>
          <div className="form-field">
            <Label htmlFor="previous-crop">Previous crop</Label>
            <select
              id="previous-crop"
              className="form-select"
              value={farm.previous}
              onChange={(e) => onUpdate("previous", e.target.value)}
            >
              {PREVIOUS_CROP_OPTIONS.map((crop) => (
                <option key={crop}>{crop}</option>
              ))}
            </select>
          </div>
          <div className="form-field">
            <Label htmlFor="soil-type">Soil texture / type (editable)</Label>
            <Input
              id="soil-type"
              value={farm.soil}
              placeholder="Awaiting public estimate or local measurement"
              onChange={(event) => onUpdate("soil", event.target.value)}
            />
          </div>
          <div className="form-field">
            <Label htmlFor="soil-ph">Soil pH (water, editable)</Label>
            <Input
              id="soil-ph"
              type="number"
              min="0"
              max="14"
              step="0.1"
              placeholder="Unknown"
              value={farm.ph}
              onChange={(event) => onUpdate("ph", event.target.value)}
            />
          </div>
          <div className="form-field">
            <Label htmlFor="irrigation">Irrigation</Label>
            <select
              id="irrigation"
              className="form-select"
              value={farm.irrigation}
              onChange={(e) => onUpdate("irrigation", e.target.value)}
            >
              {[
                "Unknown",
                "Rain-fed",
                "Gravity-fed",
                "Pump-irrigated",
                "Drip irrigation",
                "Other",
              ].map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
            <small>
              Farmer confirmation required. Public data cannot verify your working irrigation system
              or water supply.
            </small>
          </div>
          <div className="form-field">
            <Label htmlFor="drainage">Field drainage</Label>
            <select
              id="drainage"
              className="form-select"
              value={farm.drainage}
              onChange={(e) => onUpdate("drainage", e.target.value)}
            >
              {["Moderate", "Good", "Poor", "Unknown"].map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
            <small>
              Editable field observation. A demo suggestion is available below when soil and terrain
              data support one.
            </small>
          </div>
        </div>
        <div className="farm-save-row">
          <div>
            <span className="save-indicator">
              <Check size={12} />
            </span>
            <span>Saved in this browser on this device.</span>
          </div>
          <Button onClick={onContinue}>
            Continue to crop planning <ArrowRight size={16} />
          </Button>
        </div>
      </section>
      <aside className="farm-note">
        <FlaskConical size={17} />
        <div>
          <strong>Location & Soil Profile.</strong>
          <p>
            Select your actual location on the map. Soil values can be corrected using local
            measurements. Historical rainfall records can be loaded in crop planning.
          </p>
        </div>
      </aside>
    </div>
  );
}

function RecoveryPage({
  onWeather,
  farm,
  hazard,
  setHazard,
  damageDate,
  setDamageDate,
  affected,
  setAffected,
  yieldLoss,
  setYieldLoss,
  photo,
  pickPhoto,
  uploadRef,
  loss,
  onPlan,
  onChat,
  price,
  setPrice,
  expectedYield,
  setExpectedYield,
  validLossInputs,
  location,
  onUpdateFarm,
  embedStep,
  onContinueStep,
  onBackStep,
}: {
  onWeather: (weather: HistoricalWeather | null) => void;
  onUpdateFarm: (key: keyof Farm, value: string) => void;
  price: string;
  setPrice: (value: string) => void;
  expectedYield: string;
  setExpectedYield: (value: string) => void;
  validLossInputs: boolean;
  location: Coordinates;
  farm: Farm;
  hazard: Hazard;
  setHazard: (hazard: Hazard) => void;
  damageDate: string;
  setDamageDate: (date: string) => void;
  affected: number;
  setAffected: (value: number) => void;
  yieldLoss: number;
  setYieldLoss: (value: number) => void;
  photo: { src: string; name: string; sample: boolean };
  pickPhoto: (file?: File) => void;
  uploadRef: React.RefObject<HTMLInputElement | null>;
  loss: number;
  onPlan: () => void;
  onChat: () => void;
  embedStep?: 1 | 2;
  onContinueStep?: () => void;
  onBackStep?: () => void;
}) {
  const HazardIcon = HAZARD_RATES[hazard].icon;
  const stepOnePanel = (
    <section className="panel recovery-form-panel">
      <div className="panel-top">
        <div>
          <span className="panel-eyebrow">
            <HeartHandshake size={13} /> FIRST, A FEW DETAILS{" "}
            <span className="panel-demotag">DEMO</span>
          </span>
          <h2>Tell us about the event.</h2>
        </div>
        <span className="step-number">
          01 <span>/ {embedStep ? "02" : "03"}</span>
        </span>
      </div>
      <Label className="form-section-label">What happened?</Label>
      <div className="hazard-options">
        {(Object.keys(HAZARD_RATES) as Hazard[]).map((value) => {
          const Icon = HAZARD_RATES[value].icon;
          return (
            <button
              className={`hazard-option ${hazard === value ? "hazard-selected" : ""}`}
              key={value}
              aria-pressed={hazard === value}
              onClick={() => setHazard(value)}
            >
              <Icon size={17} />
              <span>{value}</span>
              {hazard === value && <Check size={13} className="hazard-check" />}
            </button>
          );
        })}
      </div>
      <div className="form-grid recovery-fields">
        <div className="form-field">
          <Label htmlFor="damage-date">When did it happen?</Label>
          <Input
            id="damage-date"
            type="date"
            value={damageDate}
            onChange={(e) => setDamageDate(e.target.value)}
          />
        </div>
        <div className="form-field">
          <Label htmlFor="recovery-area">Farm area (ha)</Label>
          <Input
            id="recovery-area"
            type="number"
            min="0"
            step="any"
            value={farm.area}
            onChange={(e) => onUpdateFarm("area", e.target.value)}
          />
        </div>
      </div>
      <div className="photo-heading">
        <div>
          <Label>
            Crop photo <span className="optional-label">OPTIONAL</span>
          </Label>
          <span className="photo-caption">
            Add a photo or explore using the labeled sample.
          </span>
        </div>
        <Button variant="outline" size="sm" onClick={() => uploadRef.current?.click()}>
          <Upload size={14} /> Add a photo
        </Button>
        <input
          ref={uploadRef}
          className="sr-only"
          type="file"
          accept="image/*"
          aria-label="Upload crop photo"
          onChange={(event) => pickPhoto(event.target.files?.[0])}
        />
      </div>
      <button
        className="photo-preview"
        onClick={() => uploadRef.current?.click()}
        aria-label="Choose a crop photo"
      >
        <img
          src={photo.src}
          alt={
            photo.sample
              ? "Sample farm crop in waterlogged soil"
              : "Farmer-uploaded crop photo; not analyzed"
          }
        />
        <span className="photo-badge">
          <ImagePlus size={12} /> {photo.sample ? "SAMPLE PHOTO" : "YOUR PHOTO"}
        </span>
        <span className="photo-overlay">
          <span>
            <Upload size={16} /> Change photo
          </span>
        </span>
      </button>
      <span className="file-caption">
        {photo.name} <span>· Image preview stays in this browser only</span>
      </span>
      <div className="observations">
        <div className="observation-head">
          <span>
            <BadgeCheck size={14} /> SAMPLE OBSERVATIONS
          </span>
          <span>NOT AI-ANALYZED</span>
        </div>
        <p>{HAZARD_RATES[hazard].observation}</p>
      </div>
      {embedStep === 1 && onContinueStep && (
        <Button
          type="button"
          className="drawer-recovery-continue-btn"
          onClick={onContinueStep}
        >
          <span>Continue</span>
          <ArrowRight size={15} />
        </Button>
      )}
    </section>
  );

  const stepTwoPanel = (
    <section className="panel loss-panel">
      <div className="panel-top">
        <div>
          <span className="panel-eyebrow">
            <BarChart3 size={13} /> PLANNING ESTIMATE{" "}
            <span className="panel-demotag">DEMO</span>
          </span>
          <h2>A starting point, not a verdict.</h2>
        </div>
        <span className="step-number">
          02 <span>/ {embedStep ? "02" : "03"}</span>
        </span>
      </div>
      <div className="form-grid loss-assumptions">
        <div className="form-field">
          <Label htmlFor="yield-assumption">Expected yield (kg/ha)</Label>
          <Input
            id="yield-assumption"
            type="number"
            min="0"
            step="any"
            value={expectedYield}
            onChange={(event) => setExpectedYield(event.target.value)}
          />
        </div>
        <div className="form-field">
          <Label htmlFor="price-assumption">Farmgate price (₱/kg)</Label>
          <Input
            id="price-assumption"
            type="number"
            min="0"
            step="any"
            value={price}
            onChange={(event) => setPrice(event.target.value)}
          />
        </div>
      </div>
      <p className="historical-copy">
        Defaults are sample corn assumptions. Enter crop-specific yield and price for{" "}
        {farm.crop}. Gross revenue at risk excludes costs and insurance.
      </p>
      <RangeField
        id="affected-area"
        label="Area affected"
        value={affected}
        setValue={setAffected}
        help="Share of total farm area"
      />
      <RangeField
        id="yield-loss"
        label="Expected yield loss on affected area"
        value={yieldLoss}
        setValue={setYieldLoss}
        help="Illustrative estimate"
      />
      <div className="calculation-box">
        <span className="calculation-title">
          <span /> GROSS REVENUE AT RISK
        </span>
        <div className="calculation-total">
          {validLossInputs ? PHP.format(loss) : "Enter valid assumptions"} <span>PHP</span>
        </div>
        <div className="calculation-equation">
          <span>{farm.area} ha</span>
          <i>×</i>
          <span>{affected}%</span>
          <i>×</i>
          <span>{Number(expectedYield).toLocaleString()} kg/ha</span>
          <i>×</i>
          <span>{yieldLoss}%</span>
          <i>×</i>
          <span>₱{price}/kg</span>
        </div>
        <div className="calculation-foot">
          Farm area × affected share × entered yield × yield-loss fraction × entered price.
          Figures are editable planning assumptions, not a verified claim.
        </div>
      </div>
      <div className="next-steps-label">
        <ShieldCheck size={15} /> POSSIBLE NEXT STEPS
      </div>
      <div className="next-steps">
        {RECOVERY_STEPS[hazard].map((step, index) => (
          <span key={step}>
            <span>{index + 1}</span>
            {step}
          </span>
        ))}
      </div>
      <div className="form-grid loss-assumptions">
        <div className="form-field">
          <Label htmlFor="recovery-plant-date">Planned next planting</Label>
          <Input
            id="recovery-plant-date"
            type="date"
            min={damageDate}
            value={farm.planted}
            onChange={(event) => onUpdateFarm("planted", event.target.value)}
          />
        </div>
        <div className="form-field">
          <Label htmlFor="recovery-drainage">Current field drainage</Label>
          <select
            id="recovery-drainage"
            className="form-select"
            value={farm.drainage}
            onChange={(event) => onUpdateFarm("drainage", event.target.value)}
          >
            {["Moderate", "Good", "Poor", "Unknown"].map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </div>
      </div>
      <p className="historical-copy">
        These farmer-reported inputs update the same profile and demo comparison used in
        prevention. Confirm field readiness before planting.
      </p>
      <div className="recovery-actions">
        {embedStep === 2 && onBackStep && (
          <Button type="button" variant="outline" onClick={onBackStep}>
            <ArrowLeft size={14} /> Back
          </Button>
        )}
        <Button disabled={!farm.planted || farm.planted < damageDate} onClick={onPlan}>
          Compare next-season options <ArrowRight size={15} />
        </Button>
        {!embedStep && (
          <Button variant="ghost" onClick={onChat}>
            <MessageCircle size={15} /> Talk it through
          </Button>
        )}
      </div>
      {!embedStep && (
        <span className="step-number recovery-step">
          03 <span>/ 03</span> <span>YOUR NEXT SEASON</span>
        </span>
      )}
    </section>
  );

  if (embedStep === 1) {
    return (
      <div key="recovery-step-1" className="recovery-slide-stage is-enter-left">
        {stepOnePanel}
      </div>
    );
  }
  if (embedStep === 2) {
    return (
      <div key="recovery-step-2" className="recovery-slide-stage is-enter-right">
        {stepTwoPanel}
      </div>
    );
  }

  return (
    <div className="recovery-layout">
      <div className="recovery-left">{stepOnePanel}</div>
      <aside className="recovery-right">
        <HistoricalWeatherPanel
          key={`${location.latitude}:${location.longitude}:${damageDate}`}
          location={location}
          eventDate={damageDate}
          onLoaded={onWeather}
        />
        {stepTwoPanel}
      </aside>
      <div className="recovery-disclaimer">
        <HazardIcon size={15} />
        <span>
          <strong>Friendly reminder.</strong> This demo can’t diagnose crop damage or replace an
          on-site assessment by an agricultural expert.
        </span>
      </div>
    </div>
  );
}

function RangeField({
  id,
  label,
  value,
  setValue,
  help,
}: {
  id: string;
  label: string;
  value: number;
  setValue: (value: number) => void;
  help: string;
}) {
  return (
    <div className="range-field">
      <div className="range-label-row">
        <Label htmlFor={id}>{label}</Label>
        <span>{help}</span>
      </div>
      <div className="range-controls">
        <input
          id={id}
          aria-label={label}
          type="range"
          min="0"
          max="100"
          step="1"
          className="range-input"
          value={value}
          onChange={(e) => setValue(Number(e.target.value))}
        />
        <span className="range-value">
          {value}
          <small>%</small>
        </span>
      </div>
    </div>
  );
}
