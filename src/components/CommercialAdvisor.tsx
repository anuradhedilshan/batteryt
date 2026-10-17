import React from 'react';
import { Compass, CheckCircle2, ArrowRight } from 'lucide-react';
import { Result, Inputs } from '../engine/types';

interface AdvisorProps {
  optimalResult: Result;
  selectedResult: Result;
  inputs: Inputs;
  results: Result[];
  onSelectCapacity: (kwh: number) => void;
}

export const CommercialAdvisor: React.FC<AdvisorProps> = ({
  optimalResult,
  selectedResult,
  inputs,
  results,
  onSelectCapacity,
}) => {
  const optCap = optimalResult.capacityKWh;
  const optCost = optimalResult.totalAnnualCostAUD;
  const selectedCap = selectedResult.capacityKWh;

  // Base commercial benchmarks in the residential battery market
  const defaultCommercial = [
    { name: 'Modular Entry Unit (e.g. AlphaESS / Sungrow SBR050)', capacity: 5.0 },
    { name: 'Standard Residential Pack (e.g. BYD Battery-Box / GoodWe)', capacity: 10.0 },
    { name: 'Large Residential Pack (e.g. Tesla Powerwall 2)', capacity: 13.5 },
  ];

  // If optimal capacity is not in the base set, insert it
  const hasOpt = defaultCommercial.some(m => Math.abs(m.capacity - optCap) < 1e-6);
  const models = hasOpt
    ? defaultCommercial
    : [
        ...defaultCommercial,
        { name: 'Mathematical Optimal Pack (Thesis Minimum Cost)', capacity: optCap },
      ];

  // Sort ascending by capacity
  models.sort((a, b) => a.capacity - b.capacity);

  // Marginal screening rule (Report Section 8.1, Eq. 18):
  // eta_RT = eta_c * eta_d; useful when eta_RT * T_import > T_FIT
  const etaRT = (inputs.efficiencyPct / 100) * (inputs.efficiencyPct / 100);
  const effectiveImportValue = etaRT * inputs.importAUDPerKWh;
  const fiT = inputs.feedInAUDPerKWh;
  const operationalMarginPerKWh = effectiveImportValue - fiT;
  const isOperationalArbitragePositive = operationalMarginPerKWh > 0;

  return (
    <div className="card">
      <div className="card-header">
        <div>
          <h2 className="card-title">
            <Compass size={20} color="#0284c7" />
            Decision Tool: Optimal Sizing &amp; Commercial Feasibility Advisor
          </h2>
          <p className="card-desc">
            Translates the continuous mathematical optimization result ($E_b^*$) into engineering sizing advice, commercial battery options, and marginal screening rules (Report Section 8.1 &amp; Eq. 18).
          </p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '16px' }}>
        {/* Commercial Size Comparison */}
        <div style={{ background: 'var(--bg-surface-subtle)', borderRadius: 'var(--radius-md)', padding: '18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px', flexWrap: 'wrap', gap: '6px' }}>
            <h3 style={{ fontSize: '0.875rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--text-muted)' }}>
              Commercial Capacity Options vs. Optimal Size
            </h3>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              Click any pack to simulate
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {models.map((m) => {
              const res = results.find(r => Math.abs(r.capacityKWh - m.capacity) < 1e-6);
              const cost = res ? res.totalAnnualCostAUD : 0;
              const penalty = cost - optCost;
              const isOpt = Math.abs(m.capacity - optCap) < 1e-6;
              const isSelected = Math.abs(m.capacity - selectedCap) < 1e-6;

              let cardClass = 'commercial-pack-card';
              if (isSelected) {
                cardClass += isOpt ? ' is-active-opt' : ' is-active-whatif';
              }

              return (
                <div
                  key={m.capacity}
                  role="button"
                  tabIndex={0}
                  onClick={() => onSelectCapacity(m.capacity)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onSelectCapacity(m.capacity);
                    }
                  }}
                  className={cardClass}
                  title={isSelected ? `${m.capacity.toFixed(1)} kWh is currently active in the studio` : `Click to test ${m.capacity.toFixed(1)} kWh across all charts`}
                >
                  <div style={{ flex: '1 1 auto', marginRight: '16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 900, fontSize: '1.0625rem', color: isOpt ? 'var(--color-optimal)' : 'var(--text-primary)' }}>
                        {m.capacity.toFixed(1)} kWh
                      </span>
                      {isOpt && (
                        <span className="table-tag table-tag-optimal" style={{ margin: 0 }}>
                          ★ OPTIMAL SIZE
                        </span>
                      )}
                      {isSelected && (
                        <span className="table-tag table-tag-selected" style={{ margin: 0, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                          <CheckCircle2 size={11} />
                          ACTIVE IN STUDIO
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                      {m.name}
                    </div>
                  </div>

                  <div style={{ textAlign: 'right', flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                    <div>
                      <div style={{ fontWeight: 800, fontSize: '0.9375rem', color: 'var(--text-primary)' }}>
                        ${cost.toFixed(2)}/yr
                      </div>
                      <div style={{ fontSize: '0.6875rem', color: isOpt ? '#0f766e' : '#b45309', fontWeight: 700 }}>
                        {isOpt ? 'Lowest expenditure' : `+$${penalty.toFixed(2)}/yr penalty`}
                      </div>
                    </div>

                    {isSelected ? (
                      <span
                        style={{
                          fontSize: '0.6875rem',
                          fontWeight: 800,
                          padding: '3px 8px',
                          borderRadius: '4px',
                          background: isOpt ? '#0f766e' : '#d97706',
                          color: '#ffffff',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                        }}
                      >
                        <CheckCircle2 size={12} />
                        Selected
                      </span>
                    ) : (
                      <span
                        className="btn btn-secondary btn-sm"
                        style={{
                          fontSize: '0.6875rem',
                          padding: '3px 8px',
                          pointerEvents: 'none',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                        }}
                      >
                        Select Pack
                        <ArrowRight size={12} />
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Marginal Economic Value Screening (Eq. 18) */}
        <div style={{ background: 'var(--bg-surface-subtle)', borderRadius: 'var(--radius-md)', padding: '18px' }}>
          <h3 style={{ fontSize: '0.875rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '10px' }}>
            Marginal Operating Screening Rule (Report Eq. 18)
          </h3>

          <div className="math-formula" style={{ fontSize: '0.8125rem', display: 'block', marginBottom: '8px' }}>
            η_RT × T_import &gt; T_FiT → Storing 1 kWh PV is operationally beneficial
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Round-Trip Efficiency (η_RT = η_c × η_d):</span>
              <strong>{(etaRT * 100).toFixed(2)}%</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Delivered Energy Value (η_RT × ${inputs.importAUDPerKWh.toFixed(2)}):</span>
              <strong>${effectiveImportValue.toFixed(4)} / kWh</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Opportunity Cost (Lost Solar FiT):</span>
              <strong>${fiT.toFixed(4)} / kWh</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--border-subtle)', paddingTop: '6px', fontWeight: 700 }}>
              <span>Operational Margin per kWh Shifted:</span>
              <strong style={{ color: isOperationalArbitragePositive ? '#15803d' : '#b91c1c' }}>
                {isOperationalArbitragePositive ? `+$${operationalMarginPerKWh.toFixed(4)}/kWh` : `-$${(-operationalMarginPerKWh).toFixed(4)}/kWh`}
              </strong>
            </div>
          </div>

          <div style={{ marginTop: '10px', fontSize: '0.75rem', lineHeight: 1.5, color: 'var(--text-muted)' }}>
            {isOperationalArbitragePositive ? (
              <span>
                ✓ <strong>Operationally Viable:</strong> Shifting 1 kWh saves more on grid imports than foregone FiT revenue. However, annual battery capital depreciation ($/yr) must still be amortized across full annual cycling.
              </span>
            ) : (
              <span>
                ✗ <strong>Operationally Unviable:</strong> Exporting directly to the grid earns more than storing it after round-trip losses.
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
