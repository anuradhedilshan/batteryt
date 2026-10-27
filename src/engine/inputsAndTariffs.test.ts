import { describe, it, expect } from 'vitest';
import { parseHourlyCSV } from './csv';
import { convertPOAtoPVGeneration } from './pvModel';
import { simulateBatteryTimeSeries } from './model';
import { Battery } from './battery';

describe('Phase 4 - Inputs, Tariffs, Irradiance Model, and Curtailment', () => {
  it('parses valid 8,760 row CSV and detects custom interval tariffs', () => {
    // Generate a minimal sample CSV with 24 hours
    const rows = ['timestamp,household_load_kwh,pv_generation_kwh,import_tariff_aud_kwh,feed_in_tariff_aud_kwh'];
    for (let h = 0; h < 24; h++) {
      const isPeak = h >= 17 && h < 21;
      const tImp = isPeak ? 0.55 : 0.25;
      rows.push(`2026-01-01T${String(h).padStart(2, '0')}:00:00,1.25,2.50,${tImp},0.05`);
    }
    const csvText = rows.join('\n');
    const parsed = parseHourlyCSV(csvText, 'test_24h.csv');

    expect(parsed.load.length).toBe(24);
    expect(parsed.pv.length).toBe(24);
    expect(parsed.importTariffs).toBeDefined();
    expect(parsed.importTariffs?.length).toBe(24);
    expect(parsed.importTariffs?.[18]).toBe(0.55); // peak
    expect(parsed.importTariffs?.[12]).toBe(0.25); // off-peak
    expect(parsed.feedInTariffs?.[12]).toBe(0.05);
    expect(parsed.dt).toBeCloseTo(8760 / 24, 1);
  });

  it('rejects invalid inputs: negative values, non-numeric data, missing required columns', () => {
    // Missing PV column
    const missingPV = 'household_load_kwh,other_col\n' + '1.5,foo\n'.repeat(25);
    expect(() => parseHourlyCSV(missingPV, 'bad.csv')).toThrow(/Missing PV data column/i);

    // Negative load
    const negativeLoad = 'household_load_kwh,pv_generation_kwh\n' + '-1.5,2.0\n'.repeat(25);
    expect(() => parseHourlyCSV(negativeLoad, 'bad.csv')).toThrow(/must be non-negative/i);

    // Corrupt text value
    const corruptVal = 'household_load_kwh,pv_generation_kwh\n' + 'N/A,2.0\n'.repeat(25);
    expect(() => parseHourlyCSV(corruptVal, 'bad.csv')).toThrow(/Invalid household load/i);
  });

  it('converts plane-of-array (POA) solar irradiance to electrical generation with temperature loss and inverter clipping', () => {
    // 5 midday hours with strong sun (1,000 W/m² POA) and mild ambient temperature
    const poa = [1000, 1000, 1000, 1000, 1000];
    const ambTemp = [15, 15, 15, 15, 15]; // cool sunny day
    const settings = {
      systemKW: 6.6, // 6.6 kW DC array
      inverterACLimitKW: 5.0, // 5.0 kW AC inverter limit
      performanceRatio: 0.85,
      tempCoeffPctPerC: -0.38,
    };

    const result = convertPOAtoPVGeneration(poa, ambTemp, settings, 1.0);

    expect(result.pvKWh.length).toBe(5);
    // Each hour, AC output must not exceed the 5.0 kW inverter limit (5.0 kWh in 1 hour)
    for (let t = 0; t < 5; t++) {
      expect(result.pvKWh[t]).toBeLessThanOrEqual(5.0 + 1e-9);
    }
    // Verifies that clipping occurred (6.6 kW DC * 0.919 temp factor * 0.85 PR = ~5.16 kW DC > 5.0 kW limit)
    expect(result.clippedEnergyKWh).toBeGreaterThan(0);
    expect(result.assumedPerformanceRatio).toBe(0.85);
  });

  it('enforces export limits and curtails excess generation accurately', () => {
    // 5 kW export limit
    const exportCapKW = 5.0;
    const pv = [10.0]; // 10 kWh PV in 1 hour
    const load = [1.0]; // 1 kWh household load
    // Surplus = 9 kWh.
    // Battery: 5 kWh usable, max charge power 2.5 kW -> battery charges 2.5 kWh
    // Remaining surplus = 9.0 - 2.5 = 6.5 kWh.
    // Export limit = 5.0 kW * 1.0h = 5.0 kWh.
    // Curtailed = 6.5 - 5.0 = 1.5 kWh.
    const bat = Battery.fromUsable(5.0, 2.5);

    const sim = simulateBatteryTimeSeries(
      pv,
      load,
      bat,
      1.0,
      undefined,
      false,
      1e-6,
      1,
      true,
      exportCapKW
    );

    expect(sim.charge[0]).toBeCloseTo(2.5, 4);
    expect(sim.exp[0]).toBeCloseTo(5.0, 4); // Capped at 5.0 kWh
    expect(sim.curtailed?.[0]).toBeCloseTo(1.5, 4); // 1.5 kWh curtailed
    expect(sim.totalCurtailedKWh).toBeCloseTo(1.5, 4);

    // Energy balance check with curtailment:
    // (PV - curtailed) + import + discharge = load + charge + export
    const balanceResidual = Math.abs(
      (pv[0] - sim.curtailed![0]) + sim.imp[0] + sim.discharge[0] -
      (load[0] + sim.charge[0] + sim.exp[0])
    );
    expect(balanceResidual).toBeLessThan(1e-7);
  });
});
