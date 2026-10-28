import { Inputs, Series, Hour, Result, EvaluationOutput, ProductEvaluation, AnnualCashFlow, HOURS, EPS } from './types';
import { validateInputs } from './validation';
import { Battery } from './battery';
import { COMMERCIAL_PRODUCTS, BatteryProduct } from '../config/products';
import { calculateSubsidy, getSTCFactor, tierWeightedKWh } from '../config/cheaperHomeBatteries';

export { HOURS, EPS, Battery, COMMERCIAL_PRODUCTS, calculateSubsidy, getSTCFactor, tierWeightedKWh };
export type { BatteryProduct, ProductEvaluation, AnnualCashFlow };

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
  curtailed?: Float64Array;
  totalCurtailedKWh?: number;
  passes: number;
  maxResidual: number;
  minStored: number;
  maxStored: number;
  initialStored: number;
  cyclicResidual: number;
  hourly?: Hour[];
}

/**
 * Core simulation rule per timestep dt (Phase 2 & Phase 4):
 * Accepts 60-min (dt=1.0), 30-min (dt=0.5), 5-min (dt=1/12) intervals.
 * 0 kWh skips all battery/SOC logic.
 * Enforces energy balance, stored energy boundaries, power ratings, and optional export limit.
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
  recordHourly = false,
  exportLimitKW?: number
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
    const curtailed = new Float64Array(n);
    let totalCurtailed = 0;
    const hourly: Hour[] | undefined = recordHourly ? new Array(n) : undefined;

    for (let t = 0; t < n; t++) {
      imp[t] = Math.max(0, load[t] - pv[t]);
      const surplus = Math.max(0, pv[t] - load[t]);
      if (exportLimitKW !== undefined && exportLimitKW >= 0) {
        const allowedExp = Math.min(surplus, exportLimitKW * dt);
        exp[t] = allowedExp;
        curtailed[t] = Math.max(0, surplus - allowedExp);
        totalCurtailed += curtailed[t];
      } else {
        exp[t] = surplus;
      }

      if (hourly) {
        hourly[t] = {
          index: t,
          pv: pv[t],
          load: load[t],
          surplus,
          deficit: imp[t],
          storedBefore: 0,
          charge: 0,
          discharge: 0,
          storedAfter: 0,
          gridImport: imp[t],
          gridExport: exp[t],
          curtailed: curtailed[t],
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
      curtailed,
      totalCurtailedKWh: totalCurtailed,
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
  const curtailed = new Float64Array(n);
  let totalCurtailed = 0;
  const hourly: Hour[] | undefined = recordHourly ? new Array(n) : undefined;

  for (let t = 0; t < n; t++) {
    const surplus = Math.max(0, pv[t] - load[t]);
    const deficit = Math.max(0, load[t] - pv[t]);
    const i = deficit - discharge[t];
    const rawExport = surplus - charge[t];
    let x = rawExport;
    let cKWh = 0;
    if (exportLimitKW !== undefined && exportLimitKW >= 0) {
      x = Math.min(rawExport, exportLimitKW * dt);
      cKWh = Math.max(0, rawExport - x);
      totalCurtailed += cKWh;
    }
    imp[t] = i;
    exp[t] = x;
    curtailed[t] = cKWh;

    const residual = Math.abs((pv[t] - cKWh) + i + discharge[t] - (load[t] + charge[t] + x));
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
        curtailed: cKWh,
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
    curtailed,
    totalCurtailedKWh: totalCurtailed,
    passes: passesRun,
    maxResidual,
    minStored,
    maxStored,
    initialStored,
    cyclicResidual,
    hourly,
  };
}

/**
 * Lifetime NPV evaluation with capacity fade, tariff escalation, and O&M.
 * Matches battery_model.py evaluate() economics.
 */
