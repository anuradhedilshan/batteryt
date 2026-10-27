# Battery Sizing Studio — Upgrade & Mathematical Model Refactor Changelog

This document records the phased refactoring, mathematical alignment, and feature upgrades performed according to [`AGENT_INSTRUCTIONS.md`](file:///home/anuradhe/Downloads/ry/web/instrcution/AGENT_INSTRUCTIONS.md) and [`battery_model.py`](file:///home/anuradhe/Downloads/ry/web/instrcution/battery_model.py).

---

## Initial Report Audit & Baseline Correction
- **Report Contradiction Resolved:** In the original report and application, the 7.5 kWh battery was described as the "economic optimum" despite the solar-only baseline (0 kWh) having a strictly lower annual cost ($695.65/yr vs. $707.72/yr).
- **Formal Optimum ($E_b^*$):** Clarified the formal mathematical formulation ($Eq. 13$): when no battery achieves net savings over solar alone, $E_b^* = 0.0\text{ kWh}$ (Solar-Only). The 7.5 kWh pack is designated the **Least-Cost Positive Physical Battery** for households requiring storage for backup, emissions reduction, or self-reliance.
- **Sensitivity Matrix:** Fixed `src/engine/sensitivity.ts` to include 0.0 kWh, exactly matching Figure 5 and Section 7.3 of the report bit-for-bit.

---

## Phase 1 — Safety Net & Golden Comparison
- **Synthetic Reference Dataset:** Exported `src/data/syntheticReference.json` matching `_synthetic_year(seed=42)` in `battery_model.py` (8,760 hours, 10,539 kWh annual PV, 5,780 kWh annual load).
- **Golden Comparison Test Suite (`src/engine/goldenComparison.test.ts`):**
  - Section 6.2 worked example: Battery with $e_{min}=1.0$, $e_{max}=9.5$, $P=5.0\text{ kW}$, $\eta_c=\eta_d=0.95$, starting at $B_0=4.0\text{ kWh}$. Hour 1: $B_1 = 7.325\text{ kWh}$; Hour 2: $B_2 = 3.1145\text{ kWh}$.
  - Golden comparison against `battery_model.py` across 0, 5, 7.5, 10, 13.5, and 20 kWh: differences in annual import, export, charge, discharge, and grid cost verified $< 10^{-10}\text{ kWh}$ and $< 10^{-11}\text{ AUD}$.
  - Verified hourly bus energy balance: $\text{PV} + \text{import} + \text{discharge} - (\text{load} + \text{charge} + \text{export}) = 0$ (tolerance $< 10^{-7}\text{ kWh}$).
  - Verified storage bounds $B_t \in [e_{min}, e_{max}]$ and power limits $\le P \cdot \Delta t$.
  - Verified zero-PV stress test: battery never charges during darkness.
  - Verified dual-objective equivalence: $\text{Cost}(0) - \text{Cost}(E) = \sum (T_{import} \cdot \text{discharge} - T_{fit} \cdot \text{charge})$.
  - Verified Capital Recovery Factor: $\text{CRF}(0.06, 10) = 0.135868$, $\text{CRF}(0, L) = 1/L$.

---

## Phase 2 — Core Simulation Refactor
- **Single Definition of Battery Capacity (`src/engine/battery.ts`):**
  - Created `Battery` class with explicit physical parameters: $e_{min}, e_{max}$ (kWh), $p_{charge}, p_{discharge}$ (kW), $\eta_c, \eta_d$.
  - Real commercial products use manufacturer **usable** kWh directly via `Battery.fromUsable()`, with **no artificial 10–95% SOC window imposed on top**.
  - Retained `Battery.fromNominal()` with configurable SOC window only for generic thesis/academic studies.
- **Arbitrary Time Resolution ($\Delta t$):** Refactored simulation core (`simulateBatteryTimeSeries`) to accept arbitrary $\Delta t$ (60-min, 30-min, 5-min intervals).
- **Cyclic Convergence:** Implemented representative-year warm-up loop until $|B_{end} - B_{start}| < 10^{-6}\text{ kWh}$.
- **Zero-Capacity Handling:** 0 kWh battery strictly bypasses storage equations and returns exact solar-only flows without division by zero.
- **Runtime Assertions:** Enforced energy balance, SOC bounds, and power limits inside the core simulation with descriptive error messages identifying offending timestep indices.

---

## Phase 3 — Economics, Cheaper Home Batteries Rebate & Lifetime NPV
- **Australian Cheaper Home Batteries Program (`src/config/cheaperHomeBatteries.ts`):**
  - Replaced the flat 30% hypothetical subsidy with the official date- and tier-based STC program commencing 1 May 2026.
  - Formula ($Eq. 16$): $\text{tierWeighted}(u) = \min(u, 14) + 0.60 \times \min(\max(u - 14, 0), 14) + 0.15 \times \min(\max(u - 28, 0), 22)$, where $u = \min(\text{usable}, 50)$.
  - Configurable STC factor schedule from Clean Energy Regulator (6.8 in late 2026 stepping down to 2.1 in late 2030, ending 31 Dec 2030).
  - Market STC price is a configurable user input ($37/STC default), never hard-coded.
  - Eligibility checks: minimum 5.0 kWh usable capacity, accredited installer flag, and approved product listing.
- **Real Australian Commercial Battery Catalogue (`src/config/products.ts`):**
  - Benchmarked real products with documented sources and dates: Tesla Powerwall 2, Tesla Powerwall 3, BYD Battery-Box HVS 7.7 & 10.2, Sungrow SBR064 & SBR096, AlphaESS SMILE5, Enphase IQ 5P, and Solar-Only Baseline.
  - Prices, capacities, and power ratings reflect turnkey Australian market installations without interpolation between breakpoint sizes.
- **Multi-Year Lifetime NPV (`src/engine/model.ts`):**
  - Inputs: discount rate $r$, economic lifetime $L$ (10 or 15 yrs), annual O&M (% of gross capex), tariff escalation (%/yr), and capacity fade (%/yr).
  - Simulates each year $y \in [1, L]$ with faded capacity $e_{max} = e_{min} + \text{usable} \times (1 - \text{fade})^{y-1}$ and discounted savings.
  - Mathematically proved and verified in unit tests: when escalation = 0 and fade = 0, equivalent annual benefit ($\text{NPV} \times \text{CRF}$) matches single-year net benefit ($Eq. 15$) to machine precision.
- **Standardized Metrics:**
  - $\text{Self-Consumption} = (\text{PV used directly} + \text{battery charge}) / \text{total PV}$.
  - $\text{Self-Sufficiency} = (\text{PV used directly} + \text{battery discharge}) / \text{total load}$.
  - $\text{Simple Payback} = \text{Net Capex} / (\text{Year-1 Bill Saving} - \text{Annual O&M})$; displays "Never" if annual net saving $\le 0$.
  - $\text{Equivalent Full Cycles} = \sum (\text{discharge} / \eta_d) / \text{usable kWh}$.
- **Illustrative Banner:** Displayed banner on default data: "Illustrative result - based on example data and assumptions" to avoid misleading claims of household optimality prior to uploading real meter data.

---

## Phase 4 — Inputs, Solar Irradiance Model & Curtailment
- **Flexible CSV Ingestion (`src/engine/csv.ts`):**
  - Supports 8,760 (hourly), 17,520 (half-hourly), and 105,120 (5-minute) intervals.
  - Validates row continuity, rejects negative values and corrupt entries, and checks timestamps.
  - Ingests optional per-interval electricity tariff arrays (`import_tariff_aud_kwh`, `feed_in_tariff_aud_kwh`).
- **Physical Solar Irradiance PV Model (`src/engine/pvModel.ts`):**
  - Converts plane-of-array (POA) solar irradiance ($W/m^2$) to electrical energy ($kWh$).
  - Incorporates cell temperature derating: $1 + \gamma (T_{cell} - 25^\circ\text{C})$ with NOCT thermal balance.
  - Enforces inverter AC clipping limits ($\le P_{ac,limit}$).
- **Grid Export Limiting & Curtailment:**
  - Implemented DNSP export limiting (e.g. 5.0 kW export cap).
  - Surplus solar exceeding battery charging capacity and export limits is curtailed and tracked in output.

---

## Phase 5 — Tariff-Aware Dispatch (Rule-Based vs. LP Benchmark)
- **Tariff-Aware Dispatch Engine (`src/engine/dispatch.ts`):**
  - Implements `optimalDispatchLP` using Alternating Direction Method of Multipliers (ADMM) under perfect foresight.
  - Proved in `src/engine/dispatch.test.ts`: under flat tariffs, optimal LP cost matches rule-based greedy dispatch; under Time-of-Use (TOU) tariffs (17:00–21:00 evening peak @ $0.55/kWh vs. $0.25/kWh off-peak), optimal LP dispatch exploits tariff arbitrage to achieve lower bills.
- **Side-by-Side Presentation (`src/components/DispatchComparisonTool.tsx`):**
  - Rule-based dispatch presented as "Baseline (rule-based)".
  - LP dispatch labeled with a prominent disclaimer as an "Upper bound (perfect foresight)" to prevent conflating theoretical controller limits with real controller performance.

---

## Phase 6 — Robustness & Reporting
- **Lifetime Sensitivity (10 vs 15 Years):**
  - Addressed the documented phenomenon where the winner flips from Solar-Only (0 kWh) or small packs at a 10-year warranty horizon to larger commercial packs at 15 years due to additional accumulated bill savings.
  - Added interactive 10 vs 15 year toggles across `CommercialAdvisor` and `ScenarioSensitivityTool`.
- **Decision Robustness & Regret Analysis (`src/components/ScenarioSensitivityTool.tsx`):**
  - Reports best product by lifetime NPV, margin over the second-best alternative, scenario stability across 12 PV/load combinations, and the annual regret penalty of oversizing (e.g. installing 13.5 kWh when 0 or 7.5 kWh was optimal).
- **Validation Panel (`src/components/ValidationPanel.tsx`):**
  - Displays real-time validation invariants: AC bus balance residual ($< 10^{-7}\text{ kWh}$), minimum and maximum stored energy against bounds, inverter power limits, and cyclic start vs. end energy.
- **Audit Exports:**
  - Hourly trace CSV export via `generateHourlyTraceCSV`.
  - Comprehensive JSON assumptions and metadata export via `exportAssumptionsJSON` containing all parameters, sources, Clean Energy Regulator links, and verification timestamps for complete auditability.

---

## Test Verification Summary
- Total test files: 5 (`goldenComparison.test.ts`, `model.test.ts`, `economics.test.ts`, `inputsAndTariffs.test.ts`, `dispatch.test.ts`).
- Total passing tests: 26 / 26 passed (0 failures).
- Golden comparison difference vs `battery_model.py`: $< 10^{-10}\text{ kWh}$ and $< 10^{-11}\text{ AUD}$.
- Production build: `tsc -b && vite build` succeeds with zero errors.
