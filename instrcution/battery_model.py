"""
battery_model.py - corrected reference implementation of the PV-battery sizing model.

Use it two ways:
  1. As a drop-in replacement for the simulation + economics part of your app.
  2. As a "golden" reference: run your app and this file on the same CSV and compare
     imports / exports / net present value. They should match to ~1e-6 kWh.

Run the self-tests:   python battery_model.py
Needs: numpy, scipy (scipy only for the optional LP dispatch).
"""
from __future__ import annotations

from dataclasses import dataclass, replace
from datetime import date

import numpy as np


# --------------------------------------------------------------------------- #
# 1. Battery definition  (ONE consistent definition of capacity)
# --------------------------------------------------------------------------- #
@dataclass(frozen=True)
class Battery:
    emin: float          # kWh, lowest stored energy allowed
    emax: float          # kWh, highest stored energy allowed
    p_charge: float      # kW, max AC charge power
    p_discharge: float   # kW, max AC discharge power
    eta_c: float = 0.95
    eta_d: float = 0.95

    @property
    def usable(self) -> float:
        return self.emax - self.emin

    @classmethod
    def from_nominal(cls, Eb, a_min=0.10, a_max=0.95, c_rate=0.5, eta_c=0.95, eta_d=0.95):
        """Use when Eb is the physical/nominal capacity and you want an SOC window."""
        return cls(a_min * Eb, a_max * Eb, c_rate * Eb, c_rate * Eb, eta_c, eta_d)

    @classmethod
    def from_usable(cls, usable_kwh, power_kw, reserve_frac=0.0, eta_c=0.95, eta_d=0.95):
        """Use for catalogue products. Manufacturers already quote USABLE kWh, so do NOT
        apply a 10-95 % window on top of it (that double-counts the reserve)."""
        return cls(reserve_frac * usable_kwh, usable_kwh, power_kw, power_kw, eta_c, eta_d)

    def faded(self, remaining_fraction: float) -> "Battery":
        """Capacity fade: shrink the usable window to remaining_fraction of the original."""
        return replace(self, emax=self.emin + self.usable * remaining_fraction)


# --------------------------------------------------------------------------- #
# 2. Hourly (or 30-min / 5-min) rule-based simulation  - Eqs. (2)-(8) of the report
# --------------------------------------------------------------------------- #
def simulate(pv, load, bat: Battery | None, dt=1.0, b0=None, cyclic=True, tol=1e-6, max_pass=20):
    pv = np.asarray(pv, float)
    load = np.asarray(load, float)
    n = len(pv)
    S = np.maximum(pv - load, 0.0)      # surplus
    D = np.maximum(load - pv, 0.0)      # deficit

    if bat is None or bat.usable <= 0:  # 0 kWh case: no SOC maths at all
        z = np.zeros(n)
        return dict(charge=z, discharge=z.copy(), stored=z.copy(), imp=D, exp=S, passes=0)

    b_start = bat.emin if b0 is None else b0
    for p in range(1, max_pass + 1):
        B = b_start
        charge, discharge, stored = np.zeros(n), np.zeros(n), np.zeros(n)
        for t in range(n):
            if S[t] > 0:
                room = (bat.emax - B) / bat.eta_c
                c = max(min(S[t], bat.p_charge * dt, room), 0.0)
                charge[t] = c
                B += bat.eta_c * c
            elif D[t] > 0:
                avail = (B - bat.emin) * bat.eta_d
                d = max(min(D[t], bat.p_discharge * dt, avail), 0.0)
                discharge[t] = d
                B -= d / bat.eta_d
            stored[t] = B
        if not cyclic or abs(B - b_start) < tol:
            break
        b_start = B                      # start next pass from where this one ended
    return dict(charge=charge, discharge=discharge, stored=stored,
                imp=D - discharge, exp=S - charge, passes=p)


def energy_balance_residual(pv, load, r):
    """PV + import + discharge - (load + charge + export). Must be ~0 in every step."""
    return np.asarray(pv) + r["imp"] + r["discharge"] - (np.asarray(load) + r["charge"] + r["exp"])


def grid_cost(r, t_imp, t_fit):
    return float(np.sum(r["imp"] * t_imp - r["exp"] * t_fit))


