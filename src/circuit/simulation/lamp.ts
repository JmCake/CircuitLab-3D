import type { LabComponent } from '../types';

/** Steady-state tungsten approximation; calibrated to rated hot resistance, not measured lamp data. */
export function lampOperatingPoint(component: LabComponent, voltage: number) {
  const hot = Math.max(1e-3, Number(component.params.resistance) || 120);
  const ratedPower = Math.max(1e-6, Number(component.params.ratedPower) || 0.3);
  const ratedVoltage = Math.sqrt(hot * ratedPower);
  const cold = hot * 0.1;
  const beta = 0.55;
  const thermal = (hot - cold) * (Math.abs(voltage) / ratedVoltage) ** beta;
  const resistance = cold + thermal;
  return { current: voltage / resistance, conductance: (cold + (1 - beta) * thermal) / (resistance * resistance), resistance, ratedVoltage };
}
