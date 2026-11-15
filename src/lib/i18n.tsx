import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";

export type AppLocale = "en" | "ceb";

export type LocaleContextValue = {
  locale: AppLocale;
  setLocale: (locale: AppLocale) => void;
  isSwitching: boolean;
};

const LocaleContext = createContext<LocaleContextValue>({
  locale: "en",
  setLocale: () => {},
  isSwitching: false,
});

export function LocaleProvider({
  locale,
  onLocaleChange,
  children,
}: {
  locale: AppLocale;
  onLocaleChange: (locale: AppLocale) => void;
  children: ReactNode;
}) {
  const prevLocaleRef = useRef(locale);
  const [isSwitching, setIsSwitching] = useState(false);

  useEffect(() => {
    if (prevLocaleRef.current === locale) return;
    prevLocaleRef.current = locale;
    setIsSwitching(true);
    const timer = window.setTimeout(() => setIsSwitching(false), 140);
    return () => window.clearTimeout(timer);
  }, [locale]);

  return (
    <LocaleContext.Provider value={{ locale, setLocale: onLocaleChange, isSwitching }}>
      {children}
    </LocaleContext.Provider>
  );
}

export function useAppLocale() {
  return useContext(LocaleContext);
}

export function LanguageTogglePill({
  className = "",
  variant = "hud",
}: {
  className?: string;
  variant?: "landing" | "hud";
}) {
  const { locale, setLocale } = useAppLocale();

  return (
    <div
      className={`lang-toggle-pill is-${variant} ${className}`.trim()}
      role="group"
      aria-label={locale === "ceb" ? "Pinulongan" : "Language"}
    >
      <span
        className={`lang-toggle-thumb ${locale === "ceb" ? "is-cebuano" : ""}`}
        aria-hidden="true"
      />
      <button
        type="button"
        className={`lang-toggle-btn ${locale === "en" ? "is-active" : ""}`}
        aria-pressed={locale === "en"}
        onClick={() => setLocale("en")}
        title="English"
      >
        English
      </button>
      <button
        type="button"
        className={`lang-toggle-btn ${locale === "ceb" ? "is-active" : ""}`}
        aria-pressed={locale === "ceb"}
        onClick={() => setLocale("ceb")}
        title="Cebuano / Bisaya"
      >
        Cebuano
      </button>
    </div>
  );
}

const CROP_CEBUANO: Record<string, string> = {
  Corn: "Mais",
  Rice: "Humay (Palay)",
  Mungbean: "Monggo",
  Soybean: "Soya (Soybean)",
  Peanut: "Mani",
  "Sweet potato": "Kamote",
  Cassava: "Balanghoy (Kamoteng Kahoy)",
  Pineapple: "Pinya",
  Banana: "Saging",
  "Sugar Cane": "Tubo",
  Fallow: "Papahuwayon ang yuta (Fallow)",
  Unknown: "Wala mahibal-i",
};

export function translateCropName(name: string, locale: AppLocale): string {
  if (locale === "en") return name;
  return CROP_CEBUANO[name] ?? name;
}

const FIELD_OPTION_CEBUANO: Record<string, string> = {
  Unknown: "Wala mahibal-i",
  Moderate: "Kasarangan",
  Good: "Maayo",
  Poor: "Dili maayo",
  "Rain-fed": "Salig sa ulan",
  "Gravity-fed": "Patubig sa grabidad",
  "Pump-irrigated": "Pinabomba nga patubig",
  "Drip irrigation": "Tulo nga patubig",
  Loam: "Loam (balanse nga yuta)",
  Sand: "Buhanginon",
  Clay: "Lagkiton (Clay)",
  Organic: "Organiko",
  Other: "Uban pa",
};

export function translateFieldOption(value: string, locale: AppLocale): string {
  if (locale === "en") return value;
  return FIELD_OPTION_CEBUANO[value] ?? value;
}

const HAZARD_CEBUANO: Record<"Flooding" | "Drought" | "Typhoon" | "Heat", string> = {
  Flooding: "Pagbaha",
  Drought: "Hulaw",
  Typhoon: "Bagyo",
  Heat: "Sobra nga kainit",
};

