import { Inputs } from './types';

export function validateInputs(p: Inputs): void {
  for (const [key, value] of Object.entries(p)) {
    if (!Number.isFinite(value)) {
      throw new Error(`Parameter '${key}' must be a finite number.`);
    }
  }

  if (p.selectedBatteryKWh < 0) {
    throw new Error('Battery capacity cannot be negative.');
  }

  if (p.pvKW <= 0) {
    throw new Error('Rooftop PV rating must be a positive number.');
  }

  if (p.pvReferenceKW <= 0) {
    throw new Error('Reference PV rating must be a positive number.');
  }

  if (p.demandMultiplier <= 0) {
    throw new Error('Household demand multiplier must be positive.');
  }

  if (p.efficiencyPct <= 0 || p.efficiencyPct > 100) {
    throw new Error('Round-trip efficiency component must be between 1% and 100%.');
  }

  if (p.cRate <= 0) {
    throw new Error('Battery C-rate power capability must be positive.');
  }

  if (p.lifeYears <= 0) {
    throw new Error('Economic lifetime must be positive.');
  }

  if (p.socMinPct < 0 || p.socMaxPct > 100 || p.socMinPct >= p.socMaxPct) {
    throw new Error('Minimum SOC must be strictly less than maximum SOC, within 0% to 100%.');
  }

  if (p.importAUDPerKWh < 0) {
    throw new Error('Retail import tariff cannot be negative.');
  }

  if (p.feedInAUDPerKWh < 0) {
    throw new Error('Feed-in tariff cannot be negative.');
  }

  if (p.variableCapexAUDPerKWh < 0 || p.fixedCapexAUD < 0) {
    throw new Error('Battery installation capital costs cannot be negative.');
  }

  if (p.hypotheticalDiscountPct < 0 || p.hypotheticalDiscountPct > 100) {
    throw new Error('Hypothetical cost discount must be between 0% and 100%.');
  }

  if (p.annualDiscountRatePct < 0) {
    throw new Error('Discount rate cannot be negative.');
  }

  if (p.annualOMPercentGross < 0) {
    throw new Error('Annual O&M rate cannot be negative.');
  }

  if (p.tariffEscalationPct !== undefined && !Number.isFinite(p.tariffEscalationPct)) {
    throw new Error('Tariff escalation rate must be a finite number.');
  }

  if (p.capacityFadePctPerYear !== undefined && (p.capacityFadePctPerYear < 0 || p.capacityFadePctPerYear > 50)) {
    throw new Error('Capacity fade rate must be between 0% and 50% per year.');
  }

  if (p.stcPriceAUD !== undefined && p.stcPriceAUD < 0) {
    throw new Error('STC price cannot be negative.');
  }
}

export interface InputSanityWarning {
  message: string;
  isBlocking: boolean;
  type: 'tariff-cents' | 'fit-exceeds-import' | 'low-pv' | 'energy-scale';
}

/**
 * Catches the bugs that silently make every battery lose.
 * Matches battery_model.py sanity_check_inputs(t_imp, t_fit, pv, load).
 * Returns a list of warnings (blocking and non-blocking).
 */
export function sanityCheckInputs(
  t_imp: number | readonly number[] | Float64Array,
  t_fit: number | readonly number[] | Float64Array,
  pv: readonly number[] | Float64Array,
  load: readonly number[] | Float64Array
): InputSanityWarning[] {
  const warnings: InputSanityWarning[] = [];

  const ti = typeof t_imp === 'number' ? [t_imp] : Array.from(t_imp);
  const tf = typeof t_fit === 'number' ? [t_fit] : Array.from(t_fit);

  let tiMax = -Infinity;
  let tiMin = Infinity;
  for (const v of ti) {
    if (v > tiMax) tiMax = v;
    if (v < tiMin) tiMin = v;
  }

  let tfMax = -Infinity;
  for (const v of tf) {
    if (v > tfMax) tfMax = v;
  }

  // 1. Tariff above 2 AUD/kWh: probably CENTS entered as dollars -> Blocking
  if (tiMax > 2.0 || tfMax > 2.0) {
    warnings.push({
      message: 'Tariff above 2 AUD/kWh: probably CENTS entered as dollars. Use AUD/kWh (0.35 not 35).',
      isBlocking: true,
      type: 'tariff-cents',
    });
  }

  // 2. Feed-in tariff >= import tariff: a battery can never pay -> Blocking
  if (tfMax >= tiMin) {
    warnings.push({
      message: 'Feed-in tariff >= import tariff: a battery can never pay. Check the numbers/units.',
      isBlocking: true,
      type: 'fit-exceeds-import',
    });
  }

  // 3. PV is small share of load (< 30%) -> Advisory (non-blocking)
  let sumPV = 0;
  let sumLoad = 0;
  for (let i = 0; i < pv.length; i++) {
    sumPV += pv[i];
  }
  for (let i = 0; i < load.length; i++) {
    sumLoad += load[i];
  }
  if (sumPV < sumLoad * 0.3) {
    warnings.push({
      message: 'PV is a small share of load: little surplus to store. Check PV units (kWh per interval).',
      isBlocking: false,
      type: 'low-pv',
    });
  }

  // 4. Mean hourly energy > 20 kWh -> Advisory (non-blocking)
  const meanPV = pv.length > 0 ? sumPV / pv.length : 0;
  const meanLoad = load.length > 0 ? sumLoad / load.length : 0;
  if (meanPV > 20 || meanLoad > 20) {
    warnings.push({
      message: 'Average hourly energy is huge: probably W or Wh, not kWh.',
      isBlocking: false,
      type: 'energy-scale',
    });
  }

  return warnings;
}
