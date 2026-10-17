import { Result, EPS } from './types';

export interface TariffSensitivityCell {
  importTariff: number;
  feedInTariff: number;
  optimalCapacityKWh: number;
  optimalTotalCost: number;
  baselineCost: number;
  netSavingsVsBaseline: number;
  isEconomicallyViable: boolean;
}

export interface TariffSensitivityMatrix {
  importTariffs: number[];
  feedInTariffs: number[];
  grid: TariffSensitivityCell[][];
}

/**
 * Computes optimal battery sizing across a 2D tariff grid (Section 7.3 & Figure 5 of report).
 * Uses memoized physical simulation outputs to execute in sub-millisecond time.
 */
export function computeTariffSensitivityMatrix(
  results: Result[],
  importTariffs: number[] = [0.25, 0.35, 0.45, 0.55, 0.65],
  feedInTariffs: number[] = [0.03, 0.05, 0.08, 0.12]
): TariffSensitivityMatrix {
  const eligible = results.filter(r => r.capacityKWh > 0);
  const baseline = results.find(r => r.capacityKWh === 0) || results[0];

  const grid: TariffSensitivityCell[][] = [];

  for (let i = 0; i < importTariffs.length; i++) {
    const tImport = importTariffs[i];
    const row: TariffSensitivityCell[] = [];

    for (let j = 0; j < feedInTariffs.length; j++) {
      const tFit = feedInTariffs[j];

      // Re-evaluate baseline cost under this tariff
      const baselineCost = baseline.importKWh * tImport - baseline.exportKWh * tFit;

      // Find optimal capacity among eligible positive batteries
      let bestCap = eligible[0].capacityKWh;
      let minTotalCost = Infinity;

      for (const cand of eligible) {
        const gridCost = cand.importKWh * tImport - cand.exportKWh * tFit;
        const totalCost = gridCost + cand.ownerCostAUD;

        if (totalCost < minTotalCost - EPS) {
          minTotalCost = totalCost;
          bestCap = cand.capacityKWh;
        }
      }

      const netSavings = baselineCost - minTotalCost;
      const isViable = netSavings >= -0.005;

      row.push({
        importTariff: tImport,
        feedInTariff: tFit,
        optimalCapacityKWh: bestCap,
        optimalTotalCost: minTotalCost,
        baselineCost,
        netSavingsVsBaseline: netSavings,
        isEconomicallyViable: isViable,
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
