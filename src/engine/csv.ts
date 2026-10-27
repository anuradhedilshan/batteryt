import Papa from 'papaparse';
import { Result, Hour, Inputs } from './types';
import { convertPOAtoPVGeneration, PVSettings } from './pvModel';

export interface ImportedProfile {
  pv: number[];
  load: number[];
  importTariffs?: number[];
  feedInTariffs?: number[];
  timestamps?: string[];
  dt: number;
  filename: string;
  provenance: 'uploaded';
  timezoneNote?: string;
  warnings?: string[];
  irradianceMetadata?: {
    assumedPerformanceRatio: number;
    clippedEnergyKWh: number;
  };
}

/**
 * Parses hourly or sub-hourly CSV files (8,760 rows for 1h, 17,520 for 30m, 105,120 for 5m).
 * Supports direct PV energy (kWh) or POA irradiance (W/m²), load energy (kWh),
 * and optional per-interval electricity tariffs (import and feed-in).
 */
export function parseHourlyCSV(
  text: string,
  filename: string,
  pvSettings?: PVSettings
): ImportedProfile {
  const cleanText = text.replace(/^\uFEFF/, '').trim();
  const parsed = Papa.parse<Record<string, string>>(cleanText, {
    header: true,
    skipEmptyLines: 'greedy',
    transformHeader: h => h.trim().toLowerCase().replace(/[\s-]+/g, '_'),
    dynamicTyping: false,
  });

  const fatalErrors = parsed.errors.filter(e => e.code !== 'UndetectableDelimiter');
  if (fatalErrors.length > 0) {
    throw new Error(`CSV parsing error: ${fatalErrors[0].message} (row ${fatalErrors[0].row ?? 'unknown'}).`);
  }

  const rows = parsed.data;
  const numRows = rows.length;

  if (numRows < 24) {
    throw new Error(`CSV file must contain at least 24 interval data rows (received ${numRows}).`);
  }

  // Determine interval timestep dt (in hours)
  let dt = 1.0;
  if (numRows === 8760) dt = 1.0;
  else if (numRows === 8784) dt = 1.0; // Leap year 8,784 hours
  else if (numRows === 17520 || numRows === 17568) dt = 0.5; // Half-hourly (30 min)
  else if (numRows === 105120 || numRows === 105408) dt = 5.0 / 60.0; // 5-minute data
  else {
    // Infer from 8,760 / numRows
    dt = 8760.0 / numRows;
  }

  const firstRow = rows[0] || {};
  const columns = Object.keys(firstRow);

  const findCol = (aliases: string[]) => aliases.find(name => columns.includes(name));

  const loadKey = findCol(['household_load_kwh', 'load_kwh', 'load', 'e_load_t', 'demand_kwh', 'grid_load_kwh']);
  const pvKey = findCol(['pv_generation_kwh', 'pv_kwh', 'pv', 'solar_kwh', 'e_pv_t', 'generation_kwh']);
  const irradianceKey = findCol(['poa_irradiance_w_m2', 'irradiance_w_m2', 'poa_irradiance', 'irradiance', 'solar_irradiance_w_m2']);
  const ambientTempKey = findCol(['ambient_temp_c', 'temp_c', 'temperature_c', 'ambient_temperature']);
  const importTariffKey = findCol(['import_tariff_aud_kwh', 'import_tariff', 'tariff_import', 't_import', 'retail_tariff_aud_kwh']);
  const feedInTariffKey = findCol(['feed_in_tariff_aud_kwh', 'feed_in_tariff', 'fit_aud_kwh', 't_fit', 'solar_fit_aud_kwh']);
  const timestampKey = findCol(['timestamp', 'datetime', 'date_time', 'time', 'date']);

  if (!loadKey) {
    throw new Error('Missing household load column. Expected "household_load_kwh" or "load_kwh".');
  }

  if (!pvKey && !irradianceKey) {
    throw new Error('Missing PV data column. Provide either "pv_generation_kwh" or POA irradiance "poa_irradiance_w_m2".');
  }

  const load: number[] = new Array(numRows);
  const rawPV: number[] = pvKey ? new Array(numRows) : [];
  const rawPoa: number[] = irradianceKey ? new Array(numRows) : [];
  const rawTemp: number[] = ambientTempKey ? new Array(numRows) : [];
  const importTariffs: number[] | undefined = importTariffKey ? new Array(numRows) : undefined;
  const feedInTariffs: number[] | undefined = feedInTariffKey ? new Array(numRows) : undefined;
  const timestamps: string[] | undefined = timestampKey ? new Array(numRows) : undefined;

  for (let i = 0; i < numRows; i++) {
    const row = rows[i];

    // Load parsing
    const rawLoadVal = (row[loadKey] ?? '').trim();
    if (rawLoadVal === '') {
      throw new Error(`Empty load value at row ${i + 1}.`);
    }
    const l = Number(rawLoadVal);
    if (!Number.isFinite(l) || l < 0) {
      throw new Error(`Invalid household load "${rawLoadVal}" at row ${i + 1}. Values must be non-negative numbers.`);
    }
    load[i] = l;

    // Direct PV parsing
    if (pvKey) {
      const rawPVVal = (row[pvKey] ?? '').trim();
      if (rawPVVal === '') {
        throw new Error(`Empty PV value at row ${i + 1}.`);
      }
      const p = Number(rawPVVal);
      if (!Number.isFinite(p) || p < 0) {
        throw new Error(`Invalid PV energy "${rawPVVal}" at row ${i + 1}. Values must be non-negative numbers.`);
      }
      rawPV[i] = p;
    }

    // POA Irradiance parsing
    if (irradianceKey) {
      const rawIrrVal = (row[irradianceKey] ?? '').trim();
      const irr = Number(rawIrrVal || '0');
      if (!Number.isFinite(irr) || irr < 0) {
        throw new Error(`Invalid solar irradiance "${rawIrrVal}" at row ${i + 1}. Irradiance must be non-negative.`);
      }
      rawPoa[i] = irr;

      if (ambientTempKey) {
        const rawT = Number((row[ambientTempKey] ?? '20').trim());
        rawTemp[i] = Number.isFinite(rawT) ? rawT : 20.0;
      }
    }

    // Optional Tariffs
    if (importTariffKey && importTariffs) {
      const rawImp = Number((row[importTariffKey] ?? '').trim());
      if (Number.isFinite(rawImp) && rawImp >= 0) {
        importTariffs[i] = rawImp;
      }
    }

    if (feedInTariffKey && feedInTariffs) {
      const rawFit = Number((row[feedInTariffKey] ?? '').trim());
      if (Number.isFinite(rawFit) && rawFit >= 0) {
        feedInTariffs[i] = rawFit;
      }
    }

    if (timestampKey && timestamps) {
      timestamps[i] = (row[timestampKey] ?? '').trim();
    }
  }

  // Convert Irradiance to PV if necessary
  let finalPV = rawPV;
  let irradianceMetadata: ImportedProfile['irradianceMetadata'] | undefined;

  if (irradianceKey && !pvKey) {
    const settings: PVSettings = pvSettings ?? { systemKW: 6.6, inverterACLimitKW: 5.0 };
    const conv = convertPOAtoPVGeneration(
      rawPoa,
      ambientTempKey ? rawTemp : null,
      settings,
      dt
    );
    finalPV = Array.from(conv.pvKWh);
    irradianceMetadata = {
      assumedPerformanceRatio: conv.assumedPerformanceRatio,
      clippedEnergyKWh: conv.clippedEnergyKWh,
    };
  }

  const warnings: string[] = [];
  if (numRows !== 8760 && numRows !== 17520 && numRows !== 105120) {
    warnings.push(`File contains ${numRows} intervals (dt=${dt.toFixed(3)}h). Standard annual datasets use 8,760, 17,520 or 105,120 rows.`);
  }

  return {
    pv: finalPV,
    load,
    importTariffs,
    feedInTariffs,
    timestamps,
    dt,
    filename,
    provenance: 'uploaded',
    timezoneNote: 'Standard local solar time assumed (AEST UTC+10 / AEDT UTC+11 noted).',
    warnings,
    irradianceMetadata,
  };
}

