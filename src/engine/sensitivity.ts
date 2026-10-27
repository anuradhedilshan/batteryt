import { Result, EPS } from './types';

export interface TariffSensitivityCell {
  importTariff: number;
  feedInTariff: number;
  optimalCapacityKWh: number; // Eb* from Eq. 13 (0 kWh when uneconomic, exactly matching Report Fig. 5)
  optimalTotalCost: number;
  baselineCost: number;
  netSavingsVsBaseline: number;
  isEconomicallyViable: boolean;
  bestPositiveCapacityKWh: number; // Least-cost positive battery option if installing storage
  bestPositiveTotalCost: number;
  bestPositiveNetSavings: number;
}

export interface TariffSensitivityMatrix {
  importTariffs: number[];
  feedInTariffs: number[];
  grid: TariffSensitivityCell[][];
}

/**
 * Computes optimal battery sizing across a 2D tariff grid (Section 7.3 & Figure 5 of report).
 * Evaluates the full candidate set B including 0 kWh.
 * When battery ownership is uneconomic (all positive batteries have negative net benefit),
 * the optimal decision Eb* = 0 kWh, strictly matching Figure 5.
 */
export function computeTariffSensitivityMatrix(
  results: Result[],
  importTariffs: number[] = [0.25, 0.30, 0.35, 0.40, 0.45, 0.50, 0.55],
  feedInTariffs: number[] = [0.15, 0.12, 0.09, 0.06, 0.03, 0.00]
): TariffSensitivityMatrix {
  const positiveCandidates = results.filter(r => r.capacityKWh > 0);
  const baseline = results.find(r => r.capacityKWh === 0) || results[0];

  const grid: TariffSensitivityCell[][] = [];

  for (let j = 0; j < feedInTariffs.length; j++) {
    const tFit = feedInTariffs[j];
    const row: TariffSensitivityCell[] = [];

    for (let i = 0; i < importTariffs.length; i++) {
      const tImport = importTariffs[i];

      // Re-evaluate baseline cost under this tariff
      const baselineCost = baseline.importKWh * tImport - baseline.exportKWh * tFit;

      // Find best positive battery among physical storage options
      let bestPositiveCap = positiveCandidates[0]?.capacityKWh ?? 7.5;
      let minPositiveCost = Infinity;

      for (const cand of positiveCandidates) {
        const gridCost = cand.importKWh * tImport - cand.exportKWh * tFit;
        const totalCost = gridCost + cand.ownerCostAUD;

        if (totalCost < minPositiveCost - EPS) {
          minPositiveCost = totalCost;
          bestPositiveCap = cand.capacityKWh;
        }
      }

      const bestPositiveNetSavings = baselineCost - minPositiveCost;
      const isViable = bestPositiveNetSavings >= -0.005;

      // Report Eq. 13 & Fig. 5:
      // When no battery beats solar alone, Eb* = 0.
      const optimalCapacityKWh = isViable ? bestPositiveCap : 0;
      const optimalTotalCost = isViable ? minPositiveCost : baselineCost;
      const netSavingsVsBaseline = isViable ? bestPositiveNetSavings : 0;

      row.push({
        importTariff: tImport,
        feedInTariff: tFit,
        optimalCapacityKWh,
        optimalTotalCost,
        baselineCost,
        netSavingsVsBaseline,
        isEconomicallyViable: isViable,
        bestPositiveCapacityKWh: bestPositiveCap,
        bestPositiveTotalCost: minPositiveCost,
        bestPositiveNetSavings: bestPositiveNetSavings,
      });
    }

    grid.push(row);
  }

  return {
    importTariffs,
    feedInTariffs,
    grid,
  };
}
