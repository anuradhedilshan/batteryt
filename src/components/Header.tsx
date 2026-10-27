import React from 'react';
import { Upload, Download, RefreshCw, FileText, CheckCircle2, AlertCircle, ShieldCheck, Compass, Grid, Clock, BookOpen } from 'lucide-react';
import { ProfileMetadata } from '../engine/types';

export type ActiveTab = 'optimal-sizer' | 'verification' | 'sensitivity' | 'dispatch' | 'report-notes';

interface HeaderProps {
  metadata: ProfileMetadata;
  onReset: () => void;
  onOpenUpload: () => void;
  onExportComparison: () => void;
  onExportHourly: () => void;
  onExportAssumptionsJSON?: () => void;
  onDownloadSample: () => void;
  checksPass: boolean;
  activeTab: ActiveTab;
  onSelectTab: (tab: ActiveTab) => void;
}

export const Header: React.FC<HeaderProps> = ({
  metadata,
  onReset,
  onOpenUpload,
  onExportComparison,
  onExportHourly,
  onExportAssumptionsJSON,
  onDownloadSample,
  checksPass,
  activeTab,
  onSelectTab,
}) => {
  return (
    <header style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <div className="top-header">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <h1 style={{ fontSize: '1.4375rem', fontWeight: 900, letterSpacing: '-0.02em', color: '#0f172a' }}>
              Battery Sizing Studio
            </h1>
            <span style={{ fontSize: '0.8125rem', padding: '2px 8px', borderRadius: '4px', background: '#e0f2fe', color: '#0369a1', fontWeight: 800 }}>
              Optimization &amp; Verification Suite
            </span>
          </div>
          <p style={{ fontSize: '0.875rem', color: '#475569', marginTop: '2px' }}>
            Techno-Economic Residential PV–Battery Sizing Tool &amp; Verification Protocol (Revised Research Report, Oct 2026)
          </p>
        </div>

        <div className="header-badges">
          {metadata.source === 'illustration' ? (
            <span className="badge badge-illustration" title="Profile calibrated to match thesis annual totals (10,539 kWh PV, 5,780 kWh Load)">
              <FileText size={13} />
              Illustrative Profile (Thesis Calibrated)
            </span>
          ) : (
            <span className="badge badge-uploaded" title={`User uploaded data: ${metadata.filename}`}>
              <Upload size={13} />
              Uploaded Profile: {metadata.filename}
            </span>
          )}

          <span
            className={`badge ${checksPass ? 'badge-pass' : 'badge-illustration'}`}
            style={{ color: checksPass ? '#15803d' : '#b91c1c', cursor: 'pointer' }}
            onClick={() => onSelectTab('verification')}
            title="Click to view the 8-point Software Verification Suite"
          >
            {checksPass ? <CheckCircle2 size={13} /> : <AlertCircle size={13} />}
            Verification Suite: {checksPass ? 'ALL 8 CHECKS PASS' : 'REVIEW'}
          </span>
        </div>

        <div className="header-actions">
          <button className="btn btn-secondary btn-sm" onClick={onOpenUpload} title="Upload custom 8,760-hour CSV">
            <Upload size={14} />
            Upload CSV
          </button>
          <button className="btn btn-secondary btn-sm" onClick={onDownloadSample} title="Download sample 8,760-hour CSV">
            <Download size={14} />
            Sample CSV
          </button>
          <button className="btn btn-secondary btn-sm" onClick={onExportComparison} title="Export all candidate capacities to CSV">
            <Download size={14} />
            Export Sizing
          </button>
          <button className="btn btn-secondary btn-sm" onClick={onExportHourly} title="Export 8,760-hour trace">
            <Download size={14} />
            Export Trace
          </button>
          {onExportAssumptionsJSON && (
            <button className="btn btn-secondary btn-sm" onClick={onExportAssumptionsJSON} title="Export all assumptions and model parameters as JSON for full reproducibility">
              <Download size={14} />
              Export Assumptions
            </button>
          )}
          <button className="btn btn-secondary btn-sm" onClick={onReset} title="Reset all input parameters to default thesis report values">
            <RefreshCw size={14} />
            Reset
          </button>
        </div>
      </div>

      {/* Navigation Tabs */}
      <nav style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '4px' }}>
        <button
          className={`btn btn-sm ${activeTab === 'optimal-sizer' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => onSelectTab('optimal-sizer')}
        >
          <Compass size={15} />
          1. Optimal Sizing Recommendation
        </button>

        <button
          className={`btn btn-sm ${activeTab === 'verification' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => onSelectTab('verification')}
        >
          <ShieldCheck size={15} />
          2. Software Verification Suite (Report §6.3)
        </button>

        <button
          className={`btn btn-sm ${activeTab === 'sensitivity' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => onSelectTab('sensitivity')}
        >
          <Grid size={15} />
          3. Sizing Sensitivity &amp; Scenario Matrices (Report §7.3 &amp; §8.2)
        </button>

        <button
          className={`btn btn-sm ${activeTab === 'dispatch' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => onSelectTab('dispatch')}
        >
          <Clock size={15} />
          4. 24-Hour Dispatch &amp; Energy Flow
        </button>

        <button
          className={`btn btn-sm ${activeTab === 'report-notes' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => onSelectTab('report-notes')}
        >
          <BookOpen size={15} />
          5. Research Basis &amp; Method Notes
        </button>
      </nav>
    </header>
  );
};
