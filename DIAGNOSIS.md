# Diagnosis: "Go For Solar Only" Result Analysis

## Executive Summary
An exhaustive side-by-side audit of the TypeScript application against the reference implementation (`instrcution/battery_model.py`) was performed using identical synthetic inputs (8,760 hourly timesteps, seed=42).

**Key Diagnosis:**
1. **The mathematical simulation is exact and fully verified:** The TypeScript simulation matches `battery_model.py` across all metrics to $< 10^{-10}\text{ kWh}$ and $< 10^{-10}\text{ AUD}$ (far exceeding the required $10^{-6}\text{ kWh}$ and $10^{-4}\text{ AUD}$ tolerances).
2. **Under realistic 2026 conditions ($8,000 gross price, Cheaper Home Batteries subsidy of $2,516), a 10 kWh battery DOES NOT lose to solar only:** It yields an NPV of **+$1,284.40 AUD**, annual bill savings of **$999.61 AUD/year**, and pays back in **Year 8**.
3. **Why the app previously recommended "Solar Only" almost every time:**
   - **Root Cause 1 (Code Bug):** In `simulateCapacity` (`src/engine/model.ts`), the condition `if (p.useCheaperHomeBatteriesProgram)` evaluated to `false` when `useCheaperHomeBatteriesProgram` was `undefined` in default parameters. This caused the simulation to fall back to a flat 30% hypothetical discount ($2,400) rather than applying the statutory Australian Cheaper Home Batteries subsidy ($2,516).
   - **Root Cause 2 (Default Preset Configuration):** In `src/App.tsx`, the initial defaults inherited the academic thesis baseline ($1,000 fixed capex + $700/kWh capex with an uncredited SOC window of 10%–95%), where annualized owner costs ($840/yr) genuinely exceeded annual bill savings ($820/yr). Under that specific legacy thesis setup, solar-only was mathematically genuine.
   - **Root Cause 3 (High Retail Commercial Turnkey Prices):** Unsubsidised turnkey products priced $> \$11,000$ (e.g., Tesla Powerwall 2 at $13,500 gross capex = ~$11,000 net) take $> 11$ years to pay back at $1,000/yr savings, producing negative 10-year NPV.
   - **Root Cause 4 (UI Framing & Missing Explainability):** The UI unconditionally displayed labels like *"Optimal Economic Sizing: 0.0 kWh (Solar PV Only)"* without explaining *why* (break-even cost, price discount needed, avoided import vs lost export spread, or sensitivity to lifetime and feed-in tariffs).

---

## Part A, Step 1 & 2: Side-by-Side Comparison Table

### Simulation Inputs Actually Used
- **Import Tariff:** Min $0.3500 / Mean $0.3500 / Max $0.3500 AUD/kWh
- **Feed-in Tariff:** Min $0.0500 / Mean $0.0500 / Max $0.0500 AUD/kWh
- **Annual Discount Rate ($r$):** 6.0%
- **System Lifetime ($L$):** 10 years
- **O&M Rate:** 1.0% of gross capex ($80.00 AUD/year)
- **Tariff Escalation:** 0.0%/year
- **Capacity Fade:** 0.0%/year
- **Gross Capex:** $8,000.00 AUD
- **Subsidy Applied:** $2,516.00 AUD (Australian Cheaper Home Batteries STC Program, deemed launch factor 6.8, installation 2026-11-01, STC price $37.00/STC)
- **Net Capex:** $5,484.00 AUD
- **Usable Capacity:** 10.0 kWh (no secondary SOC restriction on manufacturer usable capacity)
- **Charge / Discharge Power:** 5.0 kW
- **Efficiencies:** $\eta_c = 0.95$, $\eta_d = 0.95$ (Round-trip efficiency $\eta_{rt} = 90.25\%$)

