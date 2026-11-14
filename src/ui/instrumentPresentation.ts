import { getDefinition, type ComponentType, type ElementResult, type LabComponent, type SimulationResult, type Wire } from '../circuit';
import type { ScopeFrame } from '../circuit/scope';
import { formatCurrent, formatResistance, formatVoltage } from './format';

export const hasInstrumentDisplay = (type: ComponentType) => ['oscilloscope', 'multimeter', 'programmable-supply', 'power-supply', 'three-phase-source', 'ammeter', 'voltmeter', 'capacitor'].includes(type);
export function instrumentParams(c: LabComponent) {
  return getDefinition(c.type).params.filter(p => c.type !== 'multimeter' || !p.key.endsWith('Range') || p.key ===
    (c.params.mode === 'ohms' ? 'resistanceRange' : String(c.params.mode).endsWith('i') ? 'currentRange' : 'voltageRange'));
}
export function meterConnected(c: LabComponent, e: ElementResult | undefined, wires: Wire[]) {
  if (c.type === 'multimeter') return Boolean(e?.flags?.activeProbe);
  return ['positive', 'negative'].every(key => wires.some(w => w.fromPortId === `${c.id}:${key}` || w.toPortId === `${c.id}:${key}`));
}
export function meterReading(c: LabComponent, result: SimulationResult, wires: Wire[]) {
  const e = result.elements[c.id];
  if (!result.solved || !e || c.params.enabled === false || e.flags?.invalidReading) return '—';
  if (e.overRange || e.flags?.openCircuit) return 'OL';
  if (!meterConnected(c, e, wires)) return '—';
  if (['ammeter', 'voltmeter'].includes(c.type) && (c.params.mode === 'ac') !== (result.domain === 'ac')) return '—';
  return e.readingUnit === 'Ω' ? formatResistance(e.reading) : e.readingUnit === 'A' || c.type === 'ammeter' ? formatCurrent(e.reading) : formatVoltage(e.reading, 3);
}
/** Fit actual captured voltages into the eight-division graticule, with room beyond each peak. */
export function autoScopeRanges(c: LabComponent, frame: ScopeFrame) {
  return frame.traces.map((trace, i) => {
    const field = getDefinition(c.type).params.find(p => p.key === `voltsDiv${i + 1}`);
    if (!trace.connected || !trace.points.length || field?.kind !== 'select') return Number(c.params[`voltsDiv${i + 1}`]);
    const needed = Math.max(...trace.points.map(p => Math.abs(p.voltage))) / 3.6;
    const ranges = field.options.map(o => Number(o.value)).sort((a, b) => a - b);
    return ranges.find(v => v >= needed) ?? ranges.at(-1)!;
  });
}
