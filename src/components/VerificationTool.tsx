import React, { useState } from 'react';
import { ShieldCheck, CheckCircle2, XCircle, Download, ChevronDown, ChevronUp } from 'lucide-react';
import { VerificationSuiteOutput } from '../engine/verification';
import { downloadCSV } from '../engine/csv';

interface VerificationProps {
  suiteOutput: VerificationSuiteOutput;
}

export const VerificationTool: React.FC<VerificationProps> = ({ suiteOutput }) => {
  const [isOpen, setIsOpen] = useState<boolean>(true);

  const handleDownloadVerificationReport = () => {
    const rows = [
      ['Battery Sizing Studio — Software Verification Report (Section 6.3)'],
      ['Timestamp', suiteOutput.timestamp],
      ['Overall Status', suiteOutput.allPassed ? 'ALL CHECKS PASSED' : 'REVIEW NEEDED'],
      ['Passed Checks', `${suiteOutput.passedCount} / ${suiteOutput.totalChecks}`],
      [],
      ['Test ID', 'Verification Check Name', 'Report Reference', 'Status', 'Tolerance', 'Observed Value', 'Evidence Class'],
      ...suiteOutput.checks.map(c => [
        c.id,
        c.name,
        c.reportSection,
        c.passed ? 'PASS' : 'FAIL',
        c.tolerance,
        c.observedValue,
        c.evidenceClass,
      ]),
    ];

    downloadCSV('software_verification_report.csv', rows);
  };

  return (
    <div className="card">
      <div className="card-header">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <h2 className="card-title">
              <ShieldCheck size={22} color="var(--color-optimal)" />
              Software Results Verification &amp; Audit Suite
            </h2>
            <span
              style={{
                fontSize: '0.75rem',
                fontWeight: 800,
                padding: '3px 10px',
                borderRadius: '9999px',
                background: suiteOutput.allPassed ? '#dcfce7' : '#fee2e2',
                color: suiteOutput.allPassed ? '#15803d' : '#b91c1c',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
              }}
            >
              {suiteOutput.allPassed ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
              {suiteOutput.passedCount}/{suiteOutput.totalChecks} REPORT CHECKS PASS
            </span>
          </div>
          <p className="card-desc">
            Rigorous mathematical and physical invariant tests mandated by <strong>Section 6.3 of the Revised Research Report</strong>.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button className="btn btn-secondary btn-sm" onClick={handleDownloadVerificationReport}>
            <Download size={14} />
            Export Verification Audit (CSV)
          </button>
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => setIsOpen(!isOpen)}
            aria-label="Toggle verification details"
          >
            {isOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
        </div>
      </div>

      {isOpen && (
        <div style={{ marginTop: '10px' }}>
          <div className="table-wrapper">
            <table className="data-table" role="table" aria-label="Software Verification Checks">
              <thead>
                <tr>
                  <th scope="col" style={{ width: '40px' }}>Status</th>
                  <th scope="col">Verification Rule (Report Reference)</th>
                  <th scope="col">Theoretical Tolerance</th>
                  <th scope="col">Observed Software Value</th>
                  <th scope="col">Evidence Class</th>
                </tr>
              </thead>
              <tbody>
                {suiteOutput.checks.map((c) => (
                  <tr key={c.id}>
                    <td>
                      {c.passed ? (
                        <CheckCircle2 size={18} color="#15803d" />
                      ) : (
                        <XCircle size={18} color="#b91c1c" />
                      )}
                    </td>
                    <td>
                      <strong>{c.name}</strong>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        {c.reportSection} • {c.description}
                      </div>
                    </td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8125rem' }}>
                      {c.tolerance}
                    </td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8125rem', color: c.passed ? '#0f766e' : '#b91c1c', fontWeight: 600 }}>
                      {c.observedValue}
                    </td>
                    <td>
                      <span style={{ fontSize: '0.6875rem', padding: '2px 8px', borderRadius: '4px', background: '#e2e8f0', color: '#334155', fontWeight: 700 }}>
                        {c.evidenceClass}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ marginTop: '12px', fontSize: '0.8125rem', color: 'var(--text-secondary)', background: '#f8fafc', padding: '10px 14px', borderRadius: 'var(--radius-sm)' }}>
            <strong>Academic Note (Section 6.3):</strong> Passing these 8 checks strictly proves the internal implementation consistency, energy conservation, and convergence of the mathematical solver. It verifies that software outputs are mathematically robust under the tested conditions.
          </div>
        </div>
      )}
    </div>
  );
};
