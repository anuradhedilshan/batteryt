import { Inputs, Series, Hour, Result, EvaluationOutput, HOURS, EPS } from './types';
import { validateInputs } from './validation';

export { HOURS, EPS };

export function scaleSeries(
  referencePV: readonly number[],
  referenceLoad: readonly number[],
  p: Inputs
): Series {
  if (referencePV.length !== HOURS || referenceLoad.length !== HOURS) {
    throw new Error(`Both input profiles must contain exactly ${HOURS} hours (received PV: ${referencePV.length}, Load: ${referenceLoad.length}).`);
  }

  const pv = new Float64Array(HOURS);
  const load = new Float64Array(HOURS);
  const pvMultiplier = p.pvKW / p.pvReferenceKW;

  for (let t = 0; t < HOURS; t++) {
    const a = referencePV[t];
    const b = referenceLoad[t];
    if (!Number.isFinite(a) || !Number.isFinite(b) || a < 0 || b < 0) {
      throw new Error(`Invalid PV or load energy value at CSV hour index ${t + 1}.`);
    }
    pv[t] = a * pvMultiplier;
    load[t] = b * p.demandMultiplier;
  }

  return { pv, load };
}

export function capitalRecoveryFactor(rate: number, years: number): number {
  if (rate < 0 || years <= 0) {
    throw new Error('Invalid CRF inputs: rate must be non-negative and years must be positive.');
  }
  if (rate === 0) return 1 / years;
  const growth = Math.pow(1 + rate, years);
  return (rate * growth) / (growth - 1);
}

interface PassOutput {
  endKWh: number;
  minKWh: number;
  maxKWh: number;
  importKWh: number;
  exportKWh: number;
  chargedKWh: number;
  dischargedKWh: number;
  maxResidual: number;
  hourly?: Hour[];
}

function runYearPass(
  capacityKWh: number,
  p: Inputs,
  series: Series,
  initialKWh: number,
  recordHours: boolean
): PassOutput {
  const efficiency = p.efficiencyPct / 100;
  const minimum = (capacityKWh * p.socMinPct) / 100;
  const maximum = (capacityKWh * p.socMaxPct) / 100;
  const transferLimitKWh = capacityKWh * p.cRate * 1.0; // 1 hour timestep

  let stored = initialKWh;
  let minObserved = stored;
  let maxObserved = stored;
  let imported = 0;
  let exported = 0;
  let charged = 0;
  let discharged = 0;
  let maxResidual = 0;
  const hourly: Hour[] | undefined = recordHours ? new Array(HOURS) : undefined;

  for (let t = 0; t < HOURS; t++) {
    const pv = series.pv[t];
    const load = series.load[t];
    const surplus = Math.max(0, pv - load);
    const deficit = Math.max(0, load - pv);
    const storedBefore = stored;
    let charge = 0;
    let discharge = 0;

    if (capacityKWh > 0) {
      if (surplus > 0) {
        const remainingRoom = Math.max(0, (maximum - stored) / efficiency);
        charge = Math.min(surplus, transferLimitKWh, remainingRoom);
      } else if (deficit > 0) {
        const availableOutput = Math.max(0, (stored - minimum) * efficiency);
        discharge = Math.min(deficit, transferLimitKWh, availableOutput);
      }
      stored = stored + efficiency * charge - discharge / efficiency;
    }

    const gridImport = deficit - discharge;
    const gridExport = surplus - charge;
    const residual = Math.abs(pv + gridImport + discharge - load - charge - gridExport);

    if (residual > maxResidual) maxResidual = residual;
    if (stored < minObserved) minObserved = stored;
    if (stored > maxObserved) maxObserved = stored;

    imported += gridImport;
    exported += gridExport;
    charged += charge;
    discharged += discharge;

    if (hourly) {
      hourly[t] = {
        index: t,
        pv,
        load,
        surplus,
        deficit,
        storedBefore,
        charge,
        discharge,
        storedAfter: stored,
        gridImport,
        gridExport,
        socEndPct: capacityKWh > 0 ? (100 * stored) / capacityKWh : null,
        energyResidual: residual,
      };
    }
  }

  return {
    endKWh: stored,
    minKWh: minObserved,
    maxKWh: maxObserved,
    importKWh: imported,
    exportKWh: exported,
    chargedKWh: charged,
    dischargedKWh: discharged,
    maxResidual,
    hourly,
  };
}

