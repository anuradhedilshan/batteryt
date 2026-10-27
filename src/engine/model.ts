import { Inputs, Series, Hour, Result, EvaluationOutput, HOURS, EPS } from './types';
import { validateInputs } from './validation';
import { Battery } from './battery';

export { HOURS, EPS, Battery };

export function scaleSeries(
  referencePV: readonly number[],
  referenceLoad: readonly number[],
  p: Inputs
): Series {
  if (referencePV.length !== referenceLoad.length) {
    throw new Error(`PV and Load series lengths must match (received PV: ${referencePV.length}, Load: ${referenceLoad.length}).`);
  }

  const n = referencePV.length;
  const pv = new Float64Array(n);
  const load = new Float64Array(n);
  const pvMultiplier = p.pvKW / p.pvReferenceKW;

  for (let t = 0; t < n; t++) {
    const a = referencePV[t];
    const b = referenceLoad[t];
    if (!Number.isFinite(a) || !Number.isFinite(b) || a < 0 || b < 0) {
      throw new Error(`Invalid PV or load energy value at interval index ${t + 1}.`);
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

export interface SimulationOutput {
  charge: Float64Array;
  discharge: Float64Array;
  stored: Float64Array;
  imp: Float64Array;
  exp: Float64Array;
  passes: number;
  maxResidual: number;
  minStored: number;
  maxStored: number;
  initialStored: number;
  cyclicResidual: number;
  hourly?: Hour[];
}

/**
 * Core simulation rule per timestep dt (Phase 2):
 * Accepts 60-min (dt=1.0), 30-min (dt=0.5), 5-min (dt=1/12) intervals.
 * 0 kWh skips all battery/SOC logic.
 * Enforces energy balance, stored energy boundaries, and power ratings with assertions.
 */
export function simulateBatteryTimeSeries(
  pvInput: Float64Array | readonly number[],
  loadInput: Float64Array | readonly number[],
  bat: Battery | null,
  dt = 1.0,
  b0?: number,
  cyclic = true,
  tol = 1e-6,
  max_pass = 20,
  recordHourly = false
): SimulationOutput {
  const n = pvInput.length;
  if (loadInput.length !== n) {
    throw new Error(`Mismatched PV (${n}) and load (${loadInput.length}) lengths.`);
  }

  const pv = pvInput instanceof Float64Array ? pvInput : new Float64Array(pvInput);
  const load = loadInput instanceof Float64Array ? loadInput : new Float64Array(loadInput);

  // 0 kWh case: bypass all battery math
  if (!bat || bat.usable <= 0) {
    const z = new Float64Array(n);
    const imp = new Float64Array(n);
    const exp = new Float64Array(n);
    const hourly: Hour[] | undefined = recordHourly ? new Array(n) : undefined;

    for (let t = 0; t < n; t++) {
      imp[t] = Math.max(0, load[t] - pv[t]);
      exp[t] = Math.max(0, pv[t] - load[t]);
      if (hourly) {
        hourly[t] = {
          index: t,
          pv: pv[t],
          load: load[t],
          surplus: exp[t],
          deficit: imp[t],
          storedBefore: 0,
          charge: 0,
          discharge: 0,
          storedAfter: 0,
          gridImport: imp[t],
          gridExport: exp[t],
          socEndPct: null,
          energyResidual: 0,
        };
      }
    }

    return {
      charge: z,
      discharge: z,
      stored: z,
      imp,
      exp,
      passes: 0,
      maxResidual: 0,
      minStored: 0,
      maxStored: 0,
      initialStored: 0,
      cyclicResidual: 0,
      hourly,
    };
  }

  // Cyclic convergence loop
  let b_start = b0 ?? bat.emin;
  let finalStart = b_start;
  let charge = new Float64Array(n);
  let discharge = new Float64Array(n);
  let stored = new Float64Array(n);
  let imp = new Float64Array(n);
  let exp = new Float64Array(n);
  let passesRun = 0;

  for (let p = 1; p <= max_pass; p++) {
    passesRun = p;
    finalStart = b_start;
    let B = b_start;
    charge = new Float64Array(n);
    discharge = new Float64Array(n);
    stored = new Float64Array(n);

    for (let t = 0; t < n; t++) {
      const surplus = Math.max(0, pv[t] - load[t]);
      const deficit = Math.max(0, load[t] - pv[t]);

      if (surplus > 0) {
        const room = (bat.emax - B) / bat.eta_c;
        const c = Math.max(0, Math.min(surplus, bat.p_charge * dt, room));
        charge[t] = c;
        B += bat.eta_c * c;
      } else if (deficit > 0) {
        const avail = (B - bat.emin) * bat.eta_d;
        const d = Math.max(0, Math.min(deficit, bat.p_discharge * dt, avail));
        discharge[t] = d;
        B -= d / bat.eta_d;
      }
      stored[t] = B;
    }

    if (!cyclic || Math.abs(B - b_start) < tol) {
      break;
    }
    b_start = B; // Warm up next cycle
  }

  const initialStored = finalStart;
  const endKWh = stored[n - 1];
  const cyclicResidual = cyclic ? Math.abs(endKWh - initialStored) : 0;

  // Post-simulation checks and array construction
  let maxResidual = 0;
  let minStored = stored[0];
  let maxStored = stored[0];
  const hourly: Hour[] | undefined = recordHourly ? new Array(n) : undefined;

  for (let t = 0; t < n; t++) {
    const surplus = Math.max(0, pv[t] - load[t]);
    const deficit = Math.max(0, load[t] - pv[t]);
    const i = deficit - discharge[t];
    const x = surplus - charge[t];
    imp[t] = i;
    exp[t] = x;

    const residual = Math.abs(pv[t] + i + discharge[t] - (load[t] + charge[t] + x));
    if (residual > maxResidual) maxResidual = residual;
    if (stored[t] < minStored) minStored = stored[t];
    if (stored[t] > maxStored) maxStored = stored[t];

    // Assertions with hour index
    if (residual > 1e-7) {
      throw new Error(`Energy balance violated at timestep ${t}: residual = ${residual.toExponential(3)} kWh`);
    }
    if (stored[t] < bat.emin - 1e-7 || stored[t] > bat.emax + 1e-7) {
      throw new Error(`Stored energy violated boundaries at timestep ${t}: B=${stored[t].toFixed(4)} kWh outside [${bat.emin.toFixed(4)}, ${bat.emax.toFixed(4)}]`);
    }
    if (charge[t] > bat.p_charge * dt + 1e-7) {
      throw new Error(`Charge power limit exceeded at timestep ${t}: c=${charge[t].toFixed(4)} > ${bat.p_charge * dt}`);
    }
    if (discharge[t] > bat.p_discharge * dt + 1e-7) {
      throw new Error(`Discharge power limit exceeded at timestep ${t}: d=${discharge[t].toFixed(4)} > ${bat.p_discharge * dt}`);
    }

    if (hourly) {
      hourly[t] = {
        index: t,
        pv: pv[t],
        load: load[t],
        surplus,
        deficit,
        storedBefore: t === 0 ? initialStored : stored[t - 1],
        charge: charge[t],
        discharge: discharge[t],
        storedAfter: stored[t],
        gridImport: i,
        gridExport: x,
        socEndPct: bat.usable > 0 ? (100 * (stored[t] - bat.emin)) / bat.usable : null,
        energyResidual: residual,
      };
    }
  }

  return {
    charge,
    discharge,
    stored,
    imp,
    exp,
    passes: passesRun,
    maxResidual,
    minStored,
    maxStored,
    initialStored,
    cyclicResidual,
    hourly,
  };
}

export function simulateCapacity(
  capacityKWh: number,
  p: Inputs,
  series: Series,
  detailed = false,
  dt = 1.0
): Result {
  if (capacityKWh < 0 || !Number.isFinite(capacityKWh)) {
    throw new Error('Battery capacity must be non-negative and finite.');
  }

  const eff = p.efficiencyPct / 100;
  const bat = capacityKWh > 0
    ? Battery.fromNominal(capacityKWh, p.socMinPct / 100, p.socMaxPct / 100, p.cRate, eff, eff)
    : null;

  const sim = simulateBatteryTimeSeries(
    series.pv,
    series.load,
    bat,
    dt,
    undefined,
    true,
    1e-6,
    50,
    detailed
  );

  let importKWh = 0;
  let exportKWh = 0;
  let chargedKWh = 0;
  let dischargedKWh = 0;
  for (let t = 0; t < sim.imp.length; t++) {
    importKWh += sim.imp[t];
    exportKWh += sim.exp[t];
    chargedKWh += sim.charge[t];
    dischargedKWh += sim.discharge[t];
  }

  const grossCapex = capacityKWh > 0 ? p.fixedCapexAUD + capacityKWh * p.variableCapexAUDPerKWh : 0;
  const subsidy = grossCapex * (p.hypotheticalDiscountPct / 100);
  const netCapex = Math.max(0, grossCapex - subsidy);
  const crf = capitalRecoveryFactor(p.annualDiscountRatePct / 100, p.lifeYears);
  const annualCapital = netCapex * crf;
  const annualOM = grossCapex * (p.annualOMPercentGross / 100);
  const ownerCost = annualCapital + annualOM;
  const gridCost = importKWh * p.importAUDPerKWh - exportKWh * p.feedInAUDPerKWh;
  const totalCost = gridCost + ownerCost;

  return {
    capacityKWh,
    initialKWh: bat ? sim.initialStored : 0,
    finalKWh: bat ? sim.stored[sim.stored.length - 1] : 0,
    cyclicResidual: sim.cyclicResidual,
    maxEnergyResidual: sim.maxResidual,
    minStoredKWh: sim.minStored,
    maxStoredKWh: sim.maxStored,
    importKWh,
    exportKWh,
    chargedKWh,
    dischargedKWh,
    equivalentCycles: capacityKWh > 0 ? dischargedKWh / (eff * capacityKWh) : 0,
    gridCostAUD: gridCost,
    grossCapexAUD: grossCapex,
    subsidyAUD: subsidy,
    netCapexAUD: netCapex,
    annualCapitalAUD: annualCapital,
    annualOMAUD: annualOM,
    ownerCostAUD: ownerCost,
    totalAnnualCostAUD: totalCost,
    netBenefitAUD: 0, // Filled in relative to baseline
    hourly: sim.hourly,
  };
}

export function evaluateAll(
  inputs: Inputs,
  referencePV: readonly number[],
  referenceLoad: readonly number[]
): EvaluationOutput {
  validateInputs(inputs);
  const series = scaleSeries(referencePV, referenceLoad, inputs);

  // Candidate battery capacities: 0.0 (solar-only reference baseline)
  // and candidate storage capacities (0.5 to 20.0 kWh in 0.5 kWh steps).
  // Total 41 tested candidate sizes (Report Section 4.5 & Section 8.2).
  const capacities = Array.from({ length: 41 }, (_, i) => i * 0.5);
  const results = capacities.map(c => simulateCapacity(c, inputs, series, false));
  const baseline = results[0];

  for (const r of results) {
    r.netBenefitAUD = baseline.totalAnnualCostAUD - r.totalAnnualCostAUD;
    if (r.capacityKWh > 0 && r.netCapexAUD > 0) {
      const grossBillSavings = baseline.gridCostAUD - r.gridCostAUD;
      const netAnnualOperatingSavings = grossBillSavings - r.annualOMAUD;
      r.simplePaybackYears = netAnnualOperatingSavings > 0 ? r.netCapexAUD / netAnnualOperatingSavings : null;
    } else {
      r.simplePaybackYears = null;
    }
  }

  // Find least-cost positive battery candidate among physical storage options (Eb > 0)
  const positiveCandidates = results.filter(r => r.capacityKWh > 0);
  const bestPositive = positiveCandidates.reduce((best, candidate) => {
    // If tie within EPS, choose the smaller battery size
    if (Math.abs(candidate.totalAnnualCostAUD - best.totalAnnualCostAUD) < EPS) {
      return candidate.capacityKWh < best.capacityKWh ? candidate : best;
    }
    return candidate.totalAnnualCostAUD < best.totalAnnualCostAUD ? candidate : best;
  }, positiveCandidates[0]);

  // Financial viability check: does the best battery beat solar alone?
  const bestBatteryFinanciallyWorthwhile = bestPositive.netBenefitAUD >= -0.005;

  // Formal Mathematical Optimum Eb* (Report Section 4.5, Eq. 13 & Section 7.2):
  // Eb* = arg min_{Eb in B} { C_grid(Eb) + AEC(Eb) }
  // When no battery beats solar alone, Eb* = 0 kWh (baseline is the cost-minimizing choice).
  const economicOptimal = bestBatteryFinanciallyWorthwhile ? bestPositive : baseline;

  // Find user selected candidate across all candidate capacities (including 0 kWh)
  const selectedSummary = results.find(
    r => Math.abs(r.capacityKWh - inputs.selectedBatteryKWh) < 1e-6
  );
  if (!selectedSummary) {
    throw new Error(`Selected battery ${inputs.selectedBatteryKWh} kWh is outside candidate range (0.0–20.0 kWh in 0.5 kWh steps).`);
  }

  // Run detailed hourly simulation for the selected battery
  const selectedDetail = simulateCapacity(selectedSummary.capacityKWh, inputs, series, true);
  selectedDetail.netBenefitAUD = baseline.totalAnnualCostAUD - selectedDetail.totalAnnualCostAUD;
  if (selectedDetail.capacityKWh > 0 && selectedDetail.netCapexAUD > 0) {
    const grossBillSavings = baseline.gridCostAUD - selectedDetail.gridCostAUD;
    const netAnnualOperatingSavings = grossBillSavings - selectedDetail.annualOMAUD;
    selectedDetail.simplePaybackYears = netAnnualOperatingSavings > 0 ? selectedDetail.netCapexAUD / netAnnualOperatingSavings : null;
  } else {
    selectedDetail.simplePaybackYears = null;
  }

  return {
    series,
    results,
    baseline,
    economicOptimal,
    bestPositive,
    selected: selectedDetail,
    selectedPremiumAUD: selectedDetail.totalAnnualCostAUD - economicOptimal.totalAnnualCostAUD,
    bestBatteryFinanciallyWorthwhile,
    sourceNote: '8,760 hourly simulation data',
  };
}