### 10 kWh Usable Battery (5 kW) Side-by-Side Table
| Metric | App (TypeScript) | Reference (`battery_model.py`) | Difference | Tolerance | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Annual PV Generation (kWh)** | 10,539.000000 | 10,539.000000 | $2.91 \times 10^{-11}$ | $10^{-6}$ | **PASS** |
| **Annual Load Consumption (kWh)** | 5,780.000000 | 5,780.000000 | $4.91 \times 10^{-11}$ | $10^{-6}$ | **PASS** |
| **Direct PV Use (kWh)** | 2,238.981459 | 2,238.981459 | $4.59 \times 10^{-11}$ | $10^{-6}$ | **PASS** |
| **Grid Import (kWh)** | 147.892297 | 147.892297 | $8.53 \times 10^{-14}$ | $10^{-6}$ | **PASS** |
| **Grid Export (kWh)** | 4,540.321872 | 4,540.321872 | $1.82 \times 10^{-12}$ | $10^{-6}$ | **PASS** |
| **Battery Charge (kWh)** | 3,759.696669 | 3,759.696669 | $4.55 \times 10^{-13}$ | $10^{-6}$ | **PASS** |
| **Battery Discharge (kWh)** | 3,393.126244 | 3,393.126244 | $5.28 \times 10^{-11}$ | $10^{-6}$ | **PASS** |
| **Equivalent Full Cycles** | 357.171184 | 357.171184 | $5.57 \times 10^{-12}$ | $10^{-6}$ | **PASS** |
| **Grid Cost (AUD)** | -$175.253790 | -$175.253790 | $1.14 \times 10^{-13}$ | $10^{-4}$ | **PASS** |
| **Grid Cost Without Battery (AUD)** | $824.355562 | $824.355562 | $2.16 \times 10^{-11}$ | $10^{-4}$ | **PASS** |
| **Year-1 Bill Saving (AUD)** | $999.609352 | $999.609352 | $2.15 \times 10^{-11}$ | $10^{-4}$ | **PASS** |
| **Subsidy Applied (AUD)** | $2,516.000000 | $2,516.000000 | $0.00$ | $10^{-4}$ | **PASS** |
| **Net Capex (AUD)** | $5,484.000000 | $5,484.000000 | $0.00$ | $10^{-4}$ | **PASS** |
| **10-Year Lifetime NPV (AUD)** | **+$1,284.404884** | **+$1,284.404884** | $1.59 \times 10^{-10}$ | $10^{-4}$ | **PASS** |
| **Break-even Gross Capex (AUD)** | **$9,196.352312** | **$9,196.352312** | $1.46 \times 10^{-10}$ | $10^{-4}$ | **PASS** |
| **Discounted Payback Year** | **8** | **8** | 0 | Exact | **PASS** |

### No Battery (Solar Only Baseline) Side-by-Side Table
| Metric | App (TypeScript) | Reference (`battery_model.py`) | Difference | Tolerance | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Grid Import (kWh)** | 3,541.018541 | 3,541.018541 | $5.96 \times 10^{-11}$ | $10^{-6}$ | **PASS** |
| **Grid Export (kWh)** | 8,300.018541 | 8,300.018541 | $1.82 \times 10^{-11}$ | $10^{-6}$ | **PASS** |
| **Battery Charge (kWh)** | 0.000000 | 0.000000 | $0.00$ | $10^{-6}$ | **PASS** |
| **Battery Discharge (kWh)** | 0.000000 | 0.000000 | $0.00$ | $10^{-6}$ | **PASS** |
| **Grid Cost (AUD)** | $824.355562 | $824.355562 | $2.16 \times 10^{-11}$ | $10^{-4}$ | **PASS** |
| **Year-1 Bill Saving (AUD)** | $0.000000 | $0.000000 | $0.00$ | $10^{-4}$ | **PASS** |
| **Subsidy Applied (AUD)** | $0.000000 | $0.000000 | $0.00$ | $10^{-4}$ | **PASS** |
| **Net Capex (AUD)** | $0.000000 | $0.000000 | $0.00$ | $10^{-4}$ | **PASS** |
| **Lifetime NPV (AUD)** | $0.000000 | $0.000000 | $0.00$ | $10^{-4}$ | **PASS** |

---

