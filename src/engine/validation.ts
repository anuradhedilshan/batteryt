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
}
