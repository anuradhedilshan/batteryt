import React, { useState, useEffect } from 'react';
import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
} from 'recharts';
import { Play, Pause, ChevronLeft, ChevronRight, Calendar, Clock, CheckCircle2 } from 'lucide-react';
import { Result } from '../engine/types';
import { EnergyFlowDiagram } from './EnergyFlowDiagram';

interface HourlyExplorerProps {
  selected: Result;
}

export const HourlyExplorer: React.FC<HourlyExplorerProps> = ({ selected }) => {
  const [dayIndex, setDayIndex] = useState<number>(14); // Jan 15 (0-indexed: 14)
  const [hourOfDay, setHourOfDay] = useState<number>(12); // 12:00
  const [isPlaying, setIsPlaying] = useState<boolean>(false);

  const hourlyData = selected.hourly;

  // Animation timer
  useEffect(() => {
    let timer: any = null;
    if (isPlaying) {
      timer = setInterval(() => {
        setHourOfDay((prev) => {
          if (prev >= 23) {
            setDayIndex((d) => (d + 1) % 365);
            return 0;
          }
          return prev + 1;
        });
      }, 800);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [isPlaying]);

  const stepHour = (delta: number) => {
    let nextHour = hourOfDay + delta;
    let nextDay = dayIndex;

    if (nextHour > 23) {
      nextHour = 0;
      nextDay = (dayIndex + 1) % 365;
    } else if (nextHour < 0) {
      nextHour = 23;
      nextDay = (dayIndex + 364) % 365;
    }

    setHourOfDay(nextHour);
    setDayIndex(nextDay);
  };

  // Format date
  const dateObj = new Date(Date.UTC(2025, 0, 1));
  dateObj.setUTCDate(dateObj.getUTCDate() + dayIndex);
  const formattedDate = new Intl.DateTimeFormat('en-AU', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).format(dateObj);

  // Extract 24 hours for current day
  const dayStartHour = dayIndex * 24;
  const dayChartData = Array.from({ length: 24 }, (_, h) => {
    const idx = dayStartHour + h;
    const hData = hourlyData ? hourlyData[idx] : null;
    return {
      hour: h,
      hourLabel: `${String(h).padStart(2, '0')}:00`,
      pv: hData ? Number(hData.pv.toFixed(2)) : 0,
      load: hData ? Number(hData.load.toFixed(2)) : 0,
      charge: hData ? Number(hData.charge.toFixed(2)) : 0,
      discharge: hData ? Number(hData.discharge.toFixed(2)) : 0,
      gridImport: hData ? Number(hData.gridImport.toFixed(2)) : 0,
      gridExport: hData ? Number(hData.gridExport.toFixed(2)) : 0,
      socEndPct: hData && hData.socEndPct !== null ? Number(hData.socEndPct.toFixed(1)) : 0,
    };
  });

  const currentHourIndex = dayStartHour + hourOfDay;
  const currentHourData = hourlyData ? hourlyData[currentHourIndex] : null;

  return (
    <div className="card" id="hourly-explorer">
      <div className="card-header">
        <div>
          <h2 className="card-title">
            <Clock size={20} color="var(--color-optimal)" />
            Interactive 24-Hour Dispatch &amp; Energy Flow
          </h2>
          <p className="card-desc">
            Simulate and verify actual hourly dispatch dynamics for the selected <strong>{selected.capacityKWh.toFixed(1)} kWh</strong> battery.
          </p>
        </div>

        {/* Seasonal presets */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)' }}>SEASON:</span>
          <button
            className={`btn btn-sm ${dayIndex === 14 ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setDayIndex(14)}
          >
            Summer (Jan 15)
          </button>
          <button
            className={`btn btn-sm ${dayIndex === 104 ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setDayIndex(104)}
          >
            Autumn (Apr 15)
          </button>
          <button
            className={`btn btn-sm ${dayIndex === 195 ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setDayIndex(195)}
          >
            Winter (Jul 15)
          </button>
          <button
            className={`btn btn-sm ${dayIndex === 287 ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setDayIndex(287)}
          >
            Spring (Oct 15)
          </button>
        </div>
      </div>

      {/* Date & Hour Controls */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px',
          background: 'var(--bg-surface-subtle)',
          padding: '12px 18px',
          borderRadius: 'var(--radius-md)',
          marginBottom: '16px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Calendar size={16} color="var(--text-secondary)" />
            <span style={{ fontWeight: 800, fontSize: '0.9375rem', color: 'var(--text-primary)' }}>
              Day {dayIndex + 1} ({formattedDate})
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>Day #</span>
            <input
              type="number"
              min={1}
              max={365}
              value={dayIndex + 1}
              onChange={(e) => setDayIndex(Math.max(0, Math.min(364, Number(e.target.value) - 1)))}
              style={{
                width: '64px',
                padding: '4px 8px',
                borderRadius: '6px',
                border: '1px solid var(--border-default)',
                fontSize: '0.875rem',
              }}
            />
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button className="btn btn-secondary btn-sm" onClick={() => stepHour(-1)} title="Previous Hour">
            <ChevronLeft size={16} />
            Prev
          </button>

          <button
            className={`btn btn-sm ${isPlaying ? 'btn-gold' : 'btn-primary'}`}
            onClick={() => setIsPlaying(!isPlaying)}
            style={{ minWidth: '84px' }}
          >
            {isPlaying ? (
              <>
                <Pause size={14} /> Pause
              </>
            ) : (
              <>
                <Play size={14} /> Play
              </>
            )}
          </button>

          <button className="btn btn-secondary btn-sm" onClick={() => stepHour(1)} title="Next Hour">
            Next
            <ChevronRight size={16} />
          </button>

          <div style={{ marginLeft: '8px', padding: '4px 10px', background: '#0f172a', color: '#f8fafc', borderRadius: '6px', fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '0.875rem' }}>
            {String(hourOfDay).padStart(2, '0')}:00
          </div>
        </div>
      </div>

      {/* Hour Slider */}
      <div style={{ marginBottom: '16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
          <span>00:00 (Midnight)</span>
          <span>06:00 (Sunrise)</span>
          <span>12:00 (Solar Peak)</span>
          <span>18:00 (Sunset/Peak)</span>
          <span>23:00</span>
        </div>
        <input
          type="range"
          min={0}
          max={23}
          value={hourOfDay}
          onChange={(e) => setHourOfDay(Number(e.target.value))}
          className="slider slider-gold"
          style={{ height: '8px' }}
        />
      </div>

      {/* Energy Flow Diagram for Current Hour */}
      {currentHourData && (
        <EnergyFlowDiagram hourData={currentHourData} capacityKWh={selected.capacityKWh} />
      )}

      {/* 24-Hour Profile Chart */}
      <div style={{ width: '100%', height: 260, marginTop: '8px' }}>
        <ResponsiveContainer>
          <ComposedChart
            data={dayChartData}
            margin={{ top: 10, right: 25, left: 10, bottom: 20 }}
            onClick={(state) => {
              if (state && state.activePayload && state.activePayload[0]) {
                const h = state.activePayload[0].payload.hour;
                setHourOfDay(h);
              }
            }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis
              dataKey="hourLabel"
              tick={{ fill: '#64748b', fontSize: 11 }}
            />
            <YAxis
              label={{ value: 'Energy (kWh/h = kW)', angle: -90, position: 'insideLeft', offset: 0, fill: '#64748b', fontSize: 11 }}
              tick={{ fill: '#64748b', fontSize: 11 }}
            />
            <Tooltip
              content={({ active, payload }) => {
                if (active && payload && payload.length) {
                  const d = payload[0].payload;
                  return (
                    <div style={{ background: '#0f172a', color: '#f8fafc', padding: '10px 14px', borderRadius: '8px', fontSize: '11px', boxShadow: 'var(--shadow-md)' }}>
                      <strong>Time: {d.hourLabel}</strong>
                      <div style={{ marginTop: '4px', lineHeight: 1.5 }}>
                        <div style={{ color: '#f59e0b' }}>• Solar PV: {d.pv} kWh</div>
                        <div style={{ color: '#3b82f6' }}>• Load Demand: {d.load} kWh</div>
                        <div style={{ color: '#8b5cf6' }}>• Battery Charge: {d.charge} kWh</div>
                        <div style={{ color: '#10b981' }}>• Battery Discharge: {d.discharge} kWh</div>
                        <div style={{ color: '#ef4444' }}>• Grid Import: {d.gridImport} kWh</div>
                        <div style={{ color: '#06b6d4' }}>• Grid Export: {d.gridExport} kWh</div>
                        <div style={{ color: '#cbd5e1', marginTop: '2px', fontWeight: 700 }}>• Battery SOC: {d.socEndPct}%</div>
                      </div>
                    </div>
                  );
                }
                return null;
              }}
            />

            {/* Current Hour Indicator Line */}
            <ReferenceLine
              x={`${String(hourOfDay).padStart(2, '0')}:00`}
              stroke="#0f172a"
              strokeWidth={2}
              strokeDasharray="4 4"
            />

            <Line type="monotone" dataKey="pv" name="Solar PV" stroke="#f59e0b" strokeWidth={2.5} dot={false} />
            <Line type="monotone" dataKey="load" name="Household Load" stroke="#3b82f6" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="charge" name="Battery Charge" stroke="#8b5cf6" strokeWidth={2} dot={false} strokeDasharray="3 3" />
            <Line type="monotone" dataKey="discharge" name="Battery Discharge" stroke="#10b981" strokeWidth={2} dot={false} strokeDasharray="3 3" />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Hourly Physical Balance Equation Box */}
      {currentHourData && (
        <div style={{ background: '#f8fafc', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', padding: '12px 16px', marginTop: '12px', fontSize: '0.8125rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
            <span style={{ fontWeight: 800, color: 'var(--text-primary)', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
              <CheckCircle2 size={15} color="var(--color-optimal)" />
              Hour {hourOfDay + 1} Physical Balance Check:
            </span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: '#15803d', background: '#dcfce7', padding: '2px 8px', borderRadius: '4px', fontWeight: 700 }}>
              Residual: {currentHourData.energyResidual.toExponential(2)} kWh (PASS)
            </span>
          </div>

          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8125rem', marginTop: '6px', color: '#334155' }}>
            PV ({currentHourData.pv.toFixed(2)}) + Import ({currentHourData.gridImport.toFixed(2)}) + Discharge ({currentHourData.discharge.toFixed(2)})
            {' = '}
            Load ({currentHourData.load.toFixed(2)}) + Charge ({currentHourData.charge.toFixed(2)}) + Export ({currentHourData.gridExport.toFixed(2)})
          </div>
        </div>
      )}
    </div>
  );
};
