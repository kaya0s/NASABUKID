import { RECOVERY_STEPS, type AdvisorRequest } from "@/lib/advisor";
import { RotationResearch } from "@/components/rotation-research";
import { RotationEvidence } from "@/components/rotation-evidence";
import { ROTATION_RESEARCH } from "@/lib/crop-research";
import { ApiSources } from "@/components/api-sources";
import { FarmPublicData, type ContextFields } from "@/components/farm-public-data";
import { measureFarmBoundary } from "@/lib/farm-boundary";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
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
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  monthlyWeather,
  type Coordinates,
  type HistoricalWeather,
} from "@/lib/nasa-power";
import {
  buildRotationStrategies,
  buildSoilAndAgronomyAdvisory,
  planningReviewFlags,
  calculateEstimatedLoss,
  type ClimateScenario,
  type RotationStrategy,
  rotationsForScenario,
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
  | "evidence"
  | "chat";
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
type ChatMessage = {
  role: "assistant" | "user";
  text: string;
  error?: boolean;
};
const NAV: Array<{
  id: Page;
  label: string;
  icon: typeof Leaf;
  section: string;
  isCenter?: boolean;
}> = [
  { id: "overview", label: "Overview", icon: Compass, section: "WORKSPACE" },
  { id: "farm", label: "My farm", icon: Sprout, section: "WORKSPACE" },
  { id: "fullmap", label: "Full Map (New)", icon: MapIcon, section: "WORKSPACE" },
  {
    id: "prevention",
    label: "Crop planning",
    icon: Wheat,
    section: "WORKSPACE",
    isCenter: true,
  },
  {
    id: "recovery",
    label: "Damage recovery",
    icon: HeartHandshake,
    section: "WORKSPACE",
  },
  {
    id: "evidence",
    label: "Evidence & sources",
    icon: FileText,
    section: "INSIGHTS",
  },
  {
    id: "chat",
    label: "Field advisor",
    icon: MessageCircle,
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
const SUGGESTED_QUESTIONS = [
  "Why plant a legume after corn?",
  "What changes in a dry season?",
  "How was my loss estimate calculated?",
];
const SUGGESTIONS_BY_WORKFLOW = {
  prevention: [
    "Why plant a legume after corn?",
    "What changes in a dry season?",
    "How do crop rotations protect soil?",
    "Which crops handle wet conditions best?",
  ],
  recovery: [
    "How was my loss estimate calculated?",
    "What should I do right after floodwaters recede?",
    "Can surviving corn still produce grain?",
    "What fast-growing replanting options work?",
  ],
};
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
  const [advisorWorkflow, setAdvisorWorkflow] = useState<"recovery" | "prevention">("prevention");
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
  const [selectedRotation, setSelectedRotation] = useState("legume");
  const [evidenceRotation, setEvidenceRotation] = useState("legume");
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      text: "Hi there. I’m your NASABUKID demo advisor. I can walk through this mock data plan, farm profile, or recovery estimate. What would you like to explore?",
    },
  ]);
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
  const monthlyRainfall = historical
    ? Array.from({ length: 12 }, (_, month) =>
        historical.days
          .filter((day) => Number(day.date.slice(5, 7)) === month + 1)
          .reduce((sum, day) => sum + (day.rainfall ?? 0), 0),
      )
    : undefined;

  const rotations = buildRotationStrategies(scenario, {
    ph: farm.ph.trim() ? Number(farm.ph) : NaN,
    drainage: farm.drainage,
    irrigation: farm.irrigation,
    planted: farm.planted,
    crop: farm.crop,
    previous: farm.previous,
    slopePercent: terrain?.slopePercent ?? null,
    soil: farm.soil,
    ...(monthlyRainfall ? { monthlyRainfall } : {}),
  });
  const activeRotation =
    rotations.find((rotation) => rotation.id === selectedRotation) ?? rotations[0]!;
  const evidenceItem =
    rotations.find((rotation) => rotation.id === evidenceRotation) ?? rotations[0]!;
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

  function goTo(next: Page) {
    if (next === "recovery" || next === "prevention") setAdvisorWorkflow(next);
    setPage(next);
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

  async function sendQuestion(question = chatInput) {
    const text = question.trim();
    if (!text || chatBusy) return;
    setChatBusy(true);
    setChatMessages((messages) => [...messages, { role: "user", text }]);
    setChatInput("");
    try {
      const numberOrNull = (value: string) =>
        value.trim() && Number.isFinite(Number(value)) && Number(value) >= 0 ? Number(value) : null;
      const weather = advisorWorkflow === "recovery" ? eventWeather : historical;
      const payload: AdvisorRequest = {
        question: text,
        history: chatMessages
          .filter((message) => !message.error)
          .slice(1)
          .slice(-10)
          .map((message) => ({ role: message.role, content: message.text })),
        context: {
          workflow: advisorWorkflow,
          farm,
          locationConfirmed,
          profileSource: profileEdited ? "edited-unverified" : "sample-or-saved-unverified",
          scenario,
          rotation: activeRotation.name,
          recovery: {
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
          },
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
                  advisorWorkflow === "recovery"
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
          rotationDetails: {
            strategyLabel: activeRotation.strategyLabel.slice(0, 280),
            nextCrop: activeRotation.nextCrop.slice(0, 280),
            layFallowPeriod: activeRotation.layFallowPeriod.slice(0, 280),
            pros: activeRotation.pros.slice(0, 6).map((item) => item.slice(0, 280)),
            cons: activeRotation.cons.slice(0, 6).map((item) => item.slice(0, 280)),
            satelliteWhy: activeRotation.satelliteWhy.slice(0, 10).map((item) => item.slice(0, 280)),
            evidenceGaps: activeRotation.evidenceGaps.slice(0, 10).map((item) => item.slice(0, 280)),
          },
          agronomyAdvisory: (() => {
            const monthly = historical ? monthlyWeather(historical.days) : null;
            const adv = buildSoilAndAgronomyAdvisory({
              nextCrop: activeRotation.nextCrop,
              previousCrop: farm.previous,
              ph: farm.ph.trim() && Number.isFinite(Number(farm.ph)) ? Number(farm.ph) : null,
              soilTexture: farm.soil,
              drainage: farm.drainage,
              irrigation: farm.irrigation,
              slopePercent: terrain?.slopePercent ?? null,
              elevation: terrain?.elevation ?? null,
              ...(monthly
                ? {
                    monthlyRainfall: monthly.map((m) => m.rainfall ?? 0),
                    monthlyTemperature: monthly.map((m) => m.temperature ?? 25),
                  }
                : {}),
            });
            return {
              suitabilityStatus: adv.suitability.status.slice(0, 280),
              phLabel: adv.soilProfile.phLabel.slice(0, 280),
              mineralsNeeded: adv.soilProfile.mineralsNeeded.slice(0, 6).map((item) => item.slice(0, 280)),
              recommendedFertilizers: adv.soilProfile.recommendedFertilizers
                .slice(0, 6)
                .map((item) => item.slice(0, 280)),
              avoidFertilizers: adv.soilProfile.avoidFertilizers
                .slice(0, 6)
                .map((item) => item.slice(0, 280)),
              bestPlantingWindow: adv.climateTiming.bestPlantingWindow.slice(0, 280),
              prominentPestClimate: adv.climateTiming.prominentPestClimate.slice(0, 280),
            };
          })(),
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

  const pageTitle: Record<Page, string> = {
    landing: "Welcome to NASABUKID",
    overview: "Overview",
    farm: "My farm",
    fullmap: "Full Map (New)",
    prevention: "Crop planning",
    recovery: "Damage recovery",
    evidence: "Evidence & scoring",
    chat: "Field advisor",
  };

  if (page === "landing") {
    return (
      <LandingPage
        onLaunch={() => goTo("overview")}
        onNavigate={(targetPage) => goTo(targetPage)}
      />
    );
  }

  return (
    <div className="app-shell">
      <aside className="sidebar" aria-hidden={isMobile ? "true" : undefined}>
        <div
          className="brand brand-clickable"
          onClick={() => goTo("landing")}
          role="button"
          tabIndex={0}
          title="Return to Home"
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              goTo("landing");
            }
          }}
        >
          <div className="brand-mark">
            <Sprout size={21} strokeWidth={1.8} />
          </div>
          <div>
            <span className="brand-name">
              <span className="brand-nasa">NASA</span><span className="brand-bukid">BUKID</span>
            </span>
            <span className="brand-caption">GROW WITH CONFIDENCE</span>
          </div>
        </div>
        <div className="workspace-label">
          YOUR FIELD DESK <ChevronDown size={14} />
        </div>
        <div className="sidebar-location">
          <MapPin size={15} />
          <div>
            <strong>{farm.place}</strong>
            <span>Selected farm reference</span>
          </div>
          <span className="location-dot" />
        </div>
        <nav className="main-nav" aria-label="Main navigation">
          {NAV.map((item, index) => {
            const Icon = item.icon;
            return (
              <div key={item.id}>
                {(index === 0 || NAV[index - 1]?.section !== item.section) && (
                  <span className="nav-section">{item.section}</span>
                )}
                <button
                  className={`nav-item ${page === item.id ? "nav-item-active" : ""}`}
                  onClick={() => goTo(item.id)}
                >
                  <Icon size={17} strokeWidth={1.8} />
                  <span>{item.label}</span>
                  {item.id === "recovery" && <span className="nav-live-dot" />}
                </button>
              </div>
            );
          })}
        </nav>
        <div className="sidebar-foot">
          <button
            type="button"
            className="sidebar-logout-btn"
            onClick={() => goTo("landing")}
            title="Log out and return to landing page"
          >
            <LogOut size={16} strokeWidth={1.8} />
            <span>Log out</span>
          </button>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div className="user-chip">
            <span className="user-avatar">B</span>
            <span className="user-name">Bukidnon grower</span>
          </div>
        </header>
        {page === "fullmap" ? (
          <FullFarmMap
            location={location}
            boundary={boundary}
            onBoundary={updateBoundary}
            onChange={updateLocation}
            areaLabel={farm.area}
            farm={farm}
            onUpdateFarm={updateFarm}
            onContinue={() => goTo("prevention")}
            historical={historical}
            climateLoading={climateLoading}
            terrain={terrain}
            cropOptions={CROP_OPTIONS}
            previousCropOptions={PREVIOUS_CROP_OPTIONS}
          />
        ) : (
        <div className="page-wrap">
          {page !== "overview" && page !== "chat" && (
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
              rotationName={activeRotation.name}
              hazard={hazard}
              onLocationFound={(coords) => {
                updateLocation(coords);
              }}
              onPlan={() => goTo("farm")}
              onRecover={() => goTo("recovery")}
              onPrevention={() => goTo("prevention")}
              onChat={() => goTo("chat")}
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
          {page === "prevention" && (
            <>
              <HistoricalWeatherPanel location={location} onUse={setHistorical} monthlyCharts />
              {historical && (
                <div className="note-strip">
                  <ShieldCheck size={16} />
                  <span>
                    Demo water context: actual NASA rainfall from {historical.start} to{" "}
                    {historical.end}, using your planting month. Other ratings and thresholds remain
                    illustrative. The charts above show the selected NASA year.
                  </span>
                  <button onClick={() => setHistorical(null)}>Clear historical context</button>
                </div>
              )}
              <section className="panel">
                <h2>Review before choosing a crop</h2>
                <p>
                  These are demo comparisons, not validated suitability decisions or yield
                  forecasts. Income scores do not use production costs. Review every crop across its
                  full growing season.
                </p>
                <ul>
                  {planningReviewFlags(farm).map((flag) => (
                    <li key={flag}>{flag}</li>
                  ))}
                </ul>
              </section>
              <PreventionPage
                farm={farm}
                setFarm={setFarm}
                cropOptions={CROP_OPTIONS}
                previousCropOptions={PREVIOUS_CROP_OPTIONS}
                terrain={terrain}
                historical={historical}
                scenario={scenario}
                setScenario={(next) => {
                  setScenario(next);
                  setHistorical(null);
                }}
                rotations={rotations}
                selected={selectedRotation}
                setSelected={setSelectedRotation}
                onEvidence={(id) => {
                  setEvidenceRotation(id);
                  setEvidenceOpen(true);
                }}
                onChat={() => goTo("chat")}
                onEvidencePage={() => goTo("evidence")}
              />
            </>
          )}
          {page === "recovery" && (
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
              <RecoveryPage
                onWeather={setEventWeather}
                farm={farm}
                hazard={hazard}
                setHazard={changeHazard}
                damageDate={damageDate}
                setDamageDate={(value) => {
                  setDamageDate(value);
                  setEventWeather(null);
                }}
                affected={affected}
                setAffected={(value) => {
                  setAssumptionsEdited(true);
                  setAffected(value);
                }}
                yieldLoss={yieldLoss}
                setYieldLoss={(value) => {
                  setAssumptionsEdited(true);
                  setYieldLoss(value);
                }}
                price={price}
                setPrice={(value) => {
                  setAssumptionsEdited(true);
                  setPrice(value);
                }}
                expectedYield={expectedYield}
                setExpectedYield={(value) => {
                  setAssumptionsEdited(true);
                  setExpectedYield(value);
                }}
                validLossInputs={validLossInputs}
                onUpdateFarm={updateFarm}
                location={location}
                photo={photo}
                pickPhoto={pickPhoto}
                uploadRef={uploadRef}
                loss={loss}
                onPlan={() => goTo("prevention")}
                onChat={() => goTo("chat")}
              />
            </>
          )}
          {page === "evidence" && (
            <EvidencePage
              rotations={rotations}
              scenario={scenario}
              selected={evidenceRotation}
              setSelected={setEvidenceRotation}
              onChat={() => goTo("chat")}
            />
          )}
          {page === "chat" && (
            <ChatPage
              farm={farm}
              messages={chatMessages}
              busy={chatBusy}
              input={chatInput}
              setInput={setChatInput}
              onSend={sendQuestion}
              onSuggestion={sendQuestion}
              scenario={scenario}
              rotation={activeRotation.name}
              hazard={hazard}
              loss={lossLabel}
              advisorWorkflow={advisorWorkflow}
              setAdvisorWorkflow={setAdvisorWorkflow}
            />
          )}

          {SHOW_API_SOURCES && <ApiSources />}
          <footer className="page-footer">
            <span>
              <Sprout size={14} /> Made for the seasons ahead.
            </span>
            {SHOW_FOOTER_NASA_INFO && (
              <span>
                NASABUKID <span className="footer-divider">·</span> NASA Space Apps demo{" "}
                <span className="footer-divider">·</span> Historical NASA access · Demo scores ·
                Gemini advisor
              </span>
            )}
          </footer>
        </div>
        )}
        <div hidden={page !== "farm"}><FarmPublicData location={location} confirmed={locationConfirmed} onApply={applyContext} /></div>

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
      </main>

      <Dialog open={evidenceOpen} onOpenChange={setEvidenceOpen}>
        <DialogContent className="evidence-dialog">
          <DialogHeader>
            <span className="eyebrow">
              SCORECARD <span className="eyebrow-dot" /> DEMO ESTIMATE
            </span>
            <DialogTitle>{evidenceItem?.name ?? "Rotation details"}</DialogTitle>
            <DialogDescription>
              Illustrative score and evidence notes. These are planning examples—not verified field
              results.
            </DialogDescription>
          </DialogHeader>
          {evidenceItem && (
            <>
              <div className="modal-total">
                <span>{evidenceItem.total}</span>
                <span> / 100 weighted score</span>
                <span className="rank-pill">
                  {rotations.findIndex((entry) => entry.id === evidenceItem.id) === 0
                    ? "TOP SAMPLE MATCH"
                    : "ALTERNATIVE"}
                </span>
              </div>
              <ScoreBreakdown scores={evidenceItem.scores} />
              <p className="modal-note">{evidenceItem.note}</p>
              <Button
                className="w-full"
                onClick={() => {
                  setEvidenceOpen(false);
                  goTo("chat");
                }}
              >
                Ask the field advisor <ArrowRight size={16} />
              </Button>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function LandingPage({
  onLaunch,
  onNavigate,
}: {
  onLaunch: () => void;
  onNavigate: (page: Page) => void;
}) {
  return (
    <div className="landing-root">
      {/* Top Navigation */}
      <header className="landing-header">
        <div className="landing-header-inner">
          <div
            className="landing-brand"
            onClick={onLaunch}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onLaunch();
              }
            }}
          >
            <div className="brand-mark">
              <Sprout size={20} strokeWidth={2} />
            </div>
            <span className="brand-name">
              <span className="brand-nasa">NASA</span><span className="brand-bukid">BUKID</span>
            </span>
          </div>

          <nav className="landing-nav-links" aria-label="Landing navigation">
            <button
              type="button"
              className="landing-nav-link"
              onClick={() => onNavigate("farm")}
            >
              My farm
            </button>
            <button
              type="button"
              className="landing-nav-link"
              onClick={() => onNavigate("prevention")}
            >
              Crop planning
            </button>
            <button
              type="button"
              className="landing-nav-link"
              onClick={() => onNavigate("recovery")}
            >
              Damage recovery
            </button>
            <button
              type="button"
              className="landing-nav-link"
              onClick={() => onNavigate("chat")}
            >
              Field advisor
            </button>
          </nav>

          <div className="landing-header-actions">
            <Button className="landing-launch-btn" onClick={onLaunch}>
              <span>Launch Field Desk</span>
              <ArrowRight size={15} />
            </Button>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section
        className="landing-hero-section landing-hero-photo"
        style={{ backgroundImage: `url(${heroFarmland})` }}
      >
        <div className="landing-hero-content">
          <div className="landing-badge">
            <span className="landing-badge-dot" />
            <Sparkles size={13} />
            <span>NASA Space Apps Challenge 2026 · Bukidnon Agriculture</span>
          </div>

          <h1 className="landing-hero-title">
            Space Data for Grounded Farming.
          </h1>

          <p className="landing-hero-subtitle">
            Harness NASA satellite earth observations, 30+ years of solar and precipitation records,
            and climate-ready crop rotation intelligence to safeguard Bukidnon yields through droughts,
            floods, and changing seasons.
          </p>

          <div className="landing-hero-ctas">
            <Button size="lg" className="landing-cta-primary" onClick={onLaunch}>
              <span>Explore Field Desk</span>
              <ArrowRight size={17} />
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="landing-cta-secondary"
              onClick={() => onNavigate("prevention")}
            >
              <Wheat size={17} />
              <span>Plan Crop Rotations</span>
            </Button>
            <Button
              size="lg"
              variant="ghost"
              className="landing-cta-ghost"
              onClick={() => onNavigate("chat")}
            >
              <MessageCircle size={17} />
              <span>Ask Field Advisor</span>
            </Button>
          </div>

          {/* Social Proof / Key Highlights */}
          <div className="landing-hero-metrics">
            <div className="landing-metric-card">
              <strong>30+ Years</strong>
              <span>NASA POWER Satellite Records</span>
            </div>
            <div className="landing-metric-card">
              <strong>4 Scenarios</strong>
              <span>El Niño, Heavy Rain & Typical</span>
            </div>
            <div className="landing-metric-card">
              <strong>Bukidnon-First</strong>
              <span>Calibrated Upland Soil & Crops</span>
            </div>
            <div className="landing-metric-card">
              <strong>AI Guided</strong>
              <span>Season-Ready Agronomic Advice</span>
            </div>
          </div>
        </div>

        {/* Hero Interactive Preview Card */}
        <div className="landing-hero-preview">
          <div className="hero-preview-window">
            <div className="hero-preview-topbar">
              <span className="window-dot red" />
              <span className="window-dot yellow" />
              <span className="window-dot green" />
              <span className="window-title">NASABUKID Active Intelligence · Bukidnon, Philippines</span>
            </div>
            <div className="hero-preview-body">
              <div className="hero-preview-weather-card">
                <div className="preview-weather-head">
                  <div>
                    <span className="preview-location"><MapPin size={12} /> Bukidnon, Philippines</span>
                    <strong className="preview-temp">26°C</strong>
                  </div>
                  <CloudSun size={36} className="preview-weather-icon" />
                </div>
                <div className="preview-weather-stats">
                  <div><small>HUMIDITY</small><strong>86%</strong></div>
                  <div><small>PRECIPITATION</small><strong>0 mm</strong></div>
                  <div><small>WIND</small><strong>3 km/h</strong></div>
                </div>
              </div>

              <div className="hero-preview-rotation-card">
                <div className="preview-rotation-badge">
                  <Sparkles size={12} /> RECOMMENDED ROTATION
                </div>
                <h3>Corn → Mungbean → Sorghum</h3>
                <p>Nitrogen-fixing legume breaks pest cycles while drought-hardy sorghum secures food security in late season.</p>
                <div className="preview-rotation-footer">
                  <span className="preview-score-pill">Demo Score: 88 / 100</span>
                  <button type="button" className="preview-link-btn" onClick={() => onNavigate("prevention")}>
                    Inspect Model <ArrowRight size={13} />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Core Features Bento Grid */}
      <section className="landing-features-section">
        <div className="landing-section-head">
          <span className="section-eyebrow">BUILT FOR BUKIDNON GROWERS</span>
          <h2>Intelligent tools for resilient agriculture</h2>
          <p>Designed around real field challenges—from unpredictable typhoons to severe dry spells.</p>
        </div>

        <div className="landing-features-grid">
          <div className="landing-feature-card">
            <div className="feature-card-icon map-icon">
              <MapIcon size={24} />
            </div>
            <span className="feature-category">SATELLITE & BOUNDARIES</span>
            <h3>Interactive Farm Mapping</h3>
            <p>Pinpoint your coordinates in Bukidnon or draw your precise field polygon to calculate area and query local satellite history.</p>
            <Button variant="outline" className="feature-card-btn" onClick={() => onNavigate("farm")}>
              <span>Set Farm Boundary</span>
              <ChevronRight size={15} />
            </Button>
          </div>

          <div className="landing-feature-card featured-card">
            <div className="feature-card-icon crop-icon">
              <Wheat size={24} />
            </div>
            <span className="feature-category">CLIMATE ADAPTATION</span>
            <h3>Climate-Ready Rotations</h3>
            <p>Compare diversified 3-crop sequences evaluated across El Niño droughts and heavy rainfall patterns to protect soil organic matter.</p>
            <Button className="feature-card-btn primary" onClick={() => onNavigate("prevention")}>
              <span>Compare Rotations</span>
              <ChevronRight size={15} />
            </Button>
          </div>

          <div className="landing-feature-card">
            <div className="feature-card-icon recovery-icon">
              <HeartHandshake size={24} />
            </div>
            <span className="feature-category">POST-HAZARD RESPONSE</span>
            <h3>Rapid Loss & Replanting</h3>
            <p>Assess crop loss after floods or typhoons with transparent gross revenue calculations, replanting timelines, and salvage guidance.</p>
            <Button variant="outline" className="feature-card-btn" onClick={() => onNavigate("recovery")}>
              <span>Calculate Loss</span>
              <ChevronRight size={15} />
            </Button>
          </div>

          <div className="landing-feature-card">
            <div className="feature-card-icon advisor-icon">
              <MessageCircle size={24} />
            </div>
            <span className="feature-category">DEMO AI ASSISTANT</span>
            <h3>AI Field Advisor</h3>
            <p>Receive conversational, field-aware agronomic guidance powered by Gemini, grounded in your active farm context and scenario data.</p>
            <Button variant="outline" className="feature-card-btn" onClick={() => onNavigate("chat")}>
              <span>Ask Field Guide</span>
              <ChevronRight size={15} />
            </Button>
          </div>
        </div>
      </section>

      {/* How it Works Section */}
      <section className="landing-steps-section">
        <div className="landing-section-head">
          <span className="section-eyebrow">SIMPLE 3-STEP WORKFLOW</span>
          <h2>How NASABUKID powers your season</h2>
        </div>

        <div className="landing-steps-grid">
          <div className="landing-step-card">
            <div className="step-number">01</div>
            <h4>Identify Your Field</h4>
            <p>Select your Bukidnon farm location and boundary to load satellite rainfall and solar data.</p>
          </div>
          <div className="landing-step-card">
            <div className="step-number">02</div>
            <h4>Test Climate Scenarios</h4>
            <p>Simulate upcoming dry spells, typhoons, or wet seasons against proven crop sequences.</p>
          </div>
          <div className="landing-step-card">
            <div className="step-number">03</div>
            <h4>Execute with Clarity</h4>
            <p>Replant with confidence, track recovery economics, and consult your dedicated Field Guide.</p>
          </div>
        </div>
      </section>

      {/* Final Call to Action */}
      <section className="landing-cta-banner">
        <div className="cta-banner-card">
          <div className="cta-banner-content">
            <Sprout size={32} className="cta-sprout-icon" />
            <h2>Ready to prepare your farm for the seasons ahead?</h2>
            <p>Explore climate-smart crop rotations, satellite observations, and demo agronomy tools for Bukidnon.</p>
            <Button size="lg" className="cta-banner-btn" onClick={onLaunch}>
              <span>Open NASABUKID Field Desk</span>
              <ArrowRight size={18} />
            </Button>
          </div>
        </div>
      </section>

      {/* Landing Footer */}
      <footer className="landing-footer">
        <div className="landing-footer-inner">
          <div className="landing-footer-brand">
            <span className="brand-name">
              <span className="brand-nasa">NASA</span><span className="brand-bukid">BUKID</span>
            </span>
            <p>Climate-ready crop planning and recovery intelligence for Bukidnon, Philippines.</p>
          </div>
          <div className="landing-footer-meta">
            <span>NASA Space Apps Challenge 2026 demo</span>
            <span>Historical NASA POWER satellite access · Demo calculations · Gemini advisor</span>
          </div>
        </div>
      </footer>
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
      {/* Quick Actions Row */}
      <div className="agri-quick-actions">
        <Button size="lg" className="agri-btn-primary" onClick={onPlan}>
          <MapPin size={18} /> Set up my farm
        </Button>
        <Button size="lg" className="agri-btn-secondary" variant="outline" onClick={onRecover}>
          <HeartHandshake size={18} /> Check crop damage
        </Button>
      </div>

      <OverviewWeatherWidget
        location={location}
        placeName={farm.place}
        onLocationFound={onLocationFound}
        onOpenFarm={onPlan}
      />

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
                Five demo rotations scored on water, soil, income, and resilience.
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

function PreventionPage({
  farm,
  setFarm,
  cropOptions,
  previousCropOptions,
  terrain,
  historical,
  scenario,
  setScenario,
  rotations,
  selected,
  setSelected,
  onEvidence,
  onChat,
  onEvidencePage,
}: {
  farm: Farm;
  setFarm: React.Dispatch<React.SetStateAction<Farm>>;
  cropOptions: readonly string[];
  previousCropOptions: readonly string[];
  terrain: { elevation: number | null; slopePercent: number | null } | null;
  historical: HistoricalWeather | null;
  scenario: ClimateScenario;
  setScenario: (scenario: ClimateScenario) => void;
  rotations: RotationStrategy[];
  selected: string;
  setSelected: (id: string) => void;
  onEvidence: (id: string) => void;
  onChat: () => void;
  onEvidencePage: () => void;
}) {
  const activeStrategy = rotations.find((item) => item.id === selected) ?? rotations[0]!;
  const monthly = historical ? monthlyWeather(historical.days) : null;
  const advisory = buildSoilAndAgronomyAdvisory({
    nextCrop: activeStrategy.nextCrop,
    previousCrop: farm.previous,
    ph: farm.ph.trim() && Number.isFinite(Number(farm.ph)) ? Number(farm.ph) : null,
    soilTexture: farm.soil,
    drainage: farm.drainage,
    irrigation: farm.irrigation,
    slopePercent: terrain?.slopePercent ?? null,
    elevation: terrain?.elevation ?? null,
    ...(monthly
      ? {
          monthlyRainfall: monthly.map((m) => m.rainfall ?? 0),
          monthlyTemperature: monthly.map((m) => m.temperature ?? 25),
        }
      : {}),
  });

  return (
    <>
      <section className="panel crop-history-bar">
        <div className="crop-history-copy">
          <span className="eyebrow">CROP HISTORY &amp; NEXT-CROP PREDICTOR</span>
          <h3>Compare your current rotation against two alternatives</h3>
          <p>
            Adjust your previous and current crop below. Predictions combine NASA POWER rainfall,
            SoilGrids pH, and terrain slope with transparent trade-offs and information gaps.
          </p>
        </div>
        <div className="crop-history-fields">
          <label>
            Previous crop
            <select
              value={farm.previous}
              onChange={(e) => setFarm((current) => ({ ...current, previous: e.target.value }))}
            >
              {previousCropOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
          <label>
            Current crop
            <select
              value={farm.crop}
              onChange={(e) => setFarm((current) => ({ ...current, crop: e.target.value }))}
            >
              {cropOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
          <label>
            Planned next planting
            <input
              type="date"
              value={farm.planted}
              onChange={(e) => setFarm((current) => ({ ...current, planted: e.target.value }))}
            />
          </label>
        </div>
      </section>
      <div className="scenario-toolbar">
        <div className="scenario-copy">
          <span className="scenario-indicator">
            <Activity size={15} />
          </span>
          <div>
            <strong>Explore demo scoring assumptions.</strong>
            <span>
              NASA charts above use actual records; these scenarios apply only to demo scores.
            </span>
          </div>
        </div>
        <div className="scenario-tabs" role="tablist" aria-label="Climate scenarios">
          {SCENARIOS.map((value) => (
            <button
              key={value}
              role="tab"
              aria-selected={scenario === value}
              className={scenario === value ? "scenario-active" : ""}
              onClick={() => setScenario(value)}
            >
              {value === "Typical" ? (
                <CloudSun size={14} />
              ) : value === "El Niño-like" ? (
                <Sun size={14} />
              ) : (
                <CloudDrizzle size={14} />
              )}
              {value}
            </button>
          ))}
        </div>
      </div>
      <div className="scenario-footnote">
        <span>DEMO SCORING ASSUMPTIONS ONLY</span>
        <span>
          These tabs adjust sample ratings. They do not change NASA observations or classify
          historical ENSO.
        </span>
        <span>NOT A FORECAST</span>
      </div>
      <section className="rotation-section">
        <div className="section-title-row">
          <div>
            <span className="eyebrow">THREE WAYS TO ROTATE</span>
            <h2>A season plan worth considering.</h2>
            <p>
              Published research explains why each option is worth considering. The order still
              comes from demo scores, not a validated comparison of these sequences.
            </p>
          </div>
          <Button variant="outline" onClick={onEvidencePage}>
            <FileText size={15} /> All scoring evidence
          </Button>
        </div>
        <div className="rotation-grid">
          {rotations.map((rotation, index) => (
            <article
              key={rotation.id}
              className={`rotation-card ${selected === rotation.id ? "rotation-selected" : ""}`}
            >
              <div className="rotation-card-top">
                <span className="rotation-rank">
                  <span>{String(index + 1).padStart(2, "0")}</span> {rotation.strategyLabel}
                </span>
                <button
                  className={`rotation-select ${selected === rotation.id ? "rotation-select-on" : ""}`}
                  aria-label={`${selected === rotation.id ? "Selected" : "Select"}: ${rotation.name}`}
                  onClick={() => setSelected(rotation.id)}
                >
                  {selected === rotation.id ? <Check size={14} /> : <span />}
                </button>
              </div>
              <div className="rotation-crop-media">
                <img
                  src={rotation.nextCropImage}
                  alt={`${rotation.nextCrop} crop`}
                  className="rotation-crop-img"
                  loading="lazy"
                />
                <span className="rotation-next-badge">Next crop: {rotation.nextCrop}</span>
              </div>
              <h3>{rotation.name}</h3>
              <p className="rotation-note">{rotation.note}</p>
              <div className="rotation-score">
                <span className="score-number">
                  {rotation.total}
                  <small> / 100</small>
                </span>
                <ScoreRing score={rotation.total} />
                <div className="rotation-rank-caption">
                  {rotation.isCurrentRotation
                    ? "CURRENT BASELINE"
                    : index === 0
                      ? "HIGHEST SAMPLE SCORE"
                      : "ALTERNATIVE ROTATION"}
                </div>
              </div>
              <ScoreBreakdown scores={rotation.scores} />
              <div className="rotation-tradeoffs">
                <div className="tradeoff-col tradeoff-pros">
                  <strong>Pros</strong>
                  <ul>
                    {rotation.pros.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
                <div className="tradeoff-col tradeoff-cons">
                  <strong>Cons &amp; risks</strong>
                  <ul>
                    {rotation.cons.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              </div>
              <div className="rotation-fallow-note">
                <strong>Lay fallow / rest period:</strong> {rotation.layFallowPeriod}
              </div>
              <details className="rotation-pests">
                <summary>
                  Possible pests &amp; diseases ({rotation.pestsAndDiseases.length})
                </summary>
                <div className="pest-list">
                  {rotation.pestsAndDiseases.map((pest) => (
                    <div key={pest.name} className="pest-item">
                      <strong>{pest.name}</strong>
                      <span>
                        <b>Risk window:</b> {pest.riskWindow}
                      </span>
                      <span>
                        <b>Mitigation:</b> {pest.mitigation}
                      </span>
                    </div>
                  ))}
                </div>
              </details>
              <details className="rotation-why-gaps">
                <summary>Why this rotation (satellite evidence &amp; gaps)</summary>
                <div className="why-gaps-body">
                  <strong>Satellite &amp; field signals</strong>
                  <ul>
                    {rotation.satelliteWhy.map((reason) => (
                      <li key={reason}>{reason}</li>
                    ))}
                  </ul>
                  <strong>Information gaps &amp; local review</strong>
                  <ul>
                    {rotation.evidenceGaps.map((gap) => (
                      <li key={gap}>{gap}</li>
                    ))}
                  </ul>
                </div>
              </details>
              <RotationResearch rotationId={rotation.id} drainage={farm.drainage} />
              <RotationEvidence rotation={rotation} farm={farm} historical={historical} />
              <div className="rotation-actions">
                <Button variant="outline" size="sm" onClick={() => onEvidence(rotation.id)}>
                  <FileText size={14} /> View evidence
                </Button>
                <Button variant="ghost" size="sm" onClick={onChat}>
                  <MessageCircle size={14} /> Ask the advisor
                </Button>
              </div>
            </article>
          ))}
        </div>
        <div className="scoring-note">
          <ShieldCheck size={16} />
          <span>
            <strong>Transparent sample scoring.</strong> Weights are water 30%, soil 30%, income
            25%, climate resilience 15%. The displayed total is calculated from these weights and
            scenario-adjusted demo scores.
          </span>
        </div>
      </section>
      <section className="panel agronomy-advisory-panel">
        <div className="section-title-row">
          <div>
            <span className="eyebrow">SOIL, FERTILIZER TIMING &amp; SUITABILITY</span>
            <h2>Field &amp; crop guidance for {activeStrategy.nextCrop}</h2>
            <p>
              Illustrative screening based on SoilGrids pH, terrain slope, and NASA POWER rainfall
              patterns. Confirm with a local soil test and agricultural technician.
            </p>
          </div>
          <span
            className={`suitability-pill suitability-${advisory.suitability.status.toLowerCase().replace(/[^a-z]+/g, "-")}`}
          >
            {advisory.suitability.status}
          </span>
        </div>

        <div className="advisory-grid">
          <div className="advisory-card">
            <h3>Planting suitability &amp; terrain</h3>
            <p className="advisory-summary">{advisory.suitability.summary}</p>
            <ul>
              {advisory.suitability.flags.map((flag) => (
                <li key={flag}>{flag}</li>
              ))}
            </ul>
          </div>

          <div className="advisory-card">
            <h3>Soil pH &amp; mineral needs</h3>
            <p className="advisory-summary">
              <strong>{advisory.soilProfile.phLabel}</strong>
            </p>
            <strong>Minerals likely needed</strong>
            <ul>
              {advisory.soilProfile.mineralsNeeded.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            <strong className="advisory-subhead">Recommended fertilizers</strong>
            <ul>
              {advisory.soilProfile.recommendedFertilizers.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            <strong className="advisory-subhead">Avoid / use with caution</strong>
            <ul>
              {advisory.soilProfile.avoidFertilizers.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>

          <div className="advisory-card">
            <h3>Fertilizer timing by growth stage</h3>
            <div className="fertilizer-stages">
              {advisory.fertilizerStages.map((step) => (
                <div key={step.stage} className="fertilizer-stage-item">
                  <div className="stage-header">
                    <strong>{step.stage}</strong>
                    <span>{step.timing}</span>
                  </div>
                  <p>{step.guidance}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="advisory-card">
            <h3>Planting window &amp; pest climate</h3>
            <div className="climate-timing-block">
              <strong>Best time to plant</strong>
              <p>{advisory.climateTiming.bestPlantingWindow}</p>
            </div>
            <div className="climate-timing-block">
              <strong>When pests &amp; diseases peak</strong>
              <p>{advisory.climateTiming.prominentPestClimate}</p>
            </div>
          </div>
        </div>
      </section>
    </>
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
}) {
  const HazardIcon = HAZARD_RATES[hazard].icon;
  return (
    <div className="recovery-layout">
      <div className="recovery-left">
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
              01 <span>/ 03</span>
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
        </section>
      </div>
      <aside className="recovery-right">
        <HistoricalWeatherPanel
          key={`${location.latitude}:${location.longitude}:${damageDate}`}
          location={location}
          eventDate={damageDate}
          onLoaded={onWeather}
        />
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
              02 <span>/ 03</span>
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
            <Button disabled={!farm.planted || farm.planted < damageDate} onClick={onPlan}>
              Compare next-season options <ArrowRight size={15} />
            </Button>
            <Button variant="ghost" onClick={onChat}>
              <MessageCircle size={15} /> Talk it through
            </Button>
          </div>
          <span className="step-number recovery-step">
            03 <span>/ 03</span> <span>YOUR NEXT SEASON</span>
          </span>
        </section>
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

function EvidencePage({
  rotations,
  scenario,
  selected,
  setSelected,
  onChat,
}: {
  rotations: ReturnType<typeof rotationsForScenario>;
  scenario: ClimateScenario;
  selected: string;
  setSelected: (id: string) => void;
  onChat: () => void;
}) {
  const current = rotations.find((rotation) => rotation.id === selected) ?? rotations[0]!;
  const rank = rotations.findIndex((rotation) => rotation.id === current.id);
  return (
    <div className="evidence-page">
      <div className="panel evidence-overview">
        <div className="evidence-illustration">
          <div className="evidence-orbit orbit-one" />
          <div className="evidence-orbit orbit-two" />
          <span>
            <FlaskConical size={25} />
          </span>
        </div>
        <div>
          <span className="eyebrow">SCORING METHODOLOGY</span>
          <h2>Clear agronomic principles</h2>
          <p>
            Rotations are compared on four weighted factors. The weather charts add historical
            rainfall and temperature context from NASA records.
          </p>
        </div>
      </div>
      <div className="evidence-columns">
        <section className="panel evidence-factor-panel">
          <div className="panel-top">
            <div>
              <span className="panel-eyebrow">
                <BarChart3 size={13} /> HOW ROTATIONS ARE COMPARED
              </span>
              <h2>Four weighted factors</h2>
            </div>
          </div>
          <div className="weighted-rows">
            {[
              {
                key: "water",
                label: "Water efficiency",
                weight: 30,
                Icon: Droplets,
                color: "factor-water",
                explain: "Ability to fit the selected rainfall scenario.",
              },
              {
                key: "soil",
                label: "Soil health",
                weight: 30,
                Icon: Sprout,
                color: "factor-soil",
                explain: "Value of legumes and crop breaks.",
              },
              {
                key: "income",
                label: "Income potential",
                weight: 25,
                Icon: BarChart3,
                color: "factor-income",
                explain: "Relative return and market value.",
              },
              {
                key: "resilience",
                label: "Climate resilience",
                weight: 15,
                Icon: ShieldCheck,
                color: "factor-resilience",
                explain: "Flexibility under variable weather.",
              },
            ].map(({ key, label, weight, Icon, color, explain }) => (
              <div className="weighted-row" key={key}>
                <span className={`factor-icon ${color}`}>
                  <Icon size={15} />
                </span>
                <span className="factor-label">
                  <strong>{label}</strong>
                  <small>{explain}</small>
                </span>
                <span className="factor-weight">
                  {weight}
                  <small>%</small>
                </span>
                <span className="weight-bar">
                  <i className={color} style={{ width: `${(weight * 10) / 3.5}%` }} />
                </span>
              </div>
            ))}
          </div>
          <p className="evidence-footnote">
            Every factor is scored from 0 to 100. The weighted total is rounded to one decimal.
          </p>
        </section>
        <section className="panel evidence-score-panel">
          <div className="panel-top">
            <div>
              <span className="panel-eyebrow">
                <BadgeCheck size={13} /> ROTATION SCORECARD
              </span>
              <h2>{scenario} scenario</h2>
            </div>
            <select
              aria-label="Choose rotation for evidence"
              className="compact-select"
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
            >
              {rotations.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </div>
          <div className="evidence-total-row">
            <span>
              <strong>{current.total}</strong>
              <small> / 100</small>
            </span>
            <span className="rank-pill">
              Rank {rank + 1} of {rotations.length}
            </span>
          </div>
          <ScoreBreakdown scores={current.scores} showWeight />
        </section>
      </div>
      <section className="panel evidence-sources">
        <div className="panel-top">
          <div>
            <span className="panel-eyebrow">
              <FileText size={13} /> DATA SOURCES
            </span>
            <h2>Where the context comes from</h2>
          </div>
        </div>
        <div className="source-grid">
          {[
            {
              icon: Thermometer,
              name: "Satellite Weather Records",
              label: "Climate context",
              description:
                "Historical rainfall and temperature can be loaded by farm coordinates and date in crop planning and recovery.",
            },
            {
              icon: Activity,
              name: "NOAA ENSO",
              label: "Potential climate signal",
              description:
                "Seasonal climate signals add context to planning discussions, not a farm-level forecast.",
            },
            {
              icon: Leaf,
              name: "Crop guides",
              label: "Agronomy & rotation",
              description:
                "Philippine crop guides and local extension advice should inform real planting decisions.",
            },
          ].map(({ icon: Icon, name, label, description }) => (
            <div className="source-item" key={name}>
              <span className="source-icon">
                <Icon size={17} />
              </span>
              <span className="source-meta">
                <strong>{name}</strong>
                <span>{description}</span>
              </span>
              <span className="source-status">
                {name === "Satellite Weather Records" ? "CONNECTED" : "PLANNED"}
              </span>
            </div>
          ))}
        </div>
        <div className="uncertainty-note">
          <CircleHelp size={16} />
          <span>
            <strong>Farmer guidance:</strong> Local soil testing, seasonal forecasts, and advice
            from Bukidnon agricultural extension staff support real-world decisions.
          </span>
        </div>
      </section>
      <div className="evidence-chat-row">
        <span>Want to see the score broken down in plain language?</span>
        <Button onClick={onChat}>
          <MessageCircle size={15} /> Ask the field advisor <ArrowRight size={15} />
        </Button>
      </div>
    </div>
  );
}

function ChatPage({
  farm,
  messages,
  busy,
  input,
  setInput,
  onSend,
  onSuggestion,
  scenario,
  rotation,
  hazard,
  loss,
  advisorWorkflow,
  setAdvisorWorkflow,
}: {
  farm: Farm;
  messages: ChatMessage[];
  busy: boolean;
  input: string;
  setInput: (input: string) => void;
  onSend: (question?: string) => void;
  onSuggestion: (question: string) => void;
  scenario: ClimateScenario;
  rotation: string;
  hazard: Hazard;
  loss: string;
  advisorWorkflow: "recovery" | "prevention";
  setAdvisorWorkflow: (workflow: "recovery" | "prevention") => void;
}) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [messages, busy]);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!input.trim() || busy) return;
    onSend();
  }

  const suggestions =
    advisorWorkflow === "recovery"
      ? SUGGESTIONS_BY_WORKFLOW.recovery
      : SUGGESTIONS_BY_WORKFLOW.prevention;

  return (
    <div className="chat-layout-stacked">
      {/* Box 1: Picking up where you left off (4 Columns) */}
      <section className="panel chat-context-summary-panel">
        <div className="chat-context-summary-head">
          <h2>Picking up where you left off.</h2>
        </div>

        <div className="chat-context-four-columns">
          {/* Column 1 */}
          <div className="chat-context-card">
            <span className="context-icon">
              <MapPin size={18} />
            </span>
            <div className="context-card-info">
              <small>FIELD PROFILE</small>
              <strong>{farm.place || "Location not set"}</strong>
              <span>
                {farm.area} hectares · {farm.soil || "Soil unverified"}
              </span>
            </div>
          </div>

          {/* Column 2 */}
          <div className="chat-context-card">
            <span className="context-icon context-climate">
              <CloudSun size={18} />
            </span>
            <div className="context-card-info">
              <small>PLANNING SCENARIO</small>
              <strong>{scenario}</strong>
              <span>Climate scenario</span>
            </div>
          </div>

          {/* Column 3 */}
          <div className="chat-context-card">
            <span className="context-icon context-crop">
              <Flower2 size={18} />
            </span>
            <div className="context-card-info">
              <small>ROTATION SEQUENCE</small>
              <strong>{rotation}</strong>
              <span>Crop sequence</span>
            </div>
          </div>

          {/* Column 4 */}
          <div className="chat-context-card">
            <span className="context-icon context-hazard">
              <HeartHandshake size={18} />
            </span>
            <div className="context-card-info">
              <small>RECOVERY ESTIMATE</small>
              <strong>
                {hazard} · {loss}
              </strong>
              <span>Projected recovery</span>
            </div>
          </div>
        </div>
      </section>

      {/* Box 2: Field Advisor (Full width of the page) */}
      <section className="panel advisor-panel-fullwidth">
        <div className="advisor-head">
          <div className="advisor-identity">
            <div className="advisor-avatar">
              <Sprout size={24} strokeWidth={2.2} />
            </div>
            <div className="advisor-title-wrap">
              <strong>Your NASABUKID guide</strong>
              <span>
                <span className="advisor-status-dot" />
                AI Field Guide
              </span>
            </div>
          </div>

          <div className="advisor-segmented-control" role="tablist" aria-label="Advice focus">
            <button
              type="button"
              role="tab"
              aria-selected={advisorWorkflow === "prevention"}
              className={`advisor-seg-btn ${advisorWorkflow === "prevention" ? "advisor-seg-active" : ""}`}
              onClick={() => setAdvisorWorkflow("prevention")}
            >
              <Wheat size={15} />
              <span>Crop planning</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={advisorWorkflow === "recovery"}
              className={`advisor-seg-btn ${advisorWorkflow === "recovery" ? "advisor-seg-active" : ""}`}
              onClick={() => setAdvisorWorkflow("recovery")}
            >
              <HeartHandshake size={15} />
              <span>Damage recovery</span>
            </button>
          </div>
        </div>

        <div className="chat-messages" aria-live="polite">
          {messages.map((message, index) => (
            <div
              key={index}
              className={`chat-row ${message.role === "user" ? "chat-row-user" : ""}`}
            >
              <span className={`chat-avatar ${message.role === "user" ? "chat-user-avatar" : ""}`}>
                {message.role === "assistant" ? <Sprout size={18} /> : "B"}
              </span>
              <div className={`chat-bubble ${message.role === "user" ? "chat-user-bubble" : ""}`}>
                <span className="chat-role">
                  {message.role === "assistant" ? (
                    <>
                      <Sparkles size={12} /> FIELD GUIDE
                    </>
                  ) : (
                    "YOU"
                  )}
                </span>
                <p>{message.text}</p>
              </div>
            </div>
          ))}
          {busy && (
            <div className="chat-row">
              <span className="chat-avatar">
                <Sprout size={18} />
              </span>
              <div className="chat-bubble">
                <span className="chat-role">
                  <Sparkles size={12} /> FIELD GUIDE
                </span>
                <div className="typing-indicator" aria-label="Advisor thinking">
                  <span className="typing-dot" />
                  <span className="typing-dot" />
                  <span className="typing-dot" />
                </div>
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        <div className="suggested-questions">
          <span className="suggestion-heading">
            <Sparkles size={13} /> SUGGESTED QUESTIONS
          </span>
          <div className="suggestion-chips-scroller">
            {suggestions.map((question) => (
              <button key={question} type="button" onClick={() => onSuggestion(question)}>
                <span>{question}</span>
                <ArrowUpRight size={14} />
              </button>
            ))}
          </div>
        </div>

        <form className="chat-input-row" onSubmit={handleSubmit}>
          <Textarea
            aria-label="Ask a question"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                handleSubmit(event);
              }
            }}
            placeholder="Ask a question..."
            rows={1}
            maxLength={1200}
          />
          <Button
            type="submit"
            size="icon"
            aria-label="Send question"
            disabled={!input.trim() || busy}
          >
            <Send size={18} />
          </Button>
        </form>

        <span className="chat-safety">
          <ShieldCheck size={15} className="shrink-0" />
          <span>
            Verify critical agronomic decisions with a local agricultural officer.
          </span>
        </span>
      </section>
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

function ScoreBreakdown({
  scores,
  showWeight = false,
}: {
  scores: { water: number; soil: number; income: number; resilience: number };
  showWeight?: boolean;
}) {
  const metrics: Array<{
    key: keyof typeof scores;
    label: string;
    weight: number;
  }> = [
    { key: "water", label: "Water", weight: 30 },
    { key: "soil", label: "Soil", weight: 30 },
    { key: "income", label: "Income", weight: 25 },
    { key: "resilience", label: "Resilience", weight: 15 },
  ];
  return (
    <div className={`score-breakdown ${showWeight ? "score-breakdown-expanded" : ""}`}>
      {metrics.map((metric) => (
        <div key={metric.key} className="score-factor">
          <div>
            <span>
              {metric.label}
              {showWeight && <small> × {metric.weight}%</small>}
            </span>
            <strong>{scores[metric.key]}</strong>
          </div>
          <div className="score-track">
            <span
              className={`score-fill score-${metric.key}`}
              style={{ width: `${scores[metric.key]}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function ScoreRing({ score }: { score: number }) {
  return (
    <div
      className="score-ring"
      style={{ "--score-angle": `${score * 3.6}deg` } as React.CSSProperties}
    >
      <span>
        <Leaf size={13} />
      </span>
    </div>
  );
}
