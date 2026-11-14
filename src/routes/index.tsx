import { RotationResearch } from "@/components/rotation-research";
import { RotationEvidence } from "@/components/rotation-evidence";
import { ApiSources } from "@/components/api-sources";
import { FarmPublicData, type ContextFields } from "@/components/farm-public-data";
import { measureFarmBoundary } from "@/lib/farm-boundary";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  Activity, ArrowDown, ArrowLeft, ArrowRight, ArrowUpRight, BadgeCheck, BarChart3, Bot,
  CalendarDays, Check, ChevronDown, ChevronRight, CircleHelp, CloudDrizzle, CloudSun,
  Compass, Droplets, FileText, FlaskConical, Flower2, HeartHandshake, ImagePlus, Leaf,
  Map, MapPin, Menu, MessageCircle, Mountain, RotateCcw, Send, ShieldCheck, Sprout, Sun,
  Thermometer, Upload, Waves, Wind, X,
} from "lucide-react";
import bukidnonFields from "@/assets/bukidnon-fields.jpg";
import floodCorn from "@/assets/sample-flooded-corn.jpg";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FarmMap } from "@/components/farm-map";
import { FullFarmMap } from "@/components/full-farm-map";
import { HistoricalWeatherPanel } from "@/components/historical-weather";
import { coordinatesSchema, type Coordinates, type HistoricalWeather } from "@/lib/nasa-power";
import {
  calculateEstimatedLoss, type ClimateScenario, rotationsForScenario, rotationsForFarm,
  SAMPLE_CORN_PRICE_PER_KG, SAMPLE_YIELD_KG_PER_HA,
} from "@/lib/fieldshift-demo";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "FieldShift AI | Climate-Ready Crop Planning" },
      { name: "description", content: "Explore a clearly labeled demo for Bukidnon crop rotation planning and crop damage recovery." },
      { property: "og:title", content: "FieldShift AI | Climate-Ready Crop Planning" },
      { property: "og:description", content: "A demo dashboard for climate-ready crop rotations and farm recovery in Bukidnon, Philippines." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: FieldShift,
});

type Page = "overview" | "farm" | "fullmap" | "prevention" | "recovery" | "evidence" | "chat";
type Hazard = "Flooding" | "Drought" | "Typhoon" | "Heat";
type Farm = { place: string; area: string; crop: string; previous: string; ph: string; soil: string; irrigation: string; drainage: string; planted: string };
type ChatMessage = { role: "assistant" | "user"; text: string };
const NAV: Array<{ id: Page; label: string; icon: typeof Leaf; section: string }> = [
  { id: "overview", label: "Overview", icon: Compass, section: "WORKSPACE" },
  { id: "farm", label: "My farm", icon: Sprout, section: "WORKSPACE" },
  { id: "fullmap", label: "Full Map (New)", icon: Map, section: "WORKSPACE" },
  { id: "prevention", label: "Crop planning", icon: Flower2, section: "WORKSPACE" },
  { id: "recovery", label: "Damage recovery", icon: HeartHandshake, section: "WORKSPACE" },
  { id: "evidence", label: "Evidence & sources", icon: FileText, section: "INSIGHTS" },
  { id: "chat", label: "Field advisor", icon: MessageCircle, section: "INSIGHTS" },
];
const SCENARIOS: ClimateScenario[] = ["Typical", "El Niño-like", "Wet"];
const SUGGESTED_QUESTIONS = ["Why plant a legume after corn?", "What changes in a dry season?", "How was my loss estimate calculated?"];
const SEED_FARM: Farm = { place: "Location not identified", area: "4.2", crop: "Corn", previous: "Mungbean", ph: "", soil: "", irrigation: "Unknown", drainage: "Unknown", planted: "2026-06-15" };
const HAZARD_RATES: Record<Hazard, { affected: number; yieldLoss: number; observation: string; icon: typeof Waves }> = {
  Flooding: { affected: 65, yieldLoss: 35, observation: "Standing water observed between rows; sample leaf yellowing and stem lodging visible." , icon: Waves },
  Drought: { affected: 50, yieldLoss: 28, observation: "Sample observation: leaf curling and dry surface soil are consistent with water stress." , icon: Sun },
  Typhoon: { affected: 75, yieldLoss: 42, observation: "Sample observation: wind lodging and damaged leaf tissue may reduce harvestable yield." , icon: Wind },
  Heat: { affected: 45, yieldLoss: 25, observation: "Sample observation: leaf-edge scorch and midday wilting may indicate heat stress." , icon: Thermometer },
};
const PHP = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", maximumFractionDigits: 0 });

