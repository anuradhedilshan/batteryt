import { describe, expect, it } from 'vitest';
import syntheticData from '../data/syntheticReference.json';
import { simulateBatteryTimeSeries, evaluateLifetimeNPV, Battery, evaluateProduct } from './model';
import { sanityCheckInputs } from './validation';
import { calculateSubsidy } from '../config/cheaperHomeBatteries';
import { Inputs } from './types';
import { BatteryProduct } from '../config/products';

describe('Part D: Diagnostic & Explainability Regression Tests', () => {
  const pv = new Float64Array(syntheticData.pv);
  const load = new Float64Array(syntheticData.load);
  const dt = 1.0;

  const BASE_INPUTS: Inputs = {
    selectedBatteryKWh: 10,
    pvKW: 5.0,
    pvReferenceKW: 5.0,
    demandMultiplier: 1.0,
    importAUDPerKWh: 0.35,
    feedInAUDPerKWh: 0.05,
    variableCapexAUDPerKWh: 700,
    fixedCapexAUD: 1000,
    hypotheticalDiscountPct: 30,
    efficiencyPct: 95,
    cRate: 0.5,
    socMinPct: 0,
    socMaxPct: 100,
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

  // 1. evaluate at break_even_gross gives NPV = 0 (tolerance 1e-6)
  it('verifies that evaluate at break_even_gross gives NPV = 0 (tolerance 1e-6)', () => {
    const bat10 = Battery.fromUsable(10, 5, 0.0, 0.95, 0.95);
    const noBatSim = simulateBatteryTimeSeries(pv, load, null, dt);
    let noBatImp = 0, noBatExp = 0;
    for (let t = 0; t < noBatSim.imp.length; t++) {
      noBatImp += noBatSim.imp[t];
      noBatExp += noBatSim.exp[t];
    }
    const baseGridCost = noBatImp * BASE_INPUTS.importAUDPerKWh - noBatExp * BASE_INPUTS.feedInAUDPerKWh;

    const sub = calculateSubsidy(10, BASE_INPUTS.installDate, BASE_INPUTS.stcPriceAUD, true, true);
    const initialEval = evaluateLifetimeNPV(bat10, pv, load, baseGridCost, 8000, sub.subsidyAUD, BASE_INPUTS, dt);

    const breakEvenGross = initialEval.breakEvenGrossAUD;
    expect(breakEvenGross).toBeGreaterThan(0);

    // Re-evaluate at exactly break_even_gross
    const breakEvenEval = evaluateLifetimeNPV(bat10, pv, load, baseGridCost, breakEvenGross, sub.subsidyAUD, BASE_INPUTS, dt);

    expect(Math.abs(breakEvenEval.npv)).toBeLessThan(1e-6);
  });

  // 2. sanity_check_inputs(35, 5, ...) returns a warning; (0.35, 0.05, ...) returns none
  it('validates input tariffs correctly: catches cents-as-dollars and passes valid AUD rates', () => {
    // 35 cents entered as dollars: both ti > 2.0 and tf > 2.0
    const warningsCents = sanityCheckInputs(35, 5, pv, load);
    expect(warningsCents.length).toBeGreaterThan(0);
    expect(warningsCents.some(w => w.type === 'tariff-cents')).toBe(true);
    expect(warningsCents.some(w => w.isBlocking)).toBe(true);

    // Standard valid tariffs: 0.35 AUD/kWh import, 0.05 AUD/kWh feed-in
    const warningsValid = sanityCheckInputs(0.35, 0.05, pv, load);
    expect(warningsValid.length).toBe(0);

    // Feed-in tariff >= import tariff check
    const warningsInverted = sanityCheckInputs(0.20, 0.25, pv, load);
    expect(warningsInverted.some(w => w.type === 'fit-exceeds-import')).toBe(true);
    expect(warningsInverted.some(w => w.isBlocking)).toBe(true);
  });

  // 3. Golden comparison with battery_model.py from Part A step 2 as an automated test
  it('agrees with battery_model.py golden reference on all metrics (Part A Step 2)', () => {
    // Reference values produced by battery_model.py for this identical dataset & parameters
    const pyRef10 = {
      pv: 10539.0,
      load: 5780.0,
      direct_pv: 2238.981459,
      imp: 147.8922968,
      exp: 4540.3218715,
      charge: 3759.6966694,
      discharge: 3393.1262441,
      cycles: 357.17118359,
      grid_cost: -175.2537897,
      base_grid_cost: 824.3555623,
      saving_y1: 999.609352,
      subsidy: 2516.0,
      net_capex: 5484.0,
      npv: 1284.4048838,
      break_even_gross: 9196.3523122,
      payback_year: 8,
    };

    const bat10 = Battery.fromUsable(10, 5, 0.0, 0.95, 0.95);
    const sim0 = simulateBatteryTimeSeries(pv, load, null, dt);
    let noBatImp = 0, noBatExp = 0;
    for (let t = 0; t < sim0.imp.length; t++) {
      noBatImp += sim0.imp[t];
      noBatExp += sim0.exp[t];
    }
    const cost0 = noBatImp * 0.35 - noBatExp * 0.05;

    const sim10 = simulateBatteryTimeSeries(pv, load, bat10, dt);
    let imp10 = 0, exp10 = 0, chg10 = 0, dis10 = 0, sumPV = 0, sumLoad = 0, directPV = 0;
    for (let t = 0; t < sim10.imp.length; t++) {
      imp10 += sim10.imp[t];
      exp10 += sim10.exp[t];
      chg10 += sim10.charge[t];
      dis10 += sim10.discharge[t];
      sumPV += pv[t];
      sumLoad += load[t];
      directPV += Math.min(pv[t], load[t]);
    }
    const cost10 = imp10 * 0.35 - exp10 * 0.05;
    const cycles10 = dis10 / (0.95 * 10);

    const sub = calculateSubsidy(10, '2026-11-01', 37.0, true, true);
    const econ10 = evaluateLifetimeNPV(bat10, pv, load, cost0, 8000, sub.subsidyAUD, BASE_INPUTS, dt);

    // Energy metrics within 1e-6 kWh
    expect(Math.abs(sumPV - pyRef10.pv)).toBeLessThan(1e-6);
    expect(Math.abs(sumLoad - pyRef10.load)).toBeLessThan(1e-6);
    expect(Math.abs(directPV - pyRef10.direct_pv)).toBeLessThan(1e-6);
    expect(Math.abs(imp10 - pyRef10.imp)).toBeLessThan(1e-6);
    expect(Math.abs(exp10 - pyRef10.exp)).toBeLessThan(1e-6);
    expect(Math.abs(chg10 - pyRef10.charge)).toBeLessThan(1e-6);
    expect(Math.abs(dis10 - pyRef10.discharge)).toBeLessThan(1e-6);
    expect(Math.abs(cycles10 - pyRef10.cycles)).toBeLessThan(1e-6);

    // Economic metrics within 1e-4 AUD
    expect(Math.abs(cost10 - pyRef10.grid_cost)).toBeLessThan(1e-4);
    expect(Math.abs(cost0 - pyRef10.base_grid_cost)).toBeLessThan(1e-4);
    expect(Math.abs(econ10.savingY1 - pyRef10.saving_y1)).toBeLessThan(1e-4);
    expect(Math.abs(sub.subsidyAUD - pyRef10.subsidy)).toBeLessThan(1e-4);
    expect(Math.abs(econ10.netCapex - pyRef10.net_capex)).toBeLessThan(1e-4);
    expect(Math.abs(econ10.npv - pyRef10.npv)).toBeLessThan(1e-4);
    expect(Math.abs(econ10.breakEvenGrossAUD - pyRef10.break_even_gross)).toBeLessThan(1e-4);
    expect(econ10.discountedPaybackYear).toBe(pyRef10.payback_year);
  });

  // 4. Test that feed-in tariff of 0 and import tariff of 0.35 gives a higher NPV than feed-in 0.10 for the same battery
  it('confirms that feed-in tariff of 0 gives higher NPV than feed-in of 0.10 for the same battery', () => {
    const testProduct: BatteryProduct = {
      id: 'test-10kwh',
      name: 'Test 10 kWh Battery',
      manufacturer: 'TestCo',
      usableKWh: 10,
      powerKW: 5,
      installedPriceAUD: 8000,
      efficiencyRoundTrip: 0.9025,
      warrantyYears: 10,
      source: 'Test',
      lastVerifiedDate: '2026-10-27',
    };

    const series = { pv, load };

    // Case A: Feed-in tariff = 0.00 AUD/kWh, Import = 0.35 AUD/kWh
    const inputsFiT0: Inputs = { ...BASE_INPUTS, importAUDPerKWh: 0.35, feedInAUDPerKWh: 0.00 };
    const baseGridCost0 = pv.reduce((sum, _, i) => sum + Math.max(0, load[i] - pv[i]) * 0.35, 0);
    const evalFiT0 = evaluateProduct(testProduct, inputsFiT0, series, baseGridCost0);

    // Case B: Feed-in tariff = 0.10 AUD/kWh, Import = 0.35 AUD/kWh
    const inputsFiT10: Inputs = { ...BASE_INPUTS, importAUDPerKWh: 0.35, feedInAUDPerKWh: 0.10 };
    const baseGridCost10 = pv.reduce(
      (sum, _, i) => sum + Math.max(0, load[i] - pv[i]) * 0.35 - Math.max(0, pv[i] - load[i]) * 0.10,
      0
    );
    const evalFiT10 = evaluateProduct(testProduct, inputsFiT10, series, baseGridCost10);

    // When FiT is 0, stored solar energy displaces $0.35 import with 0 lost feed-in revenue.
    // When FiT is 0.10, storing solar forfeits $0.10/eta_c in export income, lowering the marginal gain of cycling.
    // Therefore, NPV with FiT=0 must be strictly greater than NPV with FiT=0.10.
    expect(evalFiT0.lifetimeNPVAUD).toBeGreaterThan(evalFiT10.lifetimeNPVAUD);
  });
});
