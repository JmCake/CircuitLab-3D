import { getDefinition, getInternalPortGroups } from '../catalog';
import type {
  CircuitSnapshot,
  Diagnostic,
  ElementResult,
  LabComponent,
  SimulationOptions,
  SimulationResult,
} from '../types';
import { makePortId } from '../types';
import { solveLinearSystem } from './linalg';
import { UnionFind, UnionFindNumbers } from './unionFind';
import { simulateAC } from './ac';
import { lampOperatingPoint } from './lamp';

const LED_SPECS: Record<string, { vf: number; rd: number; color: string; maxCurrent: number }> = {
  red: { vf: 1.82, rd: 14, color: '#ff5040', maxCurrent: 0.03 },
  yellow: { vf: 2.0, rd: 16, color: '#ffd35a', maxCurrent: 0.025 },
  green: { vf: 2.2, rd: 18, color: '#68ef9b', maxCurrent: 0.025 },
  blue: { vf: 2.85, rd: 20, color: '#6da7ff', maxCurrent: 0.02 },
};

const MIN_RESISTANCE = 1e-6;
const LED_OFF_RESISTANCE = 5_000_000;
const GROUND = -1;

interface PortEntry {
  portId: string;
  componentId: string;
  portKey: string;
  net: number;
}

interface RawSolve {
  netVoltages: number[];
  portEntries: Map<string, PortEntry>;
  nets: string[][];
  singular: boolean;
  diagnostics: Diagnostic[];
  equationMap: Map<number, number>;
}

interface StampContext {
  bulbVoltages: Map<string, number>;
  nets: string[][];
  portNet: Map<string, number>;
  equationMap: Map<number, number>;
  grounded: Set<number>;
  size: number;
  A: number[][];
  b: number[];
  componentsById: Map<string, LabComponent>;
  componentPorts: Map<string, Map<string, number>>;
  transient: SimulationOptions['transient'] | undefined;
  ledStates: Map<string, boolean>;
}