function FieldShift() {
  const [page, setPage] = useState<Page>("overview");
  const [farm, setFarm] = useState<Farm>(SEED_FARM);
  const [stored, setStored] = useState(false);
  const [location, setLocation] = useState<Coordinates>({ latitude: 8.3, longitude: 125.0 });
  const [locationConfirmed, setLocationConfirmed] = useState(false);
  const [boundary, setBoundary] = useState<Coordinates[]>([]);
  const [historical, setHistorical] = useState<HistoricalWeather | null>(null);
  const [price, setPrice] = useState(String(SAMPLE_CORN_PRICE_PER_KG));
  const [expectedYield, setExpectedYield] = useState(String(SAMPLE_YIELD_KG_PER_HA));
  const [scenario, setScenario] = useState<ClimateScenario>("Typical");
  const [hazard, setHazard] = useState<Hazard>("Flooding");
  const [damageDate, setDamageDate] = useState("2026-10-29");
  const [affected, setAffected] = useState(65);
  const [yieldLoss, setYieldLoss] = useState(35);
  const [photo, setPhoto] = useState<{ src: string; name: string; sample: boolean }>({ src: floodCorn, name: "Sample · waterlogged corn", sample: true });
  const [selectedRotation, setSelectedRotation] = useState("legume");
  const [evidenceRotation, setEvidenceRotation] = useState("legume");
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([{ role: "assistant", text: "Hi there. I’m your FieldShift demo advisor. I can walk through this sample plan, farm profile, or recovery estimate. What would you like to explore?" }]);
  const [chatBusy, setChatBusy] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const uploadRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem("fieldshift-demo-farm");
      if (saved) {
        const parsed: unknown = JSON.parse(saved);
        if (parsed && typeof parsed === "object") {
          const fields = Object.fromEntries(Object.entries(parsed).filter(([key, value]) => key in SEED_FARM && typeof value === "string"));
          setFarm({ ...SEED_FARM, ...fields });
        }
      }
      const savedLocation = window.localStorage.getItem("fieldshift-location");
      if (savedLocation) { const parsed = coordinatesSchema.safeParse(JSON.parse(savedLocation)); if (parsed.success) setLocation(parsed.data); }
      setLocationConfirmed(window.localStorage.getItem("fieldshift-location-confirmed") === "true");
      const savedBoundary = window.localStorage.getItem("fieldshift-boundary");
      if (savedBoundary) {
        const points: unknown = JSON.parse(savedBoundary);
        if (Array.isArray(points) && points.length) {
          const measured = measureFarmBoundary(points);
          setBoundary(measured.points);
          setLocationConfirmed(true);
          setFarm(current => ({ ...current, area: measured.hectares.toFixed(4) }));
          setLocation(measured.reference);
        }
      }
    } catch { /* Keep the demo profile when browser storage is unavailable. */ }
    setStored(true);
  }, []);

  useEffect(() => {
    if (!stored) return;
    try {
      window.localStorage.setItem("fieldshift-demo-farm", JSON.stringify(farm));
      window.localStorage.setItem("fieldshift-location", JSON.stringify(location));
      window.localStorage.setItem("fieldshift-boundary", JSON.stringify(boundary));
      window.localStorage.setItem("fieldshift-location-confirmed", String(locationConfirmed));
    } catch { /* Continue without persistence when browser storage is unavailable. */ }
  }, [farm, location, boundary, locationConfirmed, stored]);

  function updateLocation(next: Coordinates) { setLocation(next); setBoundary([]); setHistorical(null); setLocationConfirmed(true); setFarm(current => ({ ...current, place: "Location not identified", ph: "", soil: "", irrigation: "Unknown", drainage: "Unknown" })); }
  function updateBoundary(points: Coordinates[]) {
    setBoundary(points);
    if (points.length) {
      const measured = measureFarmBoundary(points);
      setFarm(current => ({ ...current, area: measured.hectares.toFixed(4) }));
      setLocation(measured.reference);
      setLocationConfirmed(true);
      setFarm(current => ({ ...current, place: "Location not identified", ph: "", soil: "", irrigation: "Unknown", drainage: "Unknown" }));
      setHistorical(null);
    }
  }
  const monthlyRainfall = historical ? Array.from({ length: 12 }, (_, month) => historical.days
    .filter(day => Number(day.date.slice(5, 7)) === month + 1)
    .reduce((sum, day) => sum + (day.rainfall ?? 0), 0)) : undefined;

  const rotations = rotationsForFarm(scenario, {
    ph: farm.ph.trim() ? Number(farm.ph) : NaN, drainage: farm.drainage, irrigation: farm.irrigation, planted: farm.planted,
    ...(monthlyRainfall ? { monthlyRainfall } : {}),
  });
  const activeRotation = rotations.find((rotation) => rotation.id === selectedRotation) ?? rotations[0]!;
  const evidenceItem = rotations.find((rotation) => rotation.id === evidenceRotation) ?? rotations[0]!;
  const validLossInputs = [farm.area, expectedYield, price].every(value => value.trim() !== "" && Number.isFinite(Number(value)) && Number(value) >= 0) && Number(farm.area) * Number(expectedYield) * Number(price) <= Number.MAX_SAFE_INTEGER;
  const area = validLossInputs ? Number(farm.area) : 0;
  const loss = calculateEstimatedLoss({ areaHectares: area, affectedFraction: affected / 100, expectedYieldKgPerHectare: validLossInputs ? Number(expectedYield) : 0, yieldLossFraction: yieldLoss / 100, pricePerKg: validLossInputs ? Number(price) : 0 });

  const lossLabel = validLossInputs ? PHP.format(loss) : "unavailable until valid assumptions are entered";

  function goTo(next: Page) {
    setPage(next);
    setMobileNavOpen(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function applyContext(fields: ContextFields) {
    setFarm(current => ({ ...current,
      ...((!current.place || current.place === "Location not identified") && fields.place ? { place: fields.place } : {}),
      ...(!current.ph && fields.ph !== undefined ? { ph: fields.ph } : {}),
      ...(!current.soil && fields.soil ? { soil: fields.soil } : {}),
      ...(fields.drainage ? { drainage: fields.drainage } : {}),
    }));
  }

  function updateFarm(key: keyof Farm, value: string) {
    setFarm((current) => ({ ...current, [key]: value }));
  }

  function pickPhoto(file?: File) {
    if (!file || !file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") setPhoto({ src: reader.result, name: file.name, sample: false });
    };
    reader.readAsDataURL(file);
  }

  function changeHazard(next: Hazard) {
    setHazard(next);
    setAffected(HAZARD_RATES[next].affected);
    setYieldLoss(HAZARD_RATES[next].yieldLoss);
  }

  async function sendQuestion(question = chatInput) {
    const text = question.trim();
    if (!text || chatBusy) return;
    setChatBusy(true);
    setChatMessages((messages) => [...messages, { role: "user", text }]);
    setChatInput("");
    try {
      const response = await fetch("/api/advisor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(20_000),
        body: JSON.stringify({ question: text, context: JSON.stringify({ farm, scenario, rotation: activeRotation.name, hazard, loss: lossLabel }) }),
      });
      if (!response.ok) throw new Error(await response.text());
      const { answer } = await response.json() as { answer: string };
      setChatMessages((messages) => [...messages, { role: "assistant", text: answer }]);
    } catch (error) {
      setChatMessages((messages) => [...messages, { role: "assistant", text: error instanceof Error && error.name === "TimeoutError" ? "The advisor took too long. Please try again." : error instanceof Error ? error.message : "The advisor is unavailable right now." }]);
    } finally { setChatBusy(false); }
  }

  const pageTitle: Record<Page, string> = { overview: "Your farm, better prepared.", farm: "A little about your farm.", fullmap: "Interactive satellite field map.", prevention: "Plan for the season ahead.", recovery: "Let’s understand what happened.", evidence: "See what’s behind each score.", chat: "A field-side sounding board." };

  return (
    <div className="app-shell">
      {mobileNavOpen && <button className="mobile-scrim" aria-label="Close menu" onClick={() => setMobileNavOpen(false)} />}
      <aside className={`sidebar ${mobileNavOpen ? "sidebar-open" : ""}`}>
        <div className="brand"><div className="brand-mark"><Sprout size={21} strokeWidth={1.8} /></div><div><span className="brand-name">fieldshift<span className="brand-ai">ai</span></span><span className="brand-caption">GROW WITH CONFIDENCE</span></div><button className="sidebar-close" aria-label="Close menu" onClick={() => setMobileNavOpen(false)}><X size={18} /></button></div>
        <div className="workspace-label">YOUR FIELD DESK <ChevronDown size={14} /></div>
        <div className="sidebar-location"><MapPin size={15} /><div><strong>{farm.place}</strong><span>Selected farm reference</span></div><span className="location-dot" /></div>
        <nav className="main-nav" aria-label="Main navigation">
          {NAV.map((item, index) => {
            const Icon = item.icon;
            return <div key={item.id}>{(index === 0 || NAV[index - 1]?.section !== item.section) && <span className="nav-section">{item.section}</span>}<button className={`nav-item ${page === item.id ? "nav-item-active" : ""}`} onClick={() => goTo(item.id)}><Icon size={17} strokeWidth={1.8} /><span>{item.label}</span>{item.id === "recovery" && <span className="nav-live-dot" />}</button></div>;
          })}
        </nav>
        <div className="sidebar-foot"><div className="guide-avatar"><Mountain size={17} /></div><div><span>BUKIDNON FIELD GUIDE</span><strong>Farmer-first, season-ready.</strong></div><button className="sidebar-help" title="Get friendly, sample-based planning guidance" aria-label="Get field guidance" onClick={() => goTo("chat")}><CircleHelp size={17} /></button></div>
      </aside>

      <main className="main-area">
        <header className="topbar"><div className="topbar-left"><Button size="icon" variant="ghost" className="mobile-menu" aria-label="Open menu" onClick={() => setMobileNavOpen(true)}><Menu /></Button><span className="crumb">FIELD DESK</span><ChevronRight size={14} className="crumb-divider" /><span className="crumb-current">{NAV.find((item) => item.id === page)?.label ?? "Overview"}</span></div><div className="topbar-right"><span className="demo-label"><span className="demo-dot" /> DEMO SCORES</span><span className="user-chip"><span className="user-avatar">B</span><span className="user-name">Bukidnon grower</span><ChevronDown size={14} /></span></div></header>
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
          />
        ) : (
        <div className="page-wrap">
          <div className="page-intro"><div><span className="eyebrow">FIELD NOTES <span className="eyebrow-dot" /> BUKIDNON, PHILIPPINES</span><h1>{pageTitle[page]}</h1><p className="intro-copy">{page === "overview" ? "Grounded crop planning for a changing climate — shaped around the way your farm grows." : page === "farm" ? "Every field is different. Let’s make these sample recommendations feel a little more like yours." : page === "prevention" ? "Explore historical NASA weather for your farm and compare illustrative crop rotations." : page === "recovery" ? "Share a little about the damage. This sample estimate is a starting point for your next steps." : page === "evidence" ? "A transparent look at sample scoring, calculations, and the resources that could inform a real plan." : page === "chat" ? "Have a question about your sample plan? Let’s think it through together." : ""}</p></div>{page !== "overview" && <Button variant="outline" className="intro-home" onClick={() => goTo("overview")}><ArrowLeft size={16} /> Overview</Button>}</div>

          {page === "overview" && <OverviewPage farm={farm} onPlan={() => goTo("farm")} onRecover={() => goTo("recovery")} onPrevention={() => goTo("prevention")} onChat={() => goTo("chat")} />}
          {page === "farm" && <FarmPage farm={farm} location={location} boundary={boundary} onBoundary={updateBoundary} onLocation={updateLocation} onUpdate={updateFarm} onContinue={() => goTo("prevention")} />}
          {page === "prevention" && <>
            <HistoricalWeatherPanel location={location} onUse={setHistorical} monthlyCharts />
            {historical && <div className="note-strip"><ShieldCheck size={16} /><span>Demo water context: actual NASA rainfall from {historical.start} to {historical.end}, using your planting month. Other ratings and thresholds remain illustrative. The charts above show the selected NASA year.</span><button onClick={() => setHistorical(null)}>Clear historical context</button></div>}
            <PreventionPage farm={farm} historical={historical} scenario={scenario} setScenario={(next) => { setScenario(next); setHistorical(null); }} rotations={rotations} selected={selectedRotation} setSelected={setSelectedRotation} onEvidence={(id) => { setEvidenceRotation(id); setEvidenceOpen(true); }} onChat={() => goTo("chat")} onEvidencePage={() => goTo("evidence")} /></>}
          {page === "recovery" && <RecoveryPage farm={farm} hazard={hazard} setHazard={changeHazard} damageDate={damageDate} setDamageDate={setDamageDate} affected={affected} setAffected={setAffected} yieldLoss={yieldLoss} setYieldLoss={setYieldLoss} price={price} setPrice={setPrice} expectedYield={expectedYield} setExpectedYield={setExpectedYield} validLossInputs={validLossInputs} onUpdateFarm={updateFarm} location={location} photo={photo} pickPhoto={pickPhoto} uploadRef={uploadRef} loss={loss} onPlan={() => goTo("prevention")} onChat={() => goTo("chat")} />}
          {page === "evidence" && <EvidencePage rotations={rotations} scenario={scenario} selected={evidenceRotation} setSelected={setEvidenceRotation} onChat={() => goTo("chat")} />}
          {page === "chat" && <ChatPage farm={farm} messages={chatMessages} busy={chatBusy} input={chatInput} setInput={setChatInput} onSend={sendQuestion} onSuggestion={sendQuestion} scenario={scenario} rotation={activeRotation.name} hazard={hazard} loss={lossLabel} />}

          <ApiSources />
          <footer className="page-footer"><span><Sprout size={14} /> Made for the seasons ahead.</span><span>FieldShift AI <span className="footer-divider">·</span> NASA Space Apps demo <span className="footer-divider">·</span> Historical NASA access · Demo scores · Gemini advisor</span></footer>
        </div>
        )}
        <div hidden={page !== "farm"}><FarmPublicData location={location} confirmed={locationConfirmed} onApply={applyContext} /></div>
      </main>

      <Dialog open={evidenceOpen} onOpenChange={setEvidenceOpen}>
        <DialogContent className="evidence-dialog">
          <DialogHeader><span className="eyebrow">SCORECARD <span className="eyebrow-dot" /> DEMO ESTIMATE</span><DialogTitle>{evidenceItem?.name ?? "Rotation details"}</DialogTitle><DialogDescription>Illustrative score and evidence notes. These are planning examples—not verified field results.</DialogDescription></DialogHeader>
          {evidenceItem && <><div className="modal-total"><span>{evidenceItem.total}</span><span> / 100 weighted score</span><span className="rank-pill">{rotations.findIndex((entry) => entry.id === evidenceItem.id) === 0 ? "TOP SAMPLE MATCH" : "ALTERNATIVE"}</span></div><ScoreBreakdown scores={evidenceItem.scores} /><p className="modal-note">{evidenceItem.note}</p><Button className="w-full" onClick={() => { setEvidenceOpen(false); goTo("chat"); }}>Ask the field advisor <ArrowRight size={16} /></Button></>}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function OverviewPage({ farm, onPlan, onRecover, onPrevention, onChat }: { farm: Farm; onPlan: () => void; onRecover: () => void; onPrevention: () => void; onChat: () => void }) {
  return <>
    <section className="welcome-hero"><img src={bukidnonFields} alt="Farms nestled in the green highlands of Bukidnon" width={1600} height={960} /><div className="hero-scrim" /><div className="hero-content"><span className="hero-overline"><span className="hero-spark" /> A NEW SEASON, A CLEARER VIEW</span><h2>Rooted in your land.<br />Ready for what’s next.</h2><p>A thoughtful first step for <strong>{farm.area} hectares</strong> in <strong>{farm.place}</strong>.</p><div className="hero-actions"><Button size="lg" className="hero-primary" onClick={onPlan}><Sprout size={17} /> Plan my crops <ArrowRight size={16} /></Button><Button size="lg" className="hero-secondary" variant="outline" onClick={onRecover}><Activity size={17} /> Assess crop damage</Button></div></div><div className="hero-bottom"><span><MapPin size={13} /> IMPASUG-ONG HIGHLANDS <span className="hero-bottom-sep">·</span> BUKIDNON</span><span>DEMO LANDSCAPE <span className="hero-bottom-sep">·</span> NOT A SATELLITE IMAGE</span></div></section>
    <div className="home-section-heading"><div><span className="eyebrow">YOUR STARTING POINT</span><h2>A few useful next steps.</h2></div><span className="updated-label"><span className="updated-check"><Check size={12} /></span> Sample farm profile loaded</span></div>
    <div className="overview-cards"><button className="workspace-card planner-card" onClick={onPrevention}><div className="workspace-card-top"><span className="workspace-icon mint-icon"><CloudSun size={20} /></span><span className="card-arrow"><ArrowUpRight size={17} /></span></div><span className="card-kicker">01 <span>·</span> PLAN AHEAD</span><strong>Find a rotation that fits.</strong><span className="workspace-copy">Compare sample crop sequences against a dry, typical, or wetter season.</span><span className="workspace-link">Explore crop planning <ArrowRight size={14} /></span></button><button className="workspace-card recovery-card" onClick={onRecover}><div className="workspace-card-top"><span className="workspace-icon peach-icon"><HeartHandshake size={20} /></span><span className="card-arrow"><ArrowUpRight size={17} /></span></div><span className="card-kicker">02 <span>·</span> RECOVER</span><strong>Find a way forward.</strong><span className="workspace-copy">Try a sample crop-damage check and estimate a possible income impact.</span><span className="workspace-link">Start a damage check <ArrowRight size={14} /></span></button><button className="workspace-card advisor-card" onClick={onChat}><div className="workspace-card-top"><span className="workspace-icon lilac-icon"><MessageCircle size={20} /></span><span className="card-arrow"><ArrowUpRight size={17} /></span></div><span className="card-kicker">03 <span>·</span> TALK IT THROUGH</span><strong>Think out loud.</strong><span className="workspace-copy">Ask a friendly demo advisor about your sample plan or estimate.</span><span className="workspace-link">Visit your field advisor <ArrowRight size={14} /></span></button></div>
    <div className="note-strip"><ShieldCheck size={16} /><span>The map and NASA historical weather access are connected. Crop scores and scenarios use <strong>demo assumptions</strong>. No forecasts, damage detection, or AI responses are connected.</span><button onClick={onChat}>What does “demo” mean? <ArrowUpRight size={14} /></button></div>
  </>;
}

