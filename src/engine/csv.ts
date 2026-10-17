import Papa from 'papaparse';
import { HOURS, Result, Hour } from './types';

export interface ImportedProfile {
  pv: number[];
  load: number[];
  filename: string;
  provenance: 'uploaded';
}

export function parseHourlyCSV(text: string, filename: string): ImportedProfile {
  const cleanText = text.replace(/^\uFEFF/, '').trim();
  const parsed = Papa.parse<Record<string, string>>(cleanText, {
    header: true,
    skipEmptyLines: 'greedy',
    transformHeader: h => h.trim().toLowerCase(),
    dynamicTyping: false,
  });

  if (parsed.errors.length > 0) {
    throw new Error(`CSV parsing error: ${parsed.errors[0].message} (row ${parsed.errors[0].row ?? 'unknown'}).`);
  }

  if (parsed.data.length !== HOURS) {
    throw new Error(`Expected exactly ${HOURS} hourly data rows for a non-leap year; received ${parsed.data.length} rows.`);
  }

  const firstRow = parsed.data[0] || {};
  const columns = Object.keys(firstRow);

  const findCol = (aliases: string[]) => aliases.find(name => columns.includes(name));
  const pvKey = findCol(['pv_generation_kwh', 'pv_kwh', 'solar_kwh', 'e_pv_t', 'pv']);
  const loadKey = findCol(['household_load_kwh', 'load_kwh', 'e_load_t', 'load']);

  if (!pvKey || !loadKey) {
    throw new Error('Missing required PV or load column. Use "pv_generation_kwh" and "household_load_kwh".');
  }

  const pv: number[] = new Array(HOURS);
  const load: number[] = new Array(HOURS);

  for (let i = 0; i < HOURS; i++) {
    const row = parsed.data[i];
    const rawPV = (row[pvKey] ?? '').trim();
    const rawLoad = (row[loadKey] ?? '').trim();

    if (rawPV === '' || rawLoad === '') {
      throw new Error(`Empty value found at data row ${i + 1}.`);
    }

    const a = Number(rawPV);
    const b = Number(rawLoad);

    if (!Number.isFinite(a) || a < 0) {
      throw new Error(`Invalid PV energy "${rawPV}" at data row ${i + 1}. Values must be non-negative finite numbers.`);
    }
    if (!Number.isFinite(b) || b < 0) {
      throw new Error(`Invalid household load "${rawLoad}" at data row ${i + 1}. Values must be non-negative finite numbers.`);
    }

    pv[i] = a;
    load[i] = b;
  }

  return {
    pv,
    load,
    filename,
    provenance: 'uploaded',
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
      r.equivalentCycles.toFixed(1),
      provenanceLabel,
    ]);
  }

  downloadCSV('battery_capacity_comparison.csv', rows);
}

export function generateHourlyTraceCSV(hourly: Hour[], capacityKWh: number): void {
  const headers = [
    'hour_index',
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
