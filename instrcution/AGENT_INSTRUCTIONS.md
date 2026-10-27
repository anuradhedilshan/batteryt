# Task: fix and upgrade the residential PV–battery sizing application

You are working on an existing application that chooses the most economical home battery size for a grid-connected household with rooftop solar (Australian context). The model has known errors. Fix them in the phases below. Do the phases in order, and finish each one (tests green) before starting the next.

## 0. Files and ground rules

- `battery_model.py` (provided next to this file) is the **reference implementation**. It is the source of truth for the maths. Its self-tests pass (`python battery_model.py`).
- Do **not** rewrite the app from scratch. Keep the existing language, framework, folder layout and UI. Change only what is needed.
- First, read the codebase and write a short summary of: language/framework, where the hourly simulation is, where costs/subsidy/payback are computed, how inputs (CSV, tariffs) are loaded, and where results are shown. Show it to me before editing.
- Work on a new git branch. Commit after each phase with a clear message.
- Never invent numbers. Prices, tariffs, STC prices, battery specs and the STC factor must come from user input or a clearly labelled config file, with a source and date next to each value.
- Never present synthetic or example data as a real result. Any output computed from synthetic data must be labelled "illustrative - not measured data".
- If something is unclear, ask me one short question instead of guessing.

## Phase 1 - Safety net (do this before changing any logic)

1. Port the tests from `battery_model.py` (`run_tests`) into the app's own test framework.
2. Add a "golden comparison" test: run the app's current simulation and `battery_model.simulate` on the same input and print the differences in annual import, export, charge, discharge and grid cost. Do not fix anything yet. Report the differences to me.
3. Add these unit tests (they must pass after Phase 2):
   - Worked example: battery `emin=1.0, emax=9.5, p=5 kW, eta_c=eta_d=0.95`, start stored energy 4.0 kWh. Hour 1: PV 5.0, load 1.5 -> stored energy 7.325 kWh, export 0. Hour 2: PV 0, load 4.0 -> stored energy 3.1145 kWh, import 0.
   - Every hour: `PV + import + discharge - (load + charge + export) = 0` (tolerance 1e-8).
   - Stored energy always inside `[emin, emax]`; charge and discharge never above `power x dt`.
   - 0 kWh battery: no division by zero, all battery flows zero, results equal the no-battery baseline.
   - Zero PV: battery never charges.
   - Objective equivalence: `grid_cost(no battery) - grid_cost(battery) = sum(T_import x discharge - T_fit x charge)` (tolerance 1e-7).
   - `crf(0.06, 10) = 0.135868`, `crf(0, L) = 1/L`.

## Phase 2 - Fix the simulation core

1. **One definition of capacity.** Define a battery by `emin`, `emax` (kWh), `p_charge`, `p_discharge` (kW), `eta_c`, `eta_d`. For real products use the manufacturer's **usable** kWh, and do NOT apply an extra 10-95 % SOC window on top of it (that double-counts the reserve). Keep an optional "nominal + SOC window" constructor only for generic studies. Price, power and subsidy must all refer to the same usable capacity.
2. **Hourly rule** (per time step, `dt` in hours):
   - surplus = max(PV - load, 0); deficit = max(load - PV, 0)
   - if surplus > 0: charge = min(surplus, p_charge x dt, (emax - B) / eta_c); B += eta_c x charge
   - else if deficit > 0: discharge = min(deficit, p_discharge x dt, (B - emin) x eta_d); B -= discharge / eta_d
   - import = deficit - discharge; export = surplus - charge
3. **Cyclic state.** Repeat the annual series until the end stored energy equals the start stored energy (tolerance 1e-6 kWh). Never start with a free full battery.
4. **0 kWh case:** skip all battery and SOC code; return the no-battery result.
5. **Time resolution.** Make `dt` a parameter, not a hard-coded 1. Accept 60-, 30- and 5-minute data.
6. **Assertions.** After each simulation assert energy balance, stored-energy bounds and power limits. Fail loudly with the hour index.
7. Remove any "SOC in kWh" naming confusion: stored energy `B` is in kWh; `SOC % = 100 x (B - emin) / (emax - emin)` is only for display.

## Phase 3 - Fix the economics