function FarmPage({ farm, location, boundary, onBoundary, onLocation, onUpdate, onContinue }: { farm: Farm; boundary: Coordinates[]; onBoundary: (points: Coordinates[]) => void; location: Coordinates; onLocation: (location: Coordinates) => void; onUpdate: (key: keyof Farm, value: string) => void; onContinue: () => void }) {
  return <div className="farm-layout">
    <section className="panel farm-map-panel"><div className="panel-top"><div><span className="panel-eyebrow"><MapPin size={13} /> FARM LOCATION</span><h2>Select your farm.</h2></div><span className="sample-chip">LEAFLET · OPENSTREETMAP</span></div><FarmMap location={location} boundary={boundary} onBoundary={onBoundary} onChange={onLocation} /></section>
    <section className="panel farm-profile-panel"><div className="panel-top"><div><span className="panel-eyebrow"><Sprout size={13} /> FARM PROFILE <span className="panel-demotag">DEMO</span></span><h2>Make it yours.</h2></div><span className="profile-status"><BadgeCheck size={14} /> SAVED HERE</span></div>
      <div className="form-grid"><div className="form-field full-span"><Label htmlFor="farm-location">Municipality / city (automatic, editable)</Label><Input id="farm-location" value={farm.place} onChange={event => onUpdate("place", event.target.value)} /><small>Detected from your selected farm point when public records are available.</small></div><div className="form-field"><Label htmlFor="area-ha">Farm area <span>ha</span></Label><div className="input-unit-wrap"><Input id="area-ha" readOnly={boundary.length > 0} aria-describedby="area-source" type="number" min="0" step="0.0001" value={farm.area} onChange={(e) => onUpdate("area", e.target.value)} /><span>hectares</span></div><small id="area-source">{boundary.length ? "Calculated from drawn boundary. Clear boundary to edit manually." : "Enter manually or draw your farm boundary."}</small></div><div className="form-field"><Label htmlFor="plant-date">Planned next planting</Label><Input id="plant-date" type="date" value={farm.planted} onChange={(e) => onUpdate("planted", e.target.value)} /></div><div className="form-field"><Label htmlFor="current-crop">Current crop</Label><select id="current-crop" className="form-select" value={farm.crop} onChange={(e) => onUpdate("crop", e.target.value)}>{["Corn", "Mungbean", "Sorghum", "Sweet potato", "Rice", "Cassava"].map((crop) => <option key={crop}>{crop}</option>)}</select></div><div className="form-field"><Label htmlFor="previous-crop">Previous crop</Label><select id="previous-crop" className="form-select" value={farm.previous} onChange={(e) => onUpdate("previous", e.target.value)}>{["Mungbean", "Corn", "Sorghum", "Sweet potato", "Rice", "Cassava", "Fallow"].map((crop) => <option key={crop}>{crop}</option>)}</select></div><div className="form-field"><Label htmlFor="soil-type">Soil texture / type (editable)</Label><Input id="soil-type" value={farm.soil} placeholder="Awaiting public estimate or local measurement" onChange={event => onUpdate("soil", event.target.value)} /></div><div className="form-field"><Label htmlFor="soil-ph">Soil pH (water, editable)</Label><Input id="soil-ph" type="number" min="0" max="14" step="0.1" placeholder="Unknown" value={farm.ph} onChange={event => onUpdate("ph", event.target.value)} /></div><div className="form-field"><Label htmlFor="irrigation">Irrigation</Label><select id="irrigation" className="form-select" value={farm.irrigation} onChange={(e) => onUpdate("irrigation", e.target.value)}>{["Unknown", "Rain-fed", "Gravity-fed", "Pump-irrigated", "Drip irrigation", "Other"].map((value) => <option key={value}>{value}</option>)}</select><small>Farmer confirmation required. Public data cannot verify your working irrigation system or water supply.</small></div><div className="form-field"><Label htmlFor="drainage">Field drainage</Label><select id="drainage" className="form-select" value={farm.drainage} onChange={(e) => onUpdate("drainage", e.target.value)}>{["Moderate", "Good", "Poor", "Unknown"].map((value) => <option key={value}>{value}</option>)}</select><small>Editable field observation. A demo suggestion is available below when soil and terrain data support one.</small></div></div>
      <div className="farm-save-row"><div><span className="save-indicator"><Check size={12} /></span><span>Saved in this browser on this device.</span></div><Button onClick={onContinue}>Continue to crop planning <ArrowRight size={16} /></Button></div>
    </section>
    <aside className="farm-note"><FlaskConical size={17} /><div><strong>Some context is sample, not measured.</strong><p>Select your actual location on the map. Public soil values are mapped predictions; fields can be corrected using local measurements. Crop ratings remain demo assumptions. Historical NASA records can be loaded in crop planning.</p></div></aside>
  </div>;
}

