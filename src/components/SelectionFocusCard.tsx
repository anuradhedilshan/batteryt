import React from 'react';
import { Target, CheckCircle2, AlertCircle, RotateCcw } from 'lucide-react';
import { Result } from '../engine/types';

interface SelectionProps {
  selected: Result;
  economicOptimal: Result;
  bestPositive: Result;
  baseline: Result;
  onSelectBest?: () => void;
}

export const SelectionFocusCard: React.FC<SelectionProps> = ({
  selected,
  economicOptimal,
  bestPositive,
  baseline,
  onSelectBest,
}) => {
  const isWorthwhile = bestPositive.netBenefitAUD >= -0.005;
  const gapVsOpt = selected.totalAnnualCostAUD - economicOptimal.totalAnnualCostAUD;
  const isOpt = Math.abs(gapVsOpt) <= 0.005;
  const isBestPos = Math.abs(selected.capacityKWh - bestPositive.capacityKWh) < 1e-6;
  const isBaseline = Math.abs(selected.capacityKWh - baseline.capacityKWh) < 1e-6;

  let statusLabel = '';
  if (isOpt) {
    statusLabel = isWorthwhile
      ? `OPTIMAL BATTERY RECOMMENDATION (${selected.capacityKWh.toFixed(1)} kWh)`
      : `ECONOMIC MINIMUM: 0.0 kWh (SOLAR-ONLY IS LOWEST COST)`;
  } else if (isBestPos) {
    statusLabel = `LEAST-COST POSITIVE BATTERY (+${gapVsOpt > 0 ? '$' + gapVsOpt.toFixed(2) : '$0.00'}/YR VS 0 kWh)`;
  } else {
    statusLabel = `+$${gapVsOpt.toFixed(2)}/YR HIGHER TOTAL COST THAN OPTIMUM`;
  }

  return (
    <div className="selection-focus-card">
      <div className="selection-top">
        <div className="selection-title-group">
          <span className="selection-badge">
            <Target size={14} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '4px' }} />
            Active Studio Selection
          </span>
          <span className="selection-size-display">
            {selected.capacityKWh === 0 ? '0.0 kWh (Solar Only)' : `${selected.capacityKWh.toFixed(1)} kWh`}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <div className={`selection-status-pill ${isOpt ? 'is-optimal' : 'is-suboptimal'}`}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
              {isOpt ? <CheckCircle2 size={15} /> : <AlertCircle size={15} />}
              {statusLabel}
            </span>
          </div>

          {onSelectBest && !isOpt && (
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={onSelectBest}
              style={{ gap: '6px', fontWeight: 700 }}
              title={`Switch back to the ${economicOptimal.capacityKWh.toFixed(1)} kWh economic optimum`}
            >
              <RotateCcw size={14} />
              Reset to Optimum ({economicOptimal.capacityKWh.toFixed(1)} kWh)
            </button>
          )}
        </div>
      </div>

      <div className="stat-grid-4">
        <div className="stat-box">
          <span className="stat-label">Selected Annual Cost</span>
          <span className="stat-val" style={{ color: 'var(--color-selected)' }}>
            ${selected.totalAnnualCostAUD.toFixed(2)}/yr
          </span>
          <span className="stat-sub">
            Grid: ${selected.gridCostAUD.toFixed(0)} | Capex: ${selected.ownerCostAUD.toFixed(0)}
          </span>
        </div>

        <div className="stat-box">
          <span className="stat-label">Economic Minimum ({economicOptimal.capacityKWh.toFixed(1)} kWh)</span>
          <span className="stat-val" style={{ color: 'var(--color-optimal)' }}>
            ${economicOptimal.totalAnnualCostAUD.toFixed(2)}/yr
          </span>
          <span className="stat-sub">
            {isWorthwhile ? 'Feasible battery minimum' : '0 kWh Solar-Only baseline'}
          </span>
        </div>

        <div className="stat-box">
          <span className="stat-label">Least-Cost Battery ({bestPositive.capacityKWh.toFixed(1)} kWh)</span>
          <span className="stat-val" style={{ color: '#0369a1' }}>
            ${bestPositive.totalAnnualCostAUD.toFixed(2)}/yr
          </span>
          <span className="stat-sub">
            {isWorthwhile ? 'Optimal battery choice' : '+$12.07/yr vs Solar-Only'}
          </span>
        </div>

        <div className="stat-box">
          <span className="stat-label">Net Annual Benefit</span>
          <span className="stat-val" style={{ color: selected.netBenefitAUD >= 0 ? 'var(--color-optimal)' : '#dc2626' }}>
            {selected.netBenefitAUD >= 0 ? `+$${selected.netBenefitAUD.toFixed(2)}/yr` : `-$${(-selected.netBenefitAUD).toFixed(2)}/yr`}
          </span>
          <span className="stat-sub">
            {selected.simplePaybackYears ? `Payback: ${selected.simplePaybackYears.toFixed(1)} yrs` : 'vs 0 kWh Baseline'}
          </span>
        </div>
      </div>

      <div className={`callout ${isOpt ? 'callout-optimal' : 'callout-warning'}`}>
        {isOpt ? (
          <div>
            <strong>OPTIMAL CHOICE:</strong> {isBaseline ? (
              <span>Your selected 0.0 kWh (Solar-Only) represents the cost-minimizing baseline ($695.65/yr). Under current prices, no battery provides positive net financial savings.</span>
            ) : (
              <span>Your selected {selected.capacityKWh.toFixed(1)} kWh battery is the optimal investment size, generating +${selected.netBenefitAUD.toFixed(2)}/year in net savings.</span>
            )}
          </div>
        ) : (
          <div>
            <strong>SELECTION COMPARISON:</strong> Choosing {selected.capacityKWh.toFixed(1)} kWh incurs ${gapVsOpt > 0 ? `+$${gapVsOpt.toFixed(2)}/year` : '$0.00/year'} more in total expenditure than the {economicOptimal.capacityKWh.toFixed(1)} kWh economic optimum.
            {selected.netBenefitAUD < 0 ? (
              <span> (Costs ${(-selected.netBenefitAUD).toFixed(2)}/year more than having no battery at all).</span>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
};