1. **Replace the flat 30 % subsidy** with a date-based, tier-based function (Australian Cheaper Home Batteries Program, from 1 May 2026):
   - tier-weighted kWh = min(u,14) + 0.60 x min(max(u-14,0),14) + 0.15 x min(max(u-28,0),22), where u = min(usable kWh, 50)
   - STCs = STC factor(install date) x tier-weighted kWh (check rounding against the CER calculator)
   - STC factor by install date: 1 May-31 Dec 2026 = 6.8; Jan-Jun 2027 = 5.7; Jul-Dec 2027 = 5.2; Jan-Jun 2028 = 4.6; Jul-Dec 2028 = 4.1; Jan-Jun 2029 = 3.6; Jul-Dec 2029 = 3.1; Jan-Jun 2030 = 2.6; Jul-Dec 2030 = 2.1
   - subsidy AUD = STCs x STC price. The STC price is a user input (from the installer quote), never hard-coded.
   - Put the factor table in a config file with a "last verified" date and a link to the Clean Energy Regulator calculator. Add eligibility flags (minimum 5 kWh usable, eligible product, accredited installer). If eligibility is unknown, show the result both with and without subsidy.
2. **Lifetime NPV instead of one annual cost.** Inputs: discount rate, lifetime (years), O&M (% of gross cost per year), tariff escalation (% per year), capacity fade (% per year). For each year re-simulate with the faded capacity (`emax = emin + usable x (1 - fade)^(year-1)`), apply escalation to the bill saving, and discount. `NPV = -net capex + sum((saving_y - O&M) / (1+r)^y)`. Rank by NPV; also show equivalent annual benefit (`NPV x CRF`).
3. **Metrics, defined correctly:**
   - self-consumption = (PV used directly + PV charged into battery) / total PV
   - self-sufficiency = (PV used directly + battery discharge delivered to load) / total load
   - simple payback = net capex / (year-1 bill saving - annual O&M); show "never" if the denominator is <= 0
   - equivalent full cycles = sum(discharge / eta_d) / usable kWh
4. **Candidates are real products**, not a kWh grid: name, usable kWh, power kW, installed price. Always include "No battery" in the ranking. Because price and subsidy have breakpoints (14 and 28 kWh), do not interpolate between products.
5. **Defaults must not claim an optimum.** If the user has not supplied real data, show a banner: "Illustrative result - based on example data and assumptions".

## Phase 4 - Inputs and tariffs

1. Accept 8,760 (or finer) rows: timestamp, household load kWh, PV kWh (or irradiance + system settings), import tariff per interval, feed-in tariff per interval. Validate: row count, no gaps, no negatives, timezone/DST noted. Reject or warn clearly on bad data.
2. Tariffs must be per-interval arrays (flat, time-of-use, and feed-in). Keep daily supply charge separate (it cancels in battery-vs-none comparisons unless the tariff plan changes).
3. If PV comes from irradiance, use at least: plane-of-array irradiance (tilt/azimuth), a temperature loss term, and an inverter AC limit (clipping). Note the assumed performance ratio in the output.
4. Add optional export limit and curtailment (export <= cap; excess curtailed or stored).

## Phase 5 - Tariff-aware dispatch (optional but wanted)

1. Keep the rule-based dispatch as "baseline (rule-based)".
2. Add `optimal_dispatch_lp` (see reference file, uses scipy HiGHS) as "tariff-optimised (perfect foresight)". Options: PV-only charging vs grid charging allowed; battery export allowed or not.
3. Label LP results as an upper bound (real controllers have no perfect forecast). Show both results side by side. Never mix them in one ranking without a label.

## Phase 6 - Robustness and reporting

1. Sensitivity runs: lifetime 10 vs 15 years; discount rate; import tariff and feed-in tariff; battery price; PV size; several solar/load years if data exists. The current known issue is that the winner flips between 0 kWh and about 7.5-10 kWh when lifetime changes from 10 to 15 years, so lifetime sensitivity is mandatory.
2. Report: best product by NPV, the margin over the second best, whether the winner is stable across scenarios, and the cost of choosing the wrong size.
3. Add a "Validation" panel: energy-balance residual, min/max stored energy, max charge/discharge power, start vs end stored energy.
4. Export a CSV of hourly results and a JSON of all assumptions (with source and date) so any run can be reproduced.

## Do NOT

- Do not hard-code prices, tariffs, STC prices or the STC factor in logic files.
- Do not apply the SOC window to a manufacturer's usable capacity.
- Do not call the result "optimal" unless it comes from real user data and the sensitivity checks agree.
- Do not silently change units. Energy is kWh, power is kW, money is AUD, time step is `dt` hours.
- Do not delete existing features or UI without asking.

## Definition of done

- All tests from Phase 1 pass, plus the golden comparison against `battery_model.py` is within 1e-6 kWh and 1e-4 AUD on the same data.
- The app runs end to end on a sample CSV and shows ranked products, the no-battery option, NPV at 10 and 15 years, and the validation panel.
- A short `CHANGES.md` lists what changed, per phase, and anything you could not do or were unsure about.
