import React from 'react';
import { Calculator, HelpCircle, TrendingDown, Info } from 'lucide-react';
import { Result } from '../engine/types';

interface MathProps {
  baseline: Result;
  bestPositive: Result;
  results: Result[];
}

export const MathematicalPrincipleCard: React.FC<MathProps> = ({
  baseline,
  bestPositive,
  results,
}) => {
  const optCap = bestPositive.capacityKWh;
  const optCost = bestPositive.totalAnnualCostAUD;

  // Find 5.0 kWh and 10.0 kWh for direct illustration of lecturer's exact dialogue
  const r5 = results.find(r => r.capacityKWh === 5.0);
  const r10 = results.find(r => r.capacityKWh === 10.0);

  const cost5 = r5 ? r5.totalAnnualCostAUD : 0;
  const cost10 = r10 ? r10.totalAnnualCostAUD : 0;

  return (
    <div className="math-banner">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
        <h2>
          <Calculator size={20} />
          Mathematical Decision Function &amp; Optimal Battery Sizing
        </h2>
        <span style={{ fontSize: '0.8125rem', color: '#94a3b8', fontStyle: 'italic' }}>
          Thesis Formulation • Equations (1)–(15)
        </span>
      </div>

      <p style={{ fontSize: '0.9375rem', color: '#e2e8f0', marginTop: '6px', lineHeight: 1.6 }}>
        The system models <strong>8,760 hourly energy balance steps</strong> for every candidate battery size, computing the annual grid electricity bill plus the annualized capital ownership cost. The optimal size minimizes total annual expenditure.
      </p>

      <div className="math-grid">
        {/* Optimization Objective */}
        <div className="math-col">
          <h3>1. Optimization Function</h3>
          <div className="math-formula">
            min C_total(E_b) = C_grid(E_b) + C_owner(E_b)
          </div>
          <p className="math-explanation">
            <strong>C_grid:</strong> Net electricity bill (Grid Imports × $0.35 − Solar Exports × $0.05).<br />
            <strong>C_owner:</strong> Annualized battery capex via Capital Recovery Factor (CRF) + O&amp;M.
          </p>
        </div>

        {/* Why 7.5 kWh is the Optimal Size (Lecturer's Direct Question) */}
        <div className="math-col" style={{ background: 'rgba(15, 118, 110, 0.25)', border: 'none' }}>
          <h3 style={{ color: '#5eead4', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <TrendingDown size={14} />
            2. Why {optCap.toFixed(1)} kWh is the Optimal Size
          </h3>
          <div style={{ fontSize: '0.8125rem', color: '#f1f5f9', lineHeight: 1.6 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0' }}>
              <span>Smaller (5.0 kWh):</span>
              <strong style={{ color: '#fca5a5' }}>${cost5.toFixed(2)}/yr (costs MORE)</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 6px', background: 'rgba(15, 118, 110, 0.4)', borderRadius: '4px' }}>
              <span style={{ fontWeight: 700, color: '#5eead4' }}>Optimal ({optCap.toFixed(1)} kWh):</span>
              <strong style={{ color: '#5eead4' }}>${optCost.toFixed(2)}/yr (MINIMUM)</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0' }}>
              <span>Larger (10.0 kWh):</span>
              <strong style={{ color: '#fca5a5' }}>${cost10.toFixed(2)}/yr (costs MORE)</strong>
            </div>
          </div>
          <p className="math-explanation" style={{ marginTop: '6px' }}>
            All numbers above are higher, all numbers below are higher. Only <strong>{optCap.toFixed(1)} kWh</strong> minimizes the cost!
          </p>
        </div>

        {/* The Number Behind Zero */}
        <div className="math-col">
          <h3 style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <HelpCircle size={14} />
            3. The Number Behind &quot;0 kWh&quot;
          </h3>
          <div className="math-formula" style={{ color: '#93c5fd' }}>
            C_0 = ${baseline.totalAnnualCostAUD.toFixed(2)} / year
          </div>
          <p className="math-explanation">
            <strong>0 kWh is NOT zero cost.</strong> It represents the <strong>Solar-Only baseline bill</strong>: 3,112 kWh grid imports ($1,089.20) minus 7,871 kWh solar exports ($393.55) = <strong>${baseline.totalAnnualCostAUD.toFixed(2)}/yr</strong> with $0 battery capex.
          </p>
        </div>

        {/* Convexity & Tradeoff */}
        <div className="math-col">
          <h3 style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <Info size={14} />
            4. Why the U-Curve Occurs
          </h3>
          <p className="math-explanation" style={{ fontSize: '0.8125rem' }}>
            • <strong>Electricity bill C_grid:</strong> Decreases rapidly as battery captures evening load, then flattens (diminishing returns).<br />
            • <strong>Battery capex C_owner:</strong> Increases linearly with capacity ($/kWh).<br />
            • <strong>The Sum:</strong> Forms a classic convex U-curve with a unique global minimum.
          </p>
        </div>
      </div>
    </div>
  );
};