export function downloadCSV(filename: string, rows: (string | number)[][]): void {
  const csvContent = rows
    .map(row =>
      row
        .map(cell => {
          const str = String(cell);
          if (/[",\n\r]/.test(str)) {
            return `"${str.replace(/"/g, '""')}"`;
          }
          return str;
        })
        .join(',')
    )
    .join('\r\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function downloadJSON(filename: string, data: Record<string, unknown>): void {
  const jsonContent = JSON.stringify(data, null, 2);
  const blob = new Blob([jsonContent], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function generateCapacityComparisonCSV(results: Result[], provenanceLabel: string): void {
  const headers = [
    'capacity_kwh',
    'system_type',
    'annual_import_kwh',
    'annual_export_kwh',
    'annual_charge_kwh',
    'annual_discharge_kwh',
    'annual_grid_cost_aud',
    'annual_capital_aud',
    'annual_om_aud',
    'total_annual_cost_aud',
    'net_annual_benefit_aud',
    'lifetime_npv_aud',
    'equivalent_annual_benefit_aud',
    'simple_payback_years',
    'self_consumption_pct',
    'self_sufficiency_pct',
    'equivalent_full_cycles',
    'data_provenance',
  ];

  const rows: (string | number)[][] = [headers];

  for (const r of results) {
    rows.push([
      r.capacityKWh.toFixed(1),
      r.capacityKWh === 0 ? 'solar_only_baseline' : 'candidate_battery',
      r.importKWh.toFixed(2),
      r.exportKWh.toFixed(2),
      r.chargedKWh.toFixed(2),
      r.dischargedKWh.toFixed(2),
      r.gridCostAUD.toFixed(2),
      r.annualCapitalAUD.toFixed(2),
      r.annualOMAUD.toFixed(2),
      r.totalAnnualCostAUD.toFixed(2),
      r.netBenefitAUD.toFixed(2),
      (r.lifetimeNPVAUD ?? 0).toFixed(2),
      (r.equivalentAnnualBenefitAUD ?? 0).toFixed(2),
      r.simplePaybackYears ? r.simplePaybackYears.toFixed(1) : 'Never',
      (r.selfConsumptionPct ?? 0).toFixed(1),
      (r.selfSufficiencyPct ?? 0).toFixed(1),
      r.equivalentCycles.toFixed(1),
      provenanceLabel,
    ]);
  }

  downloadCSV('battery_capacity_comparison.csv', rows);
}

export function generateHourlyTraceCSV(hourly: Hour[], capacityKWh: number): void {
  const headers = [
    'interval_index',
    'pv_kwh',
    'load_kwh',
    'surplus_kwh',
    'deficit_kwh',
    'charge_kwh',
    'discharge_kwh',
    'stored_before_kwh',
    'stored_after_kwh',
    'soc_end_pct',
    'grid_import_kwh',
    'grid_export_kwh',
    'bus_balance_residual_kwh',
  ];

  const rows: (string | number)[][] = [headers];

  for (const h of hourly) {
    rows.push([
      h.index + 1,
      h.pv.toFixed(3),
      h.load.toFixed(3),
      h.surplus.toFixed(3),
      h.deficit.toFixed(3),
      h.charge.toFixed(3),
      h.discharge.toFixed(3),
      h.storedBefore.toFixed(3),
      h.storedAfter.toFixed(3),
      h.socEndPct !== null ? h.socEndPct.toFixed(2) : 'N/A',
      h.gridImport.toFixed(3),
      h.gridExport.toFixed(3),
      h.energyResidual.toExponential(3),
    ]);
  }

  downloadCSV(`battery_hourly_trace_${capacityKWh.toFixed(1)}kwh.csv`, rows);
}

/**
 * Phase 6 Requirement 4: Export a JSON of all assumptions (with source and date)
 * so that any simulation run can be completely audited and reproduced.
 */
export function exportAssumptionsJSON(
  inputs: Inputs,
  metadata: {
    source: string;
    filename?: string;
    selectedBatteryKWh: number;
    economicOptimalKWh: number;
    optimalCostAUD: number;
    baselineCostAUD: number;
  }
): void {
  const assumptionsData = {
    exportMetadata: {
      generatedAt: new Date().toISOString(),
      softwareVersion: '1.0.0 (Research Model Upgraded)',
      specification: 'AGENT_INSTRUCTIONS.md (Phases 1–6)',
    },
    runProfile: {
      provenance: metadata.source,
      filename: metadata.filename ?? 'Illustrative synthetic profile',
      pvSystemKW: inputs.pvKW,
      referencePVKW: inputs.pvReferenceKW,
      demandMultiplier: inputs.demandMultiplier,
    },
    tariffs: {
      retailImportAUDPerKWh: inputs.importAUDPerKWh,
      feedInAUDPerKWh: inputs.feedInAUDPerKWh,
      tariffEscalationPctPerYear: inputs.tariffEscalationPct ?? 0.0,
      source: 'Retail Electricity Price Fact Sheet Benchmark',
      lastVerifiedDate: '2026-10-27',
    },
    cheaperHomeBatteriesProgram: {
      programCommenced: '2026-05-01',
      programConcludes: '2030-12-31',
      applied: inputs.useCheaperHomeBatteriesProgram ?? true,
      installDate: inputs.installDate ?? '2026-11-01',
      stcMarketPriceAUD: inputs.stcPriceAUD ?? 37.0,
      installerAccredited: inputs.subsidyEligible ?? true,
      source: 'Clean Energy Regulator (CER) Cheaper Home Batteries Calculator',
      regulatorURL: 'https://rec-registry.cleanenergyregulator.gov.au/',
      lastVerifiedDate: '2026-10-27',
    },
    financialAssumptions: {
      discountRatePct: inputs.annualDiscountRatePct,
      financialHorizonYears: inputs.lifeYears,
      annualOMPercentGross: inputs.annualOMPercentGross,
      batteryCapacityFadePctPerYear: inputs.capacityFadePctPerYear ?? 0.0,
      fixedCapexAUD: inputs.fixedCapexAUD,
      variableCapexAUDPerKWh: inputs.variableCapexAUDPerKWh,
      source: 'SolarQuotes Battery Guide & Report Section 4',
      lastVerifiedDate: '2026-10-27',
    },
    batteryHardwareRules: {
      efficiencyRoundTripPct: Math.pow(inputs.efficiencyPct / 100, 2) * 100,
      chargeDischargeEfficiencyPctEachWay: inputs.efficiencyPct,
      cRateLimit: inputs.cRate,
      reserveMarginPolicy: 'Manufacturer usable kWh ratings applied directly; no extra reserve window imposed.',
    },
    decisionResults: {
      selectedCapacityKWh: metadata.selectedBatteryKWh,
      economicOptimalCapacityKWh: metadata.economicOptimalKWh,
      solarOnlyBaselineCostAUDPerYear: metadata.baselineCostAUD,
      economicOptimalCostAUDPerYear: metadata.optimalCostAUD,
    },
  };

  downloadJSON(`battery_sizing_assumptions_${new Date().toISOString().slice(0, 10)}.json`, assumptionsData);
}