## Part A, Step 3: 10-Point Checklist Audit

| # | Checklist Item | Status | Evidence (File & Line) |
| :--- | :--- | :--- | :--- |
| **1** | **Units:** Tariffs are AUD per kWh (0.35, not 35). PV and load are kWh per interval (not W or Wh). | **PASS** | `src/engine/validation.ts#L8-L12`, `src/App.tsx#L32-L33`, `src/engine/csv.ts#L18-L35`. Added `sanityCheckInputs` in Part B to detect cent-scale tariffs (> $2/kWh) and power/Wh scaling (> 20 kWh/h). |
| **2** | **Subsidy:** Not silently zero. Check install date (on/after 1 May 2026), eligibility flag, usable >= 5 kWh, STC price input, and date-based deeming factor. | **PASS (Fixed)** | `src/config/cheaperHomeBatteries.ts#L36-L65` (date schedule), `#L108-L150` (eligibility & floor rounding). Fixed `src/engine/model.ts#L451` to ensure `p.useCheaperHomeBatteriesProgram ?? true` does not silently disable subsidy when undefined in defaults. |
| **3** | **Capital cost counted once:** No annualised cost added on top of NPV. Fixed cost added only when battery size > 0. | **PASS** | `src/engine/model.ts#L318` (`npv = -netCapex`), `#L345-L352` (cash flows), `#L449` (`grossCapex = capacityKWh > 0 ? fixed + var : 0`). |
| **4** | **No SOC window on usable kWh:** No SOC window applied on top of manufacturer's usable kWh. | **PASS** | `src/engine/model.ts#L510`, `src/engine/battery.ts#L42-L49` (`Battery.fromUsable` sets $E_{min}=0, E_{max}=\text{usable}$). |
| **5** | **Baseline comparison:** Baseline is the same input without battery; saving = bill without battery minus bill with battery. No-battery option has zero cost. | **PASS** | `src/engine/model.ts#L306-L316` (0 kWh returns 0 cost, 0 capex, 0 NPV), `#L345` (`saving = baseGridCost - yearGridCost`). |
| **6** | **Charge/discharge power correct:** Correct for selected product (not tiny default, not C-rate applied to wrong capacity). | **PASS** | `src/config/products.ts#L13-L56`, `src/engine/model.ts#L510` (`Battery.fromUsable(product.usableKWh, product.powerKW)`). |
| **7** | **Time alignment:** Tariff, load, and PV arrays have identical length and timestamps with no shift. | **PASS** | `src/engine/model.ts#L15-L17` (`referencePV.length !== referenceLoad.length`), `#L81-L84` (`pvInput.length !== loadInput.length`). |
| **8** | **Configurable economics:** Lifetime, discount rate, O&M, escalation, and fade come from user inputs, not hard-coded 10 years. | **PASS** | `src/engine/model.ts#L297-L304` (`years = p.lifeYears`, `r = p.annualDiscountRatePct / 100`, `omFrac`, `escalation`, `fadePerYear`). |
| **9** | **Feed-in tariff logic:** Feed-in tariff is lower than import tariff; exports valued at feed-in tariff only. | **PASS** | `src/engine/model.ts#L338` (`gridCost = imp * importAUD - exp * feedInAUD`), `src/engine/validation.ts#L10` (`feedInAUDPerKWh < importAUDPerKWh`). |
| **10** | **NPV ranking:** Ranking compares NPV (or equivalent annual benefit), not raw bill savings or capex alone. | **PASS** | `src/engine/model.ts#L658` (`products.sort((a, b) => b.lifetimeNPVAUD - a.lifetimeNPVAUD)`). |

---

## Conclusion
The simulation engine is mathematically identical to `battery_model.py`. The "solar only" result was caused by:
1. An un-defaulted subsidy flag in candidate capacity evaluation (`simulateCapacity`).
2. Legacy UI copy that presented solar-only as an unconditional recommendation rather than explaining the economics.
3. Catalogue products with turnkey prices exceeding the break-even gross price ($9,196 AUD).
