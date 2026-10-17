import React, { useState } from 'react';
import { Sliders, Zap, DollarSign, Settings, ChevronDown, ChevronUp, Sparkles } from 'lucide-react';
import { Inputs, Result } from '../engine/types';

interface ParamsProps {
  inputs: Inputs;
  onChange: (newInputs: Inputs) => void;
  preset: string;
  onPresetChange: (presetKey: string) => void;
  bestPositive: Result;
  autoFollowOptimal: boolean;
  onToggleAutoFollow: (auto: boolean) => void;
}

export const ParametersPanel: React.FC<ParamsProps> = ({
  inputs,
  onChange,
  preset,
  onPresetChange,
  bestPositive,
  autoFollowOptimal,
  onToggleAutoFollow,
}) => {
  const [openSections, setOpenSections] = useState<{ [key: string]: boolean }>({
    household: true,
    pv: true,
    tariffs: true,
    whatIf: false,
    technical: false,
  });

  const toggleSection = (section: string) => {
    setOpenSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  const update = (field: keyof Inputs, value: number) => {
    onChange({ ...inputs, [field]: value });
  };

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <h2 className="sidebar-title">
          <Sliders size={22} color="#38bdf8" />
          Sizing Inputs &amp; Scenarios
        </h2>
        <p className="sidebar-subtitle">
          Define household demand, rooftop solar, and economics. The software automatically calculates and suggests the optimal battery size.
        </p>

        {/* Suggested Optimal Size Callout in Sidebar */}
        <div style={{ marginTop: '14px', background: 'rgba(15, 118, 110, 0.35)', border: 'none', borderRadius: '8px', padding: '12px 14px' }}>
          <div style={{ fontSize: '0.6875rem', textTransform: 'uppercase', color: '#99f6e4', fontWeight: 800, letterSpacing: '0.05em' }}>
            Current Model Suggestion
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginTop: '2px' }}>
            <span style={{ fontSize: '1.25rem', fontWeight: 900, color: '#f0fdfa' }}>
              {bestPositive.capacityKWh.toFixed(1)} kWh Battery
            </span>
            <span style={{ fontSize: '0.75rem', color: '#5eead4', fontWeight: 700 }}>
              ${bestPositive.totalAnnualCostAUD.toFixed(2)}/yr
            </span>
          </div>
          <div style={{ fontSize: '0.6875rem', color: '#ccfbf1', marginTop: '2px' }}>
            Minimizes total annual electricity bill + annualized ownership capex.
          </div>
        </div>

        {/* Preset Selector */}
        <div style={{ marginTop: '14px' }}>
          <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: '#94a3b8', marginBottom: '4px' }}>
            Tariff &amp; Economic Preset
          </label>
          <select
            className="select-input"
            value={preset}
            onChange={(e) => onPresetChange(e.target.value)}
          >
            <option value="report">Report Baseline ($0.35 Import / $0.05 FiT)</option>
            <option value="higher">High Retail Electricity Price ($0.65 Import / $0.03 FiT)</option>
            <option value="lowcost">Cheaper Battery Capex ($300/kWh, 50% Subsidy)</option>
            <option value="custom">Custom Parameters (Manual)</option>
          </select>
        </div>
      </div>

      {/* 1. Household Demand & Occupancy */}
      <div style={{ marginBottom: '16px' }}>
        <button
          onClick={() => toggleSection('household')}
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            width: '100%',
            background: '#1e293b',
            border: 'none',
            padding: '10px 14px',
            borderRadius: '8px',
            color: '#f8fafc',
            fontWeight: 700,
            fontSize: '0.875rem',
            cursor: 'pointer',
            textAlign: 'left',
          }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Zap size={16} color="#38bdf8" />
            1. Household Demand Profile
          </span>
          {openSections.household ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>

        {openSections.household && (
          <div style={{ padding: '14px 4px 0' }}>
            <div style={{ display: 'flex', gap: '6px', marginBottom: '12px' }}>
              <button
                className={`btn btn-sm ${Math.abs(inputs.demandMultiplier - 0.75) < 0.02 ? 'btn-primary' : 'btn-secondary'}`}
                style={{ flex: 1, fontSize: '0.6875rem', padding: '6px 4px' }}
                onClick={() => update('demandMultiplier', 0.75)}
              >
                Small (0.75×)
              </button>
              <button
                className={`btn btn-sm ${Math.abs(inputs.demandMultiplier - 1.00) < 0.02 ? 'btn-primary' : 'btn-secondary'}`}
                style={{ flex: 1, fontSize: '0.6875rem', padding: '6px 4px' }}
                onClick={() => update('demandMultiplier', 1.00)}
              >
                Medium (1.00×)
              </button>
              <button
                className={`btn btn-sm ${Math.abs(inputs.demandMultiplier - 1.35) < 0.02 ? 'btn-primary' : 'btn-secondary'}`}
                style={{ flex: 1, fontSize: '0.6875rem', padding: '6px 4px' }}
                onClick={() => update('demandMultiplier', 1.35)}
              >
                Large (1.35×)
              </button>
            </div>

            <div className="control-group">
              <div className="control-label-row">
                <span>Demand Scaling Multiplier</span>
                <span className="control-value-badge">{inputs.demandMultiplier.toFixed(2)}×</span>
              </div>
              <input
                type="range"
                min={0.5}
                max={1.75}
                step={0.05}
                value={inputs.demandMultiplier}
                onChange={(e) => update('demandMultiplier', Number(e.target.value))}
                className="slider"
              />
              <span style={{ fontSize: '0.6875rem', color: '#94a3b8' }}>
                Annual load: {(5780 * inputs.demandMultiplier).toFixed(0)} kWh/year
              </span>
            </div>
          </div>
        )}
      </div>

      {/* 2. Solar PV Sizing */}
      <div style={{ marginBottom: '16px' }}>
        <button
          onClick={() => toggleSection('pv')}
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            width: '100%',
            background: '#1e293b',
            border: 'none',
            padding: '10px 14px',
            borderRadius: '8px',
            color: '#f8fafc',
            fontWeight: 700,
            fontSize: '0.875rem',
            cursor: 'pointer',
            textAlign: 'left',
          }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Sparkles size={16} color="#fbbf24" />
            2. Rooftop Solar PV System
          </span>
          {openSections.pv ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>

        {openSections.pv && (
          <div style={{ padding: '14px 4px 0' }}>
            <div style={{ display: 'flex', gap: '6px', marginBottom: '12px' }}>
              {[4.0, 6.6, 8.0, 10.0].map(kw => (
                <button
                  key={kw}
                  className={`btn btn-sm ${Math.abs(inputs.pvKW - kw) < 0.1 ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ flex: 1, fontSize: '0.6875rem', padding: '6px 2px' }}
                  onClick={() => update('pvKW', kw)}
                >
                  {kw} kW
                </button>
              ))}
            </div>

            <div className="control-group">
              <div className="control-label-row">
                <span>Installed PV Rating</span>
                <span className="control-value-badge">{inputs.pvKW.toFixed(1)} kW</span>
              </div>
              <input
                type="range"
                min={3.0}
                max={12.0}
                step={0.1}
                value={inputs.pvKW}
                onChange={(e) => update('pvKW', Number(e.target.value))}
                className="slider"
              />
              <span style={{ fontSize: '0.6875rem', color: '#94a3b8' }}>
                Estimated generation: {(10539 * (inputs.pvKW / inputs.pvReferenceKW)).toFixed(0)} kWh/year
              </span>
            </div>
          </div>
        )}
      </div>

      {/* 3. Tariffs & Capital Economics */}
      <div style={{ marginBottom: '16px' }}>
        <button
          onClick={() => toggleSection('tariffs')}
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            width: '100%',
            background: '#1e293b',
            border: 'none',
            padding: '10px 14px',
            borderRadius: '8px',
            color: '#f8fafc',
            fontWeight: 700,
            fontSize: '0.875rem',
            cursor: 'pointer',
            textAlign: 'left',
          }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <DollarSign size={16} color="#4ade80" />
            3. Electricity Tariffs &amp; Capital
          </span>
          {openSections.tariffs ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>

        {openSections.tariffs && (
          <div style={{ padding: '14px 4px 0' }}>
            <div className="control-group">
              <div className="control-label-row">
                <span>Retail Import Tariff</span>
                <span className="control-value-badge">${inputs.importAUDPerKWh.toFixed(2)}/kWh</span>
              </div>
              <input
                type="range"
                min={0.10}
                max={0.85}
                step={0.01}
                value={inputs.importAUDPerKWh}
                onChange={(e) => update('importAUDPerKWh', Number(e.target.value))}
                className="slider"
              />
            </div>

            <div className="control-group">
              <div className="control-label-row">
                <span>Solar Feed-in Tariff (FiT)</span>
                <span className="control-value-badge">${inputs.feedInAUDPerKWh.toFixed(2)}/kWh</span>
              </div>
              <input
                type="range"
                min={0.00}
                max={0.25}
                step={0.01}
                value={inputs.feedInAUDPerKWh}
                onChange={(e) => update('feedInAUDPerKWh', Number(e.target.value))}
                className="slider"
              />
            </div>

            <div className="control-group">
              <div className="control-label-row">
                <span>Battery Capex per kWh</span>
                <span className="control-value-badge">${inputs.variableCapexAUDPerKWh.toFixed(0)}/kWh</span>
              </div>
              <input
                type="range"
                min={100}
                max={1400}
                step={25}
                value={inputs.variableCapexAUDPerKWh}
                onChange={(e) => update('variableCapexAUDPerKWh', Number(e.target.value))}
                className="slider"
              />
            </div>

            <div className="control-group">
              <div className="control-label-row">
                <span>Fixed Installation Capex</span>
                <span className="control-value-badge">${inputs.fixedCapexAUD.toFixed(0)}</span>
              </div>
              <input
                type="range"
                min={0}
                max={3000}
                step={100}
                value={inputs.fixedCapexAUD}
                onChange={(e) => update('fixedCapexAUD', Number(e.target.value))}
                className="slider"
              />
            </div>

            <div className="control-group">
              <div className="control-label-row">
                <span>Hypothetical Subsidy / Discount</span>
                <span className="control-value-badge">{inputs.hypotheticalDiscountPct}%</span>
              </div>
              <input
                type="range"
                min={0}
                max={70}
                step={5}
                value={inputs.hypotheticalDiscountPct}
                onChange={(e) => update('hypotheticalDiscountPct', Number(e.target.value))}
                className="slider"
              />
            </div>
          </div>
        )}
      </div>

      {/* 4. What-If Tool: Test / Inspect Specific Battery */}
      <div style={{ marginBottom: '16px' }}>
        <button
          onClick={() => toggleSection('whatIf')}
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            width: '100%',
            background: '#1e293b',
            border: 'none',
            padding: '10px 14px',
            borderRadius: '8px',
            color: '#f8fafc',
            fontWeight: 700,
            fontSize: '0.875rem',
            cursor: 'pointer',
            textAlign: 'left',
          }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Sliders size={16} color="#fbbf24" />
            4. What-If: Test Specific Battery
          </span>
          {openSections.whatIf ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>

        {openSections.whatIf && (
          <div style={{ padding: '14px 4px 0', background: 'rgba(0,0,0,0.15)', borderRadius: '6px', marginTop: '6px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.75rem', color: '#f8fafc', marginBottom: '10px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={autoFollowOptimal}
                onChange={(e) => onToggleAutoFollow(e.target.checked)}
                style={{ width: '16px', height: '16px', accentColor: '#0f766e' }}
              />
              <span>Auto-follow suggested optimal size ({bestPositive.capacityKWh.toFixed(1)} kWh)</span>
            </label>

            {!autoFollowOptimal && (
              <div className="control-group">
                <div className="control-label-row">
                  <span>Custom Candidate to Inspect</span>
                  <span className="control-value-badge" style={{ color: '#fbbf24' }}>
                    {inputs.selectedBatteryKWh.toFixed(1)} kWh
                  </span>
                </div>
                <input
                  type="range"
                  min={0.5}
                  max={20.0}
                  step={0.5}
                  value={inputs.selectedBatteryKWh}
                  onChange={(e) => update('selectedBatteryKWh', Number(e.target.value))}
                  className="slider slider-gold"
                />
                <span style={{ fontSize: '0.6875rem', color: '#94a3b8' }}>
                  Use this to test what happens if you install an alternative commercial capacity (e.g. 10.0 kWh or 13.5 kWh).
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 5. Technical Specifications */}
      <div style={{ marginBottom: '16px' }}>
        <button
          onClick={() => toggleSection('technical')}
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            width: '100%',
            background: '#1e293b',
            border: 'none',
            padding: '10px 14px',
            borderRadius: '8px',
            color: '#f8fafc',
            fontWeight: 700,
            fontSize: '0.875rem',
            cursor: 'pointer',
            textAlign: 'left',
          }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Settings size={16} color="#a78bfa" />
            5. Technical Specs &amp; Inverter
          </span>
          {openSections.technical ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>

        {openSections.technical && (
          <div style={{ padding: '14px 4px 0' }}>
            <div className="control-group">
              <div className="control-label-row">
                <span>Charge/Discharge Efficiency</span>
                <span className="control-value-badge">{inputs.efficiencyPct}% each way</span>
              </div>
              <input
                type="range"
                min={80}
                max={99}
                step={1}
                value={inputs.efficiencyPct}
                onChange={(e) => update('efficiencyPct', Number(e.target.value))}
                className="slider"
              />
            </div>

            <div className="control-group">
              <div className="control-label-row">
                <span>Inverter C-rate Power Capability</span>
                <span className="control-value-badge">{inputs.cRate.toFixed(2)} C</span>
              </div>
              <input
                type="range"
                min={0.1}
                max={1.5}
                step={0.05}
                value={inputs.cRate}
                onChange={(e) => update('cRate', Number(e.target.value))}
                className="slider"
              />
            </div>

            <div className="control-group">
              <div className="control-label-row">
                <span>SOC Minimum &amp; Maximum</span>
                <span className="control-value-badge">{inputs.socMinPct}% – {inputs.socMaxPct}%</span>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  type="range"
                  min={0}
                  max={35}
                  step={5}
                  value={inputs.socMinPct}
                  onChange={(e) => update('socMinPct', Number(e.target.value))}
                  className="slider"
                  title="Min SOC"
                />
                <input
                  type="range"
                  min={65}
                  max={100}
                  step={5}
                  value={inputs.socMaxPct}
                  onChange={(e) => update('socMaxPct', Number(e.target.value))}
                  className="slider"
                  title="Max SOC"
                />
              </div>
            </div>

            <div className="control-group">
              <div className="control-label-row">
                <span>Financial Horizon &amp; Discount Rate</span>
                <span className="control-value-badge">{inputs.lifeYears} yrs @ {inputs.annualDiscountRatePct}%</span>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  type="range"
                  min={5}
                  max={20}
                  step={1}
                  value={inputs.lifeYears}
                  onChange={(e) => update('lifeYears', Number(e.target.value))}
                  className="slider"
                />
                <input
                  type="range"
                  min={0}
                  max={15}
                  step={1}
                  value={inputs.annualDiscountRatePct}
                  onChange={(e) => update('annualDiscountRatePct', Number(e.target.value))}
                  className="slider"
                />
              </div>
            </div>

            <div className="control-group">
              <div className="control-label-row">
                <span>Annual O&amp;M Rate</span>
                <span className="control-value-badge">{inputs.annualOMPercentGross.toFixed(2)}%</span>
              </div>
              <input
                type="range"
                min={0}
                max={4}
                step={0.25}
                value={inputs.annualOMPercentGross}
                onChange={(e) => update('annualOMPercentGross', Number(e.target.value))}
                className="slider"
              />
            </div>
          </div>
        )}
      </div>
    </aside>
  );
};
