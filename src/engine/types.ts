export const HOURS = 8760;
export const EPS = 1e-9;

export interface Inputs {
  selectedBatteryKWh: number;
  pvKW: number;
  pvReferenceKW: number;
  demandMultiplier: number;
  importAUDPerKWh: number;
  feedInAUDPerKWh: number;
  variableCapexAUDPerKWh: number;
  fixedCapexAUD: number;
  hypotheticalDiscountPct: number;
  efficiencyPct: number;       // applied each way
  cRate: number;               // C-rate for charge & discharge
  socMinPct: number;
  socMaxPct: number;
  annualDiscountRatePct: number;
  lifeYears: number;
  annualOMPercentGross: number;
}

export interface Series {
  pv: Float64Array;
  load: Float64Array;
}

export interface Hour {
  index: number;
  pv: number;
  load: number;
  surplus: number;
  deficit: number;
  storedBefore: number;
  charge: number;
  discharge: number;
  storedAfter: number;
  gridImport: number;
  gridExport: number;
  socEndPct: number | null;
  energyResidual: number;
}

export interface Result {
  capacityKWh: number;
  initialKWh: number;
  finalKWh: number;
  cyclicResidual: number;
  maxEnergyResidual: number;
  minStoredKWh: number;
  maxStoredKWh: number;
  importKWh: number;
  exportKWh: number;
  chargedKWh: number;
  dischargedKWh: number;
  equivalentCycles: number;
  gridCostAUD: number;
  grossCapexAUD: number;
  subsidyAUD: number;
  netCapexAUD: number;
  annualCapitalAUD: number;
  annualOMAUD: number;
  ownerCostAUD: number;
  totalAnnualCostAUD: number;
  netBenefitAUD: number;
  hourly?: Hour[];
}

export interface EvaluationOutput {
  series: Series;
  results: Result[];
  baseline: Result;
  bestPositive: Result;
  selected: Result;
  selectedPremiumAUD: number;
  bestBatteryFinanciallyWorthwhile: boolean;
  sourceNote: string;
}

export interface ProfileMetadata {
  source: 'illustration' | 'uploaded';
  filename?: string;
  referencePVkW: number;
}
