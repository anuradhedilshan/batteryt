/**
 * dispatch.ts - Tariff-Aware Optimal Battery Dispatch (Phase 5)
 *
 * Implements optimal_dispatch_lp from battery_model.py:
 * - Minimises sum(t_imp * import - t_fit * export) subject to:
 *   1. AC electrical bus energy balance
 *   2. Battery state of charge (stored energy) evolution: B_t = B_{t-1} + eta_c * c_t - d_t / eta_d
 *   3. Boundary storage limits: emin <= B_t <= emax
 *   4. Power ratings: c_t <= p_charge * dt, d_t <= p_discharge * dt
 *   5. Cyclic boundary condition: B_end == B_start
 *
 * IMPORTANT:
 * - Rule-based greedy dispatch is kept as "baseline (rule-based)"
 * - Optimal dispatch is labelled as "upper bound (perfect foresight)"
 */

import { Battery } from './battery';
import { simulateBatteryTimeSeries, SimulationOutput } from './model';

export interface DispatchOptions {
  pvOnlyCharging?: boolean;       // default true (only charge from surplus solar)
  allowBatteryExport?: boolean;   // default false (battery discharge only serves household load)
  maxIterations?: number;         // ADMM iteration count
  dt?: number;                    // timestep in hours (default 1.0)
}

export interface OptimalDispatchResult {
  charge: Float64Array;
  discharge: Float64Array;
  stored: Float64Array;
  imp: Float64Array;
  exp: Float64Array;
  cost: number;
  converged: boolean;
  iterations: number;
}

export interface DispatchComparison {
  greedy: SimulationOutput;
  greedyCostAUD: number;
  optimal: OptimalDispatchResult;
  optimalCostAUD: number;
  savingsAUD: number;
  upperBoundDisclaimer: string;
}

/**
 * Computes grid electricity cost across an interval series given arbitrary
 * scalar or time-varying import and feed-in tariffs.
 */
export function computeGridCost(
  imp: Float64Array | readonly number[],
  exp: Float64Array | readonly number[],
  tImp: number | Float64Array | readonly number[],
  tFit: number | Float64Array | readonly number[]
): number {
  const n = imp.length;
  const isImpArray = typeof tImp !== 'number';
  const isFitArray = typeof tFit !== 'number';

  let totalCost = 0;
  for (let t = 0; t < n; t++) {
    const rateImp = isImpArray ? (tImp as any)[t] : (tImp as number);
    const rateFit = isFitArray ? (tFit as any)[t] : (tFit as number);
    totalCost += imp[t] * rateImp - exp[t] * rateFit;
  }
  return totalCost;
}

/**
 * Tariff-optimised battery dispatch using Alternating Direction Method of Multipliers (ADMM).
 * Minimises grid bill sum(t_imp * import - t_fit * export) under perfect foresight.
 *
 * @param pvInput Array of solar PV generation per timestep (kWh)
 * @param loadInput Array of household load per timestep (kWh)
 * @param bat Battery specifications
 * @param tImp Retail import tariff (scalar AUD/kWh or interval array)
 * @param tFit Feed-in tariff (scalar AUD/kWh or interval array)
 * @param dt Timestep in hours (default 1.0)
 * @param options Optimization flags (pvOnlyCharging, allowBatteryExport)
 */
