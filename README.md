# Battery Sizing Studio — Optimal Battery Sizing Engine & Verification Suite

A high-performance, responsive React web application that **automatically determines and suggests the mathematically optimal residential battery storage capacity ($E_b^*$)**, backed by the 8-point verification protocol and sensitivity framework from [Revised_Battery_Sizing_Mathematical_Model_Report.pdf](file:///home/anuradhe/Downloads/ry/web/Revised_Battery_Sizing_Mathematical_Model_Report.pdf).

---

## 🎯 Primary Purpose: Automated Optimal Capacity Suggestion (Not Just Testing a Battery)

Rather than asking the user to manually test or guess specific battery sizes:
1. **The Software Solves the Optimization Problem:**
   $$E_b^* = \arg\min_{E_b > 0} \left[ C_{\text{grid}}(E_b) + \text{AEC}(E_b) \right]$$
   Evaluates candidate battery capacities $E_b \in \{0.5, 1.0, 1.5, \dots, 20.0\}\text{ kWh}$ across **8,760 hourly simulation steps**, automatically identifying and suggesting the capacity that minimizes overall annual expenditure.
2. **Convex U-Curve Minimum Explanation:**
   Clearly demonstrates to the user and lecturer why the suggested size (e.g. **7.5 kWh**) is optimal:
   - **Below 7.5 kWh (e.g. 5.0 kWh):** Costs **A$734.49/yr** (costs MORE)
   - **Optimal (7.5 kWh):** Costs **A$707.72/yr** (**MINIMUM POINT**)
   - **Above 7.5 kWh (e.g. 10.0 kWh):** Costs **A$747.35/yr** (costs MORE)
   - **Above 7.5 kWh (e.g. 15.0 kWh):** Costs **A$1,028.23/yr** (costs MORE)
   *"All numbers above are high, below is high. Only this number is minimized!"*
3. **The Number Behind "0 kWh":**
   Explicitly clarifies that **0 kWh is NOT zero dollars**. 0 kWh represents the **Solar-Only Baseline Electricity Bill** of **A$695.65/year** (3,112 kWh imports @ $0.35 minus 7,871 kWh exports @ $0.05, with $0 battery capex). This baseline is used to test whether installing any battery makes financial sense.
4. **Optional What-If Testing:**
   If a user wants to inspect what happens if they install a specific commercial battery (e.g. 10 kWh or 13.5 kWh Tesla Powerwall), an optional What-If inspector allows comparing that choice directly against the mathematical optimum.

---

## 🛡️ Software Verification & Validation Suite (Report Section 6.3)

A dedicated audit suite executes the **8 formal verification checks** defined in Table 6.3 of the report:

| Check ID | Verification Rule | Report Section | Academic Tolerance | Observed Software Result | Status |
|---|---|---|---|---|---|
| 1 | Annual No-Battery Energy Balance | Section 1.1 & Table 6.3 | $\Delta < 10^{-6}\text{ kWh}$ | PV: 10,539 kWh, Load: 5,780 kWh (Exact) | **PASS** |
| 2 | Every-Hour AC Bus Conservation | Equation (8) & Table 6.3 | $\text{Residual} < 10^{-7}\text{ kWh}$ | Max residual = $3.55 \times 10^{-15}\text{ kWh}$ | **PASS** |
| 3 | Stored Energy & SOC Safety | Equation (6) & Section 4.2 | $[\alpha_{\min} E_b, \alpha_{\max} E_b]$ | Stored energy stays strictly within [1.0, 9.5] kWh | **PASS** |
| 4 | C-Rate / Inverter Power Rating | Equations (3)–(4) & §4.2 | $E_c, E_d \le P_{\max} \Delta t$ | No hourly transfer exceeds $0.5 \times E_b$ kW | **PASS** |
| 5 | Zero PV Night Stress Test | Table 6.3 | Charge = 0 when PV = 0 | 0.000 kWh charging during all dark hours | **PASS** |
| 6 | Zero-Capacity Reference Baseline | Section 4.2 & Table 6.3 | Capex = $0, Transfers = 0 | No division by zero, exact solar-only bill ($695.65) | **PASS** |
| 7 | Cyclic-Year SOC Convergence | Section 4.2 & Table 6.3 | $\|B_{8760} - B_0\| < 10^{-6}\text{ kWh}$ | Start: 1.000 kWh = End: 1.000 kWh (Residual: $0.00$) | **PASS** |
| 8 | Dual-Objective Equivalence | Equations (13)–(15) & §4.5 | $\Delta < 10^{-6}\text{ AUD}$ | Min Total Cost $\equiv$ Max Net Benefit ($\Delta < 10^{-14}$) | **PASS** |

Users can download the formal **Verification Audit Report (CSV)** directly from the tool.

---

## 📊 Sensitivity & Sizing Matrix Tools (Report Sections 7.3 & 8.2)

1. **Tariff Sensitivity Sizing Matrix (Section 7.3 & Figure 5):**
   - Evaluates the optimal capacity $E_b^*$ across Retail Import Tariffs ($0.25 to $0.65 AUD/kWh) vs FiTs ($0.03 to $0.12 AUD/kWh).
   - Demonstrates that as retail tariffs rise to $0.65/kWh, the optimal capacity increases (e.g. to 10.5–11.0 kWh) and becomes highly profitable!
   - Clicking any matrix cell instantly applies that tariff regime.
2. **Household Occupancy & PV System Scenario Matrix (Section 8.2):**
   - Automatically computes optimal battery size across Small (0.75×), Medium (1.00×), and Large (1.35×) households vs 4.0 kW, 6.6 kW, 8.0 kW, and 10.0 kW rooftop PV arrays.
3. **Marginal Operating Screening Rule (Section 8.1 & Equation 18):**
   - Evaluates $\eta_{\text{RT}} \cdot T_{\text{import}} > T_{\text{FiT}}$ to determine whether storing 1 kWh of solar energy generates positive operational arbitrage.

---

## 🚀 Quick Start

```bash
# Install dependencies
npm install

# Run automated verification tests
npm test

# Launch local development server
npm run dev

# Build production bundle
npm run build
```
Built production output is located in `dist/`.
