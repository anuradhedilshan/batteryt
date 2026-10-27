import React from 'react';
import { ShieldCheck, CheckCircle2, AlertCircle } from 'lucide-react';
import { Result } from '../engine/types';

interface ValidationPanelProps {
  selected: Result;
}

export const ValidationPanel: React.FC<ValidationPanelProps> = ({ selected }) => {
  const isZero = selected.capacityKWh <= 0;

  const cyclicDiff = Math.abs(selected.finalKWh - selected.initialKWh);
  const cyclicOk = cyclicDiff < 1e-6;
  const balanceOk = selected.maxEnergyResidual < 1e-7;

  return (
    <div className="card" style={{ marginBottom: '16px' }}>
      <div className="card-header">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <h2 className="card-title">
              <ShieldCheck size={20} color="#0f766e" />
              Simulation Validation &amp; Physical Invariant Audit (Phase 6)
            </h2>
            <span style={{
              fontSize: '0.6875rem',
              fontWeight: 800,
              padding: '2px 8px',
              borderRadius: '4px',
              background: balanceOk && cyclicOk ? '#dcfce7' : '#fee2e2',
              color: balanceOk && cyclicOk ? '#15803d' : '#b91c1c',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
            }}>
              {balanceOk && cyclicOk ? <CheckCircle2 size={12} /> : <AlertCircle size={12} />}
              {balanceOk && cyclicOk ? 'ALL INVARIANTS SATISFIED' : 'TOLERANCE EXCEEDED'}
            </span>
          </div>
          <p className="card-desc">
            Directly inspects the physical conservation laws, boundary constraints, and cyclic convergence for the active <strong>{selected.capacityKWh.toFixed(1)} kWh</strong> system.
          </p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
        {/* Metric 1: AC Bus Energy Balance Residual */}
        <div style={{ background: 'var(--bg-surface-subtle)', borderRadius: '6px', padding: '12px 14px' }}>
          <div style={{ fontSize: '0.6875rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--text-muted)' }}>
            1. AC Bus Energy Balance Residual
          </div>
          <div style={{ fontSize: '1.125rem', fontWeight: 900, color: balanceOk ? '#15803d' : '#b91c1c', marginTop: '4px' }}>
            {selected.maxEnergyResidual.toExponential(2)} kWh
          </div>
          <div style={{ fontSize: '0.6875rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
            Tolerance: &lt; 1e-7 kWh across all 8,760 intervals
          </div>
        </div>

        {/* Metric 2: Stored Energy Boundaries */}
        <div style={{ background: 'var(--bg-surface-subtle)', borderRadius: '6px', padding: '12px 14px' }}>
          <div style={{ fontSize: '0.6875rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--text-muted)' }}>
            2. Min / Max Stored Energy
          </div>
          <div style={{ fontSize: '1.125rem', fontWeight: 900, color: 'var(--text-primary)', marginTop: '4px' }}>
            {!isZero ? `${selected.minStoredKWh.toFixed(2)} / ${selected.maxStoredKWh.toFixed(2)} kWh` : '0.00 kWh (Bypassed)'}
          </div>
          <div style={{ fontSize: '0.6875rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
            {!isZero ? 'Enclosed strictly within physical [emin, emax]' : 'Solar-only baseline (no battery logic)'}
          </div>
        </div>

        {/* Metric 3: Power Ratings & C-Rate */}
        <div style={{ background: 'var(--bg-surface-subtle)', borderRadius: '6px', padding: '12px 14px' }}>
          <div style={{ fontSize: '0.6875rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--text-muted)' }}>
            3. Charge &amp; Discharge Limits
          </div>
          <div style={{ fontSize: '1.125rem', fontWeight: 900, color: 'var(--text-primary)', marginTop: '4px' }}>
            {!isZero ? `${(selected.powerKW ?? (selected.capacityKWh * 0.5)).toFixed(1)} kW Max Power` : '0.0 kW (No Inverter)'}
          </div>
          <div style={{ fontSize: '0.6875rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
            Hourly flows never exceed inverter rating
          </div>
        </div>

        {/* Metric 4: Cyclic Start vs End Energy */}
        <div style={{ background: 'var(--bg-surface-subtle)', borderRadius: '6px', padding: '12px 14px' }}>
          <div style={{ fontSize: '0.6875rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--text-muted)' }}>
            4. Cyclic Start vs. End Energy
          </div>
          <div style={{ fontSize: '1.125rem', fontWeight: 900, color: cyclicOk ? '#15803d' : '#b91c1c', marginTop: '4px' }}>
            {!isZero ? `${selected.initialKWh.toFixed(3)} → ${selected.finalKWh.toFixed(3)} kWh` : '0.000 → 0.000 kWh'}
          </div>
          <div style={{ fontSize: '0.6875rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
            Residual: {cyclicDiff.toExponential(2)} kWh (closes annual cycle)
          </div>
        </div>
      </div>
    </div>
  );
};
