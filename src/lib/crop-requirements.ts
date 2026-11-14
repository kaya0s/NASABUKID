// FAO ECOCROP global reference ranges, consulted 2026-11-15; not locally calibrated agronomy.
// Values are [optimal minimum, optimal maximum, absolute minimum, absolute maximum].
export type CropRange = readonly [number, number, number, number];
export type CropRequirement = {
  crop: string;
  sourceId: number;
  temperatureC: CropRange;
  annualRainfallMm: CropRange;
  ph: CropRange;
  maxCycleDays: number;
  maxElevationM: number;
  family: string;
  longTerm: boolean;
  drainage: "well" | "wet";
  optimalTextures: readonly string[];
};
export const CROP_REQUIREMENTS: readonly CropRequirement[] = [
  {
    crop: "Pineapple",
    sourceId: 402,
    temperatureC: [21, 30, 10, 36],
    annualRainfallMm: [800, 2500, 550, 3500],
    ph: [4.5, 8, 3.5, 9],
    maxCycleDays: 365,
    maxElevationM: 1800,
    family: "Bromeliaceae",
    longTerm: true,
    drainage: "well",
    optimalTextures: ["Loam", "Sand"],
  },
  {
    crop: "Banana",
    sourceId: 7848,
    temperatureC: [23, 33, 12, 42],
    annualRainfallMm: [1200, 3600, 650, 5000],
    ph: [5.5, 7.5, 4, 8.4],
    maxCycleDays: 365,
    maxElevationM: 2400,
    family: "Musaceae",
    longTerm: true,
    drainage: "well",
    optimalTextures: ["Loam", "Organic"],
  },
  {
    crop: "Sugar Cane",
    sourceId: 1884,
    temperatureC: [24, 37, 15, 41],
    annualRainfallMm: [1500, 2000, 1000, 5000],
    ph: [5, 8, 4.5, 9],
    maxCycleDays: 365,
    maxElevationM: 1600,
    family: "Poaceae",
    longTerm: true,
    drainage: "well",
    optimalTextures: [],
  },
  {
    crop: "Corn",
    sourceId: 2175,
    temperatureC: [18, 33, 10, 47],
    annualRainfallMm: [600, 1200, 400, 1800],
    ph: [5, 7, 4.5, 8.5],
    maxCycleDays: 365,
    maxElevationM: 4000,
    family: "Poaceae",
    longTerm: false,
    drainage: "well",
    optimalTextures: [],
  },
  {
    crop: "Rice",
    sourceId: 1574,
    temperatureC: [20, 30, 10, 36],
    annualRainfallMm: [1500, 2000, 1000, 4000],
    ph: [5.5, 7, 4.5, 9],
    maxCycleDays: 180,
    maxElevationM: 2500,
    family: "Poaceae",
    longTerm: false,
    drainage: "wet",
    optimalTextures: [],
  },
  {
    crop: "Mungbean",
    sourceId: 2150,
    temperatureC: [21, 36, 8, 40],
    annualRainfallMm: [650, 900, 500, 1250],
    ph: [5.5, 6.2, 4.3, 8.3],
    maxCycleDays: 120,
    maxElevationM: 2000,
    family: "Fabaceae",
    longTerm: false,
    drainage: "well",
    optimalTextures: ["Loam", "Organic"],
  },
  {
    crop: "Sweet potato",
    sourceId: 1265,
    temperatureC: [18, 28, 10, 38],
    annualRainfallMm: [750, 2000, 350, 5000],
    ph: [5, 7, 4, 8.7],
    maxCycleDays: 170,
    maxElevationM: 2800,
    family: "Convolvulaceae",
    longTerm: false,
    drainage: "well",
    optimalTextures: [],
  },
  {
    crop: "Cassava",
    sourceId: 1420,
    temperatureC: [20, 29, 10, 35],
    annualRainfallMm: [1000, 1500, 500, 5000],
    ph: [5.5, 8, 4, 9],
    maxCycleDays: 365,
    maxElevationM: 2000,
    family: "Euphorbiaceae",
    longTerm: true,
    drainage: "well",
    optimalTextures: ["Loam", "Sand"],
  },
];
export const cropRequirementUrl = (id: number) =>
  `https://ecocrop.apps.fao.org/ecocrop/srv/en/dataSheet?id=${id}`;
// Drainage checks supplement blank ECOCROP entries for corn, sugarcane and sweetpotato.
export const DRAINAGE_SOURCES = [
  "https://www.dlrrd.gov.za/phocadownloadpap/Brochures_and_Production_Guidelines/Maize%20brochure%20updated%20Nov%202022.pdf",
  "https://www.fao.org/4/i2800e/i2800e07.pdf",
  "https://zwxb.chinacrops.org/EN/10.3724/SP.J.1006.2025.44116",
];
