import React from 'react';
import { Target, CheckCircle2, AlertCircle, RotateCcw } from 'lucide-react';
import { Result } from '../engine/types';

interface SelectionProps {
  selected: Result;
  bestPositive: Result;
  baseline: Result;
  onSelectBest?: () => void;
}

export const SelectionFocusCard: React.FC<SelectionProps> = ({
  selected,
  bestPositive,
  baseline,
  onSelectBest,
}) => {
  const gapVsBest = selected.totalAnnualCostAUD - bestPositive.totalAnnualCostAUD;
  const isBest = gapVsBest <= 0.005;
  const gapVsBaseline = baseline.totalAnnualCostAUD - selected.totalAnnualCostAUD;

  return (
    <div className="selection-focus-card">
      <div className="selection-top">
        <div className="selection-title-group">
          <span className="selection-badge">
            <Target size={14} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '4px' }} />
            Custom What-If Inspection
          </span>
          <span className="selection-size-display">
            {selected.capacityKWh.toFixed(1)} kWh
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <div className={`selection-status-pill ${isBest ? 'is-optimal' : 'is-suboptimal'}`}>
            {isBest ? (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                <CheckCircle2 size={15} />
                LOWEST-COST ELIGIBLE BATTERY
              </span>
            ) : (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                <AlertCircle size={15} />
                +${gapVsBest.toFixed(2)}/YR MORE EXPENSIVE THAN BEST BATTERY
              </span>
            )}
          </div>

          {onSelectBest && !isBest && (
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={onSelectBest}
              style={{ gap: '6px', fontWeight: 700 }}
              title={`Switch back to the ${bestPositive.capacityKWh.toFixed(1)} kWh optimal recommendation`}
            >
              <RotateCcw size={14} />
              Reset to Optimal {bestPositive.capacityKWh.toFixed(1)} kWh
            </button>
          )}
        </div>
      </div>

      <div className="stat-grid-4">
        <div className="stat-box">
          <span className="stat-label">Selected Annual Cost</span>
          <span className="stat-val" style={{ color: 'var(--color-selected)' }}>
            ${selected.totalAnnualCostAUD.toFixed(2)}
          </span>
          <span className="stat-sub">
            Grid: ${selected.gridCostAUD.toFixed(0)} | Capex: ${selected.ownerCostAUD.toFixed(0)}
          </span>
        </div>

        <div className="stat-box">
          <span className="stat-label">Lowest-Cost Battery ({bestPositive.capacityKWh.toFixed(1)} kWh)</span>
          <span className="stat-val" style={{ color: 'var(--color-optimal)' }}>
            ${bestPositive.totalAnnualCostAUD.toFixed(2)}
          </span>
          <span className="stat-sub">
            Global minimum of 40 candidates
          </span>
        </div>

        <div className="stat-box">
          <span className="stat-label">Solar-Only Baseline (0 kWh)</span>
          <span className="stat-val" style={{ color: 'var(--color-baseline)' }}>
            ${baseline.totalAnnualCostAUD.toFixed(2)}
          </span>
          <span className="stat-sub">
            Import $1,089 − Export $394
          </span>
        </div>

        <div className="stat-box">
          <span className="stat-label">Cost Gap vs Optimal</span>
          <span className="stat-val" style={{ color: isBest ? 'var(--color-optimal)' : '#dc2626' }}>
            {isBest ? '$0.00/yr' : `+$${gapVsBest.toFixed(2)}/yr`}
          </span>
          <span className="stat-sub">
            {isBest ? 'Zero penalty (Optimal)' : `Extra spend vs ${bestPositive.capacityKWh.toFixed(1)} kWh`}
          </span>
        </div>
      </div>

      <div className={`callout ${isBest ? 'callout-optimal' : 'callout-warning'}`}>
        {isBest ? (
          <div>
            <strong>OPTIMAL CHOICE:</strong> Your selected {selected.capacityKWh.toFixed(1)} kWh battery is the lowest-cost option among all 40 positive sizes evaluated.
            {gapVsBaseline < -0.005 ? (
              <span> However, due to low feed-in tariffs and capital depreciation, it still costs ${(-gapVsBaseline).toFixed(2)}/year more than having no battery at all.</span>
            ) : (
              <span> It generates net savings of ${gapVsBaseline.toFixed(2)}/year compared with solar alone.</span>
            )}
          </div>
        ) : (
          <div>
            <strong>SUBOPTIMAL BY ${gapVsBest.toFixed(2)}/YEAR:</strong> Choosing {selected.capacityKWh.toFixed(1)} kWh increases annual costs by ${gapVsBest.toFixed(2)} compared with the optimal {bestPositive.capacityKWh.toFixed(1)} kWh size.
            {gapVsBaseline < -0.005 ? (
              <span> It also costs ${(-gapVsBaseline).toFixed(2)}/year more than solar without a battery.</span>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
};
