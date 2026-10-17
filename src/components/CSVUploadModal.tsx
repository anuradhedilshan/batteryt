import React, { useState } from 'react';
import { X, Upload, AlertCircle, RotateCcw } from 'lucide-react';
import { parseHourlyCSV, ImportedProfile } from '../engine/csv';

interface CSVModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUploadSuccess: (profile: ImportedProfile, refPV: number) => void;
  onUseDefault: () => void;
  currentReferencePV: number;
}

export const CSVUploadModal: React.FC<CSVModalProps> = ({
  isOpen,
  onClose,
  onUploadSuccess,
  onUseDefault,
  currentReferencePV,
}) => {
  const [refPV, setRefPV] = useState<number>(currentReferencePV);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);

  if (!isOpen) return null;

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setErrorMsg(null);
    setIsProcessing(true);

    try {
      const text = await file.text();
      const profile = parseHourlyCSV(text, file.name);
      onUploadSuccess(profile, refPV);
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Error parsing CSV file');
    } finally {
      setIsProcessing(false);
      e.target.value = '';
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Upload size={20} color="var(--color-optimal)" />
            Upload 8,760-Hour Energy Profile
          </h2>
          <button
            onClick={onClose}
            style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}
            aria-label="Close dialog"
          >
            <X size={20} />
          </button>
        </div>

        <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: '16px', lineHeight: 1.5 }}>
          Upload a chronological 1-year CSV file containing <strong>exactly 8,760 rows</strong> (one row per hour). All calculations are run entirely client-side in your browser; your data is not sent to any server.
        </p>

        <div style={{ background: '#f8fafc', border: 'none', borderRadius: 'var(--radius-md)', padding: '16px', marginBottom: '16px', fontSize: '0.8125rem' }}>
          <strong style={{ display: 'block', marginBottom: '4px', color: 'var(--text-primary)' }}>Required CSV Columns:</strong>
          <code style={{ background: '#e2e8f0', padding: '2px 6px', borderRadius: '4px', color: '#0f172a' }}>
            pv_generation_kwh, household_load_kwh
          </code>
          <span style={{ display: 'block', marginTop: '6px', color: 'var(--text-muted)' }}>
            Aliases also accepted: <code>pv_kwh</code>, <code>solar_kwh</code>, <code>load_kwh</code>.
          </span>
        </div>

        <div style={{ marginBottom: '18px' }}>
          <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '6px' }}>
            Reference PV Rating of Data (kW)
          </label>
          <input
            type="number"
            min={0.1}
            step={0.1}
            value={refPV}
            onChange={(e) => setRefPV(Math.max(0.1, Number(e.target.value)))}
            style={{
              width: '100%',
              padding: '8px 12px',
              border: '1px solid var(--border-default)',
              borderRadius: 'var(--radius-md)',
              fontSize: '0.875rem',
            }}
          />
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px', display: 'block' }}>
            The installed PV system size corresponding to the unscaled PV figures in the CSV.
          </span>
        </div>

        {errorMsg && (
          <div style={{ background: '#fef2f2', border: 'none', borderRadius: 'var(--radius-md)', padding: '14px', marginBottom: '16px', color: '#b91c1c', fontSize: '0.8125rem', display: 'flex', gap: '8px' }}>
            <AlertCircle size={18} style={{ flexShrink: 0 }} />
            <div>
              <strong>CSV Error:</strong> {errorMsg}
            </div>
          </div>
        )}

        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <button
            className="btn btn-secondary"
            onClick={() => {
              onUseDefault();
              onClose();
            }}
          >
            <RotateCcw size={15} />
            Use Illustrative Thesis Dataset
          </button>

          <label className="btn btn-primary" style={{ cursor: isProcessing ? 'wait' : 'pointer' }}>
            <Upload size={15} />
            {isProcessing ? 'Processing 8,760 rows...' : 'Select CSV File'}
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={handleFileChange}
              disabled={isProcessing}
              style={{ display: 'none' }}
            />
          </label>
        </div>
      </div>
    </div>
  );
};
