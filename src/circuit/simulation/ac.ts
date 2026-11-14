import { getDefinition } from '../catalog';
import type { CircuitSnapshot, Complex, Diagnostic, ElementResult, SimulationResult } from '../types';
import { makePortId } from '../types';
import { add, sub, scale, zero, polar, magnitude, realPower } from './complex';
import { solveLinearSystem } from './linalg';
import { UnionFindNumbers } from './unionFind';

interface Nets { nets: string[][]; portNet: Map<string, number>; diagnostics: Diagnostic[] }
interface Branch { componentId: string; p: string; n: string; a: number; b: number; resistance: number; emf?: Complex }
const positive = (v: unknown, fallback: number) => Math.max(1e-6, Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : fallback);

/** Single-frequency RMS phasor analysis of resistive three-phase networks, independent of the DC solver. */
export function simulateAC(snapshot: CircuitSnapshot, network: Nets): SimulationResult {
  const { nets, portNet } = network;
  const diagnostics = [...network.diagnostics];
  const elements: Record<string, ElementResult> = Object.fromEntries(snapshot.components.map(c => [c.id, { current: 0, voltage: 0, power: 0 }]));
  const sources = snapshot.components.filter(c => c.type === 'three-phase-source' && c.params.enabled);
  const frequencyHz = Number(sources[0]?.params.frequencyHz ?? 50);
  const failure = (code: string, message: string): SimulationResult => ({ domain: 'ac', status: 'error', solved: false,
    nodeVoltages: {}, elements, diagnostics: [...diagnostics, { code, level: 'error', message }] });
  if (sources.some(c => Number(c.params.frequencyHz ?? 50) !== frequencyHz)) return failure('ac-frequency-conflict', '当前交流求解要求所有电源具有相同频率。');
  if (snapshot.components.some(c => c.type === 'power-supply' && c.params.enabled)) return failure('mixed-domain', '当前实验请使用同频交流电源；直流与交流混合分析尚未实现。');

  const branches: Branch[] = [];
  const addBranch = (id: string, pk: string, nk: string, resistance: number, emf?: Complex) => {
    const p = makePortId(id, pk), n = makePortId(id, nk);
    const a = portNet.get(p), b = portNet.get(n);
    if (a !== undefined && b !== undefined) branches.push({ componentId: id, p, n, a, b, resistance: Math.max(1e-6, resistance), emf });
  };
  for (const c of snapshot.components) {
    switch (c.type) {
      case 'three-phase-source':
        if (c.params.enabled) {
          const sign = c.params.sequence === 'ACB' ? -1 : 1;
          for (const [key, degrees] of [['a', 0], ['b', -120 * sign], ['c', 120 * sign]] as const) {
            addBranch(c.id, key, 'n', positive(c.params.internalResistance, 0.2), polar(Number(c.params.phaseVoltage ?? 24), degrees));
          }
        }
        break;
      case 'resistor': case 'resistor-box': addBranch(c.id, 'a', 'b', Math.max(1e-6, Number(c.params.resistance) || 0)); break;
      case 'switch': if (c.params.closed) addBranch(c.id, 'a', 'b', positive(c.params.onResistance, 0.01)); break;
      case 'ammeter': case 'voltmeter': addBranch(c.id, 'positive', 'negative', positive(c.params.internalResistance, c.type === 'ammeter' ? 0.1 : 1e7)); break;
      case 'rheostat': {
        const r = positive(c.params.maxResistance, 50), t = Math.max(0, Math.min(1, Number(c.params.position) || 0));
        addBranch(c.id, 'a', 'w', Math.max(1e-6, r * t)); addBranch(c.id, 'b', 'w', Math.max(1e-6, r * (1 - t)));
        break;
      }
    }
  }
  const islands = new UnionFindNumbers(nets.length);
  for (const branch of branches) islands.union(branch.a, branch.b);
  const sourceRoots = new Set(sources.flatMap(c => getDefinition(c.type).ports.map(p => islands.find(portNet.get(makePortId(c.id, p.key))!))));
  for (const c of snapshot.components.filter(c => ['led', 'bulb', 'capacitor'].includes(c.type))) {
    if (getDefinition(c.type).ports.some(p => sourceRoots.has(islands.find(portNet.get(makePortId(c.id, p.key))!)))) {
      return failure('unsupported-ac-element', `${c.name} 的交流模型尚未实现；三相实验使用电阻负载。`);
    }
  }
  const grounds = new Map<number, number>();
  for (let i = 0; i < nets.length; i++) if (!grounds.has(islands.find(i))) grounds.set(islands.find(i), i);
  for (const c of sources) { const n = portNet.get(makePortId(c.id, 'n'))!; grounds.set(islands.find(n), n); }
  const grounded = new Set(grounds.values());
  const indices = new Map<number, number>();
  for (let i = 0; i < nets.length; i++) if (!grounded.has(i)) indices.set(i, indices.size);
  const size = indices.size;
  const matrix = Array.from({ length: size }, () => Array<number>(size).fill(0));
  const rhsRe = Array<number>(size).fill(0), rhsIm = Array<number>(size).fill(0);
  for (const branch of branches) {
    const a = indices.get(branch.a), b = indices.get(branch.b), g = 1 / branch.resistance;
    if (branch.a === branch.b) continue;
    if (a !== undefined) { matrix[a][a] += g; rhsRe[a] += (branch.emf?.re ?? 0) * g; rhsIm[a] += (branch.emf?.im ?? 0) * g; }
    if (b !== undefined) { matrix[b][b] += g; rhsRe[b] -= (branch.emf?.re ?? 0) * g; rhsIm[b] -= (branch.emf?.im ?? 0) * g; }
    if (a !== undefined && b !== undefined) { matrix[a][b] -= g; matrix[b][a] -= g; }
  }
  const re = solveLinearSystem(matrix, rhsRe, 1e-13).solution;
  const im = solveLinearSystem(matrix, rhsIm, 1e-13).solution;
  if (!re || !im) return failure('ac-singular', '交流节点方程没有唯一解，请检查接线。');
  const volts = nets.map((_, i) => { const index = indices.get(i); return index === undefined ? zero() : { re: re[index], im: im[index] }; });
  if (volts.some(v => !Number.isFinite(v.re) || !Number.isFinite(v.im))) return failure('ac-non-finite', '交流求解产生非有限值，读数已停止显示。');
  const portVoltages: Record<string, Complex> = {};
  const terminalCurrents: Record<string, Complex> = {};
  for (const [id, i] of portNet) { portVoltages[id] = volts[i]; terminalCurrents[id] = zero(); }
  const nodeCurrents = nets.map(zero);
  let powerSum = 0, absorbedPower = 0, currentScale = 0, powerScale = 0;
  for (const branch of branches) {
    const voltage = sub(volts[branch.a], volts[branch.b]);
    const current = scale(sub(voltage, branch.emf ?? zero()), 1 / branch.resistance);
    terminalCurrents[branch.p] = add(terminalCurrents[branch.p], current);
    terminalCurrents[branch.n] = sub(terminalCurrents[branch.n], current);
    nodeCurrents[branch.a] = add(nodeCurrents[branch.a], current);
    nodeCurrents[branch.b] = sub(nodeCurrents[branch.b], current);
    const p = realPower(voltage, current);
    const e = elements[branch.componentId];
    e.power += branch.emf ? -p : p;
    powerSum += p; currentScale += magnitude(current); powerScale += Math.abs(p);
    if (!branch.emf) absorbedPower += p;
  }
  for (const c of snapshot.components) {
    const e = elements[c.id];
    const ports = getDefinition(c.type).ports;
    const v = (key: string) => portVoltages[makePortId(c.id, key)] ?? zero();
    const i = (key: string) => terminalCurrents[makePortId(c.id, key)] ?? zero();
    const isMeter = c.type === 'ammeter' || c.type === 'voltmeter';
    if (c.type === 'three-phase-source') {
      const phase = sub(v('a'), v('n'));
      e.voltage = magnitude(phase); e.current = magnitude(i('a'));
      e.flags = { enabled: Boolean(c.params.enabled), frequencyHz, outputVoltage: e.voltage, outputCurrent: e.current,
        voltageB: magnitude(sub(v('b'), v('n'))), voltageC: magnitude(sub(v('c'), v('n'))),
        currentB: magnitude(i('b')), currentC: magnitude(i('c')), neutralCurrent: magnitude(i('n')) };
      if (c.params.enabled && Math.max(e.current, Number(e.flags.currentB), Number(e.flags.currentC)) > positive(c.params.maxCurrent, 2)) {
        diagnostics.push({ code: 'ac-over-current', level: 'error', message: `${c.name} 输出电流超过模型额定值，请检查负载和相间短路。`, componentIds: [c.id] });
      }
    } else if (ports.length >= 2) {
      const p = ports[0].key, n = c.type === 'rheostat' ? 'w' : ports[1].key;
      e.voltage = magnitude(sub(v(p), v(n))); e.current = magnitude(i(p));
      if (isMeter) {
        e.reading = c.params.mode === 'ac' ? (c.type === 'voltmeter' ? e.voltage : e.current) : 0;
        e.readingUnit = c.type === 'voltmeter' ? 'V' : 'A';
        e.overRange = e.reading > positive(c.params.range, c.type === 'voltmeter' ? 20 : 0.02) * 1.0001;
        if (e.overRange) diagnostics.push({ code: 'ac-meter-over-range', level: 'warning', message: `${c.name} 已超量程，请提高量程。`, componentIds: [c.id] });
      }
      if (c.type === 'switch') e.flags = { closed: Boolean(c.params.closed) };
    }
  }
  const kclResidualA = Math.max(0, ...nodeCurrents.map(magnitude));
  const powerResidualW = Math.abs(powerSum);
  const passed = kclResidualA < Math.max(1e-8, currentScale * 1e-8) && powerResidualW < Math.max(1e-7, powerScale * 1e-8);
  if (!passed) diagnostics.push({ code: 'ac-conservation', level: 'error', message: '交流电流或功率守恒残差过大，读数不可用于实验记录。' });
  return { domain: 'ac', status: diagnostics.some(d => d.level === 'error') ? 'error' : sources.length ? 'ok' : 'incomplete', solved: passed,
    nodeVoltages: {}, elements, totalPower: absorbedPower, diagnostics,
    ac: { frequencyHz, portVoltages, terminalCurrents, audit: { kclResidualA, powerResidualW, passed } } };
}
