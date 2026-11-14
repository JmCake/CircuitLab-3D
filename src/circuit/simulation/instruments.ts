import { createDefaultParams, getDefinition } from '../catalog';
import type { CircuitSnapshot, ElementResult, LabComponent, SimulationOptions, SimulationResult } from '../types';
import { add as addComplex, zero } from './complex';

export const isBenchInstrument = (c: LabComponent) => ['programmable-supply', 'multimeter', 'oscilloscope'].includes(c.type);
type Solver = (snapshot: CircuitSnapshot, options?: SimulationOptions) => SimulationResult;
/** Expand physical instruments into explicit electrical branches, preserving their external ports. */
export function simulateInstruments(snapshot: CircuitSnapshot, options: SimulationOptions, solve: Solver): SimulationResult {
  const components = snapshot.components.filter(c => !isBenchInstrument(c));
  const used = new Set(snapshot.components.map(c => c.id)), map = new Map<string, string>(), owners = new Map<string, string>();
  const children = new Map<string, string[]>(), internal: CircuitSnapshot['wires'] = [];
  const ac = snapshot.components.some(c => c.type === 'three-phase-source' && c.params.enabled);
  const live = snapshot.components.some(c => (c.type === 'power-supply' || c.type === 'three-phase-source') && c.params.enabled || c.type === 'programmable-supply' && c.params.enabled && (c.params.output1 || c.params.output2));
  const unsafeOhms = live || !!options.transient || snapshot.components.some(c => ['bulb', 'led', 'capacitor'].includes(c.type));
  const add = (parent: LabComponent, type: LabComponent['type'], params: LabComponent['params']) => {
    let id = `${parent.id}~branch${children.get(parent.id)?.length ?? 0}`;
    while (used.has(id)) id += '~'; used.add(id); owners.set(id, parent.id);
    children.set(parent.id, [...children.get(parent.id) ?? [], id]);
    components.push({ ...parent, id, type, params: { ...createDefaultParams(type), ...params } }); return id;
  };
  const port = (original: string, child: string, key: string) => map.set(original, `${child}:${key}`);
  for (const c of snapshot.components.filter(isBenchInstrument)) {
    if (c.type === 'programmable-supply') {
      for (const ch of [1, 2]) {
        const suffix = ch === 1 ? '' : '2';
        const id = add(c, 'power-supply', { enabled: Boolean(c.params.enabled && c.params[`output${ch}`]), voltage: Number(c.params[`voltage${suffix}`]), internalResistance: 0.2, currentLimit: Number(c.params[`currentLimit${suffix}`]) });
        port(`${c.id}:positive${suffix}`, id, 'positive'); port(`${c.id}:negative${suffix}`, id, 'negative');
      }
    } else if (c.type === 'multimeter') {
      const resistance = c.params.mode === 'ohms' && c.params.enabled && !unsafeOhms;
      const v = add(c, resistance ? 'power-supply' : 'voltmeter', resistance ? { voltage: 1, internalResistance: 1000, enabled: true } : { range: c.params.voltageRange, mode: c.params.mode === 'acv' ? 'ac' : 'dc' });
      const i = add(c, 'ammeter', { range: c.params.currentRange, mode: c.params.mode === 'aci' ? 'ac' : 'dc' });
      port(`${c.id}:positive`, v, 'positive'); port(`${c.id}:negative`, v, 'negative'); port(`${c.id}:current`, i, 'positive');
      internal.push({ id: `${c.id}~common`, fromPortId: `${v}:negative`, toPortId: `${i}:negative`, color: '#222222' });
    } else {
      const a = add(c, 'voltmeter', { internalResistance: 1e6, range: 1e6, mode: ac ? 'ac' : 'dc' });
      const b = add(c, 'voltmeter', { internalResistance: 1e6, range: 1e6, mode: ac ? 'ac' : 'dc' });
      port(`${c.id}:ch1`, a, 'positive'); port(`${c.id}:ch2`, b, 'positive'); port(`${c.id}:negative`, a, 'negative');
      internal.push({ id: `${c.id}~common`, fromPortId: `${a}:negative`, toPortId: `${b}:negative`, color: '#222222' });
    }
  }
  const result = solve({ components, wires: [...snapshot.wires.map(w => ({ ...w, fromPortId: map.get(w.fromPortId) ?? w.fromPortId, toPortId: map.get(w.toPortId) ?? w.toPortId })), ...internal] }, options);
  const raw = result.elements;
  const elements: Record<string, ElementResult> = Object.fromEntries(Object.entries(raw).filter(([id]) => !owners.has(id)));
  // Branch meter mode/range diagnostics refer only to the mode actually selected on the DMM.
  result.diagnostics = result.diagnostics.filter(d => !d.componentIds?.some(id => owners.has(id) && snapshot.components.find(c => c.id === owners.get(id))?.type === 'multimeter') || !d.code.includes('meter'));
  result.diagnostics = result.diagnostics.map(d => ({ ...d, componentIds: d.componentIds?.map(id => owners.get(id) ?? id) }));
  for (const c of snapshot.components.filter(isBenchInstrument)) {
    const [a, b] = children.get(c.id)!.map(id => raw[id] ?? { voltage: 0, current: 0, power: 0 });
    const e: ElementResult = { voltage: a.voltage, current: a.current, power: a.power + b.power, flags: {} };
    if (c.type === 'programmable-supply') {
      e.flags = { outputVoltage: a.voltage, outputCurrent: a.current, voltage2: b.voltage, current2: b.current, mode1: String(a.flags?.regulation ?? 'OFF'), mode2: String(b.flags?.regulation ?? 'OFF'), terminal_positive: -a.current, terminal_negative: a.current, terminal_positive2: -b.current, terminal_negative2: b.current };
      if (a.current < -1e-6 || b.current < -1e-6) result.diagnostics.push({ code: 'psu-backfeed', level: 'error', componentIds: [c.id], message: '双路电源存在反向灌电流，当前模型不支持吸收功率，请检查电源互联。' });
    } else if (c.type === 'multimeter') {
      const mode = String(c.params.mode), isCurrent = mode.endsWith('i'), resistance = mode === 'ohms';
      const wired = (key: string) => snapshot.wires.some(w => w.fromPortId === `${c.id}:${key}` || w.toPortId === `${c.id}:${key}`);
      const activeProbe = wired('negative') && wired(isCurrent ? 'current' : 'positive');
      const internalSource = resistance && c.params.enabled && !unsafeOhms;
      const iv = internalSource ? -a.current : a.current;
      e.power = (internalSource ? -a.power : a.power) + b.power;
      e.readingUnit = resistance ? 'Ω' : isCurrent ? 'A' : 'V';
      e.voltage = isCurrent ? b.voltage : a.voltage; e.current = isCurrent ? b.current : iv;
      e.reading = !c.params.enabled || !activeProbe ? undefined : resistance ? (unsafeOhms || a.current < 1e-10 ? undefined : a.voltage / a.current) : (isCurrent ? b.reading : a.reading);
      e.overRange = e.reading !== undefined && Math.abs(e.reading) > Number(c.params[resistance ? 'resistanceRange' : isCurrent ? 'currentRange' : 'voltageRange']);
      if (e.overRange) result.diagnostics.push({ code: 'dmm-over-range', level: 'warning', componentIds: [c.id], message: `${c.name} 已超量程。` });
      const wrongMode = !resistance && mode.startsWith('ac') !== (result.domain === 'ac');
      const wrongJack = !isCurrent && Math.abs(b.current) > 1e-5;
      e.flags = { activeProbe, terminal_positive: iv, terminal_negative: -iv - b.current, terminal_current: b.current, invalidReading: !c.params.enabled || wrongMode || wrongJack || resistance && unsafeOhms, openCircuit: resistance && !unsafeOhms && a.current < 1e-10 };
      if (c.params.enabled && activeProbe && (resistance && unsafeOhms || wrongMode || wrongJack)) result.diagnostics.push({ code: 'dmm-invalid', level: 'warning', componentIds: [c.id], message: resistance && unsafeOhms ? '电阻挡仅用于断电的线性电阻网络，请断开外部电源并移除储能或非线性元件。' : wrongJack ? '电流插孔仍接有低阻分流器，请检查万用表插孔与挡位。' : '万用表 AC/DC 挡位与当前信号不匹配。' });
    } else {
      e.flags = { ch1: a.voltage, ch2: b.voltage, terminal_ch1: a.current, terminal_ch2: b.current, terminal_negative: -a.current - b.current };
    }
    elements[c.id] = e;
  }
  const physical = snapshot.components.flatMap(c => getDefinition(c.type).ports.map(p => `${c.id}:${p.key}`));
  const remap = <T>(values: Record<string, T>) => Object.fromEntries(physical.filter(id => (map.get(id) ?? id) in values).map(id => [id, values[map.get(id) ?? id]]));
  const terminalCurrents = result.ac && remap(result.ac.terminalCurrents);
  if (terminalCurrents) for (const c of snapshot.components.filter(c => c.type === 'multimeter' || c.type === 'oscilloscope')) {
    terminalCurrents[`${c.id}:negative`] = children.get(c.id)!.reduce((sum, id) => addComplex(sum, result.ac!.terminalCurrents[`${id}:negative`] ?? zero()), zero());
  }
  return { ...result, status: result.diagnostics.some(d => d.level === 'error') ? 'error' : result.status, elements, portVoltages: result.portVoltages && remap(result.portVoltages), ac: result.ac && { ...result.ac, portVoltages: remap(result.ac.portVoltages), terminalCurrents: terminalCurrents! } };
}
