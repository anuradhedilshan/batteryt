import { describe, it, expect } from 'vitest';
import {
  tierWeightedKWh,
  getSTCFactor,
  calculateSubsidy,
} from '../config/cheaperHomeBatteries';
import { COMMERCIAL_PRODUCTS } from '../config/products';
import {
  capitalRecoveryFactor,
  rankProducts,
  simulateCapacity,
} from './model';
import { Inputs, Series } from './types';
import referenceProfile from '../data/syntheticReference.json';

const TEST_INPUTS: Inputs = {
  selectedBatteryKWh: 10.0,
  pvKW: 6.6,
  pvReferenceKW: 6.6,
  demandMultiplier: 1.0,
  importAUDPerKWh: 0.35,
  feedInAUDPerKWh: 0.05,
  variableCapexAUDPerKWh: 700,
  fixedCapexAUD: 1000,
  hypotheticalDiscountPct: 30,
  efficiencyPct: 95,
  cRate: 0.5,
  socMinPct: 10,
  socMaxPct: 95,
  annualDiscountRatePct: 6,
  lifeYears: 10,
  annualOMPercentGross: 1.0,
  tariffEscalationPct: 0.0,
  capacityFadePctPerYear: 0.0,
  installDate: '2026-11-01',
  stcPriceAUD: 37.0,
  useCheaperHomeBatteriesProgram: true,
  subsidyEligible: true,
};