export function translateHazardName(
  hazard: "Flooding" | "Drought" | "Typhoon" | "Heat",
  locale: AppLocale,
): string {
  if (locale === "en") return hazard;
  return HAZARD_CEBUANO[hazard] ?? hazard;
}

const HAZARD_OBSERVATION_CEBUANO: Record<"Flooding" | "Drought" | "Typhoon" | "Heat", string> = {
  Flooding:
    "Adunay napundo nga tubig taliwala sa mga tudling; may sampol nga pagdalag sa dahon ug paghapa sa punoan.",
  Drought:
    "Nauga ug nangliki ang ibabaw nga yuta; may sampol nga pagkalukot sa dahon ug hinay nga pagtubo.",
  Typhoon:
    "Nangahapa ang mga punoan ug nangagisi ang dahon tungod sa kusog nga hangin ug ulan.",
  Heat: "Nangasunog ang ngilit sa dahon ug nangaumol ang tanom samtang nagpadayon ang init nga panahon.",
};

export function translateHazardObservation(
  hazard: "Flooding" | "Drought" | "Typhoon" | "Heat",
  fallback: string,
  locale: AppLocale,
): string {
  if (locale === "en") return fallback;
  return HAZARD_OBSERVATION_CEBUANO[hazard] ?? fallback;
}

const RECOVERY_STEPS_CEBUANO: Record<"Flooding" | "Drought" | "Typhoon" | "Heat", string[]> = {
  Flooding: [
    "Irekord kon unsa kadugay napundo ang tubig ug kon nihubas na ba kini; tan-awa gikan sa luwas nga lugar.",
    "Idokumento ang naapektuhan nga bahin ug ang edad sa tanom alang sa lokal nga pagsusi sa uma.",
    "Kumpirmaha ang agianan sa tubig ug kon nabuhi pa ba ang tanom una modesisyon sa pagtanom pag-usab.",
  ],
  Drought: [
    "Susiha ang kaumogon sa yuta sa giladmon sa gamot ug kon adunay magamit nga patubig.",
    "Ilahi ang mga bahin nga maka-recover pa gikan sa mga bahin nga angay ilisan.",
    "Hulata ang kasaligang ulan o suplay sa tubig una itanom ang sunod nga tanom.",
  ],
  Typhoon: [
    "Susiha ang mga natumba nga kahoy, nabanlas nga yuta, ug agianan sa umahan kon luwas na.",
    "Ipares ang nahibiling tanom sa luwas nga pamaagi sa pag-ani o paglimpyo.",
    "I-adjust ang sunod nga petsa sa pagtanom base sa kahandam sa yuta ug kadaot sa kahimanan.",
  ],
  Heat: [
    "Susiha ang pagkalawos sa buntag ug sa hapon aron mailhan ang stress sa init gikan sa kulang sa tubig.",
    "Susiha ang pagkasunog sa dahon ug mga ilhanan sa kahimsog sa uma sa imong lugar.",
    "Gamita ang mulch o igong pagpamubo kon anaa una pa mananom pag-usab.",
  ],
};

export function translateRecoverySteps(
  hazard: "Flooding" | "Drought" | "Typhoon" | "Heat",
  fallback: readonly string[],
  locale: AppLocale,
): readonly string[] {
  if (locale === "en") return fallback;
  return RECOVERY_STEPS_CEBUANO[hazard] ?? fallback;
}

const COMPACT_HAZARD_COPY_CEBUANO: Record<
  "Flooding" | "Drought" | "Typhoon" | "Heat",
  { summary: string; replantNote: string }
