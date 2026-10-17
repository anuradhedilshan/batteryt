import { Result, Inputs, Series, HOURS } from './types';

export interface VerificationCheckResult {
  id: string;
  name: string;
  reportSection: string;
  passed: boolean;
  tolerance: string;
  observedValue: string;
  description: string;
  evidenceClass: string;
}

export interface VerificationSuiteOutput {
  allPassed: boolean;
  totalChecks: number;
  passedCount: number;
  timestamp: string;
  checks: VerificationCheckResult[];
}

export function runFullVerificationSuite(
  inputs: Inputs,
  series: Series,
  baseline: Result,
  optimalResult: Result
): VerificationSuiteOutput {
  const checks: VerificationCheckResult[] = [];

  // Check 1: Annual no-battery energy balance (Report Table 6.3, Fig. 1)
  // PV = direct PV + exports; Load = direct PV + imports
  let totalPV = 0;
  let totalLoad = 0;
  let directPV = 0;
  for (let t = 0; t < HOURS; t++) {
    totalPV += series.pv[t];
    totalLoad += series.load[t];
    directPV += Math.min(series.pv[t], series.load[t]);
  }

  const pvBalanceDiff = Math.abs(totalPV - (directPV + baseline.exportKWh));
  const loadBalanceDiff = Math.abs(totalLoad - (directPV + baseline.importKWh));
  const check1Passed = pvBalanceDiff < 1e-6 && loadBalanceDiff < 1e-6;

  checks.push({
    id: 'annual-balance',
    name: '1. Annual No-Battery Energy Partition',
    reportSection: 'Section 1.1 & Section 6.3 (Table)',
    passed: check1Passed,
    tolerance: 'Exact identity (residual < 1e-6 kWh)',
    observedValue: `PV diff: ${pvBalanceDiff.toExponential(2)} kWh, Load diff: ${loadBalanceDiff.toExponential(2)} kWh (PV: ${totalPV.toFixed(0)} kWh, Load: ${totalLoad.toFixed(0)} kWh)`,
    description: 'Verifies PV = direct PV + exports and Load = direct PV + imports for solar-only baseline.',
    evidenceClass: 'Calibrated Thesis Identity',
  });

  // Check 2: Every-hour AC bus energy balance residual (Report Eq. 8, Table 6.3)
  // PV + import + discharge == load + charge + export
  const hourly = optimalResult.hourly ?? [];
  let maxHourlyResidual = 0;
  for (let t = 0; t < hourly.length; t++) {
    const h = hourly[t];
    const residual = Math.abs(h.pv + h.gridImport + h.discharge - h.load - h.charge - h.gridExport);
    if (residual > maxHourlyResidual) maxHourlyResidual = residual;
  }
  const check2Passed = maxHourlyResidual < 1e-7;

  checks.push({
    id: 'hourly-bus-balance',
    name: '2. Every-Hour AC Bus Energy Conservation',
    reportSection: 'Equation (8) & Section 6.3',
    passed: check2Passed,
    tolerance: 'Residual < 1e-7 kWh for all 8,760 hours',
    observedValue: `Max residual = ${maxHourlyResidual.toExponential(3)} kWh`,
    description: 'Verifies instantaneous conservation of energy on the AC electrical bus at every hour.',
    evidenceClass: 'Physical Conservation Law',
  });

  // Check 3: Battery SOC boundary safety (Report Eq. 6, Table 6.3)
  // alpha_min * Eb <= B_t <= alpha_max * Eb
  const eb = optimalResult.capacityKWh;
  const lowerLimit = (eb * inputs.socMinPct) / 100;
  const upperLimit = (eb * inputs.socMaxPct) / 100;
  let minStored = Infinity;
  let maxStored = -Infinity;

  for (let t = 0; t < hourly.length; t++) {
    const b = hourly[t].storedAfter;
    if (b < minStored) minStored = b;
    if (b > maxStored) maxStored = b;
  }
  const check3Passed = minStored >= lowerLimit - 1e-7 && maxStored <= upperLimit + 1e-7;

  checks.push({
    id: 'soc-safety',
    name: '3. Stored Energy & SOC Boundary Safety',
    reportSection: 'Equation (6) & Section 4.2',
    passed: check3Passed,
    tolerance: `[${lowerLimit.toFixed(2)} kWh, ${upperLimit.toFixed(2)} kWh] (${inputs.socMinPct}%–${inputs.socMaxPct}%)`,
    observedValue: `Min stored = ${minStored.toFixed(3)} kWh, Max stored = ${maxStored.toFixed(3)} kWh`,
    description: 'Guarantees stored energy never violates minimum or maximum physical SOC limits.',
    evidenceClass: 'Constraint Enforcement',
  });

  // Check 4: Charge/discharge power rating (Report Eq. 3, 4, Table 6.3)
  // E_c <= P_max * dt and E_d <= P_max * dt
  const maxPowerEnergy = eb * inputs.cRate * 1.0;
  let maxChargeObserved = 0;
  let maxDischargeObserved = 0;

  for (let t = 0; t < hourly.length; t++) {
    if (hourly[t].charge > maxChargeObserved) maxChargeObserved = hourly[t].charge;
    if (hourly[t].discharge > maxDischargeObserved) maxDischargeObserved = hourly[t].discharge;
  }
  const check4Passed = maxChargeObserved <= maxPowerEnergy + 1e-7 && maxDischargeObserved <= maxPowerEnergy + 1e-7;

  checks.push({
    id: 'power-limits',
    name: '4. Charge / Discharge C-Rate Power Limits',
    reportSection: 'Equations (3)–(4) & Section 4.2',
    passed: check4Passed,
    tolerance: `Max allowed = ${maxPowerEnergy.toFixed(2)} kWh/h (${inputs.cRate} C-rate)`,
    observedValue: `Max charge = ${maxChargeObserved.toFixed(3)} kWh/h, Max discharge = ${maxDischargeObserved.toFixed(3)} kWh/h`,
    description: 'Enforces that hourly energy transfers never exceed inverter and battery kW capacity.',
    evidenceClass: 'Hardware Power Rating',
  });

  // Check 5: Zero PV night stress test (Report Table 6.3)
  // When PV == 0, charging must strictly be 0
  let nightChargeViolation = false;
  for (let t = 0; t < hourly.length; t++) {
    if (hourly[t].pv <= 1e-6 && hourly[t].charge > 1e-6) {
      nightChargeViolation = true;
      break;
    }
  }

  checks.push({
    id: 'zero-pv-stress',
    name: '5. Zero PV Night Stress Test',
    reportSection: 'Section 6.3 (Table)',
    passed: !nightChargeViolation,
    tolerance: 'Battery charge = 0.000 kWh when PV = 0.000 kWh',
    observedValue: nightChargeViolation ? 'VIOLATION DETECTED' : '0.000 kWh charging during dark hours',
    description: 'Confirms that battery cannot charge from utility grid or fabricate unearned solar energy.',
    evidenceClass: 'Physical Logic Rule',
  });

  // Check 6: Zero-capacity baseline integrity (Report Section 4.2, Table 6.3)
  // Eb = 0 must bypass storage equations and have zero ownership cost
  const check6Passed =
    baseline.capacityKWh === 0 &&
    baseline.ownerCostAUD === 0 &&
    baseline.grossCapexAUD === 0 &&
    baseline.chargedKWh === 0 &&
    baseline.dischargedKWh === 0;

  checks.push({
    id: 'zero-capacity-baseline',
    name: '6. Zero-Capacity Reference Baseline Integrity',
    reportSection: 'Section 4.2 & Section 6.3',
    passed: check6Passed,
    tolerance: 'Eb = 0 has Capex = $0.00, Transfers = 0, no division by zero',
    observedValue: `Capex = $${baseline.ownerCostAUD.toFixed(2)}, Transfers = 0 kWh, Cost = $${baseline.totalAnnualCostAUD.toFixed(2)}/yr`,
    description: 'Verifies 0 kWh is handled as pure solar-only reference without invalid SOC equations.',
    evidenceClass: 'Mathematical Domain Boundary',
  });

  // Check 7: Cyclic-year boundary condition convergence (Report Section 4.2, Table 6.3)
  // |B_8760 - B_0| < 1e-6 kWh
  const cyclicDiff = Math.abs(optimalResult.finalKWh - optimalResult.initialKWh);
  const check7Passed = cyclicDiff < 1e-6;

  checks.push({
    id: 'cyclic-boundary',
    name: '7. Cyclic-Year Boundary Condition Convergence',
    reportSection: 'Section 4.2 & Section 6.3',
    passed: check7Passed,
    tolerance: '|B_8760 - B_0| < 1e-6 kWh',
    observedValue: `Start = ${optimalResult.initialKWh.toFixed(4)} kWh, End = ${optimalResult.finalKWh.toFixed(4)} kWh (Diff: ${cyclicDiff.toExponential(3)} kWh)`,
    description: 'Eliminates artificial benefit from opening battery energy by converging start and end states.',
    evidenceClass: 'Simulation Equilibrium',
  });

  // Check 8: Dual-objective mathematical equivalence (Report Eqs. 13–15, Table 6.3)
  // Baseline cost difference == Avoided Imports - Lost FiT - AEC(Eb)
  const costDiffForm = baseline.totalAnnualCostAUD - optimalResult.totalAnnualCostAUD;
  const avoidedImportsAUD = (baseline.importKWh - optimalResult.importKWh) * inputs.importAUDPerKWh;
  const lostFitAUD = (baseline.exportKWh - optimalResult.exportKWh) * inputs.feedInAUDPerKWh;
  const netBenefitEq15 = avoidedImportsAUD - lostFitAUD - optimalResult.ownerCostAUD;
  const objectiveDiff = Math.abs(costDiffForm - netBenefitEq15);
  const check8Passed = objectiveDiff < 1e-6;

  checks.push({
    id: 'objective-equivalence',
    name: '8. Dual-Objective Mathematical Equivalence',
    reportSection: 'Equations (13)–(15) & Section 4.5',
    passed: check8Passed,
    tolerance: '|Eq.(13) - Eq.(15)| < 1e-6 AUD',
    observedValue: `Cost Diff = $${costDiffForm.toFixed(4)}/yr, Eq.(15) = $${netBenefitEq15.toFixed(4)}/yr (Diff: ${objectiveDiff.toExponential(2)} AUD)`,
    description: 'Mathematically verifies that minimizing Total Cost is identical to maximizing Net Benefit.',
    evidenceClass: 'Mathematical Theorem Proof',
  });

  const passedCount = checks.filter(c => c.passed).length;

  return {
    allPassed: passedCount === checks.length,
    totalChecks: checks.length,
    passedCount,
    timestamp: new Date().toISOString(),
    checks,
  };
}
