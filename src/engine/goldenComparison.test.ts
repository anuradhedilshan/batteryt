import { describe, expect, it } from 'vitest';
import { simulateCapacity, scaleSeries, capitalRecoveryFactor } from './model';
import { Inputs } from './types';
import syntheticData from '../data/syntheticReference.json';

const TEST_INPUTS: Inputs = {
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

describe('Phase 1 - Safety Net & Golden Comparison', () => {
  const pv = syntheticData.pv;
  const load = syntheticData.load;
  const golden = syntheticData.golden as Record<string, {
    imp: number;
    exp: number;
    charge: number;
    discharge: number;
    grid_cost: number;
  }>;

  // 1. Worked example from Section 6.2 of the report
  it('passes worked example: (5.0, 1.5) -> 7.325 kWh, then (0, 4.0) -> 3.1145 kWh', () => {
    // Battery emin=1.0, emax=9.5, p=5 kW, eta_c=eta_d=0.95, start=4.0
    const eta_c = 0.95;
    const eta_d = 0.95;
    const emin = 1.0;
    const emax = 9.5;
    const p_kw = 5.0;

    let B = 4.0;
    // Hour 1: PV 5.0, Load 1.5 -> S = 3.5, D = 0
    const S1 = 3.5;
    const room1 = (emax - B) / eta_c;
    const c1 = Math.min(S1, p_kw, room1);
    expect(c1).toBeCloseTo(3.5, 6);
    B += eta_c * c1;
    expect(B).toBeCloseTo(7.325, 4);
    const exp1 = S1 - c1;
    expect(exp1).toBeCloseTo(0, 6);

    // Hour 2: PV 0, Load 4.0 -> S = 0, D = 4.0
    const D2 = 4.0;
    const avail2 = (B - emin) * eta_d;
    const d2 = Math.min(D2, p_kw, avail2);
    expect(d2).toBeCloseTo(4.0, 6);
    B -= d2 / eta_d;
    expect(B).toBeCloseTo(3.11447, 4);
    const imp2 = D2 - d2;
    expect(imp2).toBeCloseTo(0, 6);
  });

  // 2. Golden comparison: Current App Simulation vs Reference battery_model.py
  it('runs golden comparison between app current simulation and battery_model.py', () => {
    const series = {
      pv: new Float64Array(pv),
      load: new Float64Array(load),
    };

    console.log('\n=================== GOLDEN COMPARISON REPORT ===================');
    console.log('Tested on 8,760 hours of synthetic data (_synthetic_year, seed=42)');
    console.log('Comparison: App current simulateCapacity vs reference battery_model.py\n');

    const capacities = [0, 5.0, 7.5, 10.0, 13.5, 20.0];
    const diffs: any[] = [];

    for (const eb of capacities) {
      const appResult = simulateCapacity(eb, TEST_INPUTS, series, true);
      const ref = golden[eb.toString()] || golden[eb.toFixed(1)];

      const diffImp = Math.abs(appResult.importKWh - ref.imp);
      const diffExp = Math.abs(appResult.exportKWh - ref.exp);
      const diffCharge = Math.abs(appResult.chargedKWh - ref.charge);
      const diffDischarge = Math.abs(appResult.dischargedKWh - ref.discharge);
      const diffCost = Math.abs(appResult.gridCostAUD - ref.grid_cost);

      diffs.push({
        capacityKWh: eb,
        diffImp,
        diffExp,
        diffCharge,
        diffDischarge,
        diffCost,
      });

      console.log(`Capacity: ${eb.toFixed(1)} kWh:`);
      console.log(`  Import:    App = ${appResult.importKWh.toFixed(4)} kWh | Ref = ${ref.imp.toFixed(4)} kWh | Diff = ${diffImp.toExponential(4)}`);
      console.log(`  Export:    App = ${appResult.exportKWh.toFixed(4)} kWh | Ref = ${ref.exp.toFixed(4)} kWh | Diff = ${diffExp.toExponential(4)}`);
      console.log(`  Charge:    App = ${appResult.chargedKWh.toFixed(4)} kWh | Ref = ${ref.charge.toFixed(4)} kWh | Diff = ${diffCharge.toExponential(4)}`);
      console.log(`  Discharge: App = ${appResult.dischargedKWh.toFixed(4)} kWh | Ref = ${ref.discharge.toFixed(4)} kWh | Diff = ${diffDischarge.toExponential(4)}`);
      console.log(`  Grid Cost: App = $${appResult.gridCostAUD.toFixed(4)} | Ref = $${ref.grid_cost.toFixed(4)} | Diff = $${diffCost.toExponential(4)} AUD\n`);

      // Verify tolerances
      expect(diffImp).toBeLessThan(1e-4);
      expect(diffExp).toBeLessThan(1e-4);
      expect(diffCharge).toBeLessThan(1e-4);
      expect(diffDischarge).toBeLessThan(1e-4);
      expect(diffCost).toBeLessThan(1e-4);
    }
    console.log('================================================================\n');
  });

  // 3. Physical Invariants on Synthetic Year:
  // - Every hour energy balance == 0 (tolerance 1e-8)
  // - Stored energy inside [emin, emax]
  // - Charge & discharge <= power * dt
  it('conserves hourly energy balance, SOC safety, and power limits on all hours', () => {
    const series = {
      pv: new Float64Array(pv),
      load: new Float64Array(load),
    };

    for (const eb of [0, 5.0, 7.5, 10.0, 13.5, 20.0]) {
      const res = simulateCapacity(eb, TEST_INPUTS, series, true);
      const emin = eb * 0.10;
      const emax = eb * 0.95;
      const p_kw = eb * 0.5;

      expect(res.maxEnergyResidual).toBeLessThan(1e-7);

      for (const h of res.hourly ?? []) {
        // PV + import + discharge - (load + charge + export) = 0
        const residual = Math.abs(h.pv + h.gridImport + h.discharge - (h.load + h.charge + h.gridExport));
        expect(residual).toBeLessThan(1e-7);

        if (eb > 0) {
          expect(h.storedAfter).toBeGreaterThanOrEqual(emin - 1e-7);
          expect(h.storedAfter).toBeLessThanOrEqual(emax + 1e-7);
          expect(h.charge).toBeLessThanOrEqual(p_kw + 1e-7);
          expect(h.discharge).toBeLessThanOrEqual(p_kw + 1e-7);
        } else {
          expect(h.charge).toBe(0);
          expect(h.discharge).toBe(0);
        }
      }
    }
  });

  // 4. Zero PV: battery never charges
  it('confirms that zero PV prevents battery charging', () => {
    const zeroSeries = {
      pv: new Float64Array(48),
      load: new Float64Array(48).fill(1.0),
    };
    // 48 hours zero PV
    const res = simulateCapacity(10.0, TEST_INPUTS, zeroSeries, true);
    expect(res.chargedKWh).toBe(0);
    for (const h of res.hourly ?? []) {
      expect(h.charge).toBe(0);
    }
  });

  // 5. Objective equivalence: grid_cost(no battery) - grid_cost(battery) = sum(T_import x discharge - T_fit x charge)
  it('proves objective equivalence (Report Eq. 14 = Eq. 15)', () => {
    const series = {
      pv: new Float64Array(pv),
      load: new Float64Array(load),
    };
    const base = simulateCapacity(0, TEST_INPUTS, series, true);
    const bat = simulateCapacity(10.0, TEST_INPUTS, series, true);

    const lhs = base.gridCostAUD - bat.gridCostAUD;
    const rhs = bat.dischargedKWh * TEST_INPUTS.importAUDPerKWh - bat.chargedKWh * TEST_INPUTS.feedInAUDPerKWh;
    expect(Math.abs(lhs - rhs)).toBeLessThan(1e-7);
  });

  // 6. CRF tests
  it('calculates CRF correctly', () => {
    expect(capitalRecoveryFactor(0, 10)).toBeCloseTo(0.1, 10);
    expect(capitalRecoveryFactor(0.06, 10)).toBeCloseTo(0.135868, 5);
  });
});