> = {
  Flooding: {
    summary:
      "Susiha ang napundong tubig, peligro sa pagkadunot sa gamot, ug mga kanal sa umahan una magtanom pag-usab.",
    replantNote:
      "Ang monggo o kamote makatabang sa paggamit sa nahibiling kaumogon sa yuta inig kahubas sa tubig.",
  },
  Drought: {
    summary:
      "Bantayi ang kauga sa yuta, suplay sa patubig, ug stress sa kainit sa naapektuhan nga mga bahin.",
    replantNote:
      "Ang monggo o balanghoy nga makasugakod sa hulaw angay kon menos ang tubig sa pagbawi.",
  },
  Typhoon: {
    summary: "Susiha ang mga nangahapa ug nabali nga punoan kon luwas na mosulod sa umahan.",
    replantNote:
      "Ang mubo ug panahon nga monggo (60–65 ka adlaw) makatabang sa paspas nga pagbawi human sa paglimpyo sa bagyo.",
  },
  Heat: {
    summary:
      "Bantayi ang kainit sa ibabaw nga yuta, pagkasunog sa dahon, ug pagkalawos sa udtong tutok sa mga bakilid.",
    replantNote:
      "Ang cover crops o mga barayti nga makasugakod sa kainit makapanalipod sa ibabaw nga yuta.",
  },
};

export function translateCompactHazardMeta(
  hazard: "Flooding" | "Drought" | "Typhoon" | "Heat",
  fallback: { summary: string; replantNote: string },
  locale: AppLocale,
) {
  if (locale === "en") return fallback;
  return COMPACT_HAZARD_COPY_CEBUANO[hazard] ?? fallback;
}

const EXACT_ROTATION_CEBUANO: Record<string, string> = {
  "Enter a valid planting date from today onward.":
    "Pagpili og hustong petsa sa pagtanom gikan karon padayon.",
  "Confirm your current and previous crops.":
    "Kumpirmaha ang imong karon ug naunang mga tanom.",
  "Enter a soil pH from 0 to 14, or leave it unknown.":
    "Isulod ang pH sa yuta gikan 0 hangtod 14, o biyai lang kon wala mahibal-i.",
  "At least eight complete years of rainfall are needed; no sample data was substituted.":
    "Kinahanglan ang labing menos walo ka kompletong tuig sa datos sa ulan; walay giilis nga sampol nga datos.",
  "Not enough historical observations for this crop's growing-period months.":
    "Kulang ang nangaging datos sa panahon alang sa mga bulan sa pagtubo niining tanoma.",
  "A growing-period monthly mean temperature falls outside the published limits.":
    "Adunay kasagarang binulan nga temperatura sa pagtubo nga lapas sa gitala nga utlanan.",
  "Some growing-period monthly temperatures fall outside the optimal range.":
    "Adunay mga binulan nga temperatura sa pagtubo nga gawas sa pinakamaayong sukdanan.",
  "Soil pH is unknown; confirm with a local soil test.":
    "Wala pa mahibal-i ang pH sa yuta; kumpirmaha pinaagi sa lokal nga pagsusi sa yuta.",
  "Confirm field drainage before planting.":
    "Kumpirmaha ang agianan sa tubig sa uma una magtanom.",
  "Poor drainage conflicts with this crop's drainage screening requirement.":
    "Ang hinay nga agianan sa tubig supak sa gikinahanglan niining tanoma.",
  "Rice reference describes wet-rice systems; confirm suitable water control and variety. Poor drainage alone does not establish suitability.":
    "Ang giya sa humay alang sa basakan; kumpirmaha ang hustong kontrol sa tubig ug barayti. Ang pundo nga tubig dili garantiya nga angay ang yuta.",
  "Confirm that drainage is adequate for this crop.":
    "Kumpirmaha nga igo ang agianan sa tubig alang niining tanoma.",
  "Mapped elevation exceeds the reference altitude limit.":
    "Ang gihabogon sa lugar lapas sa gitala nga kinatas-ang gitas-on alang niining tanoma.",
  "Elevation is unknown; verify locally against the crop reference.":
    "Wala mahibal-i ang gihabogon; susiha sa lugar base sa giya sa tanom.",
  "Slope is unknown; verify erosion and field access locally.":
    "Wala mahibal-i ang bakilid; susiha sa lugar ang pagdahili ug agianan sa uma.",
  "Steep terrain: local erosion-control review is needed before cultivation (demo precaution).":
    "Titip nga bakilid: gikinahanglan ang lokal nga pagsusi batok sa pagdahili una tikaron (demo nga pahimangno).",
  "Soil texture is unknown; verify locally.":
    "Wala mahibal-i ang tipo sa yuta; susiha sa imong lugar.",
  "Confirm soil texture against the crop reference; imported percentages are not a field texture test.":
    "Kumpirmaha ang tipo sa yuta base sa giya; ang nakuha nga porsyento dili pormal nga pagsusi sa uma.",
  "Irrigation availability is unknown.": "Wala mahibal-i kon adunay magamit nga patubig.",
  "Confirm irrigation capacity; reported irrigation does not override rainfall limits.":
    "Kumpirmaha ang kapasidad sa patubig; ang gitaho nga patubig dili mopuli sa limitasyon sa ulan.",
  "Long-term crop: confirm land availability, variety and full production cycle; not a short-season rotation.":
    "Dugay maani nga tanom: kumpirmaha ang magamit nga yuta, barayti, ug tibuok siklo; dili kini mubo nga pagliso.",
  "Banana reference is Musa acuminata; confirm the intended local cultivar.":
    "Ang giya sa saging gibase sa Musa acuminata; kumpirmaha ang lokal nga klase nga itanom.",
  "Changes crop family from the current crop; local pest and disease history still needs review.":
    "Mag-ilis sa pamilya sa tanom gikan sa karon; susiha gihapon ang kaagi sa peste ug sakit sa lugar.",
  "Repeats a recent crop or crop family; check pest carryover before choosing it.":
    "Mobalik sa bag-ong tanom o samang pamilya; susiha ang pagpabilin sa peste una kini pilion.",
  "No listed crop cleared the available weather and field screening. Review the constraints with a local agricultural technician.":
    "Walay nalista nga tanom ang nakapasar sa kasamtangang datos sa panahon ug yuta. Pakigsulti sa lokal nga teknisyan sa agrikultura.",
};

