import React from 'react';
import { AlertTriangle, CheckCircle2, RotateCcw } from 'lucide-react';
import { Result } from '../engine/types';

interface RecommendationProps {
  baseline: Result;
  bestPositive: Result;
  selected: Result;
  onSelectBest: () => void;
}

export const RecommendationCard: React.FC<RecommendationProps> = ({
  baseline,
  bestPositive,
  selected,
  onSelectBest,
}) => {
  const isWorthwhile = bestPositive.netBenefitAUD >= -0.005;
  const isSelectedBest = Math.abs(selected.capacityKWh - bestPositive.capacityKWh) < 1e-6;
  const extraVsBaseline = bestPositive.totalAnnualCostAUD - baseline.totalAnnualCostAUD;

  return (
    <div className={`recommendation-banner ${!isWorthwhile ? 'has-warning' : ''}`}>
      <div className="rec-left">
        <div>
          {isWorthwhile ? (
            <span className="rec-tag rec-tag-optimal">
              <CheckCircle2 size={13} />
              Financially Feasible Battery
            </span>
          ) : (
            <span className="rec-tag rec-tag-warning">
              <AlertTriangle size={13} />
              Economic Warning • Solar-Only Is Cheaper
            </span>
          )}
        </div>

        <h2 className="rec-title">
          {isWorthwhile ? (
            <>Optimal Battery Recommendation: {bestPositive.capacityKWh.toFixed(1)} kWh</>
          ) : (
            <>Lowest-Cost Residential Battery Option: {bestPositive.capacityKWh.toFixed(1)} kWh</>
          )}
          <span style={{ fontSize: '1.125rem', fontWeight: 600, color: 'var(--text-secondary)', marginLeft: '12px' }}>
            (${bestPositive.totalAnnualCostAUD.toFixed(2)}/year total cost)
          </span>
        </h2>

        <p className="rec-desc">
          {!isWorthwhile ? (
            <>
              <strong>FINANCIAL RESULT:</strong> Under the present tariff and capital assumptions, no battery beats solar alone. If you choose to install a residential battery for energy independence or backup resilience, the lowest-cost realistic residential option is <strong>{bestPositive.capacityKWh.toFixed(1)} kWh</strong> (modular home storage), which costs <strong>${extraVsBaseline.toFixed(2)}/year MORE</strong> than solar alone (${baseline.totalAnnualCostAUD.toFixed(2)}/yr). Non-marketable sub-residential sizes (&lt; 3.0 kWh) are excluded.
            </>
          ) : (
            <>
              <strong>FINANCIALLY ATTRACTIVE:</strong> The <strong>{bestPositive.capacityKWh.toFixed(1)} kWh</strong> residential battery provides the lowest overall annual cost and saves <strong>${bestPositive.netBenefitAUD.toFixed(2)}/year</strong> compared to relying on solar PV alone.
            </>
          )}
        </p>

        <div className="rec-comparison">
          <strong>Decision Benchmark:</strong> 0 kWh Solar-Only Baseline Cost = <strong>${baseline.totalAnnualCostAUD.toFixed(2)}/yr</strong>. Candidate tested batteries range from 3.0 kWh to 20.0 kWh (35 realistic residential sizes).
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '8px', minWidth: '240px' }}>
        {isSelectedBest ? (
          <>
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 16px',
                borderRadius: '9999px',
                background: '#dcfce7',
                color: '#15803d',
                fontWeight: 800,
                fontSize: '0.8125rem',
                boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
              }}
            >
              <CheckCircle2 size={16} />
              <span>Recommended Size Active</span>
            </div>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => {
                const el = document.getElementById('cost-curve-section');
                if (el) el.scrollIntoView({ behavior: 'smooth' });
              }}
              style={{ whiteSpace: 'nowrap', fontSize: '0.75rem', fontWeight: 600 }}
              title="Jump to the annual cost curve and capacity comparison"
            >
              Inspect Cost Curve ↓
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              className="btn btn-primary"
              onClick={onSelectBest}
              style={{ whiteSpace: 'nowrap', fontWeight: 800, padding: '10px 18px', gap: '8px' }}
              title={`Switch studio back to the ${bestPositive.capacityKWh.toFixed(1)} kWh optimal recommendation`}
            >
              <RotateCcw size={16} />
              Return to Recommended ({bestPositive.capacityKWh.toFixed(1)} kWh)
            </button>
            <span style={{ fontSize: '0.75rem', color: '#b45309', fontWeight: 600 }}>
              What-if size {selected.capacityKWh.toFixed(1)} kWh is active
            </span>
          </>
        )}
      </div>
    </div>
  );
};
