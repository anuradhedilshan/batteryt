import React, { useMemo } from 'react';
import { Layers } from 'lucide-react';
import { Inputs } from '../engine/types';
import { evaluateAll } from '../engine/model';
import { DEFAULT_PV, DEFAULT_LOAD } from '../data/defaultProfile';

interface ScenarioProps {
  currentInputs: Inputs;
  onApplyScenario: (pvKW: number, demandMult: number) => void;
}

export const ScenarioSensitivityTool: React.FC<ScenarioProps> = ({
  currentInputs,
  onApplyScenario,
}) => {
  // Define scenarios from Section 8.2 of the Report
  const pvOptions = [4.0, 6.6, 8.0, 10.0];
  const occupancyOptions = [
    { label: 'Small Household (1-2 occupants)', mult: 0.75, annualKWh: 4335 },
    { label: 'Medium Household (Thesis Baseline)', mult: 1.00, annualKWh: 5780 },
    { label: 'Large Household (4+ occupants)', mult: 1.35, annualKWh: 7803 },
  ];

  // Pre-calculate the optimal capacity for each matrix combination
  const matrix = useMemo(() => {
    return occupancyOptions.map(occ => {
      return pvOptions.map(pvKW => {
        const scenarioInputs: Inputs = {
          ...currentInputs,
          pvKW,
          demandMultiplier: occ.mult,
        };
        const evaluation = evaluateAll(scenarioInputs, DEFAULT_PV, DEFAULT_LOAD);
        return {
          pvKW,
          occupancyLabel: occ.label,
          demandMult: occ.mult,
          optimalCapacityKWh: evaluation.bestPositive.capacityKWh,
          optimalTotalCost: evaluation.bestPositive.totalAnnualCostAUD,
          baselineCost: evaluation.baseline.totalAnnualCostAUD,
          netSavings: evaluation.bestPositive.netBenefitAUD,
          isViable: evaluation.bestPositive.netBenefitAUD >= -0.005,
        };
      });
    });
  }, [currentInputs]);

  return (
    <div className="card">
      <div className="card-header">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Layers size={20} color="var(--color-optimal)" />
            <h2 className="card-title">
              Optimal Battery Capacity Matrix across Household Scenarios
            </h2>
          </div>
          <p className="card-desc">
            Directly implements <strong>Section 8.2 of the Revised Research Report</strong>. The software automatically computes and suggests the optimal battery capacity ($E_b^*$) for different household occupancy profiles and PV array sizes.
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
                          : '#fffdfa',
                        border: 'none',
                        boxShadow: isCurrent ? 'inset 0 0 0 2px #475569' : 'none',
                        padding: '12px 10px',
                      }}
                    >
                      <div style={{ fontSize: '1.125rem', fontWeight: 900, color: cell.isViable ? '#0f766e' : '#b45309' }}>
                        {cell.optimalCapacityKWh.toFixed(1)} kWh
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                        ${cell.optimalTotalCost.toFixed(0)}/yr total
                      </div>
                      <div style={{ fontSize: '0.6875rem', marginTop: '2px', color: cell.isViable ? '#15803d' : '#9a3412', fontWeight: 600 }}>
                        {cell.isViable ? `Saves +$${cell.netSavings.toFixed(0)}/yr` : `Costs -$${(-cell.netSavings).toFixed(0)}/yr vs 0 kWh`}
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

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px', marginTop: '14px', fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ width: '12px', height: '12px', borderRadius: '3px', background: '#dcfce7' }}></span>
            Financially Viable Battery
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ width: '12px', height: '12px', borderRadius: '3px', background: '#fef3c7' }}></span>
            Least-Cost Positive Battery (Solar-only is cheaper)
          </span>
        </div>

        <div>
          <em>Notice: Optimal battery sizing scales with both household consumption and solar surplus availability.</em>
        </div>
      </div>
    </div>
  );
};
