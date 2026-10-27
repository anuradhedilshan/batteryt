import React, { useState } from 'react';
import { Compass, CheckCircle2, ArrowRight, ShieldCheck, ExternalLink } from 'lucide-react';
import { Result, Inputs, ProductEvaluation } from '../engine/types';
import { CER_REGULATOR_URL, LAST_VERIFIED_DATE } from '../config/cheaperHomeBatteries';

interface AdvisorProps {
  economicOptimal: Result;
  bestPositive: Result;
  selectedResult: Result;
  inputs: Inputs;
  results: Result[];
  productRankings: ProductEvaluation[];
  onSelectCapacity: (kwh: number) => void;
  onUpdateLifetime?: (years: number) => void;
}

export const CommercialAdvisor: React.FC<AdvisorProps> = ({
  economicOptimal: _economicOptimal,
  bestPositive: _bestPositive,
  selectedResult,
  inputs,
  productRankings,
  onSelectCapacity,
  onUpdateLifetime,
}) => {
  const [showAllProducts, setShowAllProducts] = useState(false);
  const selectedCap = selectedResult.capacityKWh;

  // Marginal screening rule (Report Section 8.1, Eq. 18):
  // eta_RT = eta_c * eta_d; useful when eta_RT * T_import > T_FIT
  const etaRT = (inputs.efficiencyPct / 100) * (inputs.efficiencyPct / 100);
  const effectiveImportValue = etaRT * inputs.importAUDPerKWh;
  const fiT = inputs.feedInAUDPerKWh;
  const operationalMarginPerKWh = effectiveImportValue - fiT;
  const isOperationalArbitragePositive = operationalMarginPerKWh > 0;

  const currentLifetime = inputs.lifeYears;
  const displayRankings = showAllProducts ? productRankings : productRankings.slice(0, 5);

  return (
    <div className="card">
      <div className="card-header">
        <div>
          <h2 className="card-title">
            <Compass size={20} color="#0284c7" />
            Decision Tool: Australian Commercial Battery Advisor &amp; Sizing Decision
          </h2>
          <p className="card-desc">
            Evaluates commercial home batteries available in Australia with the Clean Energy Regulator Cheaper Home Batteries Program (from 1 May 2026), multi-year lifetime NPV, and marginal screening rules.
          </p>
        </div>

        {/* 10 vs 15 Year Lifetime Quick Toggle */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'var(--bg-surface-subtle)', padding: '6px 10px', borderRadius: '8px' }}>
          <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)' }}>
            Horizon:
          </span>
          <button
            type="button"
            className={`btn btn-sm ${currentLifetime === 10 ? 'btn-primary' : 'btn-secondary'}`}
            style={{ padding: '3px 10px', fontSize: '0.75rem' }}
            onClick={() => onUpdateLifetime && onUpdateLifetime(10)}
          >
            10 Years
          </button>
          <button
            type="button"
            className={`btn btn-sm ${currentLifetime === 15 ? 'btn-primary' : 'btn-secondary'}`}
            style={{ padding: '3px 10px', fontSize: '0.75rem' }}
            onClick={() => onUpdateLifetime && onUpdateLifetime(15)}
          >
            15 Years
          </button>
        </div>
      </div>

      {/* Program Subsidy Notice Banner */}
      <div style={{
        background: '#f0fdf4',
        border: '1px solid #bbf7d0',
        borderRadius: '8px',
        padding: '10px 14px',
        marginBottom: '16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '8px',
        fontSize: '0.8125rem',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#166534' }}>
          <ShieldCheck size={18} color="#16a34a" />
          <span>
            <strong>Cheaper Home Batteries Program (May 2026):</strong> Tier-weighted STC rebate applied ({inputs.installDate || '2026-11-01'} install date, ${inputs.stcPriceAUD || 37}/STC).
          </span>
        </div>
        <a
          href={CER_REGULATOR_URL}
          target="_blank"
          rel="noopener noreferrer"
          style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: '#15803d', fontWeight: 700, textDecoration: 'none' }}
        >
          CER Calculator Ref (Verified {LAST_VERIFIED_DATE})
          <ExternalLink size={12} />
        </a>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '16px' }}>
        {/* Real Commercial Batteries Ranked by Lifetime NPV */}
        <div style={{ background: 'var(--bg-surface-subtle)', borderRadius: 'var(--radius-md)', padding: '18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px', flexWrap: 'wrap', gap: '6px' }}>
            <div>
              <h3 style={{ fontSize: '0.875rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                Commercial Products Ranked by Lifetime NPV ({currentLifetime} Years)
              </h3>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: 0 }}>
                Manufacturer usable capacity (no artificial SOC penalty). Ranked by NPV.
              </p>
            </div>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              style={{ fontSize: '0.6875rem', padding: '3px 8px' }}
              onClick={() => setShowAllProducts(prev => !prev)}
            >
              {showAllProducts ? 'Show Top 5' : `View All (${productRankings.length})`}
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {displayRankings.map((p, rankIdx) => {
              const isSelected = Math.abs(p.usableKWh - selectedCap) < 1e-6;
              const isRankOne = rankIdx === 0;
              const isNoBattery = p.usableKWh <= 0;

              let cardClass = 'commercial-pack-card';
              if (isSelected) {
                cardClass += isRankOne ? ' is-active-opt' : ' is-active-whatif';
              }

              return (
                <div
                  key={p.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => onSelectCapacity(p.usableKWh)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onSelectCapacity(p.usableKWh);
                    }
                  }}
                  className={cardClass}
                  title={`Click to simulate ${p.name}`}
                >
                  <div style={{ flex: '1 1 auto', marginRight: '14px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--text-muted)' }}>
                        #{rankIdx + 1}
                      </span>
                      <span style={{ fontWeight: 900, fontSize: '1rem', color: isRankOne ? 'var(--color-optimal)' : 'var(--text-primary)' }}>
                        {p.name}
                      </span>
                      {isRankOne && (
                        <span className="table-tag table-tag-optimal" style={{ margin: 0 }}>
                          ★ HIGHEST NPV
                        </span>
                      )}
                      {isSelected && (
                        <span className="table-tag table-tag-selected" style={{ margin: 0, display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                          <CheckCircle2 size={10} />
                          SELECTED
                        </span>
                      )}
                    </div>

                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '3px' }}>
                      {!isNoBattery ? (
                        <>
                          {p.usableKWh.toFixed(1)} kWh usable • {p.powerKW.toFixed(1)} kW power • Net Capex: ${p.netCapexAUD.toLocaleString()} (Rebate: ${p.subsidyAUD.toLocaleString()})
                        </>
                      ) : (
                        <>Zero Capex • Grid &amp; Solar-Only Baseline</>
                      )}
                    </div>

                    {/* Performance metrics */}
                    <div style={{ display: 'flex', gap: '12px', marginTop: '6px', fontSize: '0.6875rem', color: 'var(--text-secondary)' }}>
                      <span>Self-Consumption: <strong>{p.selfConsumptionPct.toFixed(1)}%</strong></span>
                      <span>Self-Sufficiency: <strong>{p.selfSufficiencyPct.toFixed(1)}%</strong></span>
                      <span>Payback: <strong>{p.simplePaybackYears ? `${p.simplePaybackYears.toFixed(1)} yrs` : 'Never'}</strong></span>
                    </div>
                  </div>

                  <div style={{ textAlign: 'right', flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                    <div>
                      <div style={{
                        fontWeight: 900,
                        fontSize: '0.9375rem',
                        color: p.lifetimeNPVAUD >= 0 ? '#15803d' : '#b91c1c',
                      }}>
                        {p.lifetimeNPVAUD >= 0 ? `+$${p.lifetimeNPVAUD.toFixed(0)}` : `-$${Math.abs(p.lifetimeNPVAUD).toFixed(0)}`} NPV
                      </div>
                      <div style={{ fontSize: '0.6875rem', color: 'var(--text-muted)' }}>
                        {p.equivalentAnnualBenefitAUD >= 0
                          ? `+$${p.equivalentAnnualBenefitAUD.toFixed(0)}/yr equiv.`
                          : `-$${Math.abs(p.equivalentAnnualBenefitAUD).toFixed(0)}/yr equiv.`}
                      </div>
                    </div>

                    {isSelected ? (
                      <span
                        style={{
                          fontSize: '0.6875rem',
                          fontWeight: 800,
                          padding: '2px 8px',
                          borderRadius: '4px',
                          background: isRankOne ? '#0f766e' : '#d97706',
                          color: '#ffffff',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                        }}
                      >
                        <CheckCircle2 size={11} />
                        Active
                      </span>
                    ) : (
                      <span
                        className="btn btn-secondary btn-sm"
                        style={{
                          fontSize: '0.6875rem',
                          padding: '2px 6px',
                          pointerEvents: 'none',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '3px',
                        }}
                      >
                        Select
                        <ArrowRight size={11} />
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Marginal Screening & Lifetime Sensitivity Insights */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
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
                <span>Round-Trip Efficiency (η_RT):</span>
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
                  ✓ <strong>Operationally Viable (Eq. 18):</strong> Storing solar saves $0.32/kWh vs $0.05/kWh foregone export.<br />
                  <em>Note:</em> Positive operational margin is necessary but not sufficient for positive lifetime NPV. Capital recovery depends heavily on lifetime horizon ({currentLifetime} yrs) and capex subsidies.
                </span>
              ) : (
                <span>
                  ✗ <strong>Operationally Unviable:</strong> Exporting directly to the grid earns more than storing it after round-trip losses.
                </span>
              )}
            </div>
          </div>

          {/* Lifetime Sensitivity Decision Note */}
          <div style={{ background: 'var(--bg-surface-subtle)', borderRadius: 'var(--radius-md)', padding: '18px' }}>
            <h3 style={{ fontSize: '0.875rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '8px' }}>
              Lifetime Sensitivity: Why 10 vs 15 Years Flips the Winner
            </h3>
            <p style={{ fontSize: '0.75rem', lineHeight: 1.5, color: 'var(--text-secondary)', margin: 0 }}>
              Under a <strong>10-year warranty horizon</strong>, capital amortization often exceeds bill savings, making <strong>Solar-Only (0 kWh)</strong> or small packs the least-risk choice.
              At <strong>15 years</strong>, 5 additional years of avoided grid purchases ($500–$1,000/yr) shift lifetime NPV into positive territory for quality packs (e.g. Sungrow / AlphaESS).
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