# --------------------------------------------------------------------------- #
# 3. Optional: tariff-aware optimal dispatch (perfect foresight LP) - for TOU tariffs
# --------------------------------------------------------------------------- #
def optimal_dispatch_lp(pv, load, bat: Battery, t_imp, t_fit, dt=1.0,
                        pv_only_charging=True, allow_battery_export=False):
    """Minimises sum(t_imp*import - t_fit*export) subject to SOC, power, energy-balance and
    a cyclic (start = end) state. Gives the BEST POSSIBLE bill for this battery - use it as
    an upper bound; a real controller without perfect forecasts will do a bit worse."""
    import scipy.sparse as sp
    from scipy.optimize import linprog

    pv = np.asarray(pv, float); load = np.asarray(load, float)
    n = len(pv)
    t_imp = np.broadcast_to(np.asarray(t_imp, float), (n,))
    t_fit = np.broadcast_to(np.asarray(t_fit, float), (n,))
    S = np.maximum(pv - load, 0.0); D = np.maximum(load - pv, 0.0)

    # variable blocks: c | d | b | i | x   (charge, discharge, stored energy, import, export)
    c0, d0, b0_, i0, x0 = (k * n for k in range(5))
    idx = np.arange(n)
    rows, cols, vals = [], [], []
    def add(r, c, v): rows.append(r); cols.append(c); vals.append(v)

    for t in range(n):
        add(t, i0 + t, 1.0); add(t, d0 + t, 1.0); add(t, c0 + t, -1.0); add(t, x0 + t, -1.0)
        r = n + t
        add(r, b0_ + t, 1.0); add(r, b0_ + (t - 1) % n, -1.0)
        add(r, c0 + t, -bat.eta_c); add(r, d0 + t, 1.0 / bat.eta_d)
    A = sp.csr_matrix((vals, (rows, cols)), shape=(2 * n, 5 * n))
    beq = np.concatenate([load - pv, np.zeros(n)])

    c_ub = np.minimum(bat.p_charge * dt, S) if pv_only_charging else np.full(n, bat.p_charge * dt)
    d_ub = np.full(n, bat.p_discharge * dt)
    if not allow_battery_export:
        d_ub = np.minimum(d_ub, D)
    bounds = np.vstack([
        np.column_stack([np.zeros(n), c_ub]),
        np.column_stack([np.zeros(n), d_ub]),
        np.column_stack([np.full(n, bat.emin), np.full(n, bat.emax)]),
        np.column_stack([np.zeros(n), np.full(n, np.inf)]),
        np.column_stack([np.zeros(n), np.full(n, np.inf)]),
    ])
    cost = np.concatenate([np.zeros(3 * n), t_imp, -t_fit])
    res = linprog(cost, A_eq=A, b_eq=beq, bounds=bounds, method="highs")
    if not res.success:
        raise RuntimeError(res.message)
    z = res.x
    return dict(charge=z[c0:c0 + n], discharge=z[d0:d0 + n], stored=z[b0_:b0_ + n],
                imp=z[i0:i0 + n], exp=z[x0:x0 + n], cost=float(res.fun))


# --------------------------------------------------------------------------- #
# 4. Australian subsidy (Cheaper Home Batteries Program) - rules from 1 May 2026
#    Factors from the CER calculator page / Regulations amendment. CHECK them again
#    before every release: the factor changes twice a year.
# --------------------------------------------------------------------------- #
STC_FACTOR_SCHEDULE = [   # (valid from, STCs per usable kWh)
    (date(2026, 5, 1), 6.8), (date(2027, 1, 1), 5.7), (date(2027, 7, 1), 5.2),
    (date(2028, 1, 1), 4.6), (date(2028, 7, 1), 4.1), (date(2029, 1, 1), 3.6),
    (date(2029, 7, 1), 3.1), (date(2030, 1, 1), 2.6), (date(2030, 7, 1), 2.1),
]
PROGRAM_END = date(2030, 12, 31)


def stc_factor(install_date: date) -> float:
    if install_date < date(2026, 5, 1):
        raise ValueError("Before 1 May 2026 the old flat (untiered) rules applied.")
    if install_date > PROGRAM_END:
        return 0.0
    f = STC_FACTOR_SCHEDULE[0][1]
    for start, val in STC_FACTOR_SCHEDULE:
        if install_date >= start:
            f = val
    return f


def tier_weighted_kwh(usable_kwh: float) -> float:
    """Eq. (16): 100 % to 14 kWh, 60 % from 14-28 kWh, 15 % from 28-50 kWh, nothing above 50."""
    u = min(usable_kwh, 50.0)
    return min(u, 14) + 0.60 * min(max(u - 14, 0), 14) + 0.15 * min(max(u - 28, 0), 22)