describe('Phase 3 - Economics, Cheaper Home Batteries Subsidy, and Lifetime NPV', () => {
  it('accurately calculates Cheaper Home Batteries tier-weighted capacity matching Equation 16', () => {
    // 0 to 14 kWh at 100%
    expect(tierWeightedKWh(5)).toBeCloseTo(5.0, 9);
    expect(tierWeightedKWh(10)).toBeCloseTo(10.0, 9);
    expect(tierWeightedKWh(14)).toBeCloseTo(14.0, 9);

    // 14 to 28 kWh at 60%
    // 20 kWh: 14 + 0.6 * 6 = 17.6 kWh
    expect(tierWeightedKWh(20)).toBeCloseTo(17.6, 9);
    // 28 kWh: 14 + 0.6 * 14 = 22.4 kWh
    expect(tierWeightedKWh(28)).toBeCloseTo(22.4, 9);

    // 28 to 50 kWh at 15%
    // 40 kWh: 22.4 + 0.15 * 12 = 24.2 kWh
    expect(tierWeightedKWh(40)).toBeCloseTo(24.2, 9);
    // 50 kWh: 22.4 + 0.15 * 22 = 25.7 kWh
    expect(tierWeightedKWh(50)).toBeCloseTo(25.7, 9);

    // Capped at 50 kWh maximum (0% above 50 kWh)
    // 60 kWh: same as 50 kWh (14 + 8.4 + 3.3 = 25.7 kWh)
    expect(tierWeightedKWh(60)).toBeCloseTo(25.7, 9);
  });

  it('determines the exact STC factor according to the Clean Energy Regulator schedule', () => {
    expect(getSTCFactor('2026-05-01')).toBe(6.8);
    expect(getSTCFactor('2026-11-01')).toBe(6.8);
    expect(getSTCFactor('2027-01-01')).toBe(5.7);
    expect(getSTCFactor('2027-03-15')).toBe(5.7);
    expect(getSTCFactor('2027-07-01')).toBe(5.2);
    expect(getSTCFactor('2028-01-01')).toBe(4.6);
    expect(getSTCFactor('2028-08-10')).toBe(4.1);
    expect(getSTCFactor('2029-02-01')).toBe(3.6);
    expect(getSTCFactor('2029-10-01')).toBe(3.1);
    expect(getSTCFactor('2030-01-01')).toBe(2.6);
    expect(getSTCFactor('2030-07-01')).toBe(2.1);
    expect(getSTCFactor('2031-01-01')).toBe(0.0);

    expect(() => getSTCFactor('2026-04-30')).toThrow(/prior to program start/i);
  });

  it('calculates the indicative battery subsidy in AUD matching battery_model.py golden figures', () => {
    // 10 kWh usable, 1 Nov 2026, STC price $37
    // STC factor = 6.8, tierWeighted = 10.0, STCs = floor(68.0) = 68, subsidy = 68 * 37 = $2,516
    const sub10 = calculateSubsidy(10.0, '2026-11-01', 37.0);
    expect(sub10.eligible).toBe(true);
    expect(sub10.stcFactor).toBe(6.8);
    expect(sub10.stcCount).toBe(68);
    expect(sub10.subsidyAUD).toBe(2516);

    // 13.5 kWh usable (Tesla Powerwall 2)
    // 13.5 * 6.8 = 91.8 -> floor = 91 -> 91 * 37 = $3,367
    const sub135 = calculateSubsidy(13.5, '2026-11-01', 37.0);
    expect(sub135.stcCount).toBe(91);
    expect(sub135.subsidyAUD).toBe(3367);

    // Below 5.0 kWh eligibility threshold -> $0 subsidy
    const sub4 = calculateSubsidy(4.5, '2026-11-01', 37.0);
    expect(sub4.eligible).toBe(false);
    expect(sub4.subsidyAUD).toBe(0);

    // Ineligible accreditation or hardware -> $0 subsidy
    const subIneligible = calculateSubsidy(10.0, '2026-11-01', 37.0, false, true);
    expect(subIneligible.eligible).toBe(false);
    expect(subIneligible.subsidyAUD).toBe(0);
  });

  it('proves lifetime NPV equivalent annual benefit equals single-year net benefit when escalation=0 and fade=0', () => {
    const series: Series = {
      pv: new Float64Array(referenceProfile.pv),
      load: new Float64Array(referenceProfile.load),
    };
    const base = simulateCapacity(0.0, TEST_INPUTS, series, false);
    const batRes = simulateCapacity(10.0, TEST_INPUTS, series, false, 1.0, base.gridCostAUD);

    // Expected: equivAnnual === netBenefitAUD (Eq. 15 equivalence)
    const annualNetBenefit = base.totalAnnualCostAUD - batRes.totalAnnualCostAUD;
    expect(batRes.equivalentAnnualBenefitAUD).toBeCloseTo(annualNetBenefit, 4);

    const crf = capitalRecoveryFactor(TEST_INPUTS.annualDiscountRatePct / 100, TEST_INPUTS.lifeYears);
    expect(batRes.lifetimeNPVAUD * crf).toBeCloseTo(annualNetBenefit, 4);
  });

  it('ranks real commercial products and demonstrates how lifetime sensitivity affects NPV', () => {
    const series: Series = {
      pv: new Float64Array(referenceProfile.pv),
      load: new Float64Array(referenceProfile.load),
    };
    const base = simulateCapacity(0.0, TEST_INPUTS, series, false);

    // Rank products with 10-year lifetime
    const inputs10: Inputs = { ...TEST_INPUTS, lifeYears: 10 };
    const ranked10 = rankProducts(COMMERCIAL_PRODUCTS, inputs10, series, base.gridCostAUD);
    expect(ranked10.length).toBe(COMMERCIAL_PRODUCTS.length);
    expect(ranked10[0].name).toContain('No Battery'); // At 10 years, No Battery wins

    // Rank products with 15-year lifetime
    const inputs15: Inputs = { ...TEST_INPUTS, lifeYears: 15 };
    const ranked15 = rankProducts(COMMERCIAL_PRODUCTS, inputs15, series, base.gridCostAUD);
    expect(ranked15.length).toBe(COMMERCIAL_PRODUCTS.length);
    expect(ranked15[0].usableKWh).toBeGreaterThan(0); // At 15 years, a positive battery wins!
    expect(ranked15[0].lifetimeNPVAUD).toBeGreaterThan(0);

    // At 15 years, positive battery products have higher NPV due to 5 extra years of bill savings
    const bestPositive10 = ranked10.find(p => p.usableKWh > 0)!;
    const bestPositive15 = ranked15.find(p => p.usableKWh > 0)!;
    expect(bestPositive15.lifetimeNPVAUD).toBeGreaterThan(bestPositive10.lifetimeNPVAUD);
  });

  it('accurately computes self-consumption and self-sufficiency percentages', () => {
    const series: Series = {
      pv: new Float64Array(referenceProfile.pv),
      load: new Float64Array(referenceProfile.load),
    };
    const base = simulateCapacity(0.0, TEST_INPUTS, series, false);
    const bat10 = simulateCapacity(10.0, TEST_INPUTS, series, false, 1.0, base.gridCostAUD);

    // Self-consumption must increase with battery storage
    expect(bat10.selfConsumptionPct).toBeGreaterThan(base.selfConsumptionPct);
    // Self-sufficiency must increase with battery storage
    expect(bat10.selfSufficiencyPct).toBeGreaterThan(base.selfSufficiencyPct);

    // Bounds check
    expect(bat10.selfConsumptionPct).toBeGreaterThan(0);
    expect(bat10.selfConsumptionPct).toBeLessThanOrEqual(100);
    expect(bat10.selfSufficiencyPct).toBeGreaterThan(0);
    expect(bat10.selfSufficiencyPct).toBeLessThanOrEqual(100);
  });
});