export function evaluateLifetimeNPV(
  bat: Battery | null,
  pv: Float64Array,
  load: Float64Array,
  baseGridCost: number,
  grossCapex: number,
  subsidy: number,
  p: Inputs,
  dt = 1.0
): {
  npv: number;
  equivAnnual: number;
  netCapex: number;
  subsidy: number;
  savingY1: number;
  paybackYears: number | null;
  breakEvenGrossAUD: number;
  discountedPaybackYear: number | null;
  annualCashFlows: AnnualCashFlow[];
} {
  const years = p.lifeYears;
  const r = p.annualDiscountRatePct / 100;
  const crf = capitalRecoveryFactor(r, years);
  const netCapex = Math.max(0, grossCapex - subsidy);
  const omFrac = p.annualOMPercentGross / 100;
  const omAUD = omFrac * grossCapex;
  const escalation = (p.tariffEscalationPct ?? 0) / 100;
  const fadePerYear = (p.capacityFadePctPerYear ?? 0) / 100;

  if (!bat || bat.usable <= 0) {
    return {
      npv: 0.0,
      equivAnnual: 0.0,
      netCapex: 0.0,
      subsidy: 0.0,
      savingY1: 0.0,
      paybackYears: null,
      breakEvenGrossAUD: 0.0,
      discountedPaybackYear: null,
      annualCashFlows: [],
    };
  }

  const horizon = Math.max(years, 30);
  const cache = new Map<number, number>();
  let cum = -netCapex;
  let npvAtLife = 0.0;
  let savingY1 = 0.0;
  let pvSavings = 0.0;
  let annuity = 0.0;
  let dpb: number | null = null;
  const annualCashFlows: AnnualCashFlow[] = [];

  for (let y = 1; y <= horizon; y++) {
    const remaining = Math.round(Math.pow(1 - fadePerYear, y - 1) * 1e6) / 1e6;
    let baseMinusYearCost: number;
    let yearGridCost: number;

    if (cache.has(remaining)) {
      baseMinusYearCost = cache.get(remaining)!;
      yearGridCost = baseGridCost - baseMinusYearCost;
    } else {
      const by = bat.faded(remaining);
      const simY = simulateBatteryTimeSeries(pv, load, by, dt, undefined, true, 1e-6, 50, false, p.exportLimitKW);
      let imp = 0;
      let exp = 0;
      for (let t = 0; t < simY.imp.length; t++) {
        imp += simY.imp[t];
        exp += simY.exp[t];
      }
      yearGridCost = imp * p.importAUDPerKWh - exp * p.feedInAUDPerKWh;
      baseMinusYearCost = baseGridCost - yearGridCost;
      cache.set(remaining, baseMinusYearCost);
    }

    const escFactor = Math.pow(1 + escalation, y - 1);
    const saving = baseMinusYearCost * escFactor;
    if (y === 1) {
      savingY1 = saving;
    }
    const discount = Math.pow(1 + r, y);
    cum += (saving - omAUD) / discount;
    if (y <= years) {
      pvSavings += saving / discount;
      annuity += 1 / discount;
    }
    if (dpb === null && cum >= 0) {
      dpb = y;
    }
    if (y === years) {
      npvAtLife = cum;
    }

    if (y <= years) {
      const netCashFlow = saving - omAUD;
      const discountedCashFlow = netCashFlow / discount;
      annualCashFlows.push({
        year: y,
        fadedCapacityKWh: bat.usable * remaining,
        gridCostAUD: yearGridCost,
        savingAUD: saving,
        omAUD: omAUD,
        netCashFlowAUD: netCashFlow,
        discountedCashFlowAUD: discountedCashFlow,
      });
    }
  }

  const netAnnualY1 = savingY1 - omAUD;
  const paybackYears = netAnnualY1 > 0 ? netCapex / netAnnualY1 : null;
  const breakEvenGrossAUD = (subsidy + pvSavings) / (1 + omFrac * annuity);

  return {
    npv: npvAtLife,
    equivAnnual: npvAtLife * crf,
    netCapex,
    subsidy,
    savingY1,
    paybackYears,
    breakEvenGrossAUD,
    discountedPaybackYear: dpb,
    annualCashFlows,
  };
}