function PreventionPage({ farm, historical, scenario, setScenario, rotations, selected, setSelected, onEvidence, onChat, onEvidencePage }: { farm: Farm; historical: HistoricalWeather | null; scenario: ClimateScenario; setScenario: (scenario: ClimateScenario) => void; rotations: ReturnType<typeof rotationsForScenario>; selected: string; setSelected: (id: string) => void; onEvidence: (id: string) => void; onChat: () => void; onEvidencePage: () => void }) {
  return <>
    <div className="scenario-toolbar"><div className="scenario-copy"><span className="scenario-indicator"><Activity size={15} /></span><div><strong>Explore demo scoring assumptions.</strong><span>NASA charts above use actual records; these scenarios apply only to demo scores.</span></div></div><div className="scenario-tabs" role="tablist" aria-label="Climate scenarios">{SCENARIOS.map((value) => <button key={value} role="tab" aria-selected={scenario === value} className={scenario === value ? "scenario-active" : ""} onClick={() => setScenario(value)}>{value === "Typical" ? <CloudSun size={14} /> : value === "El Niño-like" ? <Sun size={14} /> : <CloudDrizzle size={14} />}{value}</button>)}</div></div>
    <div className="scenario-footnote"><span>DEMO SCORING ASSUMPTIONS ONLY</span><span>These tabs adjust sample ratings. They do not change NASA observations or classify historical ENSO.</span><span>NOT A FORECAST</span></div>
    <section className="rotation-section"><div className="section-title-row"><div><span className="eyebrow">THREE WAYS TO ROTATE</span><h2>A season plan worth considering.</h2><p>Published research explains why each option is worth considering. The order still comes from demo scores, not a validated comparison of these sequences.</p></div><Button variant="outline" onClick={onEvidencePage}><FileText size={15} /> All scoring evidence</Button></div><div className="rotation-grid">{rotations.map((rotation, index) => <article key={rotation.id} className={`rotation-card ${selected === rotation.id ? "rotation-selected" : ""}`}><div className="rotation-card-top"><span className="rotation-rank"><span>{String(index + 1).padStart(2, "0")}</span> SAMPLE PICK</span><button className={`rotation-select ${selected === rotation.id ? "rotation-select-on" : ""}`} aria-label={`${selected === rotation.id ? "Selected" : "Select"}: ${rotation.name}`} onClick={() => setSelected(rotation.id)}>{selected === rotation.id ? <Check size={14} /> : <span />}</button></div><h3>{rotation.name}</h3><p className="rotation-note">{rotation.note}</p><div className="rotation-score"><span className="score-number">{rotation.total}<small> / 100</small></span><ScoreRing score={rotation.total} /><div className="rotation-rank-caption">{index === 0 ? "HIGHEST SAMPLE SCORE" : "ALTERNATIVE ROTATION"}</div></div><ScoreBreakdown scores={rotation.scores} /><RotationResearch rotationId={rotation.id} drainage={farm.drainage} /><RotationEvidence rotation={rotation} farm={farm} historical={historical} /><div className="rotation-actions"><Button variant="outline" size="sm" onClick={() => onEvidence(rotation.id)}><FileText size={14} /> View evidence</Button><Button variant="ghost" size="sm" onClick={onChat}><MessageCircle size={14} /> Ask the advisor</Button></div></article>)}</div><div className="scoring-note"><ShieldCheck size={16} /><span><strong>Transparent sample scoring.</strong> Weights are water 30%, soil 30%, income 25%, climate resilience 15%. The displayed total is calculated from these weights and scenario-adjusted demo scores.</span></div></section>
  </>;
}

