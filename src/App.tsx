import React, { useState, useMemo, useEffect } from 'react';
import { Inputs, EvaluationOutput, ProfileMetadata } from './engine/types';
import { evaluateAll } from './engine/model';
import { DEFAULT_PV, DEFAULT_LOAD } from './data/defaultProfile';
import { generateCapacityComparisonCSV, generateHourlyTraceCSV, exportAssumptionsJSON, downloadCSV, ImportedProfile } from './engine/csv';
import { runFullVerificationSuite } from './engine/verification';
import { computeTariffSensitivityMatrix } from './engine/sensitivity';

import { CheckCircle2, AlertCircle } from 'lucide-react';
import { Header, ActiveTab } from './components/Header';
import { ParametersPanel } from './components/ParametersPanel';
import { MathematicalPrincipleCard } from './components/MathematicalPrincipleCard';
import { RecommendationCard } from './components/RecommendationCard';
import { SelectionFocusCard } from './components/SelectionFocusCard';
import { CommercialAdvisor } from './components/CommercialAdvisor';
import { CostCurveChart } from './components/CostCurveChart';
import { SensitivityMatrixTool } from './components/SensitivityMatrixTool';
import { ScenarioSensitivityTool } from './components/ScenarioSensitivityTool';
import { CapacityComparisonTable } from './components/CapacityComparisonTable';
import { HourlyExplorer } from './components/HourlyExplorer';
import { DispatchComparisonTool } from './components/DispatchComparisonTool';
import { AnnualAccounting } from './components/AnnualAccounting';
import { VerificationTool } from './components/VerificationTool';
import { CSVUploadModal } from './components/CSVUploadModal';
import { ResearchNotes } from './components/ResearchNotes';
import { sanityCheckInputs, InputSanityWarning } from './engine/validation';
import { SanityWarningsBanner } from './components/SanityWarningsBanner';

const DEFAULTS: Inputs = {
  selectedBatteryKWh: 0, // Defaults to the economic optimum (0 kWh Solar-Only under report baseline)
  pvKW: 6.6,
  pvReferenceKW: 6.6,
  demandMultiplier: 1.0,
  importAUDPerKWh: 0.35,
  feedInAUDPerKWh: 0.05,
  variableCapexAUDPerKWh: 700,
  fixedCapexAUD: 1000,
  hypotheticalDiscountPct: 30,
  efficiencyPct: 95,
  cRate: 0.5,
  socMinPct: 10,
  socMaxPct: 95,
  annualDiscountRatePct: 6,
  lifeYears: 10,
  annualOMPercentGross: 1.0,
  useCheaperHomeBatteriesProgram: true,
  installDate: '2026-11-01',
  stcPriceAUD: 37.0,
  subsidyEligible: true,
};

