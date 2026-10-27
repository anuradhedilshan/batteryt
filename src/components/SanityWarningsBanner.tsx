import React from 'react';
import { AlertTriangle, AlertCircle, CheckCircle2, RefreshCw } from 'lucide-react';
import { InputSanityWarning } from '../engine/validation';

interface SanityWarningsBannerProps {
  warnings: InputSanityWarning[];
  isBlockingConfirmed: boolean;
  onConfirmBlocking: () => void;
  onFixTariffCents?: () => void;
  onFixFiT?: () => void;
}

export const SanityWarningsBanner: React.FC<SanityWarningsBannerProps> = ({
  warnings,
  isBlockingConfirmed,
  onConfirmBlocking,
  onFixTariffCents,
  onFixFiT,
}) => {
  if (warnings.length === 0) return null;

  const blockingWarnings = warnings.filter(w => w.isBlocking);
  const advisoryWarnings = warnings.filter(w => !w.isBlocking);
  const hasUnconfirmedBlocking = blockingWarnings.length > 0 && !isBlockingConfirmed;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', width: '100%', marginBottom: '16px' }}>
      {/* Blocking Warnings Section */}
      {blockingWarnings.length > 0 && (
        <div
          style={{
            background: hasUnconfirmedBlocking ? '#fef2f2' : '#fffbeb',
            border: `1px solid ${hasUnconfirmedBlocking ? '#fecaca' : '#fde68a'}`,
            borderLeft: `5px solid ${hasUnconfirmedBlocking ? '#dc2626' : '#f59e0b'}`,
            borderRadius: '8px',
            padding: '16px 20px',
            color: hasUnconfirmedBlocking ? '#991b1b' : '#92400e',
            boxShadow: 'var(--shadow-sm)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
            <AlertTriangle size={22} color={hasUnconfirmedBlocking ? '#dc2626' : '#d97706'} style={{ flexShrink: 0, marginTop: '2px' }} />
            <div style={{ flex: 1 }}>
              <h3 style={{ margin: '0 0 6px 0', fontSize: '1rem', fontWeight: 700, color: hasUnconfirmedBlocking ? '#991b1b' : '#92400e' }}>
                {hasUnconfirmedBlocking ? '⚠️ Action Required: Unusual Input Detected (Blocking Warning)' : 'Confirmed Warning Notice'}
              </h3>
              <p style={{ margin: '0 0 10px 0', fontSize: '0.875rem', lineHeight: 1.5 }}>
                {hasUnconfirmedBlocking
                  ? 'The loaded inputs contain values that will distort simulation results. Please review and confirm to proceed, or adjust the parameters:'
                  : 'You have confirmed the following unusual parameter values:'}
              </p>
              <ul style={{ margin: '0 0 12px 0', paddingLeft: '20px', fontSize: '0.875rem', lineHeight: 1.5 }}>
                {blockingWarnings.map((w, i) => (
                  <li key={i} style={{ fontWeight: 600 }}>
                    {w.message}
                  </li>
                ))}
              </ul>

              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', marginTop: '10px' }}>
                {hasUnconfirmedBlocking ? (
                  <>
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={onConfirmBlocking}
                      style={{ background: '#dc2626', borderColor: '#b91c1c', color: '#fff', fontWeight: 700 }}
                    >
                      <CheckCircle2 size={16} />
                      Confirm &amp; Proceed with Current Inputs
                    </button>

                    {blockingWarnings.some(w => w.type === 'tariff-cents') && onFixTariffCents && (
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={onFixTariffCents}
                        style={{ fontWeight: 600 }}
                      >
                        <RefreshCw size={14} />
                        Auto-Fix: Divide Tariffs by 100 (Cents → AUD)
                      </button>
                    )}

                    {blockingWarnings.some(w => w.type === 'fit-exceeds-import') && onFixFiT && (
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={onFixFiT}
                        style={{ fontWeight: 600 }}
                      >
                        <RefreshCw size={14} />
                        Auto-Fix: Reset Feed-in Tariff to $0.05/kWh
                      </button>
                    )}
                  </>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8125rem', color: '#047857' }}>
                    <CheckCircle2 size={15} color="#059669" />
                    <span>User confirmed. Simulation is running with custom parameters.</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Advisory Warnings Section */}
      {advisoryWarnings.length > 0 && (
        <div
          style={{
            background: '#f8fafc',
            border: '1px solid #e2e8f0',
            borderLeft: '4px solid #64748b',
            borderRadius: '8px',
            padding: '12px 16px',
            fontSize: '0.875rem',
            color: '#334155',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
            <AlertCircle size={18} color="#64748b" style={{ flexShrink: 0, marginTop: '2px' }} />
            <div>
              <strong style={{ color: '#0f172a' }}>Data Advisory:</strong>
              <ul style={{ margin: '4px 0 0 0', paddingLeft: '20px' }}>
                {advisoryWarnings.map((w, i) => (
                  <li key={i}>{w.message}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
