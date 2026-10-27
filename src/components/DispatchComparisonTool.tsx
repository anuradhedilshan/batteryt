import React, { useState, useMemo } from 'react';
import { Zap, AlertTriangle } from 'lucide-react';
import { Result, Inputs, Series } from '../engine/types';
import { Battery } from '../engine/battery';
import { compareDispatch, DispatchComparison } from '../engine/dispatch';

interface DispatchToolProps {
  selected: Result;
  inputs: Inputs;
  series: Series;
}

export const DispatchComparisonTool: React.FC<DispatchToolProps> = ({
  selected,
  inputs,
  series,
}) => {
  const [tariffMode, setTariffMode] = useState<'flat' | 'tou'>('tou');
  const [allowGridCharge, setAllowGridCharge] = useState(false);
  const [allowBatteryExport, setAllowBatteryExport] = useState(false);
  const [horizonDays, setHorizonDays] = useState<number>(30); // 7, 14, 30 days

  const n = Math.min(series.pv.length, horizonDays * 24);
  const pvSlice = useMemo(() => series.pv.slice(0, n), [series.pv, n]);
  const loadSlice = useMemo(() => series.load.slice(0, n), [series.load, n]);

  const eff = inputs.efficiencyPct / 100;
  const bat = useMemo(() => {
    if (selected.capacityKWh <= 0) return null;
    return Battery.fromNominal(
      selected.capacityKWh,
      inputs.socMinPct / 100,
      inputs.socMaxPct / 100,
      inputs.cRate,
      eff,
      eff
    );
  }, [selected.capacityKWh, inputs.socMinPct, inputs.socMaxPct, inputs.cRate, eff]);

  // Build TOU tariff profile (Peak: 17:00–21:00 @ $0.55/kWh, Shoulder/Off-peak: $0.25/kWh)
  const touTariff = useMemo(() => {
    const t = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const hod = i % 24;
      t[i] = hod >= 17 && hod < 21 ? 0.55 : 0.25;
    }
    return t;
  }, [n]);

  const activeTariff = tariffMode === 'tou' ? touTariff : inputs.importAUDPerKWh;

  const comparison: DispatchComparison | null = useMemo(() => {
    if (!bat) return null;
    return compareDispatch(
      pvSlice,
      loadSlice,
      bat,
      activeTariff,
      inputs.feedInAUDPerKWh,
      1.0,
      {
        pvOnlyCharging: !allowGridCharge,
        allowBatteryExport,
      }
    );
  }, [bat, pvSlice, loadSlice, activeTariff, inputs.feedInAUDPerKWh, allowGridCharge, allowBatteryExport]);

  if (!bat || selected.capacityKWh <= 0) {
    return (
      <div className="card">
        <div className="card-header">
          <div>
            <h2 className="card-title">
              <Zap size={20} color="#eab308" />
              Tariff-Aware Dispatch Benchmark (Rule-Based vs Perfect Foresight)
            </h2>
            <p className="card-desc">
              Select a battery pack (&gt; 0 kWh) in the sidebar or studio to evaluate dispatch optimization under Time-of-Use (TOU) tariffs.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="card-header">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <h2 className="card-title">
              <Zap size={20} color="#eab308" />
              Tariff-Aware Dispatch Benchmark: Rule-Based vs. Perfect Foresight (Phase 5)
            </h2>
            <span style={{ fontSize: '0.6875rem', padding: '2px 8px', borderRadius: '4px', background: '#fef3c7', color: '#92400e', fontWeight: 800 }}>
              THEORETICAL UPPER BOUND
            </span>
          </div>
          <p className="card-desc">
            Compares standard heuristic self-consumption dispatch against a linear programming (LP) controller with perfect foresight across {horizonDays} days for the selected <strong>{selected.capacityKWh.toFixed(1)} kWh</strong> battery.
          </p>
        </div>

        {/* Horizon selector */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Horizon:</span>
          {[7, 14, 30].map(days => (
            <button
              key={days}
              type="button"
              className={`btn btn-sm ${horizonDays === days ? 'btn-primary' : 'btn-secondary'}`}
              style={{ padding: '2px 8px', fontSize: '0.75rem' }}
              onClick={() => setHorizonDays(days)}
            >
              {days}d
            </button>
          ))}
        </div>
      </div>

      {/* Prominent Upper Bound Disclaimer */}
      <div style={{
        background: '#fffbeb',
        border: '1px solid #fde68a',
        borderLeft: '4px solid #f59e0b',
        borderRadius: '6px',
        padding: '10px 14px',
        marginBottom: '16px',
        display: 'flex',
        alignItems: 'flex-start',
        gap: '10px',
        fontSize: '0.8125rem',
        color: '#92400e',
      }}>
        <AlertTriangle size={18} color="#d97706" style={{ flexShrink: 0, marginTop: '2px' }} />
        <div>
          <strong>Theoretical Upper Bound Notice:</strong> Real home controllers (Tesla Gateway, Sungrow iSolarCloud, etc.) operate with weather and occupancy forecast uncertainty. Perfect foresight results show the physical limit of battery value under smart tariffs, not guaranteed savings.
        </div>
      </div>

      {/* Controls Bar */}
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '12px',
        background: 'var(--bg-surface-subtle)',
        padding: '12px 16px',
        borderRadius: '8px',
        marginBottom: '16px',
        fontSize: '0.8125rem',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>Tariff Structure:</span>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
            <input
              type="radio"
              name="tariffMode"
              checked={tariffMode === 'tou'}
              onChange={() => setTariffMode('tou')}
              style={{ accentColor: '#0284c7' }}
            />
            <span>Time-of-Use (Peak 5–9pm $0.55, Off-Peak $0.25)</span>
          </label>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
            <input
              type="radio"
              name="tariffMode"
              checked={tariffMode === 'flat'}
              onChange={() => setTariffMode('flat')}
              style={{ accentColor: '#0284c7' }}
            />
            <span>Flat Tariff (${inputs.importAUDPerKWh.toFixed(2)}/kWh)</span>
          </label>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={allowGridCharge}
              onChange={(e) => setAllowGridCharge(e.target.checked)}
              style={{ accentColor: '#0284c7' }}
            />
            <span>Grid Charging Allowed</span>
          </label>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={allowBatteryExport}
              onChange={(e) => setAllowBatteryExport(e.target.checked)}
              style={{ accentColor: '#0284c7' }}
            />
            <span>Battery Export to Grid Allowed</span>
          </label>
        </div>
      </div>

      {/* Side-by-Side Comparison Cards */}
      {comparison && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '16px', marginBottom: '16px' }}>
          {/* Greedy Baseline Card */}
          <div style={{
            background: 'var(--bg-surface-subtle)',
            border: '1px solid var(--border-subtle)',
            borderRadius: '8px',
            padding: '16px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                1. Baseline Dispatch
              </span>
              <span className="table-tag" style={{ margin: 0, background: '#e2e8f0', color: '#334155' }}>
                Standard Controller
              </span>
            </div>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 900, color: 'var(--text-primary)', marginBottom: '4px' }}>
              Rule-Based (Greedy)
            </h3>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '12px' }}>
              Charges immediately when surplus solar occurs; discharges immediately upon demand deficit.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '0.8125rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Grid Bill ({horizonDays} days):</span>
                <strong style={{ fontSize: '1.0625rem', color: 'var(--text-primary)' }}>
                  ${comparison.greedyCostAUD.toFixed(2)}
                </strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)' }}>
                <span>Tariff Strategy:</span>
                <span>Self-consumption only</span>
              </div>
            </div>
          </div>

          {/* Optimal LP Upper Bound Card */}
          <div style={{
            background: 'rgba(2, 132, 199, 0.05)',
            border: '1px solid rgba(2, 132, 199, 0.3)',
            borderRadius: '8px',
            padding: '16px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', color: '#0284c7' }}>
                2. Tariff-Optimised Dispatch
              </span>
              <span className="table-tag table-tag-optimal" style={{ margin: 0 }}>
                Upper Bound Limit
              </span>
            </div>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 900, color: '#0369a1', marginBottom: '4px' }}>
              Linear Programming (LP)
            </h3>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '12px' }}>
              Holds battery capacity for expensive evening peak hours ($0.55/kWh) and exploits tariff arbitrage.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '0.8125rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Grid Bill ({horizonDays} days):</span>
                <strong style={{ fontSize: '1.0625rem', color: '#0f766e' }}>
                  ${comparison.optimalCostAUD.toFixed(2)}
                </strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: '#0f766e', fontWeight: 700 }}>
                <span>Bill Improvement vs Greedy:</span>
                <span>
                  {comparison.savingsAUD > 0.005 ? `Saves $${comparison.savingsAUD.toFixed(2)} (${horizonDays}d)` : 'Identical (0.00)'}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Technical Insight */}
      <div style={{
        background: 'var(--bg-surface-subtle)',
        borderRadius: '6px',
        padding: '12px 14px',
        fontSize: '0.75rem',
        lineHeight: 1.5,
        color: 'var(--text-secondary)',
      }}>
        <strong>Key Engineering Insight (Phase 5):</strong> Under a flat tariff, greedy heuristic dispatch is mathematically optimal because the marginal value of battery energy is constant. Under Time-of-Use (TOU) tariffs, an intelligent controller that preserves stored energy for the 5pm–9pm evening peak window can reduce electricity bills by an additional $50–$180/year above standard self-consumption controllers.
      </div>
    </div>
  );
};
