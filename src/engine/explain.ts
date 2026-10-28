import { Inputs, Series, ProductEvaluation } from './types';
import { COMMERCIAL_PRODUCTS, BatteryProduct } from '../config/products';
import { evaluateProduct } from './model';

export interface DecisionSensitivity {
  label: string;
  condition: string;
  npvAUD: number;
  deltaNPVAUD: number;
  viable: boolean;
}

export interface DecisionAnalysis {
  bestProduct: ProductEvaluation;
  isSolarOnlyCheaper: boolean;
  isCloseCall: boolean;
  closeCallThresholdAUD: number;

  // 1. NPV over chosen life, 10y, 15y
  npvChosenLifeAUD: number;
  chosenLifeYears: number;
  npv10YearsAUD: number;
  npv15YearsAUD: number;

  // 2. Value per kWh cycled
  avgImportTariff: number;
  avgFeedInTariff: number;
  eta_c: number;
  eta_d: number;
  avoidedImportPerKWh: number;
  lostExportPerKWh: number;
  valuePerKWhCycled: number;

  // 3. Year-1 bill saving, capex, subsidy
  year1BillSavingAUD: number;
  grossCapexAUD: number;
  subsidyAUD: number;
  netCapexAUD: number;

  // 4. Break-even installed price
  breakEvenGrossAUD: number;
  breakEvenPercentCut: number; // e.g. 18% lower

  // 5. Discounted payback year
  discountedPaybackYear: number | null;
  paybackText: string;

  // 6. Sensitivities: "What would change the answer"
  sensitivities: DecisionSensitivity[];

  // 8. Plain language text
  explanationText: string;
  wordingRuleText: string;
}

/**
 * Generates plain-language reason for a battery decision matching battery_model.py explain().
 */
export function explain(
  result: {
    npv: number;
    saving_y1: number;
    net_capex: number;
    subsidy: number;
    gross_capex: number;
    break_even_gross: number;
    discounted_payback_year: number | null;
  },
  name: string,
  _usable_kwh: number,
  avg_t_imp: number,
  avg_t_fit: number,
  eta_c = 0.95,
  eta_d = 0.95
): string {
  const gain_per_kwh = eta_d * avg_t_imp - avg_t_fit / eta_c;
  const lines: string[] = [];
  lines.push(`${name}: NPV ${result.npv >= 0 ? '+' : ''}${Math.round(result.npv).toLocaleString()} AUD over the chosen life.`);
  lines.push(
    `Each kWh moved through the battery earns about ${gain_per_kwh.toFixed(3)} AUD (avoided import ${(eta_d * avg_t_imp).toFixed(3)} minus lost export income ${(avg_t_fit / eta_c).toFixed(3)}).`
  );
  lines.push(
    `Year-1 bill saving ${Math.round(result.saving_y1).toLocaleString()} AUD; net price after subsidy ${Math.round(result.net_capex).toLocaleString()} AUD (subsidy ${Math.round(result.subsidy).toLocaleString()}).`
  );

  if (result.npv < 0 && result.gross_capex > 0) {
    const cut = 100 * (1 - result.break_even_gross / result.gross_capex);
    lines.push(
      `It would break even if the installed price were ${Math.round(result.break_even_gross).toLocaleString()} AUD (${cut.toFixed(0)}% lower).`
    );
  }

  const dpb = result.discounted_payback_year;
  lines.push(dpb ? `Pays back (discounted) in year ${dpb}.` : 'Does not pay back within 30 years.');
  return lines.join(' ');
}

/**
 * Analyzes the best battery product vs no-battery baseline with full sensitivities and metrics.
 */
