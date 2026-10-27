/**
 * battery.ts - Consistent Battery Specification and Factory Methods
 * Implements Phase 2 of Agent Instructions and reference implementation in battery_model.py
 */

export interface BatterySpecs {
  emin: number;          // kWh, lowest stored energy allowed
  emax: number;          // kWh, highest stored energy allowed
  p_charge: number;      // kW, max AC charge power
  p_discharge: number;   // kW, max AC discharge power
  eta_c?: number;        // charging efficiency (default 0.95)
  eta_d?: number;        // discharging efficiency (default 0.95)
}

export class Battery {
  readonly emin: number;
  readonly emax: number;
  readonly p_charge: number;
  readonly p_discharge: number;
  readonly eta_c: number;
  readonly eta_d: number;

  constructor(specs: BatterySpecs) {
    if (specs.emin < 0 || specs.emax < specs.emin) {
      throw new Error(`Invalid battery energy boundaries: emin=${specs.emin}, emax=${specs.emax}`);
    }
    if (specs.p_charge < 0 || specs.p_discharge < 0) {
      throw new Error(`Invalid battery power: p_charge=${specs.p_charge}, p_discharge=${specs.p_discharge}`);
    }
    this.emin = specs.emin;
    this.emax = specs.emax;
    this.p_charge = specs.p_charge;
    this.p_discharge = specs.p_discharge;
    this.eta_c = specs.eta_c ?? 0.95;
    this.eta_d = specs.eta_d ?? 0.95;
  }

  get usable(): number {
    return Math.max(0, this.emax - this.emin);
  }

  /**
   * Use for generic research studies where Eb is physical/nominal capacity
   * and you want an SOC operating window (e.g. 10%–95%, 0.5 C-rate).
   */
  static fromNominal(
    Eb: number,
    a_min = 0.10,
    a_max = 0.95,
    c_rate = 0.5,
    eta_c = 0.95,
    eta_d = 0.95
  ): Battery {
    return new Battery({
      emin: a_min * Eb,
      emax: a_max * Eb,
      p_charge: c_rate * Eb,
      p_discharge: c_rate * Eb,
      eta_c,
      eta_d,
    });
  }

  /**
   * Use for catalogue products. Manufacturers already quote USABLE kWh,
   * so do NOT apply an extra 10–95 % window on top of it.
   */
  static fromUsable(
    usable_kwh: number,
    power_kw: number,
    reserve_frac = 0.0,
    eta_c = 0.95,
    eta_d = 0.95
  ): Battery {
    return new Battery({
      emin: reserve_frac * usable_kwh,
      emax: usable_kwh,
      p_charge: power_kw,
      p_discharge: power_kw,
      eta_c,
      eta_d,
    });
  }

  /**
   * Capacity fade: shrink the usable window to remaining_fraction of the original.
   * emax = emin + usable * remaining_fraction
   */
  faded(remainingFraction: number): Battery {
    return new Battery({
      emin: this.emin,
      emax: this.emin + this.usable * remainingFraction,
      p_charge: this.p_charge,
      p_discharge: this.p_discharge,
      eta_c: this.eta_c,
      eta_d: this.eta_d,
    });
  }
}
