import React, { useMemo } from 'react';
import {
  CheckCircle2,
  TrendingUp,
  Scale,
  Sparkles,
  ShieldAlert,
} from 'lucide-react';
import { Result, Inputs, Series, ProductEvaluation } from '../engine/types';
import { analyzeDecision } from '../engine/explain';

interface RecommendationProps {
  baseline: Result;
  economicOptimal: Result;
  bestPositive: Result;
  selected: Result;
  bestProduct?: ProductEvaluation;
  inputs: Inputs;
  series: Series;
  isIllustrative?: boolean;
  onSelectCapacity: (kwh: number) => void;
}

export const RecommendationCard: React.FC<RecommendationProps> = ({
  baseline,
  economicOptimal,
  bestPositive,
  selected,
  bestProduct,
  inputs,
  series,
  isIllustrative = true,
  onSelectCapacity,
}) => {
  // If bestProduct not provided, synthesize from bestPositive
  const activeProduct: ProductEvaluation = useMemo(() => {
    if (bestProduct) return bestProduct;
    return {
      id: 'synthetic-candidate',
      name: `${bestPositive.capacityKWh.toFixed(1)} kWh Sizing Option`,
      manufacturer: 'Representative',
      usableKWh: bestPositive.usableKWh,
      powerKW: bestPositive.powerKW || 5.0,
      installedPriceAUD: bestPositive.grossCapexAUD,
      subsidyAUD: bestPositive.subsidyAUD,
      netCapexAUD: bestPositive.netCapexAUD,
      lifetimeNPVAUD: bestPositive.lifetimeNPVAUD,
      equivalentAnnualBenefitAUD: bestPositive.equivalentAnnualBenefitAUD,
      year1BillSavingsAUD: bestPositive.year1BillSavingsAUD,
      simplePaybackYears: bestPositive.simplePaybackYears || null,
      breakEvenGrossAUD: bestPositive.breakEvenGrossAUD || 0,
      discountedPaybackYear: bestPositive.discountedPaybackYear || null,
      selfConsumptionPct: bestPositive.selfConsumptionPct,
      selfSufficiencyPct: bestPositive.selfSufficiencyPct,
      equivalentCycles: bestPositive.equivalentCycles,
      result: bestPositive,
    };
  }, [bestProduct, bestPositive]);

  const analysis = useMemo(() => {
    return analyzeDecision(activeProduct, inputs, series, baseline.gridCostAUD);
  }, [activeProduct, inputs, series, baseline.gridCostAUD]);

  const isSelectedOptimal = Math.abs(selected.capacityKWh - economicOptimal.capacityKWh) < 1e-6;
  const isSelectedBestPositive = Math.abs(selected.capacityKWh - bestPositive.capacityKWh) < 1e-6;

  return (
    <div
      className={`card ${analysis.isSolarOnlyCheaper ? 'decision-solar-only' : 'decision-battery-viable'}`}
      style={{
        border: analysis.isCloseCall
          ? '2px solid #f59e0b'
          : analysis.isSolarOnlyCheaper
          ? '1px solid #fed7aa'
          : '2px solid #10b981',
        borderRadius: '12px',
        padding: '24px',
        background: '#ffffff',
        boxShadow: 'var(--shadow-md)',
        marginBottom: '20px',
      }}
    >
      {/* Top Banner / Tags */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px', marginBottom: '14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          {/* Part C #9: Illustrative result banner */}
          {isIllustrative && (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                background: '#fef3c7',
                color: '#92400e',
                border: '1px solid #fde68a',
                padding: '4px 10px',
                borderRadius: '9999px',
                fontSize: '0.75rem',
                fontWeight: 700,
              }}
            >
              <Sparkles size={12} />
              Illustrative result - not based on measured data
            </span>
          )}

          {/* Part C #7: Close call label */}
          {analysis.isCloseCall ? (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                background: '#fff7ed',
                color: '#c2410c',
                border: '1px solid #fdba74',
                padding: '4px 10px',
                borderRadius: '9999px',
                fontSize: '0.75rem',
                fontWeight: 700,
              }}
            >
              <Scale size={13} />
              Close call - result is sensitive to assumptions (|NPV| ≤ 5% of net capex)
            </span>
          ) : analysis.isSolarOnlyCheaper ? (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                background: '#fff1f2',
                color: '#9f1239',
                border: '1px solid #fecdd3',
                padding: '4px 10px',
                borderRadius: '9999px',
                fontSize: '0.75rem',
                fontWeight: 700,
              }}
            >
              <ShieldAlert size={13} />
              Solar PV Only is Cheaper Under Current Inputs
            </span>
          ) : (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                background: '#ecfdf5',
                color: '#065f46',
                border: '1px solid #a7f3d0',
                padding: '4px 10px',
                borderRadius: '9999px',
                fontSize: '0.75rem',
                fontWeight: 700,
              }}
            >
              <CheckCircle2 size={13} />
              Battery Storage Financially Attractive
            </span>
          )}

          <span
            style={{
              fontSize: '0.75rem',
              fontWeight: 600,
              color: 'var(--text-muted)',
              background: '#f1f5f9',
              padding: '4px 8px',
              borderRadius: '6px',
            }}
          >
            Best Tested System: {analysis.bestProduct.name} ({analysis.bestProduct.usableKWh.toFixed(1)} kWh)
          </span>
        </div>

        {/* Quick Selection Buttons */}
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <button
            type="button"
            className={`btn btn-sm ${isSelectedOptimal ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => onSelectCapacity(economicOptimal.capacityKWh)}
            style={{ fontSize: '0.75rem', fontWeight: 600, padding: '4px 10px' }}
          >
            {economicOptimal.capacityKWh === 0 ? 'Baseline (0 kWh Solar Only)' : `Optimum (${economicOptimal.capacityKWh.toFixed(1)} kWh)`}
          </button>
          <button
            type="button"
            className={`btn btn-sm ${isSelectedBestPositive ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => onSelectCapacity(bestPositive.capacityKWh)}
            style={{ fontSize: '0.75rem', fontWeight: 600, padding: '4px 10px' }}
          >
            Best Battery ({bestPositive.capacityKWh.toFixed(1)} kWh)
          </button>
        </div>
      </div>

      {/* Primary Decision Header (Part C Wording Rule) */}
      <h2 style={{ fontSize: '1.375rem', fontWeight: 800, margin: '0 0 10px 0', color: '#0f172a' }}>
        {analysis.isCloseCall
          ? `Assumption-Sensitive Decision: ${analysis.bestProduct.name}`
          : analysis.isSolarOnlyCheaper
          ? 'Solar only is cheaper under these inputs'
          : `Battery Storage Recommended: ${analysis.bestProduct.name}`}
      </h2>

      {/* Part C #8 & Wording Rule: Plain language explanation */}
      <div
        style={{
          background: '#f8fafc',
          border: '1px solid #e2e8f0',
          borderRadius: '8px',
          padding: '14px 18px',
          fontSize: '0.9375rem',
          lineHeight: 1.6,
          color: '#1e293b',
          marginBottom: '20px',
        }}
      >
        <p style={{ margin: '0 0 8px 0', fontWeight: 500 }}>
          {analysis.wordingRuleText}
        </p>
        <div style={{ fontSize: '0.8125rem', color: '#64748b', fontStyle: 'italic', borderTop: '1px dashed #cbd5e1', paddingTop: '8px', marginTop: '8px' }}>
          <strong>Reference Model Synthesis:</strong> {analysis.explanationText}
        </div>
      </div>

      {/* Metrics Grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '14px',
          marginBottom: '22px',
        }}
      >
        {/* Metric 1: Lifetime NPV */}
        <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '14px' }}>
          <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
            1. Lifetime NPV vs Solar-Only
          </span>
          <div style={{ fontSize: '1.375rem', fontWeight: 800, color: analysis.npvChosenLifeAUD >= 0 ? '#059669' : '#dc2626', margin: '4px 0' }}>
            {analysis.npvChosenLifeAUD >= 0 ? '+' : ''}${Math.round(analysis.npvChosenLifeAUD).toLocaleString()} AUD
          </div>
          <div style={{ fontSize: '0.8125rem', color: '#475569' }}>
            Chosen life: <strong>{analysis.chosenLifeYears} yrs</strong>
          </div>
          <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '4px', borderTop: '1px solid #e2e8f0', paddingTop: '4px' }}>
            At 10 yrs: <strong>{analysis.npv10YearsAUD >= 0 ? '+' : ''}${Math.round(analysis.npv10YearsAUD).toLocaleString()}</strong> | At 15 yrs: <strong>{analysis.npv15YearsAUD >= 0 ? '+' : ''}${Math.round(analysis.npv15YearsAUD).toLocaleString()}</strong>
          </div>
        </div>

        {/* Metric 2: Value per kWh Cycled */}
        <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '14px' }}>
          <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
            2. Value Per kWh Cycled
          </span>
          <div style={{ fontSize: '1.375rem', fontWeight: 800, color: '#0f172a', margin: '4px 0' }}>
            ${analysis.valuePerKWhCycled.toFixed(3)} AUD/kWh
          </div>
          <div style={{ fontSize: '0.8125rem', color: '#475569' }}>
            Avoided import: <strong>+${analysis.avoidedImportPerKWh.toFixed(3)}</strong>
          </div>
          <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '4px', borderTop: '1px solid #e2e8f0', paddingTop: '4px' }}>
            Lost export income: <strong>-${analysis.lostExportPerKWh.toFixed(3)}</strong> (eff: {(analysis.eta_c * 100).toFixed(0)}%)
          </div>
        </div>

        {/* Metric 3: First-Year Bill Saving & Capital Outlay */}
        <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '14px' }}>
          <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
            3. Bill Saving &amp; Net Capex
          </span>
          <div style={{ fontSize: '1.375rem', fontWeight: 800, color: '#0f172a', margin: '4px 0' }}>
            ${Math.round(analysis.year1BillSavingAUD).toLocaleString()} AUD/yr
          </div>
          <div style={{ fontSize: '0.8125rem', color: '#475569' }}>
            Net Capex: <strong>${Math.round(analysis.netCapexAUD).toLocaleString()} AUD</strong>
          </div>
          <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '4px', borderTop: '1px solid #e2e8f0', paddingTop: '4px' }}>
            Gross: ${Math.round(analysis.grossCapexAUD).toLocaleString()} | Subsidy: -${Math.round(analysis.subsidyAUD).toLocaleString()}
          </div>
        </div>

        {/* Metric 4 & 5: Break-even & Payback */}
        <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '14px' }}>
          <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
            4 &amp; 5. Break-Even &amp; Payback
          </span>
          <div style={{ fontSize: '1.375rem', fontWeight: 800, color: '#0f172a', margin: '4px 0' }}>
            {analysis.paybackText}
          </div>
          <div style={{ fontSize: '0.8125rem', color: '#475569' }}>
            Break-even price: <strong>${Math.round(analysis.breakEvenGrossAUD).toLocaleString()} AUD</strong>
          </div>
          <div style={{ fontSize: '0.75rem', color: analysis.breakEvenPercentCut > 0 ? '#b91c1c' : '#059669', marginTop: '4px', borderTop: '1px solid #e2e8f0', paddingTop: '4px', fontWeight: 600 }}>
            {analysis.breakEvenPercentCut > 0
              ? `Requires ${analysis.breakEvenPercentCut.toFixed(0)}% lower price to break even`
              : `Current price is ${Math.abs(analysis.breakEvenPercentCut).toFixed(0)}% below break-even`}
          </div>
        </div>
      </div>

      {/* Part C #6: "What Would Change The Answer" Sensitivity Analysis */}
      <div style={{ background: '#f1f5f9', borderRadius: '8px', padding: '16px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
          <TrendingUp size={16} color="#0f172a" />
          <h4 style={{ margin: 0, fontSize: '0.875rem', fontWeight: 700, color: '#0f172a', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            What Would Change The Answer? (Single-Variable Exact Evaluations)
          </h4>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px' }}>
          {analysis.sensitivities.map((s, idx) => (
            <div
              key={idx}
              style={{
                background: '#ffffff',
                border: '1px solid #cbd5e1',
                borderRadius: '6px',
                padding: '10px 12px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
              }}
            >
              <div>
                <div style={{ fontSize: '0.8125rem', fontWeight: 700, color: '#1e293b' }}>{s.label}</div>
                <div style={{ fontSize: '0.75rem', color: '#64748b', marginBottom: '6px' }}>{s.condition}</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '6px', borderTop: '1px solid #f1f5f9', paddingTop: '6px' }}>
                <span style={{ fontSize: '0.75rem', color: '#475569' }}>New NPV:</span>
                <span
                  style={{
                    fontSize: '0.8125rem',
                    fontWeight: 800,
                    color: s.npvAUD >= 0 ? '#059669' : '#dc2626',
                  }}
                >
                  {s.npvAUD >= 0 ? '+' : ''}${Math.round(s.npvAUD).toLocaleString()} AUD
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