export function simulateCapacity(
  capacityKWh: number,
  p: Inputs,
  series: Series,
  detailed = false,
  dt = 1.0,
  baseGridCost?: number
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
    detailed,
    p.exportLimitKW
  );

  let importKWh = 0;
  let exportKWh = 0;
  let chargedKWh = 0;
  let dischargedKWh = 0;
  let totalPV = 0;
  let totalLoad = 0;
  for (let t = 0; t < sim.imp.length; t++) {
    importKWh += sim.imp[t];
    exportKWh += sim.exp[t];
    chargedKWh += sim.charge[t];
    dischargedKWh += sim.discharge[t];
    totalPV += series.pv[t];
    totalLoad += series.load[t];
  }

  const grossCapex = capacityKWh > 0 ? p.fixedCapexAUD + capacityKWh * p.variableCapexAUDPerKWh : 0;
  let subsidy: number;
  if (p.useCheaperHomeBatteriesProgram) {
    const usableKWh = bat ? bat.usable : 0;
    const sub = calculateSubsidy(
      usableKWh,
      p.installDate,
      p.stcPriceAUD,
      p.subsidyEligible ?? true
    );
    subsidy = capacityKWh > 0 ? sub.subsidyAUD : 0;
  } else {
    subsidy = grossCapex * (p.hypotheticalDiscountPct / 100);
  }

  const netCapex = Math.max(0, grossCapex - subsidy);
  const crf = capitalRecoveryFactor(p.annualDiscountRatePct / 100, p.lifeYears);
  const annualCapital = netCapex * crf;
  const annualOM = grossCapex * (p.annualOMPercentGross / 100);
  const ownerCost = annualCapital + annualOM;
  const gridCost = importKWh * p.importAUDPerKWh - exportKWh * p.feedInAUDPerKWh;
  const totalCost = gridCost + ownerCost;

  const selfConsumptionPct = totalPV > 0 ? ((totalPV - exportKWh) / totalPV) * 100 : 0;
  const selfSufficiencyPct = totalLoad > 0 ? ((totalLoad - importKWh) / totalLoad) * 100 : 0;

  const effectiveBaseGridCost = baseGridCost !== undefined ? baseGridCost : gridCost;
  const lifetime = evaluateLifetimeNPV(
    bat,
    series.pv,
    series.load,
    effectiveBaseGridCost,
    grossCapex,
    subsidy,
    p,
    dt
  );

  return {
    capacityKWh,
    usableKWh: bat ? bat.usable : 0,
    powerKW: bat ? bat.p_discharge : 0,
    initialKWh: bat ? sim.initialStored : 0,
    finalKWh: bat ? sim.stored[sim.stored.length - 1] : 0,
    cyclicResidual: sim.cyclicResidual,
    maxEnergyResidual: sim.maxResidual,
    minStoredKWh: sim.minStored,
    maxStoredKWh: sim.maxStored,
    importKWh,
    exportKWh,
    curtailedKWh: sim.totalCurtailedKWh ?? 0,
    chargedKWh,
    dischargedKWh,
    equivalentCycles: (bat && bat.usable > 0) ? dischargedKWh / (eff * bat.usable) : 0,
    selfConsumptionPct,
    selfSufficiencyPct,
    gridCostAUD: gridCost,
    grossCapexAUD: grossCapex,
    subsidyAUD: subsidy,
    netCapexAUD: netCapex,
    annualCapitalAUD: annualCapital,
    annualOMAUD: annualOM,
    ownerCostAUD: ownerCost,
    totalAnnualCostAUD: totalCost,
    netBenefitAUD: 0, // Filled in relative to baseline
    lifetimeNPVAUD: lifetime.npv,
    equivalentAnnualBenefitAUD: lifetime.equivAnnual,
    year1BillSavingsAUD: lifetime.savingY1,
    simplePaybackYears: lifetime.paybackYears,
    breakEvenGrossAUD: lifetime.breakEvenGrossAUD,
    discountedPaybackYear: lifetime.discountedPaybackYear,
    annualCashFlows: lifetime.annualCashFlows,
    hourly: sim.hourly,
  };
}

