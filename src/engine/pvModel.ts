/**
 * pvModel.ts - Physical PV Generation Model from Solar Irradiance
 *
 * Implements Phase 4, Requirement 3 of AGENT_INSTRUCTIONS.md:
 * - Plane-of-array (POA) irradiance conversion (W/m² to kW DC)
 * - Temperature derating: P_dc * (1 + gamma * (T_cell - 25°C))
 * - Inverter AC limit / clipping: min(P_dc, P_ac_limit)
 * - System performance ratio (PR) tracking
 */

export interface PVSettings {
  systemKW: number;                    // DC nameplate rating in kW (e.g. 6.6 kW)
  inverterACLimitKW?: number;          // Inverter AC output limit in kW (e.g. 5.0 kW)
  tempCoeffPctPerC?: number;           // Power temp coefficient (default: -0.38 %/°C for modern monocrystalline)
  nominalOperatingCellTempC?: number;  // NOCT (default: 45°C)
  performanceRatio?: number;           // Balance of system loss factor (default: 0.85 = 85%)
}

export interface PVConversionResult {
  pvKWh: Float64Array;
  totalGeneratedKWh: number;
  totalUnclippedKWh: number;
  clippedEnergyKWh: number;
  assumedPerformanceRatio: number;
  averageEfficiency: number;
}

/**
 * Converts Plane-of-Array (POA) solar irradiance series (W/m²) and optional ambient temperature (°C)
 * to AC electrical generation (kWh per interval).
 *
 * @param poaIrradianceWPerM2 Array of POA solar irradiance values (W/m²)
 * @param ambientTempC Optional array of ambient temperatures (°C); defaults to 25°C if omitted
 * @param settings PV system specifications
 * @param dt Timestep in hours (1.0 = hourly, 0.5 = 30-min, 0.0833 = 5-min)
 */
export function convertPOAtoPVGeneration(
  poaIrradianceWPerM2: readonly number[] | Float64Array,
  ambientTempC: readonly number[] | Float64Array | null,
  settings: PVSettings,
  dt = 1.0
): PVConversionResult {
  const n = poaIrradianceWPerM2.length;
  const pvKWh = new Float64Array(n);
  const pr = settings.performanceRatio ?? 0.85;
  const tempCoeff = (settings.tempCoeffPctPerC ?? -0.38) / 100; // e.g. -0.0038 / °C
  const noct = settings.nominalOperatingCellTempC ?? 45;
  const acLimit = settings.inverterACLimitKW ?? settings.systemKW; // clipping limit

  let totalGenerated = 0;
  let totalUnclipped = 0;
  let clippedEnergy = 0;

  for (let t = 0; t < n; t++) {
    const gPoa = Math.max(0, poaIrradianceWPerM2[t]);
    if (gPoa < 1e-4) {
      pvKWh[t] = 0;
      continue;
    }

    // Estimate cell temperature: T_cell = T_amb + G_poa / 800 * (NOCT - 20)
    const tAmb = ambientTempC ? ambientTempC[t] : 20.0;
    const tCell = tAmb + (gPoa / 800.0) * (noct - 20.0);

    // Temperature derating factor
    const tempDerating = 1.0 + tempCoeff * (tCell - 25.0);
    const effectiveTempFactor = Math.max(0.70, Math.min(1.05, tempDerating));

    // DC power output in kW
    const pDC = settings.systemKW * (gPoa / 1000.0) * effectiveTempFactor * pr;
    totalUnclipped += pDC * dt;

    // AC power with inverter clipping
    const pAC = Math.min(pDC, acLimit);
    const energyKWh = pAC * dt;

    pvKWh[t] = energyKWh;
    totalGenerated += energyKWh;

    if (pDC > acLimit) {
      clippedEnergy += (pDC - acLimit) * dt;
    }
  }

  return {
    pvKWh,
    totalGeneratedKWh: totalGenerated,
    totalUnclippedKWh: totalUnclipped,
    clippedEnergyKWh: clippedEnergy,
    assumedPerformanceRatio: pr,
    averageEfficiency: totalUnclipped > 0 ? totalGenerated / totalUnclipped : 1.0,
  };
}
