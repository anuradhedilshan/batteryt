import { describe, expect, it } from 'vitest';
import {
  capitalRecoveryFactor,
  evaluateAll,
  simulateCapacity,
  scaleSeries,
} from './model';
import { Inputs } from './types';
import { DEFAULT_PV, DEFAULT_LOAD } from '../data/defaultProfile';

const DEFAULTS: Inputs = {
  selectedBatteryKWh: 10,
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
};

describe('Mathematical Simulation Engine', () => {
  it('calculates Capital Recovery Factor accurately', () => {
    // r = 0 case
    expect(capitalRecoveryFactor(0, 10)).toBeCloseTo(0.1, 5);
    // r = 6%, L = 10 yrs: 0.06 * (1.06)^10 / ((1.06)^10 - 1) ≈ 0.1358679
    const crf = capitalRecoveryFactor(0.06, 10);
    expect(crf).toBeCloseTo(0.135868, 5);
  });

  it('keeps 0 kWh strictly as reference baseline and selects 7.5 kWh as optimal positive battery', () => {
    const out = evaluateAll(DEFAULTS, DEFAULT_PV, DEFAULT_LOAD);

    // 0 kWh baseline checks
    expect(out.baseline.capacityKWh).toBe(0);
    expect(out.baseline.ownerCostAUD).toBe(0);
    expect(out.baseline.importKWh).toBeCloseTo(3112.0, 1);
    expect(out.baseline.exportKWh).toBeCloseTo(7871.0, 1);
    expect(out.baseline.totalAnnualCostAUD).toBeCloseTo(695.65, 1);

    // Economic optimal must be 0 kWh under baseline prices (Report Eq. 13 & Sec 7.2)
    expect(out.economicOptimal.capacityKWh).toBe(0);
    expect(out.bestBatteryFinanciallyWorthwhile).toBe(false);

    // Best positive battery (least-cost physical storage option) must be 7.5 kWh
    expect(out.bestPositive.capacityKWh).toBe(7.5);
    expect(out.bestPositive.totalAnnualCostAUD).toBeCloseTo(707.72, 1);
    expect(out.bestPositive.importKWh).toBeCloseTo(923.09, 1);
    expect(out.bestPositive.exportKWh).toBeCloseTo(5445.61, 1);
    expect(out.bestPositive.netBenefitAUD).toBeCloseTo(-12.07, 1);
    expect(out.bestPositive.simplePaybackYears).toBeCloseTo(7.51, 1);

    // Baseline is cheaper than 7.5 kWh
    expect(out.baseline.totalAnnualCostAUD).toBeLessThan(out.bestPositive.totalAnnualCostAUD);

    // User selected 10.0 kWh battery
    expect(out.selected.capacityKWh).toBe(10.0);
    expect(out.selected.totalAnnualCostAUD).toBeCloseTo(747.35, 1);
    expect(out.selected.importKWh).toBeCloseTo(433.22, 1);
    expect(out.selected.exportKWh).toBeCloseTo(4902.83, 1);
    expect(out.selected.netBenefitAUD).toBeCloseTo(-51.70, 1);

    // Cost gap vs economic optimum (0 kWh)
    expect(out.selectedPremiumAUD).toBeCloseTo(747.35 - 695.65, 1);
  });

  it('verifies the U-shaped cost curve around the 7.5 kWh minimum', () => {
    const out = evaluateAll(DEFAULTS, DEFAULT_PV, DEFAULT_LOAD);
    const cost5kWh = out.results.find(r => r.capacityKWh === 5.0)!.totalAnnualCostAUD;
    const cost7_5kWh = out.results.find(r => r.capacityKWh === 7.5)!.totalAnnualCostAUD;
    const cost10kWh = out.results.find(r => r.capacityKWh === 10.0)!.totalAnnualCostAUD;
    const cost15kWh = out.results.find(r => r.capacityKWh === 15.0)!.totalAnnualCostAUD;

    // Below 7.5 kWh: costs are higher (5.0 kWh > 7.5 kWh)
    expect(cost5kWh).toBeGreaterThan(cost7_5kWh);
    expect(cost5kWh).toBeCloseTo(734.49, 1);

    // Above 7.5 kWh: costs are higher (10.0 kWh > 7.5 kWh)
    expect(cost10kWh).toBeGreaterThan(cost7_5kWh);
    expect(cost10kWh).toBeCloseTo(747.35, 1);
    expect(cost15kWh).toBeGreaterThan(cost10kWh);
    expect(cost15kWh).toBeCloseTo(1028.23, 1);

    // Minimum check: 7.5 kWh is strictly less than both 5.0 kWh and 10.0 kWh
    expect(cost7_5kWh).toBeLessThan(cost5kWh);
    expect(cost7_5kWh).toBeLessThan(cost10kWh);
  });

  it('conserves physical energy balance and strictly enforces SOC boundaries for all hours', () => {
    const series = scaleSeries(DEFAULT_PV, DEFAULT_LOAD, DEFAULTS);
    const out = simulateCapacity(10.0, DEFAULTS, series, true);

    expect(out.maxEnergyResidual).toBeLessThan(1e-7);
    expect(out.cyclicResidual).toBeLessThan(1e-6);
    expect(out.minStoredKWh).toBeGreaterThanOrEqual(1.0 - 1e-7); // 10% of 10 kWh
    expect(out.maxStoredKWh).toBeLessThanOrEqual(9.5 + 1e-7);   // 95% of 10 kWh

    for (const h of out.hourly ?? []) {
      expect(h.charge).toBeGreaterThanOrEqual(0);
      expect(h.discharge).toBeGreaterThanOrEqual(0);
      expect(h.gridImport).toBeGreaterThanOrEqual(0);
      expect(h.gridExport).toBeGreaterThanOrEqual(0);
      expect(h.energyResidual).toBeLessThan(1e-7);
    }
  });

  it('rejects invalid inputs correctly', () => {
    expect(() =>
      evaluateAll({ ...DEFAULTS, selectedBatteryKWh: -1 }, DEFAULT_PV, DEFAULT_LOAD)
    ).toThrow(/cannot be negative/i);

    expect(() =>
      evaluateAll({ ...DEFAULTS, socMinPct: 90, socMaxPct: 20 }, DEFAULT_PV, DEFAULT_LOAD)
    ).toThrow(/Minimum SOC must be strictly less than maximum SOC/i);

    expect(() =>
      evaluateAll({ ...DEFAULTS, efficiencyPct: 0 }, DEFAULT_PV, DEFAULT_LOAD)
    ).toThrow(/efficiency/i);
  });

  it('runs all 8 formal verification checks from Section 6.3 of the report successfully', async () => {
    const { runFullVerificationSuite } = await import('./verification');
    const out = evaluateAll(DEFAULTS, DEFAULT_PV, DEFAULT_LOAD);
    const vResult = runFullVerificationSuite(DEFAULTS, out.series, out.baseline, out.bestPositive);

    expect(vResult.totalChecks).toBe(8);
    expect(vResult.passedCount).toBe(8);
    expect(vResult.allPassed).toBe(true);

    for (const check of vResult.checks) {
      expect(check.passed).toBe(true);
    }
  });

  it('computes tariff sensitivity matrix matching Section 7.3 and Fig. 5 of report', async () => {
    const { computeTariffSensitivityMatrix } = await import('./sensitivity');
    const out = evaluateAll(DEFAULTS, DEFAULT_PV, DEFAULT_LOAD);
    const matrix = computeTariffSensitivityMatrix(out.results);

    expect(matrix.importTariffs).toEqual([0.25, 0.30, 0.35, 0.40, 0.45, 0.50, 0.55]);
    expect(matrix.feedInTariffs).toEqual([0.15, 0.12, 0.09, 0.06, 0.03, 0.00]);

    // Expected capacities strictly matching Report Fig. 5 heatmap
    const expectedFig5 = [
      [0, 0, 0, 0, 0, 8, 9],            // FiT 0.15
      [0, 0, 0, 0, 7.5, 8.5, 9.5],      // FiT 0.12
      [0, 0, 0, 7.5, 8.5, 9, 9.5],      // FiT 0.09
      [0, 0, 0, 8, 9, 9.5, 10],         // FiT 0.06
      [0, 0, 7.5, 8.5, 9.5, 10, 10.5],  // FiT 0.03
      [0, 0, 8.5, 9, 9.5, 10, 10.5],    // FiT 0.00
    ];

    for (let r = 0; r < expectedFig5.length; r++) {
      for (let c = 0; c < expectedFig5[r].length; c++) {
        expect(matrix.grid[r][c].optimalCapacityKWh).toBe(expectedFig5[r][c]);
      }
    }

    // Default baseline condition ($0.35 import, $0.05 FiT) -> Eb* is 0 kWh!
    const baselineCell = matrix.grid[3][2]; // row 3 is 0.06 FiT, col 2 is 0.35 import -> 0 kWh
    expect(baselineCell.optimalCapacityKWh).toBe(0);
    expect(baselineCell.isEconomicallyViable).toBe(false);
  });
});
