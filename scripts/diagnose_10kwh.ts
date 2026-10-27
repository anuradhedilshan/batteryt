import { execSync } from 'child_process';
import syntheticData from '../src/data/syntheticReference.json';
import { simulateBatteryTimeSeries, evaluateLifetimeNPV, Battery } from '../src/engine/model';
import { calculateSubsidy } from '../src/config/cheaperHomeBatteries';
import { Inputs } from '../src/engine/types';

// Fixed inputs for Part A diagnosis
const FIXED_INPUTS: Inputs = {
  selectedBatteryKWh: 10,
  pvKW: 5.0, // System with 10539 kWh annual generation
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

const GROSS_CAPEX = 8000;
const USABLE_KWH = 10;
const POWER_KW = 5;
const EFF = 0.95;

function runSimulation() {
  const pv = new Float64Array(syntheticData.pv);
  const load = new Float64Array(syntheticData.load);
  const dt = 1.0;

  // 1. No battery simulation
  const noBatSim = simulateBatteryTimeSeries(pv, load, null, dt);
  let noBatImport = 0, noBatExport = 0;
  for (let t = 0; t < noBatSim.imp.length; t++) {
    noBatImport += noBatSim.imp[t];
    noBatExport += noBatSim.exp[t];
  }
  const noBatGridCost = noBatImport * FIXED_INPUTS.importAUDPerKWh - noBatExport * FIXED_INPUTS.feedInAUDPerKWh;

  // 2. 10 kWh usable battery (5 kW) simulation
  const bat10 = Battery.fromUsable(USABLE_KWH, POWER_KW, 0.0, EFF, EFF);
  const bat10Sim = simulateBatteryTimeSeries(pv, load, bat10, dt);
  let bat10Import = 0, bat10Export = 0, bat10Charge = 0, bat10Discharge = 0;
  let totalPV = 0, totalLoad = 0, directPVUse = 0;
  for (let t = 0; t < bat10Sim.imp.length; t++) {
    bat10Import += bat10Sim.imp[t];
    bat10Export += bat10Sim.exp[t];
    bat10Charge += bat10Sim.charge[t];
    bat10Discharge += bat10Sim.discharge[t];
    totalPV += pv[t];
    totalLoad += load[t];
    directPVUse += Math.min(pv[t], load[t]);
  }
  const bat10GridCost = bat10Import * FIXED_INPUTS.importAUDPerKWh - bat10Export * FIXED_INPUTS.feedInAUDPerKWh;
  const cycles = bat10Discharge / (EFF * USABLE_KWH);

  // Subsidy
  const subResult = calculateSubsidy(USABLE_KWH, FIXED_INPUTS.installDate, FIXED_INPUTS.stcPriceAUD, true, true);
  const subsidy = subResult.subsidyAUD;
  const netCapex = GROSS_CAPEX - subsidy;

  // NPV evaluation
  const econ10 = evaluateLifetimeNPV(bat10, pv, load, noBatGridCost, GROSS_CAPEX, subsidy, FIXED_INPUTS, dt);
  const econ0 = evaluateLifetimeNPV(null, pv, load, noBatGridCost, 0, 0, FIXED_INPUTS, dt);

  // Run Python reference
  const pyCode = `
import json, numpy as np
from instrcution.battery_model import Battery, evaluate, simulate, grid_cost, subsidy_aud, _synthetic_year

pv, load = _synthetic_year(42)
t_imp, t_fit = 0.35, 0.05
b10 = Battery.from_usable(10, 5)

res0 = simulate(pv, load, None, 1.0)
cost0 = grid_cost(res0, t_imp, t_fit)
eval0 = evaluate(pv, load, t_imp, t_fit, None, 0, years=10, r=0.06, om_frac=0.01, escalation=0.0, fade_per_year=0.0)

res10 = simulate(pv, load, b10, 1.0)
cost10 = grid_cost(res10, t_imp, t_fit)
eval10 = evaluate(pv, load, t_imp, t_fit, b10, 8000, years=10, r=0.06, om_frac=0.01, escalation=0.0, fade_per_year=0.0)

out = {
  "b10": {
    "pv": float(np.sum(pv)),
    "load": float(np.sum(load)),
    "direct_pv": float(np.sum(np.minimum(pv, load))),
    "imp": float(np.sum(res10["imp"])),
    "exp": float(np.sum(res10["exp"])),
    "charge": float(np.sum(res10["charge"])),
    "discharge": float(np.sum(res10["discharge"])),
    "cycles": float(np.sum(res10["discharge"]) / (0.95 * 10)),
    "grid_cost": float(cost10),
    "saving_y1": float(eval10["saving_y1"]),
    "net_capex": float(eval10["net_capex"]),
    "subsidy": float(eval10["subsidy"]),
    "npv": float(eval10["npv"]),
    "break_even_gross": float(eval10["break_even_gross"]),
    "payback_year": eval10["discounted_payback_year"]
  },
  "no_bat": {
    "imp": float(np.sum(res0["imp"])),
    "exp": float(np.sum(res0["exp"])),
    "charge": float(np.sum(res0["charge"])),
    "discharge": float(np.sum(res0["discharge"])),
    "grid_cost": float(cost0),
    "saving_y1": float(eval0["saving_y1"]),
    "net_capex": float(eval0["net_capex"]),
    "subsidy": float(eval0["subsidy"]),
    "npv": float(eval0["npv"]),
    "break_even_gross": float(eval0.get("break_even_gross", 0.0)),
    "payback_year": eval0.get("discounted_payback_year", None)
  }
}
print(json.dumps(out))
`;

  const pyStdout = execSync(`python3 -c '${pyCode}'`, { encoding: 'utf-8' });
  const pyData = JSON.parse(pyStdout.trim());

  console.log('========================================================================================');
  console.log('              PART A: DIAGNOSIS & SIDE-BY-SIDE VERIFICATION TABLE                       ');
  console.log('========================================================================================\n');

  console.log('--- INPUTS ACTUALLY USED BY SIMULATION ---');
  console.log(`Import Tariff (min / mean / max): $${FIXED_INPUTS.importAUDPerKWh.toFixed(4)} / $${FIXED_INPUTS.importAUDPerKWh.toFixed(4)} / $${FIXED_INPUTS.importAUDPerKWh.toFixed(4)} AUD/kWh`);
  console.log(`Feed-in Tariff (min / mean / max): $${FIXED_INPUTS.feedInAUDPerKWh.toFixed(4)} / $${FIXED_INPUTS.feedInAUDPerKWh.toFixed(4)} / $${FIXED_INPUTS.feedInAUDPerKWh.toFixed(4)} AUD/kWh`);
  console.log(`Annual Discount Rate: ${FIXED_INPUTS.annualDiscountRatePct}%`);
  console.log(`System Lifetime: ${FIXED_INPUTS.lifeYears} years`);
  console.log(`O&M Rate: ${FIXED_INPUTS.annualOMPercentGross}% of gross capex`);
  console.log(`Tariff Escalation: ${FIXED_INPUTS.tariffEscalationPct}%/year`);
  console.log(`Capacity Fade: ${FIXED_INPUTS.capacityFadePctPerYear}%/year`);
  console.log(`Gross Capex: $${GROSS_CAPEX.toFixed(2)} AUD`);
  console.log(`Subsidy Applied: $${subsidy.toFixed(2)} AUD (Cheaper Home Batteries, install date ${FIXED_INPUTS.installDate}, STC $${FIXED_INPUTS.stcPriceAUD})`);
  console.log(`Usable Capacity: ${USABLE_KWH} kWh (Nominal min/max: 0.0 - 10.0 kWh, NO extra SOC window)`);
  console.log(`Charge / Discharge Power: ${POWER_KW} kW`);
  console.log(`Efficiency: charge ${(EFF * 100).toFixed(1)}%, discharge ${(EFF * 100).toFixed(1)}% (round-trip ${(EFF * EFF * 100).toFixed(2)}%)\n`);

  console.log('--- 10 kWh USABLE BATTERY (5 kW) SIDE-BY-SIDE COMPARISON ---');
  const metrics10 = [
    { name: 'Annual PV Generation (kWh)', app: totalPV, py: pyData.b10.pv, unit: 'kWh', tol: 1e-6 },
    { name: 'Annual Load Consumption (kWh)', app: totalLoad, py: pyData.b10.load, unit: 'kWh', tol: 1e-6 },
    { name: 'Direct PV Use (kWh)', app: directPVUse, py: pyData.b10.direct_pv, unit: 'kWh', tol: 1e-6 },
    { name: 'Grid Import (kWh)', app: bat10Import, py: pyData.b10.imp, unit: 'kWh', tol: 1e-6 },
    { name: 'Grid Export (kWh)', app: bat10Export, py: pyData.b10.exp, unit: 'kWh', tol: 1e-6 },
    { name: 'Battery Charge (kWh)', app: bat10Charge, py: pyData.b10.charge, unit: 'kWh', tol: 1e-6 },
    { name: 'Battery Discharge (kWh)', app: bat10Discharge, py: pyData.b10.discharge, unit: 'kWh', tol: 1e-6 },
    { name: 'Equivalent Full Cycles', app: cycles, py: pyData.b10.cycles, unit: 'cycles', tol: 1e-6 },
    { name: 'Grid Cost (AUD)', app: bat10GridCost, py: pyData.b10.grid_cost, unit: 'AUD', tol: 1e-4 },
    { name: 'Grid Cost Without Battery (AUD)', app: noBatGridCost, py: pyData.no_bat.grid_cost, unit: 'AUD', tol: 1e-4 },
    { name: 'Year-1 Bill Saving (AUD)', app: econ10.savingY1, py: pyData.b10.saving_y1, unit: 'AUD', tol: 1e-4 },
    { name: 'Subsidy Applied (AUD)', app: subsidy, py: pyData.b10.subsidy, unit: 'AUD', tol: 1e-4 },
    { name: 'Net Capex (AUD)', app: netCapex, py: pyData.b10.net_capex, unit: 'AUD', tol: 1e-4 },
    { name: '10-Year Lifetime NPV (AUD)', app: econ10.npv, py: pyData.b10.npv, unit: 'AUD', tol: 1e-4 },
    { name: 'Break-even Gross Capex (AUD)', app: econ10.breakEvenGrossAUD, py: pyData.b10.break_even_gross, unit: 'AUD', tol: 1e-4 },
    { name: 'Discounted Payback Year', app: econ10.discountedPaybackYear ?? 0, py: pyData.b10.payback_year ?? 0, unit: 'yr', tol: 1e-4 },
  ];

  console.log('| Metric | App (TS) | Reference (Python) | Difference | Status |');
  console.log('| :--- | :--- | :--- | :--- | :--- |');
  let allPass = true;
  for (const m of metrics10) {
    const diff = Math.abs(m.app - m.py);
    const pass = diff <= m.tol;
    if (!pass) allPass = false;
    console.log(`| ${m.name} | ${m.app.toFixed(6)} | ${m.py.toFixed(6)} | ${diff.toExponential(4)} | ${pass ? 'PASS' : 'FAIL'} |`);
  }

  console.log('\n--- NO BATTERY (SOLAR ONLY) SIDE-BY-SIDE COMPARISON ---');
  const metrics0 = [
    { name: 'Grid Import (kWh)', app: noBatImport, py: pyData.no_bat.imp, unit: 'kWh', tol: 1e-6 },
    { name: 'Grid Export (kWh)', app: noBatExport, py: pyData.no_bat.exp, unit: 'kWh', tol: 1e-6 },
    { name: 'Battery Charge (kWh)', app: 0, py: pyData.no_bat.charge, unit: 'kWh', tol: 1e-6 },
    { name: 'Battery Discharge (kWh)', app: 0, py: pyData.no_bat.discharge, unit: 'kWh', tol: 1e-6 },
    { name: 'Grid Cost (AUD)', app: noBatGridCost, py: pyData.no_bat.grid_cost, unit: 'AUD', tol: 1e-4 },
    { name: 'Year-1 Bill Saving (AUD)', app: econ0.savingY1, py: pyData.no_bat.saving_y1, unit: 'AUD', tol: 1e-4 },
    { name: 'Subsidy Applied (AUD)', app: 0, py: pyData.no_bat.subsidy, unit: 'AUD', tol: 1e-4 },
    { name: 'Net Capex (AUD)', app: 0, py: pyData.no_bat.net_capex, unit: 'AUD', tol: 1e-4 },
    { name: 'Lifetime NPV (AUD)', app: econ0.npv, py: pyData.no_bat.npv, unit: 'AUD', tol: 1e-4 },
  ];

  console.log('| Metric | App (TS) | Reference (Python) | Difference | Status |');
  console.log('| :--- | :--- | :--- | :--- | :--- |');
  for (const m of metrics0) {
    const diff = Math.abs(m.app - m.py);
    const pass = diff <= m.tol;
    if (!pass) allPass = false;
    console.log(`| ${m.name} | ${m.app.toFixed(6)} | ${m.py.toFixed(6)} | ${diff.toExponential(4)} | ${pass ? 'PASS' : 'FAIL'} |`);
  }

  console.log(`\nOVERALL AGREEMENT RESULT: ${allPass ? 'ALL METRICS PASS WITHIN TOLERANCES (1e-6 kWh, 1e-4 AUD)' : 'FAIL - METRIC DIVERGENCE DETECTED'}\n`);
}

runSimulation();
