import React, { useState } from 'react';
import { Result } from '../engine/types';
import { Table, ListFilter } from 'lucide-react';

interface TableProps {
  results: Result[];
  economicOptimal: Result;
  bestPositive: Result;
  selected: Result;
  onSelectCapacity: (kwh: number) => void;
}

export const CapacityComparisonTable: React.FC<TableProps> = ({
  results,
  economicOptimal,
  bestPositive,
  selected,
  onSelectCapacity,
}) => {
  const [showAll, setShowAll] = useState<boolean>(false);

  // Shortlist includes baseline, key commercial sizes, best, and user selection
  const shortlistSizes = [0, 5.0, 7.5, 10.0, 13.5, 15.0, 20.0, bestPositive.capacityKWh, selected.capacityKWh];
  const uniqueShortlist = Array.from(new Set(shortlistSizes)).sort((a, b) => a - b);

  const displayedRows = showAll
    ? results
    : results.filter(r => uniqueShortlist.some(s => Math.abs(s - r.capacityKWh) < 1e-6));

  return (
    <div className="card">
      <div className="card-header">
        <div>
          <h2 className="card-title">
            <Table size={20} color="var(--color-optimal)" />
            Candidate Capacity Comparison Table
          </h2>
          <p className="card-desc">
            Directly compare candidate battery capacities against the 0 kWh solar-only baseline and the optimal {economicOptimal.capacityKWh.toFixed(1)} kWh size (Report Section 4.5 &amp; 7.2).
          </p>
        </div>

        <button
          className="btn btn-secondary btn-sm"
          onClick={() => setShowAll(!showAll)}
        >
          <ListFilter size={14} />
          {showAll ? 'Show Shortlist (Key Sizes)' : `Show All ${results.length} Tested Capacities (0.0–20.0 kWh)`}
        </button>
      </div>

      <div className="table-wrapper">
        <table className="data-table" role="table" aria-label="Battery Capacity Comparison">
          <thead>
            <tr>
              <th scope="col">Battery Capacity</th>
              <th scope="col">Annual Grid Import</th>
              <th scope="col">Annual PV Export</th>
              <th scope="col">Ownership Cost</th>
              <th scope="col">Total Annual Cost</th>
              <th scope="col">Net Savings vs Solar-Only</th>
              <th scope="col">Cost Gap vs Eb*</th>
            </tr>
          </thead>
          <tbody>
            {displayedRows.map((r) => {
              const isBaseline = r.capacityKWh === 0;
              const isSelected = Math.abs(r.capacityKWh - selected.capacityKWh) < 1e-6;
              const isEconomicOpt = Math.abs(r.capacityKWh - economicOptimal.capacityKWh) < 1e-6;
              const isBestPositive = Math.abs(r.capacityKWh - bestPositive.capacityKWh) < 1e-6 && !isEconomicOpt;
              const gapVsOpt = r.totalAnnualCostAUD - economicOptimal.totalAnnualCostAUD;

              let rowClass = 'clickable';
              if (isSelected) rowClass = 'row-selected clickable';
              else if (isEconomicOpt) rowClass = 'row-optimal clickable';
              else if (isBaseline) rowClass = 'row-baseline clickable';

              return (
                <tr
                  key={r.capacityKWh}
                  className={rowClass}
                  tabIndex={0}
                  onClick={() => onSelectCapacity(r.capacityKWh)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onSelectCapacity(r.capacityKWh);
                    }
                  }}
                  title={`Click to examine ${r.capacityKWh.toFixed(1)} kWh`}
                >
                  <td>
                    <strong>{isBaseline ? '0.0 kWh (Solar-Only)' : `${r.capacityKWh.toFixed(1)} kWh`}</strong>
                    {isEconomicOpt && (
                      <span className="table-tag table-tag-optimal">
                        ★ OPTIMUM (Eb*)
                      </span>
                    )}
                    {isBestPositive && (
                      <span className="table-tag" style={{ background: '#e0f2fe', color: '#0369a1', borderColor: '#bae6fd' }}>
                        LEAST-COST BATTERY
                      </span>
                    )}
                    {isSelected && <span className="table-tag table-tag-selected">SELECTED</span>}
                  </td>
                  <td>{r.importKWh.toLocaleString('en-AU', { maximumFractionDigits: 1 })} kWh</td>
                  <td>{r.exportKWh.toLocaleString('en-AU', { maximumFractionDigits: 1 })} kWh</td>
                  <td>${r.ownerCostAUD.toFixed(2)}/yr</td>
                  <td>
                    <strong>${r.totalAnnualCostAUD.toFixed(2)}/yr</strong>
                  </td>
                  <td style={{ color: r.netBenefitAUD >= 0 ? '#15803d' : '#b91c1c', fontWeight: 600 }}>
                    {isBaseline ? '$0.00 (Reference)' : (r.netBenefitAUD >= 0 ? `+$${r.netBenefitAUD.toFixed(2)}/yr` : `-$${(-r.netBenefitAUD).toFixed(2)}/yr`)}
                  </td>
                  <td style={{ fontWeight: isEconomicOpt ? 700 : 400, color: isEconomicOpt ? '#0f766e' : 'inherit' }}>
                    {Math.abs(gapVsOpt) < 0.005 ? '$0.00 (Minimum)' : `+$${gapVsOpt.toFixed(2)}/yr`}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
