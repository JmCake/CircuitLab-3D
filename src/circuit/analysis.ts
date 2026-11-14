import { createDefaultParams, getDefinition, getInternalPortGroups } from './catalog';
import { simulateCircuit } from './simulation/simulator';
import { UnionFind } from './simulation/unionFind';
import { makePortId, type CircuitSnapshot, type LabComponent, type SimulationResult } from './types';

/** Signed current entering every external terminal. A supply's reported current is delivered. */
export function terminalCurrents(component: LabComponent, result: SimulationResult): Record<string, number> {
  const element = result.elements[component.id];
  if (!element) return {};
  const ports = getDefinition(component.type).ports;
  if (['programmable-supply', 'multimeter', 'oscilloscope'].includes(component.type)) return Object.fromEntries(ports.map(p => [p.key, Number(element.flags?.[`terminal_${p.key}`] ?? 0)]));
  if (component.type === 'breadboard') return {};
  if (component.type === 'rheostat') {
    const ia = Number(element.flags?.currentAW ?? element.current);
    const ib = Number(element.flags?.currentBW ?? 0);
    return { a: ia, b: ib, w: -ia - ib };
  }
  const current = component.type === 'power-supply' ? -element.current : element.current;
  return { [ports[0].key]: current, [ports[1].key]: -current };
}

/** Independent conservation check, using the actual wire nets, including breadboard groups. */
export function auditCircuit(snapshot: CircuitSnapshot, result: SimulationResult) {
  if (!result.solved || result.domain === 'ac') return null;
  const union = new UnionFind();
  const known = new Set<string>();
  for (const c of snapshot.components) {
    for (const p of getDefinition(c.type).ports) {
      const id = makePortId(c.id, p.key);
      union.add(id);
      known.add(id);
    }
    for (const group of getInternalPortGroups(c)) {
      for (const key of group.slice(1)) union.union(makePortId(c.id, group[0]), makePortId(c.id, key));
    }
  }
  for (const w of snapshot.wires) {
    if (known.has(w.fromPortId) && known.has(w.toPortId)) union.union(w.fromPortId, w.toPortId);
  }
  const netCurrents = new Map<string, number>();
  let deliveredPower = 0;
  let absorbedPower = 0;
  let currentScale = 0;
  for (const c of snapshot.components) {
    const e = result.elements[c.id];
    if (!e) continue;
    if (c.type === 'power-supply' || c.type === 'programmable-supply') deliveredPower += e.power;
    else absorbedPower += e.power;
    for (const [key, current] of Object.entries(terminalCurrents(c, result))) {
      const net = union.find(makePortId(c.id, key));
      netCurrents.set(net, (netCurrents.get(net) ?? 0) + current);
      currentScale = Math.max(currentScale, Math.abs(current));
    }
  }
  const kclResidual = Math.max(0, ...Array.from(netCurrents.values(), Math.abs));
  const powerResidual = Math.abs(deliveredPower - absorbedPower);
  return {
    kclResidual, powerResidual, deliveredPower, absorbedPower,
    passed: kclResidual < Math.max(1e-8, currentScale * 1e-6) &&
      powerResidual < Math.max(1e-8, Math.abs(deliveredPower) * 1e-6),
  };
}

export interface TheveninResult {
  voltage: number;
  resistance: number;
  predictedCurrent: number;
  predictedVoltage: number;
  maxPower: number;
}

/**
 * Remove a two-terminal resistive load, keeping its wire junctions via a high impedance probe.
 * Suppress enabled voltage sources by setting E=0, retaining their physical series resistance.
 * A 1 V / 1 Ω test source determines Rth = 1 / Itest - 1. No live workspace is mutated.
 * Only linear DC networks are eligible; LED networks are deliberately refused.
 */
export function analyzeThevenin(snapshot: CircuitSnapshot, loadId: string): TheveninResult | null {
  const load = snapshot.components.find(c => c.id === loadId);
  if (!load || !['resistor', 'resistor-box', 'bulb'].includes(load.type) ||
      snapshot.components.some(c => ['led', 'capacitor', 'bulb', 'three-phase-source', 'programmable-supply', 'multimeter', 'oscilloscope'].includes(c.type))) return null;
  const keys = getDefinition(load.type).ports;
  // Reuse the load ID/port keys so junctions with several stacked leads stay connected.
  const probeId = '__analysis_probe__';
  if (snapshot.components.some(c => c.id === probeId)) return null;
  const probe: LabComponent = {
    id: probeId, type: 'voltmeter', name: '开路探针', position: [0, 0], rotationY: 0,
    params: { ...createDefaultParams('voltmeter'), internalResistance: 1e12 },
  };
  const remap = (id: string) => id === makePortId(load.id, keys[0].key) ? `${probeId}:positive`
    : id === makePortId(load.id, keys[1].key) ? `${probeId}:negative` : id;
  const wires = snapshot.wires.map(w => ({ ...w, fromPortId: remap(w.fromPortId), toPortId: remap(w.toPortId) }));
  const rest = snapshot.components.filter(c => c.id !== loadId);
  const open = simulateCircuit({ components: [...rest, probe], wires });
  const zeroed = rest.map(c => c.type === 'power-supply' && c.params.enabled
    ? { ...c, params: { ...c.params, voltage: 0 } } : c);
  const test: LabComponent = { ...probe, type: 'power-supply', params: { voltage: 1, internalResistance: 1, enabled: true } };
  const injected = simulateCircuit({ components: [...zeroed, test], wires });
  const current = injected.elements[probeId]?.current;
  if (!open.solved || open.status === 'error' || !injected.solved || injected.status === 'error' || !current || current <= 1e-10) return null;
  const resistance = Math.max(0, 1 / current - 1);
  if (resistance < 1e-6 || !Number.isFinite(resistance)) return null;
  // Remove the known finite probe loading analytically (Rprobe = 1 TΩ).
  const voltage = open.elements[probeId].voltage * (1 + resistance / 1e12);
  const loadResistance = Number(load.params.resistance);
  const predictedCurrent = voltage / (resistance + loadResistance);
  return { voltage, resistance, predictedCurrent, predictedVoltage: predictedCurrent * loadResistance,
    maxPower: voltage * voltage / (4 * resistance) };
}

/** Linearity check with independent sources suppressed, not physically switched off/opened. */
export function analyzeSuperposition(snapshot: CircuitSnapshot, targetId: string) {
  const sources = snapshot.components.filter(c => c.type === 'power-supply' && c.params.enabled);
  if (sources.length < 2 || snapshot.components.some(c => ['led', 'capacitor', 'bulb', 'three-phase-source', 'programmable-supply', 'multimeter', 'oscilloscope'].includes(c.type))) return null;
  const full = simulateCircuit(snapshot);
  if (!full.solved || full.status === 'error' || !full.elements[targetId]) return null;
  const contributions = sources.map(source => {
    const components = snapshot.components.map(c => c.type === 'power-supply' && c.params.enabled && c.id !== source.id
      ? { ...c, params: { ...c.params, voltage: 0 } } : c);
    const result = simulateCircuit({ ...snapshot, components });
    return { sourceId: source.id, name: source.name, current: result.elements[targetId]?.current ?? NaN, solved: result.solved && result.status !== 'error' };
  });
  if (contributions.some(c => !c.solved || !Number.isFinite(c.current))) return null;
  const total = full.elements[targetId].current;
  const sum = contributions.reduce((v, c) => v + c.current, 0);
  return { contributions, total, sum, error: Math.abs(sum - total) };
}
