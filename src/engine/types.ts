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
  // Phase 3 additions:
  tariffEscalationPct?: number;       // annual electricity tariff escalation % (default: 0.0)
  capacityFadePctPerYear?: number;    // annual battery capacity fade % (default: 0.0)
  installDate?: string;               // ISO date string (default: '2026-11-01')
  stcPriceAUD?: number;               // market price per STC in AUD (default: 37.0)
  useCheaperHomeBatteriesProgram?: boolean; // Australian 2026 STC program (default: false for thesis baseline, true for products)
  subsidyEligible?: boolean;          // CER accreditation / eligible product flag (default: true)
  selectedProductId?: string;         // selected real commercial product id
  exportLimitKW?: number;             // optional grid export limit (kW)
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
  curtailed?: number;
  socEndPct: number | null;
  energyResidual: number;
}

export interface AnnualCashFlow {
  year: number;
  fadedCapacityKWh: number;
  gridCostAUD: number;
  savingAUD: number;
  omAUD: number;
  netCashFlowAUD: number;
  discountedCashFlowAUD: number;
}

export interface Result {
  capacityKWh: number;
  usableKWh: number;
  powerKW?: number;
  productName?: string;
  initialKWh: number;
  finalKWh: number;
  cyclicResidual: number;
  maxEnergyResidual: number;
  minStoredKWh: number;
  maxStoredKWh: number;
  importKWh: number;
  exportKWh: number;
  curtailedKWh?: number;
  chargedKWh: number;
  dischargedKWh: number;
  equivalentCycles: number;
  selfConsumptionPct: number;
  selfSufficiencyPct: number;
  gridCostAUD: number;
  grossCapexAUD: number;
  subsidyAUD: number;
  netCapexAUD: number;
  annualCapitalAUD: number;
  annualOMAUD: number;
  ownerCostAUD: number;
  totalAnnualCostAUD: number;
  netBenefitAUD: number;
  lifetimeNPVAUD: number;
  equivalentAnnualBenefitAUD: number;
  year1BillSavingsAUD: number;
  simplePaybackYears?: number | null;
  breakEvenGrossAUD?: number;
  discountedPaybackYear?: number | null;
  annualCashFlows?: AnnualCashFlow[];
  hourly?: Hour[];
}

export interface ProductEvaluation {
  id: string;
  name: string;
  manufacturer: string;
  usableKWh: number;
  powerKW: number;
  installedPriceAUD: number;
  subsidyAUD: number;
  netCapexAUD: number;
  lifetimeNPVAUD: number;
  equivalentAnnualBenefitAUD: number;
  year1BillSavingsAUD: number;
  simplePaybackYears: number | null;
  breakEvenGrossAUD: number;
  discountedPaybackYear: number | null;
  selfConsumptionPct: number;
  selfSufficiencyPct: number;
  equivalentCycles: number;
  result: Result;
}

export interface EvaluationOutput {
  series: Series;
  results: Result[];
  baseline: Result;
  economicOptimal: Result;
  bestPositive: Result;
  selected: Result;
  selectedPremiumAUD: number;
  bestBatteryFinanciallyWorthwhile: boolean;
  productRankings: ProductEvaluation[];
  bestProductByNPV: ProductEvaluation;
  sourceNote: string;
}

export interface ProfileMetadata {
  source: 'illustration' | 'uploaded';
  filename?: string;
  referencePVkW: number;
}
