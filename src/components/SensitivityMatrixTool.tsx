import React from 'react';
import { Grid } from 'lucide-react';
import { TariffSensitivityMatrix } from '../engine/sensitivity';

interface SensitivityProps {
  matrix: TariffSensitivityMatrix;
  currentImportTariff: number;
  currentFit: number;
  onApplyTariff: (tImport: number, tFit: number) => void;
}

export const SensitivityMatrixTool: React.FC<SensitivityProps> = ({
  matrix,
  currentImportTariff,
  currentFit,
  onApplyTariff,
}) => {
  return (
    <div className="card">
      <div className="card-header">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Grid size={20} color="var(--color-optimal)" />
            <h2 className="card-title">
              Automated Optimal Battery Sizing Matrix (Tariff Sensitivity)
            </h2>
          </div>
          <p className="card-desc">
            Direct implementation of <strong>Section 7.3 and Figure 5 of the Revised Research Report</strong>. Shows the mathematical optimum battery capacity ($E_b^*$) calculated dynamically across different electricity retail and feed-in tariffs.
          </p>
        </div>

        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
          Click any scenario cell to apply tariffs
        </span>
      </div>

      <div className="table-wrapper">
        <table className="data-table" style={{ textAlign: 'center' }}>
          <thead>
            <tr>
              <th scope="col" style={{ textAlign: 'left', minWidth: '150px' }}>
                Feed-in Tariff ↓ \ Import Tariff →
              </th>
              {matrix.importTariffs.map(imp => (
                <th key={imp} scope="col">
                  ${imp.toFixed(2)}/kWh
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {matrix.feedInTariffs.map((fit, rowIdx) => (
              <tr key={fit}>
                <td style={{ textAlign: 'left', fontWeight: 700, background: 'var(--bg-surface-subtle)' }}>
                  FiT: ${fit.toFixed(2)}/kWh
                </td>
                {matrix.importTariffs.map((imp, colIdx) => {
                  const cell = matrix.grid[rowIdx][colIdx];
                  const isCurrent =
                    Math.abs(imp - currentImportTariff) < 0.005 &&
                    Math.abs(fit - currentFit) < 0.005;

                  const isZero = cell.optimalCapacityKWh === 0;

                  return (
                    <td
                      key={imp}
                      onClick={() => onApplyTariff(imp, fit)}
                      title={`Click to apply Import $${imp.toFixed(2)}, FiT $${fit.toFixed(2)} (${isZero ? '0.0 kWh Solar-Only optimal; least-cost battery: ' + cell.bestPositiveCapacityKWh.toFixed(1) + ' kWh' : cell.optimalCapacityKWh.toFixed(1) + ' kWh optimal'})`}
                      style={{
                        cursor: 'pointer',
                        background: isCurrent
                          ? '#fef3c7'
                          : cell.isEconomicallyViable
                          ? '#f0fdf4'
                          : '#f8fafc',
                        border: 'none',
                        boxShadow: isCurrent ? 'inset 0 0 0 2px #475569' : 'none',
                        padding: '12px 10px',
                        transition: 'transform 0.1s',
                      }}
                    >
                      <div style={{ fontSize: '1.0625rem', fontWeight: 900, color: cell.isEconomicallyViable ? '#0f766e' : '#64748b' }}>
                        {isZero ? '0.0 kWh' : `${cell.optimalCapacityKWh.toFixed(1)} kWh`}
                      </div>

                      <div style={{ fontSize: '0.6875rem', marginTop: '2px', color: cell.isEconomicallyViable ? '#15803d' : '#64748b', fontWeight: 600 }}>
                        {cell.isEconomicallyViable ? (
                          `Saves +$${cell.netSavingsVsBaseline.toFixed(0)}/yr`
                        ) : (
                          `Solar-Only (${cell.bestPositiveCapacityKWh.toFixed(1)} kWh: -$${(-cell.bestPositiveNetSavings).toFixed(0)}/yr)`
                        )}
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
            Financially Viable Battery (Net Savings &gt; $0 vs Solar-Only)
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ width: '12px', height: '12px', borderRadius: '3px', background: '#fef3c7' }}></span>
            Lowest-Cost Battery (Costs more than Solar-Only)
          </span>
        </div>

        <div>
          <em>Notice: As retail price rises to $0.65/kWh, the optimal capacity increases and becomes highly profitable!</em>
        </div>
      </div>
    </div>
  );
};
