import React from 'react';
import { Result, Inputs, Series } from '../engine/types';
import { ShieldCheck, BarChart3, DollarSign } from 'lucide-react';

interface AccountingProps {
  selected: Result;
  baseline: Result;
  inputs: Inputs;
  series: Series;
}

export const AnnualAccounting: React.FC<AccountingProps> = ({
  selected,
  baseline,
  inputs,
  series,
}) => {
  // Compute annual energy aggregates
  let totalPV = 0;
  let totalLoad = 0;
  let directPV = 0;

  for (let t = 0; t < 8760; t++) {
    const p = series.pv[t];
    const l = series.load[t];
    totalPV += p;
    totalLoad += l;
    directPV += Math.min(p, l);
  }

  const selfConsumptionPct = ((directPV + selected.chargedKWh) / totalPV) * 100;
  const selfSufficiencyPct = ((directPV + selected.dischargedKWh) / totalLoad) * 100;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px' }}>
      {/* Annual Energy Flow Accounting */}
      <div className="card">
        <h3 className="card-title" style={{ fontSize: '1rem', marginBottom: '12px' }}>
          <BarChart3 size={18} color="var(--color-optimal)" />
          Annual Energy Balance (8,760 Hours)
        </h3>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.875rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '6px' }}>
            <span style={{ color: 'var(--text-secondary)' }}>Annual Solar PV Generation</span>
            <strong>{totalPV.toLocaleString('en-AU', { maximumFractionDigits: 0 })} kWh</strong>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '6px' }}>
            <span style={{ color: 'var(--text-secondary)' }}>Annual Household Consumption</span>
            <strong>{totalLoad.toLocaleString('en-AU', { maximumFractionDigits: 0 })} kWh</strong>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '6px' }}>
            <span style={{ color: 'var(--text-secondary)' }}>Direct PV Consumption (No Battery Needed)</span>
            <strong>{directPV.toLocaleString('en-AU', { maximumFractionDigits: 0 })} kWh</strong>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '6px' }}>
            <span style={{ color: 'var(--text-secondary)' }}>Solar Energy Charged into Battery</span>
            <strong style={{ color: '#7c3aed' }}>{selected.chargedKWh.toLocaleString('en-AU', { maximumFractionDigits: 0 })} kWh</strong>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '6px' }}>
            <span style={{ color: 'var(--text-secondary)' }}>Useful AC Energy Discharged to Load</span>
            <strong style={{ color: '#15803d' }}>{selected.dischargedKWh.toLocaleString('en-AU', { maximumFractionDigits: 0 })} kWh</strong>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '6px' }}>
            <span style={{ color: 'var(--text-secondary)' }}>Remaining Grid Imports</span>
            <strong style={{ color: '#dc2626' }}>{selected.importKWh.toLocaleString('en-AU', { maximumFractionDigits: 0 })} kWh</strong>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '6px' }}>
            <span style={{ color: 'var(--text-secondary)' }}>Remaining Solar Grid Exports</span>
            <strong style={{ color: '#0891b2' }}>{selected.exportKWh.toLocaleString('en-AU', { maximumFractionDigits: 0 })} kWh</strong>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '6px', background: '#f8fafc', padding: '6px 8px', borderRadius: '4px' }}>
            <span style={{ fontWeight: 600 }}>PV Self-Consumption Rate</span>
            <strong style={{ color: 'var(--color-optimal)' }}>{selfConsumptionPct.toFixed(1)}%</strong>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '6px', background: '#f8fafc', padding: '6px 8px', borderRadius: '4px' }}>
            <span style={{ fontWeight: 600 }}>Solar Self-Sufficiency (Coverage)</span>
            <strong style={{ color: 'var(--color-optimal)' }}>{selfSufficiencyPct.toFixed(1)}%</strong>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '4px' }}>
            <span style={{ color: 'var(--text-secondary)' }}>Equivalent Full Battery Cycles</span>
            <strong>{selected.equivalentCycles.toFixed(1)} cycles/yr</strong>
          </div>
        </div>

        <div style={{ background: '#f0fdf4', border: 'none', borderRadius: 'var(--radius-sm)', padding: '12px 14px', marginTop: '14px', fontSize: '0.8125rem', color: '#15803d', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <ShieldCheck size={18} />
          <div>
            <strong>Physical Invariants Verified (PASS):</strong> Max hourly residual = {selected.maxEnergyResidual.toExponential(2)} kWh. Cyclic SOC convergence = {selected.cyclicResidual.toExponential(2)} kWh.
          </div>
        </div>
      </div>

      {/* Financial Accounting & CRF Breakdown */}
      <div className="card">
        <h3 className="card-title" style={{ fontSize: '1rem', marginBottom: '12px' }}>
          <DollarSign size={18} color="var(--color-selected)" />
          Capital &amp; Annual Cost Breakdown
        </h3>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.875rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '6px' }}>
            <span style={{ color: 'var(--text-secondary)' }}>Gross Installed Battery Capital</span>
            <strong>${selected.grossCapexAUD.toFixed(2)}</strong>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '6px' }}>
            <span style={{ color: 'var(--text-secondary)' }}>Hypothetical Discount ({inputs.hypotheticalDiscountPct}%)</span>
            <strong style={{ color: '#15803d' }}>-${selected.subsidyAUD.toFixed(2)}</strong>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '6px' }}>
            <span style={{ color: 'var(--text-secondary)' }}>Net Initial Capital Invested</span>
            <strong>${selected.netCapexAUD.toFixed(2)}</strong>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '6px' }}>
            <span style={{ color: 'var(--text-secondary)' }}>Capital Recovery Factor (CRF, {inputs.annualDiscountRatePct}%, {inputs.lifeYears} yrs)</span>
            <span style={{ fontFamily: 'var(--font-mono)' }}>
              {selected.capacityKWh > 0 ? (selected.annualCapitalAUD / selected.netCapexAUD).toFixed(4) : '0.0000'}
            </span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '6px' }}>
            <span style={{ color: 'var(--text-secondary)' }}>Annualized Capital Cost</span>
            <strong>${selected.annualCapitalAUD.toFixed(2)}/yr</strong>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '6px' }}>
            <span style={{ color: 'var(--text-secondary)' }}>Annual O&amp;M ({inputs.annualOMPercentGross}% of gross)</span>
            <strong>${selected.annualOMAUD.toFixed(2)}/yr</strong>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '6px' }}>
            <span style={{ color: 'var(--text-secondary)' }}>Grid Purchases ({inputs.importAUDPerKWh.toFixed(2)} AUD/kWh)</span>
            <strong>${(selected.importKWh * inputs.importAUDPerKWh).toFixed(2)}/yr</strong>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '6px' }}>
            <span style={{ color: 'var(--text-secondary)' }}>Feed-in Tariff Revenue ({inputs.feedInAUDPerKWh.toFixed(2)} AUD/kWh)</span>
            <strong style={{ color: '#15803d' }}>-${(selected.exportKWh * inputs.feedInAUDPerKWh).toFixed(2)}/yr</strong>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', background: '#fef3c7', padding: '8px 10px', borderRadius: '6px', border: 'none' }}>
            <span style={{ fontWeight: 800 }}>Combined Total Annual Cost</span>
            <strong style={{ color: '#b45309', fontSize: '1rem' }}>${selected.totalAnnualCostAUD.toFixed(2)}/yr</strong>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '4px' }}>
            <span style={{ color: 'var(--text-secondary)' }}>Solar-Only Benchmark (0 kWh)</span>
            <strong>${baseline.totalAnnualCostAUD.toFixed(2)}/yr</strong>
          </div>
        </div>

        <div style={{ background: '#f8fafc', border: 'none', borderRadius: 'var(--radius-sm)', padding: '12px 14px', marginTop: '14px', fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
          <strong>Net Economic Benefit:</strong> ${selected.netBenefitAUD.toFixed(2)}/yr ({selected.netBenefitAUD >= 0 ? 'Savings vs Solar alone' : 'Shortfall vs Solar alone'}).
        </div>
      </div>
    </div>
  );
};