function RecoveryPage({ farm, hazard, setHazard, damageDate, setDamageDate, affected, setAffected, yieldLoss, setYieldLoss, photo, pickPhoto, uploadRef, loss, onPlan, onChat, price, setPrice, expectedYield, setExpectedYield, validLossInputs, location, onUpdateFarm }: { onUpdateFarm: (key: keyof Farm, value: string) => void; price: string; setPrice: (value: string) => void; expectedYield: string; setExpectedYield: (value: string) => void; validLossInputs: boolean; location: Coordinates; farm: Farm; hazard: Hazard; setHazard: (hazard: Hazard) => void; damageDate: string; setDamageDate: (date: string) => void; affected: number; setAffected: (value: number) => void; yieldLoss: number; setYieldLoss: (value: number) => void; photo: { src: string; name: string; sample: boolean }; pickPhoto: (file?: File) => void; uploadRef: React.RefObject<HTMLInputElement | null>; loss: number; onPlan: () => void; onChat: () => void }) {
  const HazardIcon = HAZARD_RATES[hazard].icon;
  return <div className="recovery-layout"><div className="recovery-left"><section className="panel recovery-form-panel"><div className="panel-top"><div><span className="panel-eyebrow"><HeartHandshake size={13} /> FIRST, A FEW DETAILS <span className="panel-demotag">DEMO</span></span><h2>Tell us about the event.</h2></div><span className="step-number">01 <span>/ 03</span></span></div><Label className="form-section-label">What happened?</Label><div className="hazard-options">{(Object.keys(HAZARD_RATES) as Hazard[]).map((value) => { const Icon = HAZARD_RATES[value].icon; return <button className={`hazard-option ${hazard === value ? "hazard-selected" : ""}`} key={value} aria-pressed={hazard === value} onClick={() => setHazard(value)}><Icon size={17} /><span>{value}</span>{hazard === value && <Check size={13} className="hazard-check" />}</button>; })}</div><div className="form-grid recovery-fields"><div className="form-field"><Label htmlFor="damage-date">When did it happen?</Label><Input id="damage-date" type="date" value={damageDate} onChange={(e) => setDamageDate(e.target.value)} /></div><div className="form-field"><Label>Farm area</Label><div className="input-readonly"><Sprout size={15} /> {farm.area} <span>hectares <span className="footer-divider">·</span> from My farm</span></div></div></div><div className="photo-heading"><div><Label>Crop photo <span className="optional-label">OPTIONAL</span></Label><span className="photo-caption">Add a photo or explore using the labeled sample.</span></div><Button variant="outline" size="sm" onClick={() => uploadRef.current?.click()}><Upload size={14} /> Add a photo</Button><input ref={uploadRef} className="sr-only" type="file" accept="image/*" aria-label="Upload crop photo" onChange={(event) => pickPhoto(event.target.files?.[0])} /></div><button className="photo-preview" onClick={() => uploadRef.current?.click()} aria-label="Choose a crop photo"><img src={photo.src} alt={photo.sample ? "Sample farm crop in waterlogged soil" : "Farmer-uploaded crop photo; not analyzed"} /><span className="photo-badge"><ImagePlus size={12} /> {photo.sample ? "SAMPLE PHOTO" : "YOUR PHOTO"}</span><span className="photo-overlay"><span><Upload size={16} /> Change photo</span></span></button><span className="file-caption">{photo.name} <span>· Image preview stays in this browser only</span></span><div className="observations"><div className="observation-head"><span><BadgeCheck size={14} /> SAMPLE OBSERVATIONS</span><span>NOT AI-ANALYZED</span></div><p>{HAZARD_RATES[hazard].observation}</p></div></section></div>
    <aside className="recovery-right"><HistoricalWeatherPanel location={location} eventDate={damageDate} />
      <section className="panel loss-panel"><div className="panel-top"><div><span className="panel-eyebrow"><BarChart3 size={13} /> PLANNING ESTIMATE <span className="panel-demotag">DEMO</span></span><h2>A starting point, not a verdict.</h2></div><span className="step-number">02 <span>/ 03</span></span></div><div className="form-grid loss-assumptions"><div className="form-field"><Label htmlFor="yield-assumption">Expected yield (kg/ha)</Label><Input id="yield-assumption" type="number" min="0" step="any" value={expectedYield} onChange={event => setExpectedYield(event.target.value)} /></div><div className="form-field"><Label htmlFor="price-assumption">Farmgate price (₱/kg)</Label><Input id="price-assumption" type="number" min="0" step="any" value={price} onChange={event => setPrice(event.target.value)} /></div></div><p className="historical-copy">Defaults are sample corn assumptions. Enter crop-specific yield and price for {farm.crop}. Gross revenue at risk excludes costs and insurance.</p><RangeField id="affected-area" label="Area affected" value={affected} setValue={setAffected} help="Share of total farm area" /><RangeField id="yield-loss" label="Expected yield loss on affected area" value={yieldLoss} setValue={setYieldLoss} help="Illustrative estimate" /><div className="calculation-box"><span className="calculation-title"><span /> GROSS REVENUE AT RISK</span><div className="calculation-total">{validLossInputs ? PHP.format(loss) : "Enter valid assumptions"} <span>PHP</span></div><div className="calculation-equation"><span>{farm.area} ha</span><i>×</i><span>{affected}%</span><i>×</i><span>{Number(expectedYield).toLocaleString()} kg/ha</span><i>×</i><span>{yieldLoss}%</span><i>×</i><span>₱{price}/kg</span></div><div className="calculation-foot">Farm area × affected share × entered yield × yield-loss fraction × entered price. Figures are editable planning assumptions, not a verified claim.</div></div><div className="next-steps-label"><ShieldCheck size={15} /> POSSIBLE NEXT STEPS</div><div className="next-steps"><span><span>1</span> Photograph the field after water recedes.</span><span><span>2</span> Check stand damage with a local agriculture officer.</span><span><span>3</span> Compare a diversified rotation for next season.</span></div><div className="form-grid loss-assumptions"><div className="form-field"><Label htmlFor="recovery-plant-date">Planned next planting</Label><Input id="recovery-plant-date" type="date" min={damageDate} value={farm.planted} onChange={event => onUpdateFarm("planted", event.target.value)} /></div><div className="form-field"><Label htmlFor="recovery-drainage">Current field drainage</Label><select id="recovery-drainage" className="form-select" value={farm.drainage} onChange={event => onUpdateFarm("drainage", event.target.value)}>{["Moderate", "Good", "Poor", "Unknown"].map(value => <option key={value}>{value}</option>)}</select></div></div><p className="historical-copy">These farmer-reported inputs update the same profile and demo comparison used in prevention. Confirm field readiness before planting.</p><div className="recovery-actions"><Button disabled={!farm.planted || farm.planted < damageDate} onClick={onPlan}>Compare next-season options <ArrowRight size={15} /></Button><Button variant="ghost" onClick={onChat}><MessageCircle size={15} /> Talk it through</Button></div><span className="step-number recovery-step">03 <span>/ 03</span> <span>YOUR NEXT SEASON</span></span></section></aside>
    <div className="recovery-disclaimer"><HazardIcon size={15} /><span><strong>Friendly reminder.</strong> This demo can’t diagnose crop damage or replace an on-site assessment by an agricultural expert.</span></div>
  </div>;
}

