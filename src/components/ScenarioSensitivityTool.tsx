import React, { useState, useMemo } from 'react';
import { Layers, Award } from 'lucide-react';
import { Inputs, ProductEvaluation } from '../engine/types';
import { evaluateAll, rankProducts } from '../engine/model';
import { COMMERCIAL_PRODUCTS } from '../config/products';
import { DEFAULT_PV, DEFAULT_LOAD } from '../data/defaultProfile';

interface ScenarioProps {
  currentInputs: Inputs;
  productRankings?: ProductEvaluation[];
  onApplyScenario: (pvKW: number, demandMult: number) => void;
}

export const ScenarioSensitivityTool: React.FC<ScenarioProps> = ({
  currentInputs,
  productRankings,
  onApplyScenario,
}) => {
  const [lifetimeMode, setLifetimeMode] = useState<10 | 15>(currentInputs.lifeYears === 15 ? 15 : 10);

  // Scenarios matrix: PV options x Occupancy profiles
  const pvOptions = [4.0, 6.6, 8.0, 10.0];
  const occupancyOptions = [
    { label: 'Small Household (1-2 occupants)', mult: 0.75, annualKWh: 4335 },
    { label: 'Medium Household (Thesis Baseline)', mult: 1.00, annualKWh: 5780 },
    { label: 'Large Household (4+ occupants)', mult: 1.35, annualKWh: 7803 },
  ];

  // Pre-calculate scenario matrix for active lifetime
  const matrix = useMemo(() => {
    return occupancyOptions.map(occ => {
      return pvOptions.map(pvKW => {
        const scenarioInputs: Inputs = {
          ...currentInputs,
          pvKW,
          demandMultiplier: occ.mult,
          lifeYears: lifetimeMode,
        };
        const evaluation = evaluateAll(scenarioInputs, DEFAULT_PV, DEFAULT_LOAD);
        const isViable = evaluation.bestBatteryFinanciallyWorthwhile;
        const optCap = isViable ? evaluation.bestPositive.capacityKWh : 0;
        const optCost = isViable ? evaluation.bestPositive.totalAnnualCostAUD : evaluation.baseline.totalAnnualCostAUD;
        const netSavings = isViable ? evaluation.bestPositive.netBenefitAUD : 0;

        const bestProd = evaluation.bestProductByNPV;

        return {
          pvKW,
          occupancyLabel: occ.label,
          demandMult: occ.mult,
          optimalCapacityKWh: optCap,
          optimalTotalCost: optCost,
          baselineCost: evaluation.baseline.totalAnnualCostAUD,
          netSavings,
          isViable,
          bestPositiveCapacityKWh: evaluation.bestPositive.capacityKWh,
          bestPositiveNetBenefit: evaluation.bestPositive.netBenefitAUD,
          bestProduct: bestProd,
        };
      });
    });
  }, [currentInputs, lifetimeMode]);

  // Robustness Report calculations:
  const currentProds = useMemo(() => {
    if (productRankings && productRankings.length > 0) return productRankings;
    const series = { pv: new Float64Array(DEFAULT_PV), load: new Float64Array(DEFAULT_LOAD) };
    return rankProducts(COMMERCIAL_PRODUCTS, { ...currentInputs, lifeYears: lifetimeMode }, series, 824.36);
  }, [productRankings, currentInputs, lifetimeMode]);

  const topProduct = currentProds[0];
  const secondProduct = currentProds.length > 1 ? currentProds[1] : null;
  const marginOverSecond = secondProduct ? topProduct.lifetimeNPVAUD - secondProduct.lifetimeNPVAUD : 0;

  // Check stability across the 12 matrix scenarios
  const scenarioWinners = matrix.flatMap(row => row.map(cell => cell.bestProduct.name));
  const uniqueWinners = Array.from(new Set(scenarioWinners));
  const isStable = uniqueWinners.length <= 2;

  // Sizing Regret Penalty Analysis:
  const regret135 = useMemo(() => {
    const evalActive = evaluateAll({ ...currentInputs, lifeYears: lifetimeMode }, DEFAULT_PV, DEFAULT_LOAD);
    const r135 = evalActive.results.find(r => Math.abs(r.capacityKWh - 13.5) < 1e-6);
    if (!r135) return 0;
    return r135.totalAnnualCostAUD - evalActive.economicOptimal.totalAnnualCostAUD;
  }, [currentInputs, lifetimeMode]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* 1. Sizing Robustness & Regret Report Card */}
      <div className="card">
        <div className="card-header">
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <Award size={20} color="#0f766e" />
              <h2 className="card-title">
                Sizing Decision Robustness &amp; Product Risk Report (Phase 6)
              </h2>
            </div>
            <p className="card-desc">
              Summarizes product ranking stability, margin over alternatives, and the financial regret cost of choosing the wrong battery size.
            </p>
          </div>

          {/* 10 vs 15 Year Lifetime Toggle */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'var(--bg-surface-subtle)', padding: '6px 12px', borderRadius: '8px' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)' }}>
              Lifetime Sensitivity:
            </span>
            <button
              type="button"
              className={`btn btn-sm ${lifetimeMode === 10 ? 'btn-primary' : 'btn-secondary'}`}
              style={{ padding: '3px 10px', fontSize: '0.75rem' }}
              onClick={() => setLifetimeMode(10)}
            >
              10-Year Horizon
            </button>
            <button
              type="button"
              className={`btn btn-sm ${lifetimeMode === 15 ? 'btn-primary' : 'btn-secondary'}`}
              style={{ padding: '3px 10px', fontSize: '0.75rem' }}
              onClick={() => setLifetimeMode(15)}
            >
              15-Year Horizon
            </button>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '14px', marginBottom: '14px' }}>
          {/* Metric A: Best Product by NPV */}
          <div style={{ background: 'var(--bg-surface-subtle)', borderRadius: '8px', padding: '14px' }}>
            <div style={{ fontSize: '0.6875rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--text-muted)' }}>
              1. Best Product by Lifetime NPV
            </div>
            <div style={{ fontSize: '1.125rem', fontWeight: 900, color: topProduct.lifetimeNPVAUD >= 0 ? '#15803d' : '#b91c1c', marginTop: '4px' }}>
              {topProduct.name}
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
              NPV: {topProduct.lifetimeNPVAUD >= 0 ? `+$${topProduct.lifetimeNPVAUD.toFixed(0)}` : `-$${Math.abs(topProduct.lifetimeNPVAUD).toFixed(0)}`} ({lifetimeMode} yrs)
            </div>
          </div>

          {/* Metric B: Margin Over Second Best */}
          <div style={{ background: 'var(--bg-surface-subtle)', borderRadius: '8px', padding: '14px' }}>
            <div style={{ fontSize: '0.6875rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--text-muted)' }}>
              2. Margin Over #2 Alternative
            </div>
            <div style={{ fontSize: '1.125rem', fontWeight: 900, color: '#0369a1', marginTop: '4px' }}>
              +${marginOverSecond.toFixed(0)} NPV Margin
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
              vs. {secondProduct?.name ?? 'None'} (${secondProduct?.lifetimeNPVAUD.toFixed(0) ?? 0})
            </div>
          </div>

          {/* Metric C: Scenario Stability */}
          <div style={{ background: 'var(--bg-surface-subtle)', borderRadius: '8px', padding: '14px' }}>
            <div style={{ fontSize: '0.6875rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--text-muted)' }}>
              3. Scenario Stability
            </div>
            <div style={{ fontSize: '1.125rem', fontWeight: 900, color: isStable ? '#15803d' : '#d97706', marginTop: '4px' }}>
              {isStable ? 'HIGH STABILITY' : 'MODERATE SENSITIVITY'}
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
              {uniqueWinners.length} distinct winners across 12 combinations
            </div>
          </div>

          {/* Metric D: Sizing Regret Penalty */}
          <div style={{ background: 'var(--bg-surface-subtle)', borderRadius: '8px', padding: '14px' }}>
            <div style={{ fontSize: '0.6875rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--text-muted)' }}>
              4. Oversizing Regret (13.5 kWh)
            </div>
            <div style={{ fontSize: '1.125rem', fontWeight: 900, color: regret135 > 10 ? '#b91c1c' : '#15803d', marginTop: '4px' }}>
              +${regret135.toFixed(2)}/yr Penalty
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
              Extra annual expenditure vs. economic optimum
            </div>
          </div>
        </div>

        {/* Narrative Finding */}
        <div style={{
          background: lifetimeMode === 15 ? '#f0fdf4' : '#fffbeb',
          border: `1px solid ${lifetimeMode === 15 ? '#bbf7d0' : '#fde68a'}`,
          borderRadius: '6px',
          padding: '10px 14px',
          fontSize: '0.75rem',
          lineHeight: 1.5,
          color: lifetimeMode === 15 ? '#166534' : '#92400e',
        }}>
          <strong>Critical Sensitivity Finding (Lifetime 10 vs 15 Years):</strong> At a <strong>10-year horizon</strong>, capital amortization exceeds bill savings, making <strong>Solar-Only (0 kWh)</strong> the least-risk choice. When extended to <strong>15 years</strong>, 5 additional years of avoided peak grid purchases shift <strong>Sungrow / AlphaESS modular packs</strong> into positive lifetime NPV. Sizing decisions must therefore be made based on user-chosen economic horizon rather than an assumed constant.
        </div>
      </div>

      {/* 2. Matrix Table */}
      <div className="card">
        <div className="card-header">
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Layers size={20} color="var(--color-optimal)" />
              <h2 className="card-title">
                Optimal Battery Capacity Matrix across Household Scenarios ({lifetimeMode} Years)
              </h2>
            </div>
            <p className="card-desc">
              Directly implements <strong>Section 8.2 of the Revised Research Report</strong>. Sizing recommendations scale with household occupancy and PV array ratings.
            </p>
          </div>

          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            Click any cell to apply PV size &amp; household load
          </span>
        </div>

        <div className="table-wrapper">
          <table className="data-table" style={{ textAlign: 'center' }}>
            <thead>
              <tr>
                <th scope="col" style={{ textAlign: 'left', minWidth: '180px' }}>
                  Household Demand ↓ \ PV Size →
                </th>
                {pvOptions.map(pv => (
                  <th key={pv} scope="col">
                    {pv.toFixed(1)} kW PV System
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {occupancyOptions.map((occ, rowIdx) => (
                <tr key={occ.label}>
                  <td style={{ textAlign: 'left', background: 'var(--bg-surface-subtle)' }}>
                    <strong>{occ.label}</strong>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      {occ.annualKWh.toLocaleString()} kWh/yr ({occ.mult.toFixed(2)}×)
                    </div>
                  </td>
                  {pvOptions.map((pvKW, colIdx) => {
                    const cell = matrix[rowIdx][colIdx];
                    const isCurrent =
                      Math.abs(pvKW - currentInputs.pvKW) < 0.05 &&
                      Math.abs(occ.mult - currentInputs.demandMultiplier) < 0.05;

                    return (
                      <td
                        key={pvKW}
                        onClick={() => onApplyScenario(pvKW, occ.mult)}
                        title={`Click to apply ${pvKW} kW PV with ${occ.label}`}
                        style={{
                          cursor: 'pointer',
                          background: isCurrent
                            ? '#fef3c7'
                            : cell.isViable
                            ? '#f0fdf4'
                            : '#f8fafc',
                          border: 'none',
                          boxShadow: isCurrent ? 'inset 0 0 0 2px #475569' : 'none',
                          padding: '12px 10px',
                        }}
                      >
                        <div style={{ fontSize: '1.125rem', fontWeight: 900, color: cell.isViable ? '#0f766e' : '#64748b' }}>
                          {cell.optimalCapacityKWh === 0 ? '0.0 kWh' : `${cell.optimalCapacityKWh.toFixed(1)} kWh`}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                          ${cell.optimalTotalCost.toFixed(0)}/yr total
                        </div>
                        <div style={{ fontSize: '0.6875rem', marginTop: '2px', color: cell.isViable ? '#15803d' : '#64748b', fontWeight: 600 }}>
                          {cell.isViable ? `Saves +$${cell.netSavings.toFixed(0)}/yr` : `Solar-Only (${cell.bestPositiveCapacityKWh.toFixed(1)} kWh: -$${(-cell.bestPositiveNetBenefit).toFixed(0)}/yr)`}
                        </div>
                        {isCurrent && (
                          <span style={{ display: 'inline-block', marginTop: '4px', fontSize: '0.625rem', fontWeight: 800, background: '#475569', color: 'white', padding: '1px 6px', borderRadius: '4px' }}>
                            ACTIVE SCENARIO
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