export const App: React.FC = () => {
  const [inputs, setInputs] = useState<Inputs>(DEFAULTS);
  const [preset, setPreset] = useState<string>('report');
  const [activeTab, setActiveTab] = useState<ActiveTab>('optimal-sizer');
  const [autoFollowOptimal, setAutoFollowOptimal] = useState<boolean>(true);

  const [profile, setProfile] = useState<{
    pv: readonly number[];
    load: readonly number[];
    metadata: ProfileMetadata;
  }>({
    pv: DEFAULT_PV,
    load: DEFAULT_LOAD,
    metadata: {
      source: 'illustration',
      referencePVkW: 6.6,
    },
  });

  const [isUploadOpen, setIsUploadOpen] = useState<boolean>(false);
  const [actionToast, setActionToast] = useState<string | null>(null);
  const [confirmedBlockingWarnings, setConfirmedBlockingWarnings] = useState<boolean>(false);

  // Sanity check inputs right after loading data / parameter changes (Part B)
  const sanityWarnings = useMemo<InputSanityWarning[]>(() => {
    return sanityCheckInputs(inputs.importAUDPerKWh, inputs.feedInAUDPerKWh, profile.pv, profile.load);
  }, [inputs.importAUDPerKWh, inputs.feedInAUDPerKWh, profile.pv, profile.load]);

  const hasUnconfirmedBlocking = useMemo(() => {
    return sanityWarnings.some(w => w.isBlocking) && !confirmedBlockingWarnings;
  }, [sanityWarnings, confirmedBlockingWarnings]);

  const handleFixTariffCents = () => {
    setInputs(prev => ({
      ...prev,
      importAUDPerKWh: prev.importAUDPerKWh > 2.0 ? prev.importAUDPerKWh / 100 : prev.importAUDPerKWh,
      feedInAUDPerKWh: prev.feedInAUDPerKWh > 2.0 ? prev.feedInAUDPerKWh / 100 : prev.feedInAUDPerKWh,
    }));
    setConfirmedBlockingWarnings(true);
    setActionToast('Converted tariffs from cents to AUD/kWh');
  };

  const handleFixFiT = () => {
    setInputs(prev => ({
      ...prev,
      feedInAUDPerKWh: Math.min(0.05, Number((prev.importAUDPerKWh * 0.2).toFixed(4))),
    }));
    setConfirmedBlockingWarnings(true);
    setActionToast('Reset feed-in tariff to standard export rate');
  };

  useEffect(() => {
    if (actionToast) {
      const timer = setTimeout(() => setActionToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [actionToast]);

  // Evaluate simulation model
  const evaluationResult = useMemo<{ ok: true; data: EvaluationOutput } | { ok: false; error: string }>(() => {
    try {
      const data = evaluateAll(inputs, profile.pv, profile.load);
      return { ok: true, data };
    } catch (err: any) {
      return { ok: false, error: err.message || 'Unknown simulation error' };
    }
  }, [inputs, profile]);

  // Keep selected battery auto-following the optimal recommendation unless user chooses manual what-if
  useEffect(() => {
    if (autoFollowOptimal && evaluationResult.ok) {
      const optCap = evaluationResult.data.economicOptimal.capacityKWh;
      if (Math.abs(inputs.selectedBatteryKWh - optCap) > 1e-6) {
        setInputs(prev => ({ ...prev, selectedBatteryKWh: optCap }));
      }
    }
  }, [autoFollowOptimal, evaluationResult]);

  // Software Verification Suite Output (Section 6.3 of Report)
  const verificationOutput = useMemo(() => {
    if (!evaluationResult.ok) return null;
    return runFullVerificationSuite(
      inputs,
      evaluationResult.data.series,
      evaluationResult.data.baseline,
      evaluationResult.data.bestPositive
    );
  }, [inputs, evaluationResult]);

  // Tariff Sensitivity Matrix (Section 7.3 & Figure 5 of Report)
  const sensitivityMatrix = useMemo(() => {
    if (!evaluationResult.ok) return null;
    return computeTariffSensitivityMatrix(evaluationResult.data.results);
  }, [evaluationResult]);

  // Handle Preset Changes
  const handlePresetChange = (presetKey: string) => {
    setPreset(presetKey);
    if (presetKey === 'report') {
      setInputs(DEFAULTS);
    } else if (presetKey === 'higher') {
      setInputs(prev => ({
        ...prev,
        importAUDPerKWh: 0.65,
        feedInAUDPerKWh: 0.03,
      }));
    } else if (presetKey === 'lowcost') {
      setInputs(prev => ({
        ...prev,
        variableCapexAUDPerKWh: 300,
        fixedCapexAUD: 400,
        hypotheticalDiscountPct: 50,
      }));
    }
  };

  const handleInputsChange = (newInputs: Inputs) => {
    setInputs(newInputs);
    setPreset('custom');
  };

  const handleSelectCapacity = (kwh: number) => {
    setAutoFollowOptimal(false);
    setInputs(prev => ({ ...prev, selectedBatteryKWh: kwh }));
    setActionToast(`Active simulation set to ${kwh.toFixed(1)} kWh what-if capacity`);
  };

  const handleSelectBest = () => {
    if (evaluationResult.ok) {
      setAutoFollowOptimal(true);
      const optCap = evaluationResult.data.economicOptimal.capacityKWh;
      setInputs(prev => ({ ...prev, selectedBatteryKWh: optCap }));
      setActionToast(`Restored ${optCap.toFixed(1)} kWh optimal recommendation`);
    }
  };

  const handleApplyTariff = (tImport: number, tFit: number) => {
    setInputs(prev => ({
      ...prev,
      importAUDPerKWh: tImport,
      feedInAUDPerKWh: tFit,
    }));
    setPreset('custom');
  };

  const handleApplyScenario = (pvKW: number, demandMult: number) => {
    setInputs(prev => ({
      ...prev,
      pvKW,
      demandMultiplier: demandMult,
    }));
    setPreset('custom');
  };

  const handleReset = () => {
    setInputs(DEFAULTS);
    setPreset('report');
    setAutoFollowOptimal(true);
    setConfirmedBlockingWarnings(false);
  };

  const handleUploadSuccess = (imported: ImportedProfile, refPV: number) => {
    setProfile({
      pv: imported.pv,
      load: imported.load,
      metadata: {
        source: 'uploaded',
        filename: imported.filename,
        referencePVkW: refPV,
      },
    });
    setInputs(prev => ({ ...prev, pvReferenceKW: refPV }));
    setConfirmedBlockingWarnings(false);
  };

  const handleUseDefault = () => {
    setProfile({
      pv: DEFAULT_PV,
      load: DEFAULT_LOAD,
      metadata: {
        source: 'illustration',
        referencePVkW: 6.6,
      },
    });
    setInputs(prev => ({ ...prev, pvReferenceKW: 6.6 }));
    setConfirmedBlockingWarnings(false);
  };

  const handleDownloadSample = () => {
    const rows = [
      ['pv_generation_kwh', 'household_load_kwh'],
      ...Array.from({ length: 8760 }, (_, i) => [
        DEFAULT_PV[i].toFixed(6),
        DEFAULT_LOAD[i].toFixed(6),
      ]),
    ];
    downloadCSV('example_8760_hours_illustrative.csv', rows);
  };

  const handleExportComparison = () => {
    if (evaluationResult.ok) {
      generateCapacityComparisonCSV(
        evaluationResult.data.results,
        profile.metadata.source === 'illustration' ? 'illustrative_reconstruction' : (profile.metadata.filename || 'uploaded')
      );
    }
  };

  const handleExportHourly = () => {
    if (evaluationResult.ok && evaluationResult.data.selected.hourly) {
      generateHourlyTraceCSV(
        evaluationResult.data.selected.hourly,
        evaluationResult.data.selected.capacityKWh
      );
    }
  };

  const handleExportAssumptions = () => {
    if (evaluationResult.ok) {
      exportAssumptionsJSON(inputs, {
        source: profile.metadata.source === 'illustration' ? 'Illustrative reconstructed profile' : 'User uploaded CSV',
        filename: profile.metadata.filename,
        selectedBatteryKWh: evaluationResult.data.selected.capacityKWh,
        economicOptimalKWh: evaluationResult.data.economicOptimal.capacityKWh,
        optimalCostAUD: evaluationResult.data.economicOptimal.totalAnnualCostAUD,
        baselineCostAUD: evaluationResult.data.baseline.totalAnnualCostAUD,
      });
    }
  };

  const checksPass = verificationOutput ? verificationOutput.allPassed : false;
  const isSelectedDifferentFromOptimal = evaluationResult.ok &&
    Math.abs(evaluationResult.data.selected.capacityKWh - evaluationResult.data.economicOptimal.capacityKWh) > 1e-6;

  return (
    <div className="app-container">
      {/* Parameter Controls Sidebar */}
      <ParametersPanel
        inputs={inputs}
        onChange={handleInputsChange}
        preset={preset}
        onPresetChange={handlePresetChange}
        baseline={evaluationResult.ok ? evaluationResult.data.baseline : { capacityKWh: 0, totalAnnualCostAUD: 695.65 } as any}
        economicOptimal={evaluationResult.ok ? evaluationResult.data.economicOptimal : { capacityKWh: 0, totalAnnualCostAUD: 695.65 } as any}
        bestPositive={evaluationResult.ok ? evaluationResult.data.bestPositive : { capacityKWh: 7.5, totalAnnualCostAUD: 707.72 } as any}
        autoFollowOptimal={autoFollowOptimal}
        onToggleAutoFollow={setAutoFollowOptimal}
      />

      {/* Main Analysis Dashboard */}
      <main className="main-content">
        <Header
          metadata={profile.metadata}
          onReset={handleReset}
          onOpenUpload={() => setIsUploadOpen(true)}
          onExportComparison={handleExportComparison}
          onExportHourly={handleExportHourly}
          onExportAssumptionsJSON={handleExportAssumptions}
          onDownloadSample={handleDownloadSample}
          checksPass={checksPass}
          activeTab={activeTab}
          onSelectTab={setActiveTab}
        />

        {/* Real-time simulation feedback toast */}
        {actionToast && (
          <div
            style={{
              background: '#0f172a',
              color: '#f8fafc',
              padding: '8px 18px',
              borderRadius: '9999px',
              fontSize: '0.8125rem',
              fontWeight: 600,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              alignSelf: 'flex-start',
              boxShadow: 'var(--shadow-md)',
              animation: 'fadeIn 0.2s ease-in-out',
            }}
          >
            <CheckCircle2 size={16} color="#5eead4" />
            <span>{actionToast}</span>
            <span style={{ fontSize: '0.6875rem', color: '#94a3b8' }}>• 8,760h simulated</span>
          </div>
        )}

        {/* Global Error Banner */}
        {!evaluationResult.ok && (
          <div className="callout callout-error" style={{ fontSize: '1rem', padding: '16px 20px' }}>
            <strong>CALCULATION / INPUT ERROR:</strong> {evaluationResult.error}
            <div style={{ marginTop: '6px', fontSize: '0.875rem' }}>
              Please correct the highlighted inputs in the sidebar.
            </div>
          </div>
        )}

        {/* Sanity Check Warnings (Part B) */}
        <SanityWarningsBanner
          warnings={sanityWarnings}
          isBlockingConfirmed={confirmedBlockingWarnings}
          onConfirmBlocking={() => setConfirmedBlockingWarnings(true)}
          onFixTariffCents={handleFixTariffCents}
          onFixFiT={handleFixFiT}
        />

        {hasUnconfirmedBlocking && (
          <div
            className="card"
            style={{
              padding: '36px',
              textAlign: 'center',
              margin: '20px 0',
              border: '2px dashed #fca5a5',
              background: '#fff5f5',
            }}
          >
            <h3 style={{ color: '#b91c1c', marginBottom: '8px', fontSize: '1.25rem' }}>
              Simulation Results Suspended
            </h3>
            <p style={{ color: '#7f1d1d', maxWidth: '620px', margin: '0 auto 16px auto', fontSize: '0.9375rem', lineHeight: 1.5 }}>
              Blocking input warnings were detected above (e.g. tariffs entered in cents or feed-in tariff exceeding import tariff).
              Please confirm the unusual assumptions or use the auto-fix button above to resume calculation.
            </p>
          </div>
        )}

        {evaluationResult.ok && !hasUnconfirmedBlocking && (
          <>
            {/* TAB 1: OPTIMAL SIZING & DECISION AID */}
            {activeTab === 'optimal-sizer' && (
              <>
                {profile.metadata.source === 'illustration' && (
                  <div
                    style={{
                      background: '#fffbeb',
                      border: '1px solid #fef3c7',
                      borderLeft: '4px solid #f59e0b',
                      borderRadius: '8px',
                      padding: '12px 16px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      flexWrap: 'wrap',
                      gap: '10px',
                      fontSize: '0.875rem',
                      color: '#92400e',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <AlertCircle size={18} color="#d97706" />
                      <span>
                        <strong>Illustrative result - based on example data and assumptions.</strong> Upload your household interval smart-meter CSV data to obtain tailored sizing recommendations.
                      </span>
                    </div>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      style={{ fontSize: '0.75rem', padding: '4px 10px' }}
                      onClick={() => setIsUploadOpen(true)}
                    >
                      Upload Real Data CSV
                    </button>
                  </div>
                )}

                <MathematicalPrincipleCard
                  baseline={evaluationResult.data.baseline}
                  bestPositive={evaluationResult.data.bestPositive}
                  results={evaluationResult.data.results}
                />

                <RecommendationCard
                  baseline={evaluationResult.data.baseline}
                  economicOptimal={evaluationResult.data.economicOptimal}
                  bestPositive={evaluationResult.data.bestPositive}
                  selected={evaluationResult.data.selected}
                  bestProduct={evaluationResult.data.bestProductByNPV}
                  inputs={inputs}
                  series={evaluationResult.data.series}
                  isIllustrative={profile.metadata.source === 'illustration'}
                  onSelectCapacity={handleSelectCapacity}
                />

                {isSelectedDifferentFromOptimal && (
                  <SelectionFocusCard
                    selected={evaluationResult.data.selected}
                    economicOptimal={evaluationResult.data.economicOptimal}
                    bestPositive={evaluationResult.data.bestPositive}
                    baseline={evaluationResult.data.baseline}
                    onSelectBest={handleSelectBest}
                  />
                )}

                <CommercialAdvisor
                  economicOptimal={evaluationResult.data.economicOptimal}
                  bestPositive={evaluationResult.data.bestPositive}
                  selectedResult={evaluationResult.data.selected}
                  inputs={inputs}
                  results={evaluationResult.data.results}
                  productRankings={evaluationResult.data.productRankings}
                  onSelectCapacity={handleSelectCapacity}
                  onUpdateLifetime={(years) => setInputs(prev => ({ ...prev, lifeYears: years }))}
                />

                <CostCurveChart
                  results={evaluationResult.data.results}
                  baseline={evaluationResult.data.baseline}
                  economicOptimal={evaluationResult.data.economicOptimal}
                  bestPositive={evaluationResult.data.bestPositive}
                  selected={evaluationResult.data.selected}
                  onSelectCapacity={handleSelectCapacity}
                />

                <CapacityComparisonTable
                  results={evaluationResult.data.results}
                  economicOptimal={evaluationResult.data.economicOptimal}
                  bestPositive={evaluationResult.data.bestPositive}
                  selected={evaluationResult.data.selected}
                  onSelectCapacity={handleSelectCapacity}
                />
              </>
            )}

            {/* TAB 2: FORMAL SOFTWARE VERIFICATION SUITE */}
            {activeTab === 'verification' && (
              <>
                {verificationOutput && (
                  <VerificationTool
                    suiteOutput={verificationOutput}
                    selected={evaluationResult.data.selected}
                  />
                )}

                <AnnualAccounting
                  selected={evaluationResult.data.selected}
                  baseline={evaluationResult.data.baseline}
                  inputs={inputs}
                  series={evaluationResult.data.series}
                />
              </>
            )}

            {/* TAB 3: SCENARIO MATRICES & SENSITIVITY */}
            {activeTab === 'sensitivity' && (
              <>
                {sensitivityMatrix && (
                  <SensitivityMatrixTool
                    matrix={sensitivityMatrix}
                    currentImportTariff={inputs.importAUDPerKWh}
                    currentFit={inputs.feedInAUDPerKWh}
                    onApplyTariff={handleApplyTariff}
                  />
                )}

                <ScenarioSensitivityTool
                  currentInputs={inputs}
                  productRankings={evaluationResult.data.productRankings}
                  onApplyScenario={handleApplyScenario}
                />
              </>
            )}

            {/* TAB 4: 24-HOUR DISPATCH & ENERGY FLOW */}
            {activeTab === 'dispatch' && (
              <>
                <DispatchComparisonTool
                  selected={evaluationResult.data.selected}
                  inputs={inputs}
                  series={evaluationResult.data.series}
                />
                <HourlyExplorer selected={evaluationResult.data.selected} />
              </>
            )}

            {/* TAB 5: RESEARCH REPORT NOTES & IEEE REFERENCES */}
            {activeTab === 'report-notes' && (
              <ResearchNotes />
            )}
          </>
        )}
      </main>

      {/* CSV Upload Modal */}
      <CSVUploadModal
        isOpen={isUploadOpen}
        onClose={() => setIsUploadOpen(false)}
        onUploadSuccess={handleUploadSuccess}
        onUseDefault={handleUseDefault}
        currentReferencePV={inputs.pvReferenceKW}
      />
    </div>
  );
};