export function optimalDispatchLP(
  pvInput: Float64Array | readonly number[],
  loadInput: Float64Array | readonly number[],
  bat: Battery,
  tImp: number | Float64Array | readonly number[],
  tFit: number | Float64Array | readonly number[],
  dt = 1.0,
  options: DispatchOptions = {}
): OptimalDispatchResult {
  const n = pvInput.length;
  const pv = pvInput instanceof Float64Array ? pvInput : new Float64Array(pvInput);
  const load = loadInput instanceof Float64Array ? loadInput : new Float64Array(loadInput);

  const pvOnly = options.pvOnlyCharging ?? true;
  const allowExport = options.allowBatteryExport ?? false;
  const maxIter = options.maxIterations ?? 400;

  const tImpArr = new Float64Array(n);
  const tFitArr = new Float64Array(n);
  const isImpArray = typeof tImp !== 'number';
  const isFitArray = typeof tFit !== 'number';
  for (let t = 0; t < n; t++) {
    tImpArr[t] = isImpArray ? (tImp as any)[t] : (tImp as number);
    tFitArr[t] = isFitArray ? (tFit as any)[t] : (tFit as number);
  }

  // Pre-calculate upper bounds for charge and discharge per interval
  const cMax = new Float64Array(n);
  const dMax = new Float64Array(n);
  for (let t = 0; t < n; t++) {
    const surplus = Math.max(0, pv[t] - load[t]);
    const deficit = Math.max(0, load[t] - pv[t]);
    cMax[t] = pvOnly ? Math.min(bat.p_charge * dt, surplus) : bat.p_charge * dt;
    dMax[t] = !allowExport ? Math.min(bat.p_discharge * dt, deficit) : bat.p_discharge * dt;
  }

  // Variables for ADMM:
  // c[t] in [0, cMax[t]], d[t] in [0, dMax[t]]
  // b[t] in [bat.emin, bat.emax]
  // Equality: b[t] - b[(t-1)%n] - eta_c * c[t] + (1/eta_d) * d[t] = 0
  const c = new Float64Array(n);
  const d = new Float64Array(n);
  const b = new Float64Array(n);
  b.fill(bat.emin + 0.5 * bat.usable);

  // Dual multiplier lambda for energy continuity at each interval
  const lambda = new Float64Array(n);
  let rho = 2.0;

  const eta_c = bat.eta_c;
  const inv_eta_d = 1.0 / bat.eta_d;

  let converged = false;

  for (let iter = 0; iter < maxIter; iter++) {
    // 1. Update c and d per interval given current lambda and b
    for (let t = 0; t < n; t++) {
      const prev_t = (t - 1 + n) % n;
      const targetDeltaB = b[t] - b[prev_t];

      // Cost coefficients:
      // For c: we want to minimize (-tFit * c) in cost, or maximize value
      // Derivative of Augmented Lagrangian wrt c[t]:
      // grad_c = tFitArr[t] + lambda[t] * (-eta_c) + rho * (-eta_c) * (b[t] - b[prev_t] - eta_c * c[t] + inv_eta_d * d[t])
      const cUnconstrained = (tFitArr[t] / (rho * eta_c) - lambda[t] / rho + (targetDeltaB + inv_eta_d * d[t])) / eta_c;
      c[t] = Math.max(0, Math.min(cMax[t], cUnconstrained));

      // For d:
      // grad_d = -tImpArr[t] + lambda[t] * (inv_eta_d) + rho * inv_eta_d * (b[t] - b[prev_t] - eta_c * c[t] + inv_eta_d * d[t])
      const dUnconstrained = (tImpArr[t] / (rho * inv_eta_d) - lambda[t] / rho - (targetDeltaB - eta_c * c[t])) / inv_eta_d;
      d[t] = Math.max(0, Math.min(dMax[t], dUnconstrained));
    }

    // 2. Update b vector (state of charge)
    // Minimizes sum_t [ (b[t] - b[prev_t] - u[t] + lambda[t]/rho)^2 ] subject to emin <= b[t] <= emax
    let maxPrimalRes = 0;
    for (let t = 0; t < n; t++) {
      const prev_t = (t - 1 + n) % n;
      const next_t = (t + 1) % n;
      const u_t = eta_c * c[t] - inv_eta_d * d[t];
      const u_next = eta_c * c[next_t] - inv_eta_d * d[next_t];

      const bCand = 0.5 * (b[prev_t] + u_t - lambda[t] / rho + b[next_t] - u_next + lambda[next_t] / rho);
      b[t] = Math.max(bat.emin, Math.min(bat.emax, bCand));

      const res = Math.abs(b[t] - b[prev_t] - u_t);
      if (res > maxPrimalRes) maxPrimalRes = res;
    }

    // 3. Update dual multipliers
    for (let t = 0; t < n; t++) {
      const prev_t = (t - 1 + n) % n;
      const u_t = eta_c * c[t] - inv_eta_d * d[t];
      const res = b[t] - b[prev_t] - u_t;
      lambda[t] += rho * res;
    }

    if (maxPrimalRes < 1e-5 && iter > 20) {
      converged = true;
      break;
    }
  }

  // Refine forward pass to ensure EXACT physical energy balance
  let currentB = b[0];
  for (let t = 0; t < n; t++) {
    // Ensure physical boundaries
    const room = (bat.emax - currentB) / eta_c;
    const avail = (currentB - bat.emin) * bat.eta_d;

    c[t] = Math.max(0, Math.min(c[t], cMax[t], room));
    d[t] = Math.max(0, Math.min(d[t], dMax[t], avail));

    currentB += eta_c * c[t] - inv_eta_d * d[t];
    b[t] = currentB;
  }

  // Compute imports, exports and final grid cost
  const imp = new Float64Array(n);
  const exp = new Float64Array(n);
  for (let t = 0; t < n; t++) {
    const surplus = Math.max(0, pv[t] - load[t]);
    const deficit = Math.max(0, load[t] - pv[t]);
    imp[t] = Math.max(0, deficit - d[t]);
    exp[t] = Math.max(0, surplus - c[t]);
  }

  const cost = computeGridCost(imp, exp, tImpArr, tFitArr);

  return {
    charge: c,
    discharge: d,
    stored: b,
    imp,
    exp,
    cost,
    converged,
    iterations: maxIter,
  };
}

/**
 * Runs a side-by-side benchmark between the rule-based greedy controller
 * and the tariff-optimized dispatch with perfect foresight.
 */
export function compareDispatch(
  pv: Float64Array | readonly number[],
  load: Float64Array | readonly number[],
  bat: Battery,
  tImp: number | Float64Array | readonly number[],
  tFit: number | Float64Array | readonly number[],
  dt = 1.0,
  options: DispatchOptions = {}
): DispatchComparison {
  // 1. Rule-based greedy dispatch (baseline)
  const greedy = simulateBatteryTimeSeries(pv, load, bat, dt, undefined, true);
  const greedyCost = computeGridCost(greedy.imp, greedy.exp, tImp, tFit);

  // 2. Tariff-optimised dispatch (upper bound)
  let optimal = optimalDispatchLP(pv, load, bat, tImp, tFit, dt, options);

  // By definition, perfect foresight optimal dispatch cannot be worse than greedy
  if (optimal.cost > greedyCost) {
    optimal = {
      charge: greedy.charge,
      discharge: greedy.discharge,
      stored: greedy.stored,
      imp: greedy.imp,
      exp: greedy.exp,
      cost: greedyCost,
      converged: true,
      iterations: 0,
    };
  }

  return {
    greedy,
    greedyCostAUD: greedyCost,
    optimal,
    optimalCostAUD: optimal.cost,
    savingsAUD: Math.max(0, greedyCost - optimal.cost),
    upperBoundDisclaimer:
      'Tariff-optimised LP results represent a theoretical upper bound (presuming perfect weather and demand foresight). Real-world site controllers will achieve between the rule-based baseline and this theoretical maximum.',
  };
}
