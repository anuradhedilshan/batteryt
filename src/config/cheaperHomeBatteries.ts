/**
 * Australian Cheaper Home Batteries Program (Commencing 1 May 2026)
 *
 * Source: Clean Energy Regulator (CER) & Renewable Energy (Electricity) Amendment Regulations
 * Last Verified: 2026-10-27
 * Official Reference: https://rec-registry.cleanenergyregulator.gov.au/
 *
 * Program Details:
 * - Provides Small-scale Technology Certificates (STCs) for eligible residential battery systems.
 * - Minimum usable capacity: 5.0 kWh.
 * - Maximum incentivised capacity: 50.0 kWh.
 * - Tiered weighting applied to usable battery capacity:
 *   - 0 to 14 kWh: 100% weighting (1.0)
 *   - >14 to 28 kWh: 60% weighting (0.60)
 *   - >28 to 50 kWh: 15% weighting (0.15)
 *   - >50 kWh: 0% weighting
 * - STC factor declines in six-month steps from 6.8 (2026) to 2.1 (late 2030), concluding 31 Dec 2030.
 * - STCs are integer quantities (rounded down / floor).
 * - STC market price varies (typically $35–$40 per STC) and must be quoted by installer.
 */

export interface STCFactorEntry {
  startDate: string; // ISO date string YYYY-MM-DD
  factor: number;
}

export const PROGRAM_START_DATE = '2026-05-01';
export const PROGRAM_END_DATE = '2030-12-31';
export const DEFAULT_INSTALL_DATE = '2026-11-01';
export const DEFAULT_STC_PRICE_AUD = 37.0;
export const MIN_ELIGIBLE_USABLE_KWH = 5.0;
export const MAX_ELIGIBLE_USABLE_KWH = 50.0;
export const LAST_VERIFIED_DATE = '2026-10-27';
export const CER_REGULATOR_URL = 'https://rec-registry.cleanenergyregulator.gov.au/';

export const STC_FACTOR_SCHEDULE: readonly STCFactorEntry[] = [
  { startDate: '2026-05-01', factor: 6.8 },
  { startDate: '2027-01-01', factor: 5.7 },
  { startDate: '2027-07-01', factor: 5.2 },
  { startDate: '2028-01-01', factor: 4.6 },
  { startDate: '2028-07-01', factor: 4.1 },
  { startDate: '2029-01-01', factor: 3.6 },
  { startDate: '2029-07-01', factor: 3.1 },
  { startDate: '2030-01-01', factor: 2.6 },
  { startDate: '2030-07-01', factor: 2.1 },
];

/**
 * Evaluates the applicable STC factor based on the battery installation date.
 */
export function getSTCFactor(installDateStr: string): number {
  if (installDateStr < PROGRAM_START_DATE) {
    throw new Error(`Installation date ${installDateStr} is prior to program start (${PROGRAM_START_DATE}). Before 1 May 2026, old untiered rules applied.`);
  }
  if (installDateStr > PROGRAM_END_DATE) {
    return 0.0;
  }
  let f = STC_FACTOR_SCHEDULE[0].factor;
  for (const entry of STC_FACTOR_SCHEDULE) {
    if (installDateStr >= entry.startDate) {
      f = entry.factor;
    }
  }
  return f;
}

/**
 * Calculates tier-weighted usable capacity (kWh) according to Equation 16 of the model.
 * 100% up to 14 kWh; 60% from 14 to 28 kWh; 15% from 28 to 50 kWh; 0% above 50 kWh.
 */
export function tierWeightedKWh(usableKWh: number): number {
  const u = Math.min(Math.max(0, usableKWh), MAX_ELIGIBLE_USABLE_KWH);
  const tier1 = Math.min(u, 14);
  const tier2 = 0.60 * Math.min(Math.max(u - 14, 0), 14);
  const tier3 = 0.15 * Math.min(Math.max(u - 28, 0), 22);
  return tier1 + tier2 + tier3;
}

export interface SubsidyCalculationResult {
  eligible: boolean;
  ineligibleReason?: string;
  usableKWh: number;
  tierWeightedKWh: number;
  stcFactor: number;
  stcCount: number;
  stcPriceAUD: number;
  subsidyAUD: number;
}

/**
 * Computes indicative STC subsidy for an Australian residential battery.
 *
 * @param usableKWh Manufacturer rated usable battery capacity in kWh
 * @param installDateStr Installation date (YYYY-MM-DD)
 * @param stcPrice Market price per STC in AUD (from installer quote)
 * @param accreditedInstaller Whether the system is installed by an accredited installer
 * @param eligibleProduct Whether the battery is an approved product on the CER list
 * @param roundDown Whether to floor STC certificate count per CER rules (default true)
 */
export function calculateSubsidy(
  usableKWh: number,
  installDateStr: string = DEFAULT_INSTALL_DATE,
  stcPrice: number = DEFAULT_STC_PRICE_AUD,
  accreditedInstaller: boolean = true,
  eligibleProduct: boolean = true,
  roundDown: boolean = true
): SubsidyCalculationResult {
  if (usableKWh < MIN_ELIGIBLE_USABLE_KWH) {
    return {
      eligible: false,
      ineligibleReason: `Capacity ${usableKWh.toFixed(1)} kWh is below minimum threshold of ${MIN_ELIGIBLE_USABLE_KWH} kWh.`,
      usableKWh,
      tierWeightedKWh: 0,
      stcFactor: 0,
      stcCount: 0,
      stcPriceAUD: stcPrice,
      subsidyAUD: 0,
    };
  }

  if (!accreditedInstaller || !eligibleProduct) {
    return {
      eligible: false,
      ineligibleReason: !accreditedInstaller
        ? 'Installer is not CER-accredited.'
        : 'Battery hardware is not on the CER approved equipment list.',
      usableKWh,
      tierWeightedKWh: tierWeightedKWh(usableKWh),
      stcFactor: getSTCFactor(installDateStr),
      stcCount: 0,
      stcPriceAUD: stcPrice,
      subsidyAUD: 0,
    };
  }

  const factor = getSTCFactor(installDateStr);
  const weighted = tierWeightedKWh(usableKWh);
  const rawSTCs = factor * weighted;
  const stcs = roundDown ? Math.floor(rawSTCs) : rawSTCs;
  const subsidyAUD = stcs * stcPrice;

  return {
    eligible: true,
    usableKWh,
    tierWeightedKWh: weighted,
    stcFactor: factor,
    stcCount: stcs,
    stcPriceAUD: stcPrice,
    subsidyAUD,
  };
}