export function evaluateProduct(
  product: BatteryProduct,
  inputs: Inputs,
  series: Series,
  baseGridCost: number,
  detailed = false,
  dt = 1.0
): ProductEvaluation {
  const isNoBattery = product.usableKWh <= 0;
  const eff = Math.sqrt(product.efficiencyRoundTrip || 0.90);
  const bat = isNoBattery
    ? null
    : Battery.fromUsable(product.usableKWh, product.powerKW, 0.0, eff, eff);

  const sim = simulateBatteryTimeSeries(
    series.pv,
    series.load,
    bat,
    dt,
    undefined,
    true,
    1e-6,
    50,
    detailed,
    inputs.exportLimitKW
  );

  let importKWh = 0;
  let exportKWh = 0;
  let chargedKWh = 0;
  let dischargedKWh = 0;
  let totalPV = 0;
  let totalLoad = 0;
  for (let t = 0; t < sim.imp.length; t++) {
    importKWh += sim.imp[t];
    exportKWh += sim.exp[t];
    chargedKWh += sim.charge[t];
    dischargedKWh += sim.discharge[t];
    totalPV += series.pv[t];
    totalLoad += series.load[t];
  }

  const grossCapex = isNoBattery ? 0 : product.installedPriceAUD;
  const subResult = calculateSubsidy(
    product.usableKWh,
    inputs.installDate,
    inputs.stcPriceAUD,
    inputs.subsidyEligible ?? true
  );
  const subsidy = isNoBattery ? 0 : subResult.subsidyAUD;
  const netCapex = Math.max(0, grossCapex - subsidy);
  const crf = capitalRecoveryFactor(inputs.annualDiscountRatePct / 100, inputs.lifeYears);
  const annualCapital = netCapex * crf;
  const annualOM = grossCapex * (inputs.annualOMPercentGross / 100);
  const ownerCost = annualCapital + annualOM;
  const gridCost = importKWh * inputs.importAUDPerKWh - exportKWh * inputs.feedInAUDPerKWh;
  const totalCost = gridCost + ownerCost;
  const selfConsumptionPct = totalPV > 0 ? ((totalPV - exportKWh) / totalPV) * 100 : 0;
  const selfSufficiencyPct = totalLoad > 0 ? ((totalLoad - importKWh) / totalLoad) * 100 : 0;
  const equivalentCycles = (!isNoBattery && bat) ? dischargedKWh / (eff * bat.usable) : 0;

  const lifetime = evaluateLifetimeNPV(
    bat,
    series.pv,
    series.load,
    baseGridCost,
    grossCapex,
    subsidy,
    inputs,
    dt
  );

  const res: Result = {
    capacityKWh: product.usableKWh,
    usableKWh: product.usableKWh,
    powerKW: product.powerKW,
    productName: product.name,
    initialKWh: bat ? sim.initialStored : 0,
    finalKWh: bat ? sim.stored[sim.stored.length - 1] : 0,
    cyclicResidual: sim.cyclicResidual,
    maxEnergyResidual: sim.maxResidual,
    minStoredKWh: sim.minStored,
    maxStoredKWh: sim.maxStored,
    importKWh,
    exportKWh,
    curtailedKWh: sim.totalCurtailedKWh ?? 0,
    chargedKWh,
    dischargedKWh,
    equivalentCycles,
    selfConsumptionPct,
    selfSufficiencyPct,
    gridCostAUD: gridCost,
    grossCapexAUD: grossCapex,
    subsidyAUD: subsidy,
    netCapexAUD: netCapex,
    annualCapitalAUD: annualCapital,
    annualOMAUD: annualOM,
    ownerCostAUD: ownerCost,
    totalAnnualCostAUD: totalCost,
    netBenefitAUD: baseGridCost - gridCost - ownerCost,
    lifetimeNPVAUD: lifetime.npv,
    equivalentAnnualBenefitAUD: lifetime.equivAnnual,
    year1BillSavingsAUD: lifetime.savingY1,
    simplePaybackYears: lifetime.paybackYears,
    breakEvenGrossAUD: lifetime.breakEvenGrossAUD,
    discountedPaybackYear: lifetime.discountedPaybackYear,
    annualCashFlows: lifetime.annualCashFlows,
    hourly: sim.hourly,
  };

  return {
    id: product.id,
    name: product.name,
    manufacturer: product.manufacturer,
    usableKWh: product.usableKWh,
    powerKW: product.powerKW,
    installedPriceAUD: product.installedPriceAUD,
    subsidyAUD: subsidy,
    netCapexAUD: netCapex,
    lifetimeNPVAUD: lifetime.npv,
    equivalentAnnualBenefitAUD: lifetime.equivAnnual,
    year1BillSavingsAUD: lifetime.savingY1,
    simplePaybackYears: lifetime.paybackYears,
    breakEvenGrossAUD: lifetime.breakEvenGrossAUD,
    discountedPaybackYear: lifetime.discountedPaybackYear,
    selfConsumptionPct,
    selfSufficiencyPct,
    equivalentCycles,
    result: res,
  };
}