function sanitizePositive(value: unknown, fallback: number): number {
  const numeric = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function makeZeroElements(components: LabComponent[]): Record<string, ElementResult> {
  const result: Record<string, ElementResult> = {};
  for (const component of components) {
    result[component.id] = { current: 0, voltage: 0, power: 0 };
  }
  return result;
}

function buildElectricalNets(snapshot: CircuitSnapshot): {
  nets: string[][];
  portNet: Map<string, number>;
  diagnostics: Diagnostic[];
  portComponents: Map<string, { component: LabComponent; portKey: string; portId: string }>;
} {
  const diagnostics: Diagnostic[] = [];
  const union = new UnionFind();
  const portComponents = new Map<
    string,
    { component: LabComponent; portKey: string; portId: string }
  >();
  const knownPorts = new Set<string>();

  for (const component of snapshot.components) {
    const definition = getDefinition(component.type);
    for (const port of definition.ports) {
      const portId = makePortId(component.id, port.key);
      knownPorts.add(portId);
      portComponents.set(portId, { component, portKey: port.key, portId });
      union.add(portId);
    }
    for (const group of getInternalPortGroups(component)) {
      for (let i = 1; i < group.length; i += 1) {
        union.union(
          makePortId(component.id, group[0]),
          makePortId(component.id, group[i]),
        );
      }
    }
  }

  const seenPairs = new Set<string>();
  for (const wire of snapshot.wires) {
    if (!knownPorts.has(wire.fromPortId) || !knownPorts.has(wire.toPortId)) {
      diagnostics.push({
        code: 'invalid-wire-endpoint',
        level: 'warning',
        message: '检测到端点失效的导线，已从本次求解中忽略。请重新连接。',
      });
      continue;
    }
    const ordered = [wire.fromPortId, wire.toPortId].sort().join('|');
    if (seenPairs.has(ordered)) {
      diagnostics.push({
        code: 'duplicate-wire',
        level: 'info',
        message: '两个端口之间存在重复导线，电气上等效于一根导线。',
      });
    }
    seenPairs.add(ordered);
    union.union(wire.fromPortId, wire.toPortId);
  }

  const rootToIndex = new Map<string, number>();
  const nets: string[][] = [];
  for (const portId of portComponents.keys()) {
    const root = union.find(portId);
    let index = rootToIndex.get(root);
    if (index === undefined) {
      index = nets.length;
      rootToIndex.set(root, index);
      nets.push([]);
    }
    nets[index].push(portId);
  }

  const portNet = new Map<string, number>();
  for (let netIndex = 0; netIndex < nets.length; netIndex += 1) {
    for (const portId of nets[netIndex]) portNet.set(portId, netIndex);
  }

  return { nets, portNet, diagnostics, portComponents };
}

/**
 * 每个物理子网络单独选择一个参考地。这样孤立器材不会令矩阵奇异，
 * 同时真正连在一起的网络共享同一电势参考。
 */
function chooseGrounds(
  snapshot: CircuitSnapshot,
  nets: string[][],
  portNet: Map<string, number>,
  transientActive: boolean,
): {
  grounded: Set<number>;
  equationMap: Map<number, number>;
  islandHasSource: Map<number, boolean>;
  floatingIslands: number;
} {
  const componentsById = new Map(snapshot.components.map((component) => [component.id, component]));
  const islandUnion = new UnionFindNumbers(nets.length);

  const netOf = (componentId: string, portKey: string): number | undefined => {
    return portNet.get(makePortId(componentId, portKey));
  };

  const connectComponentPorts = (component: LabComponent, keys: string[]): void => {
    const first = netOf(component.id, keys[0]);
    if (first === undefined) return;
    for (let i = 1; i < keys.length; i += 1) {
      const other = netOf(component.id, keys[i]);
      if (other !== undefined) islandUnion.union(first, other);
    }
  };

  for (const component of snapshot.components) {
    const definition = getDefinition(component.type);
    if (!definition) continue;
    switch (component.type) {
      case 'power-supply':
        if (Boolean(component.params.enabled)) connectComponentPorts(component, ['positive', 'negative']);
        break;
      case 'switch':
        if (Boolean(component.params.closed)) connectComponentPorts(component, ['a', 'b']);
        break;
      case 'capacitor':
        // 直流稳态下电容开路，两侧必须是独立子网络；暂态时后向欧拉伴随模型
        // 提供有限电导，才可将两侧视作同一连通网络。
        if (transientActive) connectComponentPorts(component, ['positive', 'negative']);
        break;
      case 'rheostat':
        connectComponentPorts(component, ['a', 'w', 'b']);
        break;
      case 'breadboard':
        break;
      case 'led':
        connectComponentPorts(component, ['anode', 'cathode']);
        break;
      case 'resistor':
      case 'bulb':
      case 'resistor-box':
        connectComponentPorts(component, ['a', 'b']);
        break;
      case 'ammeter':
      case 'voltmeter':
        connectComponentPorts(component, ['positive', 'negative']);
        break;
      default:
        break;
    }
  }

  const islandNets = new Map<number, number[]>();
  for (let net = 0; net < nets.length; net += 1) {
    const root = islandUnion.find(net);
    if (!islandNets.has(root)) islandNets.set(root, []);
    islandNets.get(root)!.push(net);
  }

  const grounded = new Set<number>();
  const islandHasSource = new Map<number, boolean>();
  let floatingIslands = 0;

  for (const [root, netList] of islandNets) {
    const sourceNegatives = new Set<number>();
    const sourcePositives = new Set<number>();
    let hasEnabledSource = false;
    for (const net of netList) {
      for (const portId of nets[net]) {
        const owner = parseAndGet(portId, componentsById);
        if (!owner) continue;
        if (owner.component.type === 'power-supply' && Boolean(owner.component.params.enabled)) {
          hasEnabledSource = true;
          if (owner.portKey === 'negative') sourceNegatives.add(net);
          if (owner.portKey === 'positive') sourcePositives.add(net);
        }
      }
    }
    // 电源正端与负端一定在同一个 island，优先把负端设为 0 V。
    const negativeCandidate = sourceNegatives.values().next().value;
    const positiveCandidate = sourcePositives.values().next().value;
    const ground =
      typeof negativeCandidate === 'number'
        ? negativeCandidate
        : typeof positiveCandidate === 'number'
          ? positiveCandidate
          : netList[0];
    grounded.add(ground);
    islandHasSource.set(root, hasEnabledSource);
    if (!hasEnabledSource && netList.length > 1) floatingIslands += 1;
  }

  const equationMap = new Map<number, number>();
  let nextIndex = 0;
  for (let net = 0; net < nets.length; net += 1) {
    if (grounded.has(net)) continue;
    equationMap.set(net, nextIndex);
    nextIndex += 1;
  }

  return { grounded, equationMap, islandHasSource, floatingIslands };
}

function parseAndGet(
  portId: string,
  componentsById: Map<string, LabComponent>,
): { component: LabComponent; portKey: string } | null {
  const separator = portId.indexOf(':');
  if (separator <= 0) return null;
  const component = componentsById.get(portId.slice(0, separator));
  if (!component) return null;
  return { component, portKey: portId.slice(separator + 1) };
}

function buildContext(
  snapshot: CircuitSnapshot,
  nets: string[][],
  portNet: Map<string, number>,
  grounded: Set<number>,
  equationMap: Map<number, number>,
  transient: SimulationOptions['transient'] | undefined,
  ledStates: Map<string, boolean>,
): StampContext {
  const componentsById = new Map(snapshot.components.map((component) => [component.id, component]));
  const componentPorts = new Map<string, Map<string, number>>();
  for (const component of snapshot.components) {
    const map = new Map<string, number>();
    for (const port of getDefinition(component.type).ports) {
      const net = portNet.get(makePortId(component.id, port.key));
      if (net !== undefined) map.set(port.key, net);
    }
    componentPorts.set(component.id, map);
  }
  const size = equationMap.size;
  const A = Array.from({ length: size }, () => new Array<number>(size).fill(0));
  const b = new Array<number>(size).fill(0);
  return {
    bulbVoltages: new Map(),
    nets,
    portNet,
    equationMap,
    grounded,
    size,
    A,
    b,
    componentsById,
    componentPorts,
    transient,
    ledStates,
  };
}

function stampConductance(context: StampContext, netA: number, netB: number, conductance: number): void {
  if (!Number.isFinite(conductance) || conductance <= 0) return;
  if (netA === netB) return;
  const ia = context.equationMap.get(netA);
  const ib = context.equationMap.get(netB);
  if (ia !== undefined) context.A[ia][ia] += conductance;
  if (ib !== undefined) context.A[ib][ib] += conductance;
  if (ia !== undefined && ib !== undefined) {
    context.A[ia][ib] -= conductance;
    context.A[ib][ia] -= conductance;
  }
}

/** 电流从 fromNet 经外部支路流向 toNet；节点方程中 toNet 得到注入。 */
function stampCurrentSource(context: StampContext, fromNet: number, toNet: number, current: number): void {
  if (!Number.isFinite(current) || current === 0) return;
  const from = context.equationMap.get(fromNet);
  const to = context.equationMap.get(toNet);
  if (from !== undefined) context.b[from] -= current;
  if (to !== undefined) context.b[to] += current;
}

function netForPort(context: StampContext, componentId: string, portKey: string): number | undefined {
  return context.componentPorts.get(componentId)?.get(portKey);
}

function ledSpec(component: LabComponent): { vf: number; rd: number; color: string; maxCurrent: number } {
  const color = typeof component.params.color === 'string' ? component.params.color : 'red';
  return LED_SPECS[color] ?? LED_SPECS.red;
}

function stampCircuit(context: StampContext): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  for (const component of context.componentsById.values()) {
    const net = (key: string) => netForPort(context, component.id, key);
    switch (component.type) {
      case 'power-supply': {
        if (!Boolean(component.params.enabled)) break;
        const positive = net('positive');
        const negative = net('negative');
        if (positive === undefined || negative === undefined) break;
        if (positive === negative) {
          diagnostics.push({
            code: 'supply-output-shorted',
            level: 'error',
            message: `${component.name} 的输出正负极被直接短接，电流将受内部电阻限制。`,
            componentIds: [component.id],
          });
          break;
        }
        const voltage = sanitizeFinite(component.params.voltage, 0);
        const internalResistance = Math.max(
          1e-4,
          sanitizePositive(component.params.internalResistance, 0.2),
        );
        const conductance = 1 / internalResistance;
        stampConductance(context, positive, negative, conductance);
        stampCurrentSource(context, negative, positive, voltage / internalResistance);
        break;
      }
      case 'resistor': {
        const a = net('a');
        const b = net('b');
        if (a === undefined || b === undefined) break;
        const resistance = sanitizePositive(component.params.resistance, 1000);
        stampConductance(context, a, b, 1 / resistance);
        break;
      }
      case 'resistor-box': {
        const a = net('a');
        const b = net('b');
        if (a === undefined || b === undefined) break;
        const resistance = Math.max(0, sanitizeFinite(component.params.resistance, 0));
        if (resistance <= MIN_RESISTANCE) {
          diagnostics.push({
            code: 'zero-resistance',
            level: 'warning',
            message: `${component.name} 的阻值为 0 Ω，等效为理想导线。`,
            componentIds: [component.id],
          });
          stampConductance(context, a, b, 1 / MIN_RESISTANCE);
        } else {
          stampConductance(context, a, b, 1 / resistance);
        }
        break;
      }
      case 'switch': {
        if (!Boolean(component.params.closed)) break;
        const a = net('a');
        const b = net('b');
        if (a === undefined || b === undefined) break;
        const onResistance = Math.max(MIN_RESISTANCE, sanitizePositive(component.params.onResistance, 0.01));
        stampConductance(context, a, b, 1 / onResistance);
        break;
      }
      case 'ammeter': {
        const a = net('positive');
        const b = net('negative');
        if (a === undefined || b === undefined) break;
        const internalResistance = Math.max(
          MIN_RESISTANCE,
          sanitizePositive(component.params.internalResistance, 0.1),
        );
        stampConductance(context, a, b, 1 / internalResistance);
        break;
      }
      case 'voltmeter': {
        const a = net('positive');
        const b = net('negative');
        if (a === undefined || b === undefined) break;
        const internalResistance = Math.max(
          1,
          sanitizePositive(component.params.internalResistance, 10_000_000),
        );
        stampConductance(context, a, b, 1 / internalResistance);
        break;
      }
      case 'bulb': {
        const a = net('a');
        const b = net('b');
        if (a === undefined || b === undefined) break;
        const voltage = context.bulbVoltages.get(component.id) ?? 0;
        const point = lampOperatingPoint(component, voltage);
        stampConductance(context, a, b, point.conductance);
        stampCurrentSource(context, a, b, point.current - point.conductance * voltage);
        break;
      }
      case 'rheostat': {
        const a = net('a');
        const w = net('w');
        const b = net('b');
        if (a === undefined || w === undefined || b === undefined) break;
        const maxResistance = sanitizePositive(component.params.maxResistance, 50);
        const position = clamp(sanitizeFinite(component.params.position, 0.5), 0, 1);
        const segmentA = Math.max(MIN_RESISTANCE, maxResistance * position);
        const segmentB = Math.max(MIN_RESISTANCE, maxResistance * (1 - position));
        stampConductance(context, a, w, 1 / segmentA);
        stampConductance(context, w, b, 1 / segmentB);
        break;
      }
      case 'capacitor': {
        const positive = net('positive');
        const negative = net('negative');
        if (positive === undefined || negative === undefined) break;
        if (!context.transient) break; // 直流稳态：开路
        const capacitance = Math.max(
          1e-12,
          sanitizePositive(component.params.capacitanceUf, 220) * 1e-6,
        );
        const conductance = capacitance / Math.max(1e-6, context.transient.dt);
        const previousVoltage = sanitizeFinite(
          context.transient.capacitorVoltages[component.id] ?? 0,
          0,
        );
        stampConductance(context, positive, negative, conductance);
        stampCurrentSource(context, negative, positive, previousVoltage * conductance);
        break;
      }
      case 'led': {
        const anode = net('anode');
        const cathode = net('cathode');
        if (anode === undefined || cathode === undefined) break;
        const spec = ledSpec(component);
        const on = context.ledStates.get(component.id) ?? false;
        if (on) {
          const conductance = 1 / spec.rd;
          stampConductance(context, anode, cathode, conductance);
          stampCurrentSource(context, cathode, anode, spec.vf * conductance);
        } else {
          stampConductance(context, anode, cathode, 1 / LED_OFF_RESISTANCE);
        }
        break;
      }
      case 'breadboard':
        break;
      default:
        break;
    }
  }

  return diagnostics;
}

