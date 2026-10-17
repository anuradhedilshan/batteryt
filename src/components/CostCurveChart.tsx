import React, { useState } from 'react';
import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
  ReferenceDot,
  CartesianGrid,
} from 'recharts';
import { Result } from '../engine/types';
import { TrendingDown, Layers } from 'lucide-react';

interface CostCurveChartProps {
  results: Result[];
  baseline: Result;
  bestPositive: Result;
  selected: Result;
  onSelectCapacity: (kwh: number) => void;
}

export const CostCurveChart: React.FC<CostCurveChartProps> = ({
  results,
  baseline,
  bestPositive,
  selected,
  onSelectCapacity,
}) => {
  const [viewMode, setViewMode] = useState<'totalCost' | 'netBenefit'>('totalCost');
  const [showBreakdown, setShowBreakdown] = useState<boolean>(true);

  // Prepare chart data points
  const chartData = results.map(r => ({
    capacity: r.capacityKWh,
    totalCost: Number(r.totalAnnualCostAUD.toFixed(2)),
    gridCost: Number(r.gridCostAUD.toFixed(2)),
    ownerCost: Number(r.ownerCostAUD.toFixed(2)),
    netBenefit: Number(r.netBenefitAUD.toFixed(2)),
    isOptimal: r.capacityKWh === bestPositive.capacityKWh,
    isSelected: r.capacityKWh === selected.capacityKWh,
    isBaseline: r.capacityKWh === 0,
  }));

  // Selected & Optimal points
  const selectedPoint = chartData.find(d => Math.abs(d.capacity - selected.capacityKWh) < 1e-6);
  const optimalPoint = chartData.find(d => Math.abs(d.capacity - bestPositive.capacityKWh) < 1e-6);

  const baselineCost = Number(baseline.totalAnnualCostAUD.toFixed(2));

  return (
    <div className="card" id="cost-curve-section">
      <div className="card-header">
        <div>
          <h2 className="card-title">
            <TrendingDown size={20} color="var(--color-optimal)" />
            {viewMode === 'totalCost' ? 'Total Annual Cost vs. Battery Size' : 'Net Annual Benefit vs. Solar-Only'}
          </h2>
          <p className="card-desc">
            {viewMode === 'totalCost' ? (
              <>
                Notice the distinct <strong>convex U-curve</strong>: costs are high at 5 kWh (${chartData.find(d => d.capacity === 5)?.totalCost}), lowest at {bestPositive.capacityKWh.toFixed(1)} kWh (${bestPositive.totalAnnualCostAUD.toFixed(2)}), and rise again at 10 kWh (${chartData.find(d => d.capacity === 10)?.totalCost}).
              </>
            ) : (
              <>
                Net annual savings relative to solar-only ($695.65/yr). Negative values mean the battery costs more than having no battery.
              </>
            )}
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <div style={{ display: 'inline-flex', background: '#e2e8f0', borderRadius: '8px', padding: '3px' }}>
            <button
              className="btn btn-sm"
              style={{
                background: viewMode === 'totalCost' ? '#ffffff' : 'transparent',
                color: viewMode === 'totalCost' ? '#0f172a' : '#64748b',
                boxShadow: viewMode === 'totalCost' ? 'var(--shadow-sm)' : 'none',
              }}
              onClick={() => setViewMode('totalCost')}
            >
              Total Cost ($/yr)
            </button>
            <button
              className="btn btn-sm"
              style={{
                background: viewMode === 'netBenefit' ? '#ffffff' : 'transparent',
                color: viewMode === 'netBenefit' ? '#0f172a' : '#64748b',
                boxShadow: viewMode === 'netBenefit' ? 'var(--shadow-sm)' : 'none',
              }}
              onClick={() => setViewMode('netBenefit')}
            >
              Net Savings ($/yr)
            </button>
          </div>

          {viewMode === 'totalCost' && (
            <button
              className={`btn btn-sm ${showBreakdown ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setShowBreakdown(!showBreakdown)}
              title="Toggle Grid Bill and Battery Capital Cost curves"
            >
              <Layers size={13} />
              {showBreakdown ? 'Hide Breakdown' : 'Show Breakdown'}
            </button>
          )}
        </div>
      </div>

      {/* Legend & Summary Info */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', marginBottom: '12px', fontSize: '0.8125rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ width: '12px', height: '12px', borderRadius: '50%', background: '#d97706', border: '2px solid #b45309' }}></span>
            <strong>Selected:</strong> {selected.capacityKWh.toFixed(1)} kWh (${selected.totalAnnualCostAUD.toFixed(2)}/yr)
          </span>

          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ width: '12px', height: '12px', borderRadius: '50%', background: '#0f766e', border: '2px solid #042f2e' }}></span>
            <strong>Optimal:</strong> {bestPositive.capacityKWh.toFixed(1)} kWh (${bestPositive.totalAnnualCostAUD.toFixed(2)}/yr)
          </span>

          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ width: '16px', height: '2px', background: '#64748b', borderTop: '2px dashed #64748b' }}></span>
            <strong>Baseline (0 kWh):</strong> ${baseline.totalAnnualCostAUD.toFixed(2)}/yr
          </span>

          {showBreakdown && viewMode === 'totalCost' && (
            <>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: '#dc2626' }}>
                <span style={{ width: '12px', height: '2px', background: '#ef4444' }}></span>
                Grid Bill
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: '#8b5cf6' }}>
                <span style={{ width: '12px', height: '2px', background: '#8b5cf6' }}></span>
                Battery Ownership
              </span>
            </>
          )}
        </div>

        <span style={{ color: 'var(--text-muted)' }}>
          Tip: Click any point on the curve to inspect that battery capacity
        </span>
      </div>

      {/* Recharts Container */}
      <div style={{ width: '100%', height: 360 }}>
        <ResponsiveContainer>
          <ComposedChart
            data={chartData}
            margin={{ top: 20, right: 30, left: 20, bottom: 25 }}
            onClick={(state) => {
              if (state && state.activePayload && state.activePayload[0]) {
                const cap = state.activePayload[0].payload.capacity;
                if (cap > 0) onSelectCapacity(cap);
              }
            }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis
              dataKey="capacity"
              type="number"
              domain={[0, 20]}
              ticks={[0, 2.5, 5, 7.5, 10, 12.5, 15, 17.5, 20]}
              label={{ value: 'Battery Capacity (kWh)', position: 'insideBottom', offset: -15, fill: '#475569', fontSize: 12, fontWeight: 700 }}
              tick={{ fill: '#64748b', fontSize: 11 }}
            />
            <YAxis
              domain={viewMode === 'totalCost' ? ['auto', 'auto'] : ['auto', 'auto']}
              label={{
                value: viewMode === 'totalCost' ? 'Total Annual Cost (AUD / year)' : 'Net Annual Savings vs Solar-Only (AUD / year)',
                angle: -90,
                position: 'insideLeft',
                offset: -5,
                fill: '#475569',
                fontSize: 12,
                fontWeight: 700,
              }}
              tick={{ fill: '#64748b', fontSize: 11 }}
              tickFormatter={(v) => `$${v}`}
            />

            <Tooltip
              content={({ active, payload }) => {
                if (active && payload && payload.length) {
                  const data = payload[0].payload;
                  const isOpt = data.isOptimal;
                  const isSel = data.isSelected;
                  const isBase = data.isBaseline;

                  return (
                    <div style={{ background: '#0f172a', color: '#f8fafc', padding: '12px 16px', borderRadius: '8px', fontSize: '12px', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.3)', border: '1px solid #334155' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginBottom: '6px' }}>
                        <strong style={{ fontSize: '14px', color: '#38bdf8' }}>
                          {isBase ? '0 kWh (Solar-Only Baseline)' : `${data.capacity.toFixed(1)} kWh Battery`}
                        </strong>
                        {isOpt && <span style={{ background: '#0f766e', color: '#ccfbf1', padding: '1px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 800 }}>OPTIMAL</span>}
                        {isSel && <span style={{ background: '#d97706', color: '#fef3c7', padding: '1px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 800 }}>SELECTED</span>}
                      </div>

                      <div style={{ borderTop: '1px solid #334155', paddingTop: '6px', lineHeight: 1.6 }}>
                        <div><strong>Total Annual Cost:</strong> ${data.totalCost.toFixed(2)}/yr</div>
                        <div>• Grid Electricity Bill: ${data.gridCost.toFixed(2)}/yr</div>
                        <div>• Battery Ownership Cost: ${data.ownerCost.toFixed(2)}/yr</div>
                        <div style={{ marginTop: '4px', color: data.netBenefit >= 0 ? '#4ade80' : '#f87171' }}>
                          <strong>Savings vs Baseline:</strong> {data.netBenefit >= 0 ? `+$${data.netBenefit.toFixed(2)}/yr` : `-$${(-data.netBenefit).toFixed(2)}/yr`}
                        </div>
                        {!isOpt && !isBase && (
                          <div style={{ color: '#fbbf24', fontSize: '11px', marginTop: '2px' }}>
                            Extra cost vs optimal ({bestPositive.capacityKWh.toFixed(1)} kWh): +${(data.totalCost - bestPositive.totalAnnualCostAUD).toFixed(2)}/yr
                          </div>
                        )}
                      </div>
                    </div>
                  );
                }
                return null;
              }}
            />

            {/* Reference baseline line for Solar-Only */}
            {viewMode === 'totalCost' ? (
              <ReferenceLine
                y={baselineCost}
                stroke="#64748b"
                strokeDasharray="5 5"
                strokeWidth={1.5}
                label={{
                  value: `Solar-Only: $${baselineCost}/yr`,
                  position: 'insideTopRight',
                  fill: '#475569',
                  fontSize: 11,
                  fontWeight: 700,
                }}
              />
            ) : (
              <ReferenceLine
                y={0}
                stroke="#64748b"
                strokeDasharray="5 5"
                strokeWidth={1.5}
                label={{
                  value: `Solar-Only ($0 Savings Baseline)`,
                  position: 'insideTopRight',
                  fill: '#475569',
                  fontSize: 11,
                  fontWeight: 700,
                }}
              />
            )}

            {/* Breakdown lines if selected */}
            {viewMode === 'totalCost' && showBreakdown && (
              <>
                <Line
                  type="monotone"
                  dataKey="gridCost"
                  name="Grid Electricity Bill"
                  stroke="#ef4444"
                  strokeWidth={1.8}
                  strokeDasharray="4 2"
                  dot={false}
                  isAnimationActive={false}
                />
                <Line
                  type="monotone"
                  dataKey="ownerCost"
                  name="Battery Ownership Capex"
                  stroke="#8b5cf6"
                  strokeWidth={1.8}
                  strokeDasharray="4 2"
                  dot={false}
                  isAnimationActive={false}
                />
              </>
            )}

            {/* Main Total Cost or Net Benefit Line */}
            <Line
              type="monotone"
              dataKey={viewMode === 'totalCost' ? 'totalCost' : 'netBenefit'}
              name={viewMode === 'totalCost' ? 'Total Annual Cost' : 'Net Annual Benefit'}
              stroke="#0f766e"
              strokeWidth={3.5}
              dot={{ r: 3, fill: '#0f766e' }}
              activeDot={{ r: 7, stroke: '#042f2e', strokeWidth: 2 }}
              isAnimationActive={false}
            />

            {/* Optimal Dot Marker */}
            {optimalPoint && (
              <ReferenceDot
                x={optimalPoint.capacity}
                y={viewMode === 'totalCost' ? optimalPoint.totalCost : optimalPoint.netBenefit}
                r={8}
                fill="#0f766e"
                stroke="#ffffff"
                strokeWidth={3}
                label={{
                  value: `BEST: ${bestPositive.capacityKWh.toFixed(1)} kWh`,
                  position: 'top',
                  fill: '#0f766e',
                  fontSize: 11,
                  fontWeight: 800,
                }}
              />
            )}

            {/* Selected Dot Marker */}
            {selectedPoint && (
              <>
                <ReferenceLine
                  x={selectedPoint.capacity}
                  stroke="#d97706"
                  strokeDasharray="4 4"
                  strokeWidth={1.5}
                />
                <ReferenceDot
                  x={selectedPoint.capacity}
                  y={viewMode === 'totalCost' ? selectedPoint.totalCost : selectedPoint.netBenefit}
                  r={9}
                  fill="#d97706"
                  stroke="#ffffff"
                  strokeWidth={3}
                  label={{
                    value: `SELECTED: ${selected.capacityKWh.toFixed(1)} kWh`,
                    position: 'bottom',
                    fill: '#b45309',
                    fontSize: 11,
                    fontWeight: 800,
                  }}
                />
              </>
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