export function rankProducts(
  products: readonly BatteryProduct[],
  inputs: Inputs,
  series: Series,
  baseGridCost: number,
  dt = 1.0
): ProductEvaluation[] {
  const list = products.map(p => evaluateProduct(p, inputs, series, baseGridCost, false, dt));
  return list.sort((a, b) => b.lifetimeNPVAUD - a.lifetimeNPVAUD);
}

export function evaluateAll(
  inputs: Inputs,
  referencePV: readonly number[],
  referenceLoad: readonly number[]
): EvaluationOutput {
  validateInputs(inputs);
  const series = scaleSeries(referencePV, referenceLoad, inputs);

  // Baseline: pure solar-only 0 kWh
  const baseline = simulateCapacity(0.0, inputs, series, false);

  // Candidate battery capacities: 0.0 to 20.0 kWh in 0.5 kWh steps (41 candidates)
  const capacities = Array.from({ length: 41 }, (_, i) => i * 0.5);
  const results = capacities.map(c =>
    c === 0 ? baseline : simulateCapacity(c, inputs, series, false, 1.0, baseline.gridCostAUD)
  );

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
    if (Math.abs(candidate.totalAnnualCostAUD - best.totalAnnualCostAUD) < EPS) {
      return candidate.capacityKWh < best.capacityKWh ? candidate : best;
    }
    return candidate.totalAnnualCostAUD < best.totalAnnualCostAUD ? candidate : best;
  }, positiveCandidates[0]);

  // Financial viability check: does the best battery beat solar alone?
  const bestBatteryFinanciallyWorthwhile = bestPositive.netBenefitAUD >= -0.005;

  // Formal Mathematical Optimum Eb* (Report Section 4.5, Eq. 13 & Section 7.2):
  const economicOptimal = bestBatteryFinanciallyWorthwhile ? bestPositive : baseline;

  // Commercial product evaluations & ranking by lifetime NPV
  const productRankings = rankProducts(COMMERCIAL_PRODUCTS, inputs, series, baseline.gridCostAUD);
  const bestProductByNPV = productRankings[0];

  // Find user selected candidate across all candidate capacities (including 0 kWh)
  let selectedSummary = results.find(
    r => Math.abs(r.capacityKWh - inputs.selectedBatteryKWh) < 1e-6
  );

  // If user selected a custom or off-grid commercial capacity (e.g. 9.6 kWh, 7.7 kWh, 13.5 kWh)
  // that was not in the initial 0.5 kWh grid, simulate it on demand rather than throwing an error
  if (!selectedSummary) {
    selectedSummary = simulateCapacity(inputs.selectedBatteryKWh, inputs, series, false, 1.0, baseline.gridCostAUD);
    selectedSummary.netBenefitAUD = baseline.totalAnnualCostAUD - selectedSummary.totalAnnualCostAUD;
    if (selectedSummary.capacityKWh > 0 && selectedSummary.netCapexAUD > 0) {
      const grossBillSavings = baseline.gridCostAUD - selectedSummary.gridCostAUD;
      const netAnnualOperatingSavings = grossBillSavings - selectedSummary.annualOMAUD;
      selectedSummary.simplePaybackYears = netAnnualOperatingSavings > 0 ? selectedSummary.netCapexAUD / netAnnualOperatingSavings : null;
    } else {
      selectedSummary.simplePaybackYears = null;
    }
    // Seamlessly include in results array and maintain sorted order by capacity
    results.push(selectedSummary);
    results.sort((a, b) => a.capacityKWh - b.capacityKWh);
  }

  // Run detailed hourly simulation for the selected battery
  const selectedDetail = simulateCapacity(selectedSummary.capacityKWh, inputs, series, true, 1.0, baseline.gridCostAUD);
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
    productRankings,
    bestProductByNPV,
    sourceNote: '8,760 hourly simulation data',
  };
}