export function simulateCapacity(
  capacityKWh: number,
  p: Inputs,
  series: Series,
  detailed = false
): Result {
  if (capacityKWh < 0 || !Number.isFinite(capacityKWh)) {
    throw new Error('Battery capacity must be non-negative and finite.');
  }

  const lower = (capacityKWh * p.socMinPct) / 100;
  const upper = (capacityKWh * p.socMaxPct) / 100;
  let start = lower;

  // Cyclic representative-year warm-up for positive battery storage
  if (capacityKWh > 0) {
    for (let k = 0; k < 50; k++) {
      const end = runYearPass(capacityKWh, p, series, start, false).endKWh;
      if (Math.abs(end - start) < 1e-9) {
        start = end;
        break;
      }
      start = end;
    }
  }

  const annual = runYearPass(capacityKWh, p, series, start, detailed);
  const cyclicResidual = capacityKWh > 0 ? Math.abs(annual.endKWh - start) : 0;

  if (annual.maxResidual > 1e-7) {
    throw new Error(`Hourly energy-balance residual check failed at capacity ${capacityKWh} kWh (residual: ${annual.maxResidual.toExponential(2)} kWh).`);
  }
  if (capacityKWh > 0 && (annual.minKWh < lower - 1e-7 || annual.maxKWh > upper + 1e-7)) {
    throw new Error(`SOC constraint boundary violated at capacity ${capacityKWh} kWh.`);
  }
  if (capacityKWh > 0 && cyclicResidual > 1e-6) {
    throw new Error(`Cyclic-year starting SOC did not converge at capacity ${capacityKWh} kWh.`);
  }

  const grossCapex = capacityKWh > 0 ? p.fixedCapexAUD + capacityKWh * p.variableCapexAUDPerKWh : 0;
  const subsidy = grossCapex * (p.hypotheticalDiscountPct / 100);
  const netCapex = Math.max(0, grossCapex - subsidy);
  const crf = capitalRecoveryFactor(p.annualDiscountRatePct / 100, p.lifeYears);
  const annualCapital = netCapex * crf;
  const annualOM = grossCapex * (p.annualOMPercentGross / 100);
  const ownerCost = annualCapital + annualOM;
  const gridCost = annual.importKWh * p.importAUDPerKWh - annual.exportKWh * p.feedInAUDPerKWh;
  const totalCost = gridCost + ownerCost;

  return {
    capacityKWh,
    initialKWh: start,
    finalKWh: annual.endKWh,
    cyclicResidual,
    maxEnergyResidual: annual.maxResidual,
    minStoredKWh: annual.minKWh,
    maxStoredKWh: annual.maxKWh,
    importKWh: annual.importKWh,
    exportKWh: annual.exportKWh,
    chargedKWh: annual.chargedKWh,
    dischargedKWh: annual.dischargedKWh,
    equivalentCycles: capacityKWh > 0 ? annual.dischargedKWh / (p.efficiencyPct / 100) / capacityKWh : 0,
    gridCostAUD: gridCost,
    grossCapexAUD: grossCapex,
    subsidyAUD: subsidy,
    netCapexAUD: netCapex,
    annualCapitalAUD: annualCapital,
    annualOMAUD: annualOM,
    ownerCostAUD: ownerCost,
    totalAnnualCostAUD: totalCost,
    netBenefitAUD: 0, // Filled in relative to baseline
    hourly: annual.hourly,
  };
}

export function evaluateAll(
  inputs: Inputs,
  referencePV: readonly number[],
  referenceLoad: readonly number[]
): EvaluationOutput {
  validateInputs(inputs);
  const series = scaleSeries(referencePV, referenceLoad, inputs);

  // 41 candidates: 0.0 (solar-only reference) and 0.5 to 20.0 kWh in 0.5 kWh steps
  const capacities = Array.from({ length: 41 }, (_, i) => i * 0.5);
  const results = capacities.map(c => simulateCapacity(c, inputs, series, false));
  const baseline = results[0];

  for (const r of results) {
    r.netBenefitAUD = baseline.totalAnnualCostAUD - r.totalAnnualCostAUD;
  }

  // Only capacities > 0 are eligible for lowest-cost battery recommendation
  const eligible = results.filter(r => r.capacityKWh > 0);
  const bestPositive = eligible.reduce((best, candidate) => {
    // If tie within EPS, choose the smaller battery size
    if (Math.abs(candidate.totalAnnualCostAUD - best.totalAnnualCostAUD) < EPS) {
      return candidate.capacityKWh < best.capacityKWh ? candidate : best;
    }
    return candidate.totalAnnualCostAUD < best.totalAnnualCostAUD ? candidate : best;
  }, eligible[0]);

  // Find user selected candidate
  const selectedSummary = eligible.find(
    r => Math.abs(r.capacityKWh - inputs.selectedBatteryKWh) < 1e-6
  );
  if (!selectedSummary) {
    throw new Error(`Selected battery ${inputs.selectedBatteryKWh} kWh is outside candidate range (0.5–20 kWh in 0.5 kWh steps).`);
  }

  // Run detailed hourly simulation for the selected battery
  const selectedDetail = simulateCapacity(selectedSummary.capacityKWh, inputs, series, true);
  selectedDetail.netBenefitAUD = baseline.totalAnnualCostAUD - selectedDetail.totalAnnualCostAUD;

  return {
    series,
    results,
    baseline,
    bestPositive,
    selected: selectedDetail,
    selectedPremiumAUD: selectedDetail.totalAnnualCostAUD - bestPositive.totalAnnualCostAUD,
    bestBatteryFinanciallyWorthwhile: bestPositive.netBenefitAUD >= -0.005,
    sourceNote: '8,760 hourly simulation data',
  };
}