function sanitizeFinite(value: unknown, fallback: number): number {
  const numeric = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function solveRaw(
  snapshot: CircuitSnapshot,
  nets: string[][],
  portNet: Map<string, number>,
  grounded: Set<number>,
  equationMap: Map<number, number>,
  transient: SimulationOptions['transient'] | undefined,
  ledStates: Map<string, boolean>,
): RawSolve {
  const context = buildContext(
    snapshot,
    nets,
    portNet,
    grounded,
    equationMap,
    transient,
    ledStates,
  );
  const lamps = snapshot.components.filter(c => c.type === 'bulb');
  let stampDiagnostics: Diagnostic[] = [];
  let linear: ReturnType<typeof solveLinearSystem> = { solution: null, singular: false, pivotMagnitude: 0 };
  let converged = false;
  for (let iteration = 0; iteration < 80; iteration++) {
    context.A = Array.from({ length: context.size }, () => Array<number>(context.size).fill(0));
    context.b = Array<number>(context.size).fill(0);
    stampDiagnostics = stampCircuit(context);
    linear = solveLinearSystem(context.A, context.b, 1e-13);
    if (!linear.solution) break;
    const values = lamps.map(lamp => {
      const indexA = equationMap.get(portNet.get(makePortId(lamp.id, 'a'))!);
      const indexB = equationMap.get(portNet.get(makePortId(lamp.id, 'b'))!);
      return { id: lamp.id, voltage: (indexA === undefined ? 0 : linear.solution![indexA]) - (indexB === undefined ? 0 : linear.solution![indexB]) };
    });
    const error = Math.max(0, ...values.map(v => Math.abs(v.voltage - (context.bulbVoltages.get(v.id) ?? 0))));
    if (error < 1e-9) { converged = true; break; }
    const damping = Math.min(1, 2 / error);
    for (const v of values) { const before = context.bulbVoltages.get(v.id) ?? 0; context.bulbVoltages.set(v.id, before + damping * (v.voltage - before)); }
  }
  if (!linear.solution || !converged) {
    return {
      netVoltages: new Array(nets.length).fill(0),
      portEntries: new Map(),
      nets,
      singular: true,
      diagnostics: [
        ...stampDiagnostics,
        {
          code: linear.solution ? 'lamp-not-converged' : 'singular-matrix',
          level: 'error',
          message: linear.solution ? '灯泡非线性迭代未收敛，读数已停止显示。' : '电路方程无唯一解，请检查浮动节点与电源连接。',
        },
      ],
      equationMap,
    };
  }

  const netVoltages = new Array<number>(nets.length).fill(0);
  for (const [net, index] of equationMap) {
    netVoltages[net] = linear.solution[index];
  }
  if (netVoltages.some((value) => !Number.isFinite(value))) {
    return {
      netVoltages: new Array(nets.length).fill(0),
      portEntries: new Map(),
      nets,
      singular: true,
      diagnostics: [
        ...stampDiagnostics,
        {
          code: 'non-finite-solution',
          level: 'error',
          message: '数值求解得到非有限值，已停止显示读数。请检查短路或极端参数。',
        },
      ],
      equationMap,
    };
  }
  return {
    netVoltages,
    portEntries: new Map(),
    nets,
    singular: false,
    diagnostics: stampDiagnostics,
    equationMap,
  };
}

function solveLedStates(
  snapshot: CircuitSnapshot,
  nets: string[][],
  portNet: Map<string, number>,
  grounded: Set<number>,
  equationMap: Map<number, number>,
  transient: SimulationOptions['transient'] | undefined,
): { raw: RawSolve; states: Map<string, boolean>; converged: boolean; iterations: number } {
  const leds = snapshot.components.filter((component) => component.type === 'led');
  const stateFor = (mask: number): Map<string, boolean> => {
    const map = new Map<string, boolean>();
    leds.forEach((led, index) => map.set(led.id, Boolean(mask & (1 << index))));
    return map;
  };

  if (leds.length === 0) {
    return {
      raw: solveRaw(snapshot, nets, portNet, grounded, equationMap, transient, new Map()),
      states: new Map(),
      converged: true,
      iterations: 1,
    };
  }

  const evaluate = (states: Map<string, boolean>): {
    raw: RawSolve;
    valid: boolean;
    current: Map<string, number>;
  } => {
    const raw = solveRaw(snapshot, nets, portNet, grounded, equationMap, transient, states);
    if (raw.singular) return { raw, valid: false, current: new Map() };
    const currents = new Map<string, number>();
    let valid = true;
    for (const led of leds) {
      const anode = portNet.get(makePortId(led.id, 'anode'));
      const cathode = portNet.get(makePortId(led.id, 'cathode'));
      if (anode === undefined || cathode === undefined) continue;
      const voltage = raw.netVoltages[anode] - raw.netVoltages[cathode];
      const spec = ledSpec(led);
      const on = states.get(led.id) ?? false;
      const current = on
        ? Math.max(0, (voltage - spec.vf) / spec.rd)
        : voltage / LED_OFF_RESISTANCE;
      currents.set(led.id, current);
      if (on && voltage < spec.vf - 1e-5) valid = false;
      if (!on && voltage > spec.vf + 1e-5) valid = false;
    }
    return { raw, valid, current: currents };
  };

  let states = stateFor(0);
  let best = evaluate(states);
  let converged = false;
  let iterations = 0;

  for (let iteration = 0; iteration < 18; iteration += 1) {
    iterations = iteration + 1;
    if (best.raw.singular) break;
    let changed = false;
    const next = new Map(states);
    for (const led of leds) {
      const anode = portNet.get(makePortId(led.id, 'anode'));
      const cathode = portNet.get(makePortId(led.id, 'cathode'));
      if (anode === undefined || cathode === undefined) continue;
      const voltage = best.raw.netVoltages[anode] - best.raw.netVoltages[cathode];
      const spec = ledSpec(led);
      const on = states.get(led.id) ?? false;
      if (!on && voltage > spec.vf + 1e-7) {
        next.set(led.id, true);
        changed = true;
      } else if (on && voltage < spec.vf - 1e-7) {
        next.set(led.id, false);
        changed = true;
      }
    }
    if (!changed) {
      converged = true;
      break;
    }
    states = next;
    best = evaluate(states);
  }

  // 极少数带多个 LED 的网络会出现主动集振荡，用小规模状态枚举兜底。
  if (!converged && leds.length <= 6) {
    for (let mask = 0; mask < 1 << leds.length; mask += 1) {
      const candidateStates = stateFor(mask);
      const candidate = evaluate(candidateStates);
      if (candidate.valid) {
        states = candidateStates;
        best = candidate;
        converged = true;
        break;
      }
    }
  }

  return { raw: best.raw, states, converged, iterations };
}

function netVoltage(
  raw: RawSolve,
  portNet: Map<string, number>,
  componentId: string,
  portKey: string,
): number {
  const net = portNet.get(makePortId(componentId, portKey));
  if (net === undefined) return 0;
  return raw.netVoltages[net] ?? 0;
}

function measureElementResults(
  snapshot: CircuitSnapshot,
  raw: RawSolve,
  portNet: Map<string, number>,
  options: SimulationOptions,
  ledStates: Map<string, boolean>,
  enabledSourceCount: number,
): {
  elements: Record<string, ElementResult>;
  diagnostics: Diagnostic[];
  capacitorVoltages: Record<string, number>;
  totalPower: number;
} {
  const elements: Record<string, ElementResult> = {};
  const diagnostics: Diagnostic[] = [...raw.diagnostics];
  const capacitorVoltages: Record<string, number> = {
    ...(options.transient?.capacitorVoltages ?? {}),
  };
  let totalPower = 0;

  const addDiagnostic = (diagnostic: Diagnostic) => {
    if (!diagnostics.some((item) => item.code === diagnostic.code && item.message === diagnostic.message)) {
      diagnostics.push(diagnostic);
    }
  };

  for (const component of snapshot.components) {
    const def = getDefinition(component.type);
    const port = (key: string) => netVoltage(raw, portNet, component.id, key);
    const element: ElementResult = { current: 0, voltage: 0, power: 0 };

    switch (component.type) {
      case 'power-supply': {
        const enabled = Boolean(component.params.enabled);
        const setVoltage = sanitizeFinite(component.params.voltage, 0);
        const internalResistance = Math.max(
          1e-4,
          sanitizePositive(component.params.internalResistance, 0.2),
        );
        const outputVoltage = enabled ? port('positive') - port('negative') : 0;
        const outputCurrent = enabled ? setVoltage / internalResistance - outputVoltage / internalResistance : 0;
        element.voltage = outputVoltage;
        element.current = outputCurrent;
        element.power = outputVoltage * outputCurrent;
        element.reading = outputCurrent;
        element.readingUnit = 'A';
        element.flags = {
          enabled,
          setVoltage,
          outputVoltage,
          outputCurrent,
          shortCircuit:
            enabled &&
            Math.abs(outputCurrent) > 1.5 &&
            Math.abs(outputVoltage) < Math.max(0.25, Math.abs(setVoltage) * 0.12),
          openLoop: enabled && Math.abs(outputCurrent) < 1e-5 && setVoltage > 0.05,
        };
        if (element.flags.shortCircuit) {
          addDiagnostic({
            code: 'supply-short',
            level: 'error',
            message: `${component.name} 输出接近短路：${outputCurrent.toFixed(2)} A 已超过建议值，内部电阻把电流限制在有限范围。请立即检查接线。`,
            componentIds: [component.id],
          });
        } else if (element.flags.openLoop) {
          addDiagnostic({
            code: 'supply-open-loop',
            level: 'info',
            message: `${component.name} 已开启，但输出端子没有形成闭合回路。`,
            componentIds: [component.id],
          });
        }
        if (!enabled) {
          addDiagnostic({
            code: 'supply-disabled',
            level: 'info',
            message: `${component.name} 输出处于关闭状态。`,
            componentIds: [component.id],
          });
        }
        break;
      }
      case 'resistor': {
        const voltage = port('a') - port('b');
        const resistance = sanitizePositive(component.params.resistance, 1000);
        element.voltage = voltage;
        element.current = voltage / resistance;
        element.power = Math.abs(voltage * element.current);
        element.reading = resistance;
        element.readingUnit = 'Ω';
        break;
      }
      case 'resistor-box': {
        const voltage = port('a') - port('b');
        const resistance = Math.max(0, sanitizeFinite(component.params.resistance, 0));
        element.voltage = voltage;
        element.current =
          resistance <= MIN_RESISTANCE
            ? voltage / MIN_RESISTANCE
            : voltage / resistance;
        element.power = Math.abs(voltage * element.current);
        element.reading = resistance;
        element.readingUnit = 'Ω';
        break;
      }
      case 'switch': {
        const voltage = port('a') - port('b');
        const closed = Boolean(component.params.closed);
        const resistance = Math.max(
          MIN_RESISTANCE,
          sanitizePositive(component.params.onResistance, 0.01),
        );
        element.voltage = voltage;
        element.current = closed ? voltage / resistance : 0;
        element.power = closed ? Math.abs(voltage * element.current) : 0;
        element.flags = { closed };
        break;
      }
      case 'ammeter': {
        const voltage = port('positive') - port('negative');
        const internalResistance = Math.max(
          MIN_RESISTANCE,
          sanitizePositive(component.params.internalResistance, 0.1),
        );
        const current = voltage / internalResistance;
        const range = sanitizePositive(component.params.range, 0.02);
        element.voltage = voltage;
        element.current = current;
        element.power = Math.abs(voltage * current);
        element.reading = component.params.mode === 'ac' ? 0 : current;
        element.readingUnit = 'A';
        element.overRange = Math.abs(current) > range * 1.0001;
        if (element.overRange) {
          addDiagnostic({
            code: 'ammeter-over-range',
            level: 'warning',
            message: `${component.name} 读数 ${formatCurrent(current)} 已超过所选 ${formatCurrent(range)} 量程。`,
            componentIds: [component.id],
          });
        }
        if (Math.abs(voltage) > 0.5) {
          addDiagnostic({
            code: 'ammeter-large-voltage',
            level: 'warning',
            message: `${component.name} 两端压降达到 ${voltage.toFixed(2)} V。电流表内阻很低，正常串联时压降通常仅有毫伏级，请检查是否误接成并联。`,
            componentIds: [component.id],
          });
        }
        break;
      }
      case 'voltmeter': {
        const voltage = port('positive') - port('negative');
        const internalResistance = Math.max(
          1,
          sanitizePositive(component.params.internalResistance, 10_000_000),
        );
        const range = sanitizePositive(component.params.range, 20);
        element.voltage = voltage;
        element.current = voltage / internalResistance;
        element.power = Math.abs(voltage * element.current);
        element.reading = component.params.mode === 'ac' ? 0 : voltage;
        element.readingUnit = 'V';
        element.overRange = Math.abs(voltage) > range * 1.0001;
        if (element.overRange) {
          addDiagnostic({
            code: 'voltmeter-over-range',
            level: 'warning',
            message: `${component.name} 读数 ${voltage.toFixed(2)} V 已超过所选 ${range} V 量程。`,
            componentIds: [component.id],
          });
        }
        break;
      }
      case 'bulb': {
        const voltage = port('a') - port('b');
        const point = lampOperatingPoint(component, voltage);
        const power = voltage * point.current;
        const ratedPower = sanitizePositive(component.params.ratedPower, 0.3);
        element.voltage = voltage;
        element.current = point.current;
        element.power = power;
        element.brightness = clamp(power / ratedPower, 0, 1.5);
        element.reading = power;
        element.readingUnit = 'W';
        element.flags = { operatingResistance: point.resistance, ratedVoltage: point.ratedVoltage, model: 'steady-thermal' };
        break;
      }
      case 'rheostat': {
        const maxResistance = sanitizePositive(component.params.maxResistance, 50);
        const position = clamp(sanitizeFinite(component.params.position, 0.5), 0, 1);
        const segmentA = Math.max(MIN_RESISTANCE, maxResistance * position);
        const segmentB = Math.max(MIN_RESISTANCE, maxResistance * (1 - position));
        const voltageAW = port('a') - port('w');
        const currentAW = voltageAW / segmentA;
        const voltageBW = port('b') - port('w');
        const currentBW = voltageBW / segmentB;
        element.voltage = voltageAW;
        element.current = currentAW;
        element.power = voltageAW * currentAW + voltageBW * currentBW;
        element.flags = {
          segmentA,
          segmentB,
          position,
          currentAW,
          currentBW,
        };
        break;
      }
      case 'capacitor': {
        const capacitanceUf = sanitizePositive(component.params.capacitanceUf, 220);
        const voltage = port('positive') - port('negative');
        element.voltage = voltage;
        element.power = 0;
        if (options.transient) {
          const capacitance = capacitanceUf * 1e-6;
          const conductance = capacitance / Math.max(1e-6, options.transient.dt);
          const previous = sanitizeFinite(
            options.transient.capacitorVoltages[component.id] ?? 0,
            0,
          );
          element.current = conductance * (voltage - previous);
          // Passive sign convention: a discharging capacitor delivers power (negative p).
          element.power = voltage * element.current;
          capacitorVoltages[component.id] = voltage;
          const rating = sanitizePositive(component.params.voltageRating, 25);
          if (Math.abs(voltage) > rating) {
            addDiagnostic({
              code: 'capacitor-over-voltage',
              level: 'warning',
              message: `${component.name} 端电压 ${voltage.toFixed(2)} V 已超过 ${rating} V 额定耐压。`,
              componentIds: [component.id],
            });
          }
        } else {
          element.current = 0;
          element.flags = { dcOpen: true };
        }
        element.reading = voltage;
        element.readingUnit = 'V';
        if (voltage < -0.1) {
          addDiagnostic({ code: 'capacitor-reverse-polarity', level: 'warning',
            message: `${component.name} 正极相对负极为 ${voltage.toFixed(2)} V，极性电容反接。`, componentIds: [component.id] });
        }
        break;
      }
      case 'led': {
        const spec = ledSpec(component);
        const voltage = port('anode') - port('cathode');
        const on = ledStates.get(component.id) ?? false;
        const current = on
          ? Math.max(0, (voltage - spec.vf) / spec.rd)
          : voltage / LED_OFF_RESISTANCE;
        element.voltage = voltage;
        element.current = current;
        element.power = Math.abs(voltage * current);
        element.brightness = clamp(current / spec.maxCurrent, 0, 1.25);
        element.reading = current;
        element.readingUnit = 'A';
        element.flags = {
          on,
          model: 'piecewise-linear',
          forwardVoltage: spec.vf,
          dynamicResistance: spec.rd,
          maxCurrent: spec.maxCurrent,
          color: spec.color,
        };
        if (current > spec.maxCurrent) {
          addDiagnostic({
            code: 'led-over-current',
            level: 'warning',
            message: `${component.name} 正向电流 ${formatCurrent(current)} 超过推荐值，请增大限流电阻。`,
            componentIds: [component.id],
          });
        }
        break;
      }
      case 'breadboard': {
        element.flags = { idealInternalBuses: true };
        break;
      }
      default:
        break;
    }

    if (
      !Number.isFinite(element.current) ||
      !Number.isFinite(element.voltage) ||
      !Number.isFinite(element.power)
    ) {
      addDiagnostic({
        code: 'non-finite-element',
        level: 'error',
        message: `${component.name} 的计算结果出现非有限值，读数已隐藏。`,
        componentIds: [component.id],
      });
      elements[component.id] = { current: 0, voltage: 0, power: 0 };
      continue;
    }
    elements[component.id] = element;
    if (component.type !== 'power-supply') totalPower += element.power;
  }

  if (enabledSourceCount === 0) {
    addDiagnostic({
      code: 'no-active-source',
      level: 'info',
      message: '当前没有已开启的电源，电路处于无源状态。',
    });
  }

  return { elements, diagnostics, capacitorVoltages, totalPower };
}

export function formatCurrent(value: number): string {
  const abs = Math.abs(value);
  if (abs < 1) return `${(value * 1000).toFixed(2)} mA`;
  return `${value.toFixed(3)} A`;
}

export function simulateCircuit(
  snapshot: CircuitSnapshot,
  options: SimulationOptions = {},
): SimulationResult {
  const started = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const { nets, portNet, diagnostics: netDiagnostics } = buildElectricalNets(snapshot);
  const hasAC = snapshot.components.some(c => c.type === 'three-phase-source');
  const hasDC = snapshot.components.some(c => c.type === 'power-supply');
  const activeAC = snapshot.components.some(c => c.type === 'three-phase-source' && c.params.enabled);
  if (activeAC && options.transient) return { domain: 'ac', status: 'error', solved: false, nodeVoltages: {}, elements: makeZeroElements(snapshot.components), diagnostics: [{ code: 'ac-transient-unsupported', level: 'error', message: '三相相量稳态与电容时域暂态不能混合运行。' }] };
  if (hasAC && (activeAC || (!hasDC && !options.transient))) {
    return simulateAC(snapshot, { nets, portNet, diagnostics: netDiagnostics });
  }
  if (snapshot.components.length === 0) {
    return {
      status: 'incomplete',
      solved: true,
      nodeVoltages: {},
      elements: {},
      diagnostics: [
        ...netDiagnostics,
        {
          code: 'empty-circuit',
          level: 'info',
          message: '实验台上还没有器材。请从左侧器材库添加，或载入一个教学实验。',
        },
      ],
      capacitorVoltages: options.transient?.capacitorVoltages ?? {},
      solveMs: (typeof performance !== 'undefined' ? performance.now() : Date.now()) - started,
    };
  }

  const { grounded, equationMap, floatingIslands } = chooseGrounds(
    snapshot,
    nets,
    portNet,
    Boolean(options.transient),
  );
  const enabledSourceCount = snapshot.components.filter(
    (component) => component.type === 'power-supply' && Boolean(component.params.enabled),
  ).length;

  const ledResult = solveLedStates(
    snapshot,
    nets,
    portNet,
    grounded,
    equationMap,
    options.transient,
  );

  const nodeVoltages: Record<string, number> = {};
  nets.forEach((_, index) => {
    nodeVoltages[`N${index + 1}`] = ledResult.raw.netVoltages[index] ?? 0;
  });

  if (ledResult.raw.singular) {
    return {
      status: 'error',
      solved: false,
      nodeVoltages: {},
      elements: makeZeroElements(snapshot.components),
      diagnostics: [...netDiagnostics, ...ledResult.raw.diagnostics],
      capacitorVoltages: options.transient?.capacitorVoltages ?? {},
      solveMs: (typeof performance !== 'undefined' ? performance.now() : Date.now()) - started,
    };
  }

  if (!ledResult.converged) {
    return {
      status: 'error',
      solved: false,
      nodeVoltages: {},
      elements: makeZeroElements(snapshot.components),
      diagnostics: [
        ...netDiagnostics,
        ...ledResult.raw.diagnostics,
        {
          code: 'led-solver-not-converged',
          level: 'error',
          message: 'LED 分段模型在当前网络中未能收敛，读数已隐藏。请简化接线或检查是否存在强制电压冲突。',
        },
      ],
      capacitorVoltages: options.transient?.capacitorVoltages ?? {},
      solveMs: (typeof performance !== 'undefined' ? performance.now() : Date.now()) - started,
    };
  }

  const measured = measureElementResults(
    snapshot,
    ledResult.raw,
    portNet,
    options,
    ledResult.states,
    enabledSourceCount,
  );
  const allDiagnostics = [...netDiagnostics, ...measured.diagnostics];
  if (snapshot.wires.length > 0 && floatingIslands > 0) {
    allDiagnostics.push({
      code: 'floating-network',
      level: 'info',
      message: `检测到 ${floatingIslands} 个未接入电源的独立子网络，求解器已为它们分别建立 0 V 参考；请检查是否有悬空接线。`,
    });
  }
  const hasNumericalError = allDiagnostics.some(
    (diagnostic) =>
      diagnostic.level === 'error' &&
      (diagnostic.code === 'singular-matrix' || diagnostic.code === 'non-finite-solution'),
  );

  return {
    domain: 'dc',
    status: allDiagnostics.some(d => d.level === 'error') ? 'error' : enabledSourceCount === 0 ? 'incomplete' : 'ok',
    solved: !hasNumericalError,
    nodeVoltages,
    portVoltages: Object.fromEntries([...portNet].map(([port, net]) => [port, ledResult.raw.netVoltages[net] ?? 0])),
    elements: measured.elements,
    diagnostics: allDiagnostics,
    capacitorVoltages: measured.capacitorVoltages,
    totalPower: measured.totalPower,
    solveMs: (typeof performance !== 'undefined' ? performance.now() : Date.now()) - started,
  };
}

export const MODELS = {
  supply: '理想电压源与 0.2 Ω 内部电阻（诺顿等效）',
  resistor: '理想线性电阻',
  switch: '闭合 0.01 Ω / 断开开路',
  ammeter: '0.1 Ω 采样电阻',
  voltmeter: '10 MΩ 输入电阻',
  led: '分段线性 LED（Vf + 14 Ω）',
  bulb: '标定到额定点的稳态钨丝热电阻经验模型',
  capacitor: '直流开路 / 后向欧拉暂态',
  rheostat: '三端线性电位器',
  breadboard: '孔位内部理想导体连通',
} as const;