def subsidy_aud(usable_kwh, install_date, stc_price, eligible=True, round_down=True):
    """Indicative only. STC price is a market price - take it from the installer quote.
    Confirm certificate rounding with the CER calculator."""
    if not eligible or usable_kwh < 5:
        return 0.0
    stcs = stc_factor(install_date) * tier_weighted_kwh(usable_kwh)
    if round_down:
        stcs = np.floor(stcs)
    return float(stcs * stc_price)


# --------------------------------------------------------------------------- #
# 5. Economics - lifetime NPV with tariff escalation and capacity fade
# --------------------------------------------------------------------------- #
def crf(r, L):
    return 1.0 / L if r == 0 else r * (1 + r) ** L / ((1 + r) ** L - 1)


def evaluate(pv, load, t_imp, t_fit, bat: Battery | None, gross_capex, *,
             install_date=date(2026, 11, 1), stc_price=37.0, eligible=True,
             r=0.06, years=10, om_frac=0.01, escalation=0.0, fade_per_year=0.0, dt=1.0,
             dispatch=None):
    """Returns NPV of owning this battery vs. no battery, plus year-1 numbers.
    dispatch: optional function(pv, load, bat_year, t_imp, t_fit) -> result dict
    (e.g. a wrapper around optimal_dispatch_lp for TOU)."""
    pv = np.asarray(pv, float); load = np.asarray(load, float)
    base = simulate(pv, load, None, dt)
    base_cost = grid_cost(base, t_imp, t_fit)

    if bat is None or bat.usable <= 0:
        return dict(npv=0.0, equiv_annual=0.0, net_capex=0.0, subsidy=0.0, saving_y1=0.0,
                    payback_years=float("inf"), usable=0.0)

    subsidy = subsidy_aud(bat.usable, install_date, stc_price, eligible)
    net_capex = gross_capex - subsidy
    om = om_frac * gross_capex
    npv, saving_y1 = -net_capex, 0.0
    for y in range(1, years + 1):
        by = bat.faded((1 - fade_per_year) ** (y - 1))
        res = dispatch(pv, load, by, t_imp, t_fit) if dispatch else simulate(pv, load, by, dt)
        esc = (1 + escalation) ** (y - 1)
        saving = (base_cost - grid_cost(res, t_imp, t_fit)) * esc
        if y == 1:
            saving_y1 = saving
        npv += (saving - om) / (1 + r) ** y
    net_annual_y1 = saving_y1 - om
    return dict(npv=npv, equiv_annual=npv * crf(r, years), net_capex=net_capex, subsidy=subsidy,
                saving_y1=saving_y1, usable=bat.usable,
                payback_years=net_capex / net_annual_y1 if net_annual_y1 > 0 else float("inf"))


def rank_products(pv, load, t_imp, t_fit, products, **econ):
    """products: list of dicts {name, usable_kwh, power_kw, price_aud}. A 'no battery' option is added."""
    out = [dict(name="No battery", **evaluate(pv, load, t_imp, t_fit, None, 0.0, **econ))]
    for p in products:
        b = Battery.from_usable(p["usable_kwh"], p["power_kw"])
        out.append(dict(name=p["name"], **evaluate(pv, load, t_imp, t_fit, b, p["price_aud"], **econ)))
    return sorted(out, key=lambda d: d["npv"], reverse=True)


# --------------------------------------------------------------------------- #
# 6. Self-tests  (run: python battery_model.py)
# --------------------------------------------------------------------------- #
def _synthetic_year(seed=42):
    """Test data only. NOT thesis data."""
    rng = np.random.default_rng(seed)
    h = np.arange(8760); hod = h % 24; doy = h // 24
    sun = np.clip(np.sin(np.pi * (hod - 6) / 12), 0, None)
    pv = sun * (1 + 0.35 * np.cos(2 * np.pi * (doy - 355) / 365)) * np.repeat(rng.uniform(0.4, 1, 365), 24)
    pv *= 10539 / pv.sum()
    load = 0.25 + 0.35 * np.exp(-0.5 * ((hod - 7.5) / 1.5) ** 2) + 0.9 * np.exp(-0.5 * ((hod - 19) / 2) ** 2)
    load *= 5780 / load.sum()
    return pv, load


