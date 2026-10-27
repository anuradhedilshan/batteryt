/**
 * Commercial Residential Battery Systems (Australian Market Benchmark)
 *
 * Source: SolarQuotes Australian Battery Price Guide & Clean Energy Reviews Hardware Guide
 * Last Verified: 2026-10-27
 * Notes:
 * - All capacities quoted are MANUFACTURER USABLE CAPACITIES (kWh).
 * - No additional reserve margin / SOC window should be imposed on top of usable rating.
 * - Installed prices include typical turnkey supply, installation, balance of system and GST
 *   prior to Small-scale Technology Certificates (STC) or state rebates.
 */

export interface BatteryProduct {
  id: string;
  name: string;
  manufacturer: string;
  usableKWh: number;
  powerKW: number;
  installedPriceAUD: number;
  efficiencyRoundTrip: number; // e.g. 0.90 (0.95 charge * 0.95 discharge)
  warrantyYears: number;
  source: string;
  lastVerifiedDate: string;
}

export const COMMERCIAL_PRODUCTS: readonly BatteryProduct[] = [
  {
    id: 'no-battery',
    name: 'No Battery (Solar-Only Baseline)',
    manufacturer: 'None',
    usableKWh: 0.0,
    powerKW: 0.0,
    installedPriceAUD: 0.0,
    efficiencyRoundTrip: 1.0,
    warrantyYears: 0,
    source: 'Theoretical Reference Baseline',
    lastVerifiedDate: '2026-10-27',
  },
  {
    id: 'alphaess-smile5',
    name: 'AlphaESS SMILE5 (5 kWh)',
    manufacturer: 'AlphaESS',
    usableKWh: 5.0,
    powerKW: 2.5,
    installedPriceAUD: 5800,
    efficiencyRoundTrip: 0.90, // ~95% each way
    warrantyYears: 10,
    source: 'SolarQuotes Battery Guide & AlphaESS Datasheet (Oct 2026)',
    lastVerifiedDate: '2026-10-27',
  },
  {
    id: 'enphase-iq-5p',
    name: 'Enphase IQ Battery 5P',
    manufacturer: 'Enphase Energy',
    usableKWh: 5.0,
    powerKW: 3.84,
    installedPriceAUD: 6500,
    efficiencyRoundTrip: 0.90,
    warrantyYears: 15,
    source: 'Clean Energy Reviews & Enphase 5P Spec Sheet (Oct 2026)',
    lastVerifiedDate: '2026-10-27',
  },
  {
    id: 'sungrow-sbr064',
    name: 'Sungrow SBR064 (6.4 kWh)',
    manufacturer: 'Sungrow',
    usableKWh: 6.4,
    powerKW: 3.2,
    installedPriceAUD: 6800,
    efficiencyRoundTrip: 0.90,
    warrantyYears: 10,
    source: 'SolarQuotes Australian Battery Guide (Oct 2026)',
    lastVerifiedDate: '2026-10-27',
  },
  {
    id: 'byd-hvs-7-7',
    name: 'BYD Battery-Box Premium HVS 7.7',
    manufacturer: 'BYD',
    usableKWh: 7.68,
    powerKW: 7.68,
    installedPriceAUD: 9200,
    efficiencyRoundTrip: 0.90,
    warrantyYears: 10,
    source: 'SolarQuotes & BYD Australian Importer Pricing (Oct 2026)',
    lastVerifiedDate: '2026-10-27',
  },
  {
    id: 'sungrow-sbr096',
    name: 'Sungrow SBR096 (9.6 kWh)',
    manufacturer: 'Sungrow',
    usableKWh: 9.6,
    powerKW: 4.8,
    installedPriceAUD: 9100,
    efficiencyRoundTrip: 0.90,
    warrantyYears: 10,
    source: 'SolarQuotes Australian Battery Guide (Oct 2026)',
    lastVerifiedDate: '2026-10-27',
  },
  {
    id: 'byd-hvs-10-2',
    name: 'BYD Battery-Box Premium HVS 10.2',
    manufacturer: 'BYD',
    usableKWh: 10.24,
    powerKW: 10.24,
    installedPriceAUD: 11400,
    efficiencyRoundTrip: 0.90,
    warrantyYears: 10,
    source: 'SolarQuotes & BYD Australian Importer Pricing (Oct 2026)',
    lastVerifiedDate: '2026-10-27',
  },
  {
    id: 'tesla-powerwall-2',
    name: 'Tesla Powerwall 2 (13.5 kWh)',
    manufacturer: 'Tesla',
    usableKWh: 13.5,
    powerKW: 5.0,
    installedPriceAUD: 13500,
    efficiencyRoundTrip: 0.90,
    warrantyYears: 10,
    source: 'Tesla Australia Direct & Certified Installer Pricing (Oct 2026)',
    lastVerifiedDate: '2026-10-27',
  },
  {
    id: 'tesla-powerwall-3',
    name: 'Tesla Powerwall 3 (13.5 kWh)',
    manufacturer: 'Tesla',
    usableKWh: 13.5,
    powerKW: 10.0,
    installedPriceAUD: 14200,
    efficiencyRoundTrip: 0.90,
    warrantyYears: 10,
    source: 'Tesla Australia Direct & Certified Installer Pricing (Oct 2026)',
    lastVerifiedDate: '2026-10-27',
  },
];