function EvidencePage({ rotations, scenario, selected, setSelected, onChat }: { rotations: ReturnType<typeof rotationsForScenario>; scenario: ClimateScenario; selected: string; setSelected: (id: string) => void; onChat: () => void }) {
  const current = rotations.find((rotation) => rotation.id === selected) ?? rotations[0]!;
  return <div className="evidence-page"><div className="panel evidence-overview"><div className="evidence-illustration"><div className="evidence-orbit orbit-one" /><div className="evidence-orbit orbit-two" /><span><FlaskConical size={25} /></span></div><div><span className="eyebrow">A CLEAR VIEW OF THE MATH <span className="eyebrow-dot" /> DEMO ONLY</span><h2>Examples, not promises.</h2><p>This prototype illustrates how a future planning tool might combine farm context, climate patterns, and crop rotation research. The rainfall and temperature charts use historical NASA records; crop scores remain illustrative. The separate NASA historical panel loads actual records and can supply rainfall context to a demo score; it is not a forecast, soil test, or yield prediction.</p></div></div>
    <div className="evidence-columns"><section className="panel evidence-factor-panel"><div className="panel-top"><div><span className="panel-eyebrow"><BarChart3 size={13} /> HOW ROTATIONS ARE COMPARED</span><h2>Four ingredients. One clear score.</h2></div><span className="sample-chip">SAMPLE WEIGHTS</span></div><div className="weighted-rows">{[{ key: "water", label: "Water efficiency", weight: 30, Icon: Droplets, color: "factor-water", explain: "Sample ability to fit the selected rainfall scenario." }, { key: "soil", label: "Soil health", weight: 30, Icon: Sprout, color: "factor-soil", explain: "Illustrative value of legumes and crop breaks." }, { key: "income", label: "Income potential", weight: 25, Icon: BarChart3, color: "factor-income", explain: "Sample relative return—not a peso yield forecast." }, { key: "resilience", label: "Climate resilience", weight: 15, Icon: ShieldCheck, color: "factor-resilience", explain: "Illustrative flexibility under variable weather." }].map(({ key, label, weight, Icon, color, explain }) => <div className="weighted-row" key={key}><span className={`factor-icon ${color}`}><Icon size={15} /></span><span className="factor-label"><strong>{label}</strong><small>{explain}</small></span><span className="factor-weight">{weight}<small>%</small></span><span className="weight-bar"><i className={color} style={{ width: `${weight * 10 / 3.5}%` }} /></span></div>)}</div><div className="formula-display"><span>WEIGHTED TOTAL</span><code>(Water × .30) + (Soil × .30) + (Income × .25) + (Resilience × .15)</code><span>Rounded to one decimal place <span className="footer-divider">·</span> scores range from 0–100</span></div></section>
      <section className="panel evidence-score-panel"><div className="panel-top"><div><span className="panel-eyebrow"><BadgeCheck size={13} /> ROTATION SCORECARD</span><h2>{scenario} scenario <span className="small-heading-note">· SAMPLE</span></h2></div><select aria-label="Choose rotation for evidence" className="compact-select" value={selected} onChange={(e) => setSelected(e.target.value)}>{rotations.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div><div className="evidence-picked-rotation"><Sprout size={16} /> {current.name}</div><div className="evidence-total-row"><span><strong>{current.total}</strong><small> / 100</small></span><span className="rank-pill">{rotations.findIndex((r) => r.id === current.id) === 0 ? "HIGHEST SAMPLE SCORE" : "ALTERNATIVE"}</span></div><ScoreBreakdown scores={current.scores} showWeight /><div className="score-eq-lines">{Object.entries(current.scores).map(([key, value]) => <div key={key}><span>{key[0]?.toUpperCase()}{key.slice(1)}</span><span>{value} × {({ water: "30%", soil: "30%", income: "25%", resilience: "15%" } as Record<string, string>)[key]}</span></div>)}</div><div className="score-eq-result"><span>Calculated sample total</span><strong>{current.total} / 100</strong></div></section></div>
    <section className="panel evidence-sources"><div className="panel-top"><div><span className="panel-eyebrow"><FileText size={13} /> INTENDED RESEARCH CONTEXT</span><h2>Data sources and planned integrations.</h2></div><span className="source-here">HISTORICAL ACCESS AVAILABLE <span /></span></div><div className="source-grid">{[{ icon: Thermometer, name: "NASA POWER", label: "Potential climate context", description: "Historical rainfall and temperature can be loaded by farm coordinates and date in crop planning and recovery. Inspect and download the exact records there." }, { icon: Activity, name: "NOAA ENSO", label: "Potential climate signal", description: "ENSO status could provide context for seasonal discussions—not a farm-specific weather forecast." }, { icon: Leaf, name: "Crop guides", label: "Agronomy & rotation", description: "Philippine crop guides and local extension recommendations should inform real planting decisions." }].map(({ icon: Icon, name, label, description }) => <div className="source-item" key={name}><span className="source-icon"><Icon size={17} /></span><span className="source-meta"><small>{label}</small><strong>{name}</strong><span>{description}</span></span><span className="source-status">{name === "NASA POWER" ? "CONNECTED" : "PLANNED"}</span></div>)}</div><div className="uncertainty-note"><CircleHelp size={16} /><span><strong>What this means for you.</strong> Scenario values, crop ratings, and score adjustments are demonstration inputs. Optional historical rainfall is sourced from NASA; yield and price are editable farmer assumptions. Local soil testing, confirmed forecasts, accurate crop pricing, and advice from Bukidnon agricultural extension staff would be needed for real-world decisions.</span></div></section><div className="evidence-chat-row"><span>Want to see the score broken down in plain language?</span><Button onClick={onChat}><MessageCircle size={15} /> Ask the field advisor <ArrowRight size={15} /></Button></div></div>;
}

function ChatPage({ farm, messages, busy, input, setInput, onSend, onSuggestion, scenario, rotation, hazard, loss }: { farm: Farm; messages: ChatMessage[]; busy: boolean; input: string; setInput: (input: string) => void; onSend: (question?: string) => void; onSuggestion: (question: string) => void; scenario: ClimateScenario; rotation: string; hazard: Hazard; loss: string }) {
  const bottomRef = useRef<HTMLDivElement>(null);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }); }, [messages]);
  function handleSubmit(event: FormEvent) { event.preventDefault(); onSend(); }
  return <div className="chat-layout"><section className="panel advisor-panel"><div className="advisor-head"><div className="advisor-avatar"><Sprout size={21} /></div><div><strong>Your FieldShift guide</strong><span><span className="advisor-status-dot" /> GEMINI ADVISOR <span className="footer-divider">·</span> DEMO CONTEXT</span></div><span className="advisor-badge"><Bot size={15} /> GEMINI ADVISOR</span></div><div className="context-chips"><span><MapPin size={12} /> {farm.place}</span><span><CloudSun size={12} /> {scenario} scenario</span><span><Sprout size={12} /> {rotation.split("→").map((crop) => crop.trim())[0]} rotation</span></div><div className="chat-messages" aria-live="polite">{messages.map((message, index) => <div key={index} className={`chat-row ${message.role === "user" ? "chat-row-user" : ""}`}><span className={`chat-avatar ${message.role === "user" ? "chat-user-avatar" : ""}`}>{message.role === "assistant" ? <Sprout size={16} /> : "B"}</span><div className={`chat-bubble ${message.role === "user" ? "chat-user-bubble" : ""}`}><span className="chat-role">{message.role === "assistant" ? "FIELD GUIDE · GEMINI" : "YOU"}</span><p>{message.text}</p></div></div>)}{busy && <div className="chat-row"><span className="chat-avatar"><Sprout size={16} /></span><div className="chat-bubble"><p>Thinking…</p></div></div>}<div ref={bottomRef} /></div><div className="suggested-questions"><span className="suggestion-heading">SOME THINGS TO ASK</span><div>{SUGGESTED_QUESTIONS.map((question) => <button key={question} onClick={() => onSuggestion(question)}>{question}<ArrowUpRight size={13} /></button>)}</div></div><form className="chat-input-row" onSubmit={handleSubmit}><Textarea aria-label="Ask the demo field advisor" value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); onSend(); } }} placeholder="Ask about your sample field plan…" rows={1} maxLength={400} /><Button type="submit" size="icon" aria-label="Send question" disabled={!input.trim() || busy}><Send size={16} /></Button></form><span className="chat-safety"><ShieldCheck size={13} /> Gemini uses your entered sample context. Verify field decisions with a local agricultural officer.</span></section><aside className="panel chat-context-panel"><span className="panel-eyebrow"><Compass size={13} /> CURRENT EXAMPLE</span><h2>Picking up where you left off.</h2><div className="chat-context-item"><span className="context-icon"><MapPin size={15} /></span><span><small>YOUR SAMPLE FIELD</small><strong>{farm.place}</strong><span>{farm.area} hectares · {farm.soil}</span></span></div><div className="chat-context-item"><span className="context-icon context-climate"><CloudSun size={15} /></span><span><small>PLANNING SCENARIO</small><strong>{scenario}</strong><span>Illustrative sample scenario</span></span></div><div className="chat-context-item"><span className="context-icon context-crop"><Flower2 size={15} /></span><span><small>ROTATION TO EXPLORE</small><strong>{rotation}</strong><span>Demo score · farm inputs applied</span></span></div><div className="chat-context-item"><span className="context-icon context-hazard"><HeartHandshake size={15} /></span><span><small>RECOVERY ESTIMATE</small><strong>{hazard} · {loss}</strong><span>Illustrative planning example</span></span></div><div className="chat-context-disclaimer"><CircleHelp size={14} /><span>Gemini explains the sample plan and estimate. It does not read crop photos, diagnose fields, or provide official agricultural advice.</span></div></aside></div>;
}