def run_tests():
    # 1. Worked example of the report (section 6.2)
    bat = Battery(emin=1.0, emax=9.5, p_charge=5, p_discharge=5)
    r = simulate([5.0, 0.0], [1.5, 4.0], bat, b0=4.0, cyclic=False)
    assert abs(r["stored"][0] - 7.325) < 1e-9, r["stored"]
    assert abs(r["stored"][1] - 3.11447368) < 1e-6, r["stored"]
    assert r["exp"][0] == 0 and r["imp"][1] == 0
    print("PASS worked example (7.325 kWh, 3.114 kWh)")

    pv, load = _synthetic_year()
    t_imp, t_fit = 0.35, 0.05

    # 2. aggregate no-battery numbers
    z = simulate(pv, load, None)
    assert abs(pv.sum() - 10539) < 1e-6 and abs(load.sum() - 5780) < 1e-6
    assert abs(z["imp"].sum() - (load.sum() - np.minimum(pv, load).sum())) < 1e-6
    print(f"PASS no-battery baseline: import {z['imp'].sum():.0f} kWh, export {z['exp'].sum():.0f} kWh (synthetic)")

    # 3. energy balance, SOC limits, power limits, cyclic state
    for Eb in (0, 5, 10, 13.5, 20):
        b = Battery.from_nominal(Eb) if Eb > 0 else None
        r = simulate(pv, load, b)
        assert np.max(np.abs(energy_balance_residual(pv, load, r))) < 1e-8
        if b:
            assert r["stored"].min() >= b.emin - 1e-9 and r["stored"].max() <= b.emax + 1e-9
            assert r["charge"].max() <= b.p_charge + 1e-9 and r["discharge"].max() <= b.p_discharge + 1e-9
            r2 = simulate(pv, load, b, b0=r["stored"][-1], cyclic=False)   # restart from the end state
            assert abs(r2["stored"][-1] - r["stored"][-1]) < 1e-5, "annual SOC cycle not closed"
    print("PASS energy balance / SOC / power / cyclic for all capacities")

    # 4. zero PV -> battery never charges
    r = simulate(np.zeros(48), np.full(48, 1.0), Battery.from_nominal(10))
    assert r["charge"].sum() == 0 and r["discharge"].sum() == 0
    print("PASS zero-PV stress")

    # 5. objective equivalence: C_grid(0) - C_grid(E) == sum(Ti*Ed - Tfit*Ec)
    b = Battery.from_nominal(10)
    r = simulate(pv, load, b)
    lhs = grid_cost(z, t_imp, t_fit) - grid_cost(r, t_imp, t_fit)
    rhs = np.sum(t_imp * r["discharge"] - t_fit * r["charge"])
    assert abs(lhs - rhs) < 1e-7
    print("PASS objective equivalence (Eq. 14 = Eq. 15)")

    # 6. finance helpers
    assert abs(crf(0, 10) - 0.1) < 1e-12 and abs(crf(0.06, 10) - 0.135868) < 1e-6
    assert abs(tier_weighted_kwh(20) - 17.6) < 1e-9 and abs(tier_weighted_kwh(60) - (14 + 8.4 + 3.3)) < 1e-9
    assert stc_factor(date(2026, 11, 1)) == 6.8 and stc_factor(date(2027, 3, 1)) == 5.7
    print(f"PASS subsidy: 10 kWh, Nov 2026, STC price $37 -> ${subsidy_aud(10, date(2026, 11, 1), 37):,.0f} (indicative)")

    # 7. LP dispatch is never worse than the greedy rule (flat tariff) and beats it under TOU
    n = 24 * 30
    p30, l30 = pv[:n], load[:n]
    b = Battery.from_nominal(10)
    g = simulate(p30, l30, b)
    lp = optimal_dispatch_lp(p30, l30, b, t_imp, t_fit)
    assert lp["cost"] <= grid_cost(g, t_imp, t_fit) + 1e-6
    tou = np.where((np.arange(n) % 24 >= 17) & (np.arange(n) % 24 < 21), 0.55, 0.25)
    g2, lp2 = simulate(p30, l30, b), optimal_dispatch_lp(p30, l30, b, tou, t_fit)
    assert lp2["cost"] <= grid_cost(g2, tou, t_fit) + 1e-6
    print(f"PASS LP dispatch: flat {grid_cost(g, t_imp, t_fit):.2f} -> {lp['cost']:.2f}; "
          f"TOU {grid_cost(g2, tou, t_fit):.2f} -> {lp2['cost']:.2f} AUD/30 days")

    # 8. sensitivity to lifetime: shows why 'economic life' must be a user input, not a constant
    prods = [dict(name=f"{k} kWh", usable_kwh=k, power_kw=0.5 * k, price_aud=1000 + 700 * k) for k in (5, 7.5, 10, 13.5)]
    for L in (10, 15):
        top = rank_products(pv, load, t_imp, t_fit, prods, years=L)[0]
        print(f"INFO life={L} y, flat tariff, synthetic data, hypothetical prices -> best: {top['name']} (NPV {top['npv']:.0f})")
    print("ALL TESTS PASSED")


if __name__ == "__main__":
    run_tests()