export function analyzeDecision(
  bestProduct: ProductEvaluation,
  inputs: Inputs,
  series: Series,
  baseGridCost: number
): DecisionAnalysis {
  // Find underlying product specs
  const rawProduct: BatteryProduct = COMMERCIAL_PRODUCTS.find(p => p.id === bestProduct.id) || {
    id: bestProduct.id,
    name: bestProduct.name,
    manufacturer: bestProduct.manufacturer,
    usableKWh: bestProduct.usableKWh,
    powerKW: bestProduct.powerKW,
    installedPriceAUD: bestProduct.installedPriceAUD,
    efficiencyRoundTrip: 0.9025,
    warrantyYears: 10,
    source: 'Synthetic / Candidate Model',
    lastVerifiedDate: '2026-10-27',
  };

  const eff = Math.sqrt(rawProduct.efficiencyRoundTrip || 0.90);
  const eta_c = eff;
  const eta_d = eff;

  const avgImport = inputs.importAUDPerKWh;
  const avgFiT = inputs.feedInAUDPerKWh;
  const avoidedImport = eta_d * avgImport;
  const lostExport = avgFiT / eta_c;
  const valuePerKWh = avoidedImport - lostExport;

  const chosenLife = inputs.lifeYears;
  const npvChosen = bestProduct.lifetimeNPVAUD;

  // Evaluate at 10 years and 15 years
  const inputs10 = { ...inputs, lifeYears: 10 };
  const eval10 = evaluateProduct(rawProduct, inputs10, series, baseGridCost);

  const inputs15 = { ...inputs, lifeYears: 15 };
  const eval15 = evaluateProduct(rawProduct, inputs15, series, baseGridCost);

  // Close call check: |NPV| <= 5% of net capex
  const netCapex = bestProduct.netCapexAUD;
  const closeCallThreshold = 0.05 * Math.max(netCapex, 1000);
  const isCloseCall = Math.abs(npvChosen) <= closeCallThreshold;

  const isSolarOnlyCheaper = npvChosen <= 0;

  // Break even cut percentage
  const grossCapex = bestProduct.installedPriceAUD;
  const breakEvenGross = bestProduct.breakEvenGrossAUD;
  const breakEvenPercentCut = grossCapex > 0 ? 100 * (1 - breakEvenGross / grossCapex) : 0;

  // Payback text
  const dpb = bestProduct.discountedPaybackYear;
  const paybackText = dpb !== null ? `Year ${dpb}` : 'Does not pay back within 30 years';

  // "What would change the answer": evaluate with one parameter modified
  // 1. Lifetime 15 years
  const npvLife15 = eval15.lifetimeNPVAUD;

  // 2. Feed-in tariff -50%
  const inputsFiT50 = { ...inputs, feedInAUDPerKWh: inputs.feedInAUDPerKWh * 0.5 };
  const evalFiT50 = evaluateProduct(rawProduct, inputsFiT50, series, baseGridCost);

  // 3. Import tariff +20%
  const inputsImp20 = { ...inputs, importAUDPerKWh: inputs.importAUDPerKWh * 1.2 };
  const evalImp20 = evaluateProduct(rawProduct, inputsImp20, series, baseGridCost);

  // 4. Price -20%
  const prodPrice20: BatteryProduct = { ...rawProduct, installedPriceAUD: rawProduct.installedPriceAUD * 0.8 };
  const evalPrice20 = evaluateProduct(prodPrice20, inputs, series, baseGridCost);

  const sensitivities: DecisionSensitivity[] = [
    {
      label: 'Longer Lifetime',
      condition: '15-year life (vs chosen)',
      npvAUD: npvLife15,
      deltaNPVAUD: npvLife15 - npvChosen,
      viable: npvLife15 > 0,
    },
    {
      label: 'Feed-in Tariff Drop',
      condition: 'FiT -50% ($' + (inputs.feedInAUDPerKWh * 0.5).toFixed(3) + '/kWh)',
      npvAUD: evalFiT50.lifetimeNPVAUD,
      deltaNPVAUD: evalFiT50.lifetimeNPVAUD - npvChosen,
      viable: evalFiT50.lifetimeNPVAUD > 0,
    },
    {
      label: 'Import Tariff Rise',
      condition: 'Import +20% ($' + (inputs.importAUDPerKWh * 1.2).toFixed(3) + '/kWh)',
      npvAUD: evalImp20.lifetimeNPVAUD,
      deltaNPVAUD: evalImp20.lifetimeNPVAUD - npvChosen,
      viable: evalImp20.lifetimeNPVAUD > 0,
    },
    {
      label: 'Lower Battery Price',
      condition: 'Turnkey price -20% ($' + Math.round(rawProduct.installedPriceAUD * 0.8).toLocaleString() + ')',
      npvAUD: evalPrice20.lifetimeNPVAUD,
      deltaNPVAUD: evalPrice20.lifetimeNPVAUD - npvChosen,
      viable: evalPrice20.lifetimeNPVAUD > 0,
    },
  ];

  // Plain language text matching battery_model.py
  const explanationText = explain(
    {
      npv: npvChosen,
      saving_y1: bestProduct.year1BillSavingsAUD,
      net_capex: netCapex,
      subsidy: bestProduct.subsidyAUD,
      gross_capex: grossCapex,
      break_even_gross: breakEvenGross,
      discounted_payback_year: dpb,
    },
    bestProduct.name,
    bestProduct.usableKWh,
    avgImport,
    avgFiT,
    eta_c,
    eta_d
  );

  // Wording rule: say "Solar only is cheaper under these inputs because ...", never just "go solar only"
  let wordingRuleText: string;
  if (isSolarOnlyCheaper) {
    wordingRuleText = `Solar only is cheaper under these inputs because each kWh cycled through the battery earns $${valuePerKWh.toFixed(3)} AUD (avoiding $${avoidedImport.toFixed(3)} import but forfeiting $${lostExport.toFixed(3)} export credit), producing ~$${Math.round(bestProduct.year1BillSavingsAUD).toLocaleString()} in first-year bill savings. Against a net capital cost of $${Math.round(netCapex).toLocaleString()} AUD, the investment yields an NPV of -$${Math.round(Math.abs(npvChosen)).toLocaleString()} AUD over ${chosenLife} years. The battery would break even if its installed price were $${Math.round(breakEvenGross).toLocaleString()} AUD (${breakEvenPercentCut.toFixed(0)}% lower), or if grid import tariffs rise.`;
  } else {
    wordingRuleText = `A residential battery is financially attractive under these inputs: ${bestProduct.name} delivers +$${Math.round(npvChosen).toLocaleString()} AUD in lifetime NPV over ${chosenLife} years, earning $${valuePerKWh.toFixed(3)} AUD per usable kWh cycled. First-year bill savings of $${Math.round(bestProduct.year1BillSavingsAUD).toLocaleString()} AUD recover the net price of $${Math.round(netCapex).toLocaleString()} AUD (after $${Math.round(bestProduct.subsidyAUD).toLocaleString()} AUD subsidy) with discounted payback in ${paybackText}.`;
  }

  return {
    bestProduct,
    isSolarOnlyCheaper,
    isCloseCall,
    closeCallThresholdAUD: closeCallThreshold,
    npvChosenLifeAUD: npvChosen,
    chosenLifeYears: chosenLife,
    npv10YearsAUD: eval10.lifetimeNPVAUD,
    npv15YearsAUD: eval15.lifetimeNPVAUD,
    avgImportTariff: avgImport,
    avgFeedInTariff: avgFiT,
    eta_c,
    eta_d,
    avoidedImportPerKWh: avoidedImport,
    lostExportPerKWh: lostExport,
    valuePerKWhCycled: valuePerKWh,
    year1BillSavingAUD: bestProduct.year1BillSavingsAUD,
    grossCapexAUD: grossCapex,
    subsidyAUD: bestProduct.subsidyAUD,
    netCapexAUD: netCapex,
    breakEvenGrossAUD: breakEvenGross,
    breakEvenPercentCut: breakEvenPercentCut,
    discountedPaybackYear: dpb,
    paybackText,
    sensitivities,
    explanationText,
    wordingRuleText,
  };
}