function RangeField({ id, label, value, setValue, help }: { id: string; label: string; value: number; setValue: (value: number) => void; help: string }) {
  return <div className="range-field"><div className="range-label-row"><Label htmlFor={id}>{label}</Label><span>{help}</span></div><div className="range-controls"><input id={id} aria-label={label} type="range" min="0" max="100" step="1" className="range-input" value={value} onChange={(e) => setValue(Number(e.target.value))} /><span className="range-value">{value}<small>%</small></span></div></div>;
}

function ScoreBreakdown({ scores, showWeight = false }: { scores: { water: number; soil: number; income: number; resilience: number }; showWeight?: boolean }) {
  const metrics: Array<{ key: keyof typeof scores; label: string; weight: number }> = [{ key: "water", label: "Water", weight: 30 }, { key: "soil", label: "Soil", weight: 30 }, { key: "income", label: "Income", weight: 25 }, { key: "resilience", label: "Resilience", weight: 15 }];
  return <div className={`score-breakdown ${showWeight ? "score-breakdown-expanded" : ""}`}>{metrics.map((metric) => <div key={metric.key} className="score-factor"><div><span>{metric.label}{showWeight && <small> × {metric.weight}%</small>}</span><strong>{scores[metric.key]}</strong></div><div className="score-track"><span className={`score-fill score-${metric.key}`} style={{ width: `${scores[metric.key]}%` }} /></div></div>)}</div>;
}

function ScoreRing({ score }: { score: number }) {
  return <div className="score-ring" style={{ "--score-angle": `${score * 3.6}deg` } as React.CSSProperties}><span><Leaf size={13} /></span></div>;
}
