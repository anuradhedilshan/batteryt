import React from 'react';
import { BookOpen, AlertTriangle } from 'lucide-react';

export const ResearchNotes: React.FC = () => {
  return (
    <div className="card">
      <div className="card-header">
        <div>
          <h2 className="card-title">
            <BookOpen size={20} color="var(--color-optimal)" />
            Research Basis, Methodological Assumptions &amp; References
          </h2>
          <p className="card-desc">
            Technical documentation for thesis presentation and academic review.
          </p>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', fontSize: '0.875rem', lineHeight: 1.6 }}>
        <div style={{ background: '#fffbeb', border: 'none', borderRadius: 'var(--radius-md)', padding: '16px 18px', color: '#92400e' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 800, marginBottom: '4px' }}>
            <AlertTriangle size={16} />
            Data Provenance &amp; Thesis Calibration Disclosure
          </div>
          <p style={{ fontSize: '0.8125rem' }}>
            The default 8,760-hour hourly profile is an <strong>illustrative calibrated reconstruction</strong> designed to strictly match the five published annual baseline energy totals in the thesis draft (Section 6.17): <strong>10,539 kWh</strong> solar PV, <strong>5,780 kWh</strong> household load, <strong>2,668 kWh</strong> direct solar self-consumption, <strong>7,871 kWh</strong> excess solar exports, and <strong>3,112 kWh</strong> grid imports.
          </p>
        </div>

        <div>
          <h3 style={{ fontSize: '0.9375rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '6px' }}>
            Physical Dispatch &amp; Financial Scope
          </h3>
          <ul style={{ paddingLeft: '20px', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <li><strong>Self-Consumption-First Priority:</strong> Solar serves household load first; surplus charges the battery up to its C-rate and SOC limits; deficits discharge the battery; remaining balance transacts with the grid.</li>
            <li><strong>No Solar-Only Zero Battery:</strong> 0 kWh is strictly the no-battery baseline ($695.65/yr). The lowest-cost residential battery is selected from physically marketable residential candidates (3.0 to 20.0 kWh), excluding non-marketable toy sizes.</li>
            <li><strong>Annualization:</strong> Capital is annualized using the Capital Recovery Factor: <code>CRF(r, L) = r(1+r)^L / ((1+r)^L - 1)</code>.</li>
            <li><strong>Cyclic Convergence:</strong> Battery starting SOC is iterated up to 50 passes until end-of-year energy matches start-of-year energy within 1e-6 kWh, preventing artificial initial energy bias.</li>
          </ul>
        </div>

        <details>
          <summary>IEEE Research References (Cited in Thesis)</summary>
          <div className="details-content" style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
            <ol style={{ paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <li>J. Weniger, T. Tjaden, and V. Quaschning, &quot;Sizing of residential PV battery systems,&quot; <em>Energy Procedia</em>, vol. 46, pp. 78–87, 2014.</li>
              <li>Y. Ru, J. Kleissl, and S. Martinez, &quot;Storage size determination for grid-connected photovoltaic systems,&quot; <em>IEEE Trans. Sustainable Energy</em>, vol. 4, no. 1, pp. 68–81, 2013.</li>
              <li>F. Tant, F. Geth, D. Six, P. Tant, and J. Driesen, &quot;Multiobjective battery energy storage sizing and control strategy in residential distribution grids with photovoltaic systems,&quot; <em>IEEE Trans. Sustainable Energy</em>, vol. 4, no. 4, pp. 1102–1110, 2013.</li>
              <li>R. Luthander, J. Widén, D. Nilsson, and M. Åberg, &quot;Photovoltaic self-consumption in buildings: A review,&quot; <em>Applied Energy</em>, vol. 142, pp. 80–94, 2015.</li>
              <li>Australian Energy Regulator, <em>Residential Energy Consumption Benchmarks—Final Report</em>, Dec. 2020.</li>
            </ol>
          </div>
        </details>
      </div>
    </div>
  );
};
