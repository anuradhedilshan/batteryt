import React from 'react';
import { Sun, Home, BatteryCharging, Zap, ArrowRight, ArrowLeft } from 'lucide-react';
import { Hour } from '../engine/types';

interface FlowProps {
  hourData: Hour;
  capacityKWh: number;
}

export const EnergyFlowDiagram: React.FC<FlowProps> = ({ hourData, capacityKWh }) => {
  const { pv, load, charge, discharge, gridImport, gridExport, storedAfter, socEndPct } = hourData;

  const isCharging = charge > 0.001;
  const isDischarging = discharge > 0.001;
  const isImporting = gridImport > 0.001;
  const isExporting = gridExport > 0.001;

  return (
    <div className="flow-container">
      {/* Solar PV Node */}
      <div className="flow-node">
        <div className="flow-icon-circle" style={{ background: '#fef3c7', color: '#d97706' }}>
          <Sun size={26} />
        </div>
        <span className="flow-node-title">Rooftop Solar</span>
        <span className="flow-node-value" style={{ color: '#d97706' }}>
          {pv.toFixed(2)} kWh
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', color: '#94a3b8', fontSize: '11px' }}>
        <ArrowRight size={18} color={pv > 0.001 ? '#d97706' : '#cbd5e1'} />
        <span>Solar Flow</span>
      </div>

      {/* Battery Storage Node */}
      <div className="flow-node">
        <div
          className="flow-icon-circle"
          style={{
            background: isCharging ? '#ede9fe' : isDischarging ? '#dcfce7' : '#f1f5f9',
            color: isCharging ? '#7c3aed' : isDischarging ? '#15803d' : '#64748b',
          }}
        >
          <BatteryCharging size={26} />
        </div>
        <span className="flow-node-title">
          Battery ({capacityKWh.toFixed(1)} kWh)
        </span>
        <span className="flow-node-value">
          {storedAfter.toFixed(2)} kWh
        </span>
        <span style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
          SOC: {socEndPct !== null ? `${socEndPct.toFixed(1)}%` : 'N/A'}
        </span>
        <div style={{ width: '80px', height: '6px', background: '#e2e8f0', borderRadius: '3px', marginTop: '4px', overflow: 'hidden' }}>
          <div
            style={{
              width: `${socEndPct ?? 0}%`,
              height: '100%',
              background: (socEndPct ?? 0) > 20 ? '#10b981' : '#f59e0b',
              transition: 'width 0.2s',
            }}
          />
        </div>
        <span style={{ fontSize: '10px', fontWeight: 700, color: isCharging ? '#7c3aed' : isDischarging ? '#15803d' : '#94a3b8', marginTop: '4px' }}>
          {isCharging ? `Charging +${charge.toFixed(2)}` : isDischarging ? `Discharge -${discharge.toFixed(2)}` : 'Idle'}
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', color: '#94a3b8', fontSize: '11px' }}>
        <ArrowRight size={18} color={load > 0.001 ? '#2563eb' : '#cbd5e1'} />
        <span>Supplying Load</span>
      </div>

      {/* Household Load Node */}
      <div className="flow-node">
        <div className="flow-icon-circle" style={{ background: '#dbeafe', color: '#2563eb' }}>
          <Home size={26} />
        </div>
        <span className="flow-node-title">Home Demand</span>
        <span className="flow-node-value" style={{ color: '#2563eb' }}>
          {load.toFixed(2)} kWh
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', color: '#94a3b8', fontSize: '11px' }}>
        {isImporting ? (
          <>
            <ArrowRight size={18} color="#ef4444" />
            <span style={{ color: '#ef4444', fontWeight: 700 }}>Import</span>
          </>
        ) : isExporting ? (
          <>
            <ArrowLeft size={18} color="#06b6d4" />
            <span style={{ color: '#06b6d4', fontWeight: 700 }}>Export</span>
          </>
        ) : (
          <span>Balanced</span>
        )}
      </div>

      {/* Utility Grid Node */}
      <div className="flow-node">
        <div
          className="flow-icon-circle"
          style={{
            background: isImporting ? '#fee2e2' : isExporting ? '#cffafe' : '#f1f5f9',
            color: isImporting ? '#dc2626' : isExporting ? '#0891b2' : '#64748b',
          }}
        >
          <Zap size={26} />
        </div>
        <span className="flow-node-title">Electric Grid</span>
        <span className="flow-node-value" style={{ color: isImporting ? '#dc2626' : isExporting ? '#0891b2' : '#64748b' }}>
          {isImporting ? `+${gridImport.toFixed(2)} in` : isExporting ? `-${gridExport.toFixed(2)} out` : '0.00'}
        </span>
        <span style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
          {isImporting ? 'Purchased from Grid' : isExporting ? 'Feed-in to Grid' : 'Net Zero'}
        </span>
      </div>
    </div>
  );
};