export function translateRotationText(text: string, locale: AppLocale): string {
  if (locale === "en") return text;
  const direct = EXACT_ROTATION_CEBUANO[text];
  if (direct) return direct;

  const annualRainMatch = text.match(
    /^Historical annual rain averages (\d+) mm across (\d+) complete years, within this crop's broad reference limits\.$/,
  );
  if (annualRainMatch) {
    return `Ang kasagarang tinuig nga ulan maoy ${annualRainMatch[1]} mm sulod sa ${annualRainMatch[2]} ka kompletong tuig, sulod sa gilatid nga sukdanan sa tanom.`;
  }

  const tempRangeMatch = text.match(
    /^Historical growing-period monthly temperatures: ([\d.–-]+) °C\.$/,
  );
  if (tempRangeMatch) {
    return `Nangaging binulan nga temperatura sa panahon sa pagtubo: ${tempRangeMatch[1]} °C.`;
  }

  const rangeConflictMatch = text.match(
    /^(Historical annual rainfall \(mm\/year\)|Soil pH) is outside the published absolute range \(([^)]+)\)\.$/,
  );
  if (rangeConflictMatch) {
    const label =
      rangeConflictMatch[1] === "Soil pH" ? "Ang pH sa yuta" : "Ang nangaging tinuig nga ulan (mm/tuig)";
    return `${label} anaa sa gawas sa gitala nga utlanan (${rangeConflictMatch[2]}).`;
  }

  const rangeConditionMatch = text.match(
    /^(Historical annual rainfall \(mm\/year\)|Soil pH) is within the broad limits but outside the published optimal range \(([^)]+)\)\.$/,
  );
  if (rangeConditionMatch) {
    const label =
      rangeConditionMatch[1] === "Soil pH" ? "Ang pH sa yuta" : "Ang nangaging tinuig nga ulan (mm/tuig)";
    return `${label} sulod sa lapad nga limitasyon apan gawas sa pinakamaayong sukdanan (${rangeConditionMatch[2]}).`;
  }

  return text;
}
