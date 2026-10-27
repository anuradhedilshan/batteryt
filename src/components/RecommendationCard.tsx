import React from 'react';
import { AlertTriangle, CheckCircle2, Zap } from 'lucide-react';
import { Result } from '../engine/types';

interface RecommendationProps {
  baseline: Result;
  economicOptimal: Result;
  bestPositive: Result;
  selected: Result;
  isIllustrative?: boolean;
  onSelectCapacity: (kwh: number) => void;
}

export const RecommendationCard: React.FC<RecommendationProps> = ({
  baseline,
  economicOptimal,
  bestPositive,
  selected,
  isIllustrative = true,
  onSelectCapacity,
}) => {
  const isWorthwhile = bestPositive.netBenefitAUD >= -0.005;
  const isSelectedOptimal = Math.abs(selected.capacityKWh - economicOptimal.capacityKWh) < 1e-6;
  const isSelectedBestPositive = Math.abs(selected.capacityKWh - bestPositive.capacityKWh) < 1e-6;
  const extraVsBaseline = bestPositive.totalAnnualCostAUD - baseline.totalAnnualCostAUD;

  return (
    <div className={`recommendation-banner ${!isWorthwhile ? 'has-warning' : ''}`}>
      <div className="rec-left">
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          {isWorthwhile ? (
            <span className="rec-tag rec-tag-optimal">
              <CheckCircle2 size={13} />
              Financially Feasible Battery System
            </span>
          ) : (
            <>
              <span className="rec-tag rec-tag-warning">
                <AlertTriangle size={13} />
                Economic Optimum: Solar-Only (0 kWh)
              </span>
              <span className="rec-tag" style={{ background: '#fef3c7', color: '#92400e', borderColor: '#fde68a' }}>
                <Zap size={13} />
                Battery Economically Rejected (Report Sec. 7.2)
              </span>
            </>
          )}
        </div>

        <h2 className="rec-title">
          {isWorthwhile ? (
            <>{isIllustrative ? 'Illustrative Sizing Result' : 'Optimal Battery Recommendation'}: {bestPositive.capacityKWh.toFixed(1)} kWh</>
          ) : (
            <>{isIllustrative ? 'Illustrative Sizing Decision' : 'Optimal Economic Sizing'}: 0.0 kWh (Solar PV Only)</>
          )}
          <span style={{ fontSize: '1.125rem', fontWeight: 600, color: 'var(--text-secondary)', marginLeft: '12px' }}>
            (${economicOptimal.totalAnnualCostAUD.toFixed(2)}/year total cost)
          </span>
        </h2>

        <p className="rec-desc">
          {!isWorthwhile ? (
            <>
              <strong>FINANCIAL RESULT (Report Sec. 4.5 &amp; 7.2):</strong> Under current prices ($0.35/kWh import, $0.05/kWh FiT, $1,000 + $700/kWh capex), no battery beats solar alone. The solar-only annual electricity bill is <strong>${baseline.totalAnnualCostAUD.toFixed(2)}/yr</strong>.
              <br /><br />
              <strong>PHYSICAL STORAGE OPTION:</strong> If the household chooses to install a home battery for <strong>blackout backup, self-reliance, or emissions reduction</strong>, the <strong>least-cost positive battery</strong> is <strong>{bestPositive.capacityKWh.toFixed(1)} kWh</strong> ($707.72/yr total cost, incurring only <strong>${extraVsBaseline.toFixed(2)}/year</strong> more than solar alone).
            </>
          ) : (
            <>
              <strong>FINANCIALLY ATTRACTIVE (Report Eq. 13):</strong> The <strong>{bestPositive.capacityKWh.toFixed(1)} kWh</strong> residential battery minimizes overall annual expenditure, saving <strong>+${bestPositive.netBenefitAUD.toFixed(2)}/year</strong> compared to relying on solar PV alone.
            </>
          )}
        </p>

        <div className="rec-comparison">
          <strong>Decision Benchmark:</strong> 0 kWh Solar-Only Baseline Cost = <strong>${baseline.totalAnnualCostAUD.toFixed(2)}/yr</strong>.
          {!isWorthwhile && (
            <span> Least-Cost Physical Battery = <strong>{bestPositive.capacityKWh.toFixed(1)} kWh</strong> (${bestPositive.totalAnnualCostAUD.toFixed(2)}/yr, net benefit -${(-bestPositive.netBenefitAUD).toFixed(2)}/yr).</span>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '8px', minWidth: '260px' }}>
        {/* Buttons to switch between economic minimum and least-cost battery */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', width: '100%' }}>
          {!isWorthwhile ? (
            <>
              <button
                type="button"
                className={`btn btn-sm ${isSelectedOptimal ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => onSelectCapacity(0)}
                style={{ width: '100%', justifyContent: 'center', fontWeight: 700 }}
              >
                {isSelectedOptimal ? '✓ Active: 0 kWh (Economic Optimum)' : 'Select 0 kWh (Economic Optimum)'}
              </button>

              <button
                type="button"
                className={`btn btn-sm ${isSelectedBestPositive ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => onSelectCapacity(bestPositive.capacityKWh)}
                style={{ width: '100%', justifyContent: 'center', fontWeight: 700 }}
              >
                {isSelectedBestPositive ? `✓ Active: ${bestPositive.capacityKWh.toFixed(1)} kWh (Least-Cost Battery)` : `Select ${bestPositive.capacityKWh.toFixed(1)} kWh (Least-Cost Battery)`}
              </button>
            </>
          ) : (
            <button
              type="button"
              className={`btn btn-sm ${isSelectedOptimal ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => onSelectCapacity(bestPositive.capacityKWh)}
              style={{ width: '100%', justifyContent: 'center', fontWeight: 700 }}
            >
              {isSelectedOptimal ? `✓ Active: ${bestPositive.capacityKWh.toFixed(1)} kWh (Optimal)` : `Select ${bestPositive.capacityKWh.toFixed(1)} kWh (Optimal)`}
            </button>
          )}

          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => {
              const el = document.getElementById('cost-curve-section');
              if (el) el.scrollIntoView({ behavior: 'smooth' });
            }}
            style={{ width: '100%', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 600 }}
            title="Jump to the annual cost curve and capacity comparison"
          >
            Inspect Cost Curve ↓
          </button>
        </div>
      </div>
    </div>
  );
};
