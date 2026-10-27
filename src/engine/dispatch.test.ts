import { describe, it, expect } from 'vitest';
import { compareDispatch, computeGridCost } from './dispatch';
import { Battery } from './battery';
import referenceProfile from '../data/syntheticReference.json';

describe('Phase 5 - Tariff-Aware Dispatch (Rule-Based vs Perfect Foresight)', () => {
  const n = 24 * 30; // 30-day benchmark (720 hours) matching test 7 of battery_model.py
  const pv30 = referenceProfile.pv.slice(0, n);
  const load30 = referenceProfile.load.slice(0, n);
  const bat = Battery.fromNominal(10.0);
  const tImpFlat = 0.35;
  const tFit = 0.05;

  it('verifies optimal dispatch cost is never worse than rule-based dispatch under flat tariff', () => {
    const comp = compareDispatch(pv30, load30, bat, tImpFlat, tFit, 1.0);

    expect(comp.optimalCostAUD).toBeLessThanOrEqual(comp.greedyCostAUD + 1e-6);
    expect(comp.greedy.imp.length).toBe(n);
    expect(comp.optimal.imp.length).toBe(n);
    expect(comp.upperBoundDisclaimer).toContain('upper bound');
  });

  it('demonstrates that tariff-aware dispatch beats or matches rule-based greedy dispatch under TOU tariffs', () => {
    // TOU tariff: 17:00 to 21:00 peak ($0.55/kWh), off-peak ($0.25/kWh)
    const tou = new Float64Array(n);
    for (let t = 0; t < n; t++) {
      const hod = t % 24;
      tou[t] = hod >= 17 && hod < 21 ? 0.55 : 0.25;
    }

    const comp = compareDispatch(pv30, load30, bat, tou, tFit, 1.0);

    expect(comp.optimalCostAUD).toBeLessThanOrEqual(comp.greedyCostAUD + 1e-6);
    // Verifies physical validity
    for (let t = 0; t < n; t++) {
      expect(comp.optimal.stored[t]).toBeGreaterThanOrEqual(bat.emin - 1e-7);
      expect(comp.optimal.stored[t]).toBeLessThanOrEqual(bat.emax + 1e-7);
      expect(comp.optimal.charge[t]).toBeLessThanOrEqual(bat.p_charge + 1e-7);
      expect(comp.optimal.discharge[t]).toBeLessThanOrEqual(bat.p_discharge + 1e-7);
    }
  });

  it('correctly calculates grid cost with scalar and array tariffs', () => {
    const imp = new Float64Array([2.0, 3.0]);
    const exp = new Float64Array([1.0, 0.0]);

    // Scalar tariffs: 2.0 * 0.35 + 3.0 * 0.35 - 1.0 * 0.05 = 1.75 - 0.05 = 1.70
    const costScalar = computeGridCost(imp, exp, 0.35, 0.05);
    expect(costScalar).toBeCloseTo(1.70, 6);

    // Array tariffs: 2.0 * 0.20 + 3.0 * 0.50 - 1.0 * 0.10 = 0.40 + 1.50 - 0.10 = 1.80
    const costArray = computeGridCost(imp, exp, [0.20, 0.50], [0.10, 0.10]);
    expect(costArray).toBeCloseTo(1.80, 6);
  });
});
