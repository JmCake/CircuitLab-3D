import { create } from 'zustand';
import { useScopeStore } from './scopeStore';
import { advanceTransient, TRANSIENT_SAMPLE_DT, TRANSIENT_MAX_STEP } from '../circuit/simulation/transient';
import { measurementIssue } from '../circuit/measurement';
import {
  BENCH,
  clampComponentPosition,
  COMPONENT_DEFINITIONS,
  createDefaultParams,
  findPortOwner,
  getDefinition,
  getInternalPortGroups,
  makePortId,
  parsePortId,
  simulateCircuit,
  WIRE_COLORS,
  type CircuitSnapshot,
  type ComponentType,
  type Diagnostic,
  type LabComponent,
  type MeasurementRow,
  type ParamValue,
  type SavedWorkspace,
  type SimulationOptions,
  type SimulationResult,
  type Wire,
} from '../circuit';
import { buildLabCircuit, getLab } from '../experiments/labs';
import { arrangeLesson } from '../experiments/benchLayout';
import { colorDemoWires } from '../experiments/wireColors';
import { captureObservation, threePhaseReadings } from '../experiments/courseAnalysis';
import {
  makeWorkspacePayload,
  readLocalWorkspace,
  writeLocalWorkspace,
} from './persistence';

export type SideTab = 'lab' | 'inspector' | 'data';
export type InteractionMode = 'idle' | 'dragging' | 'wiring' | 'adjusting';
export type ToastKind = 'info' | 'success' | 'warning' | 'error';

export interface ToastMessage {
  id: string;
  kind: ToastKind;
  title: string;
  message?: string;
}

export interface DraftWire {
  fromPortId: string;
  cursor: [number, number, number];
  targetPortId: string | null;
  valid: boolean;
}

export interface DragSession {
  componentId: string;
  offsetX: number;
  offsetZ: number;
  moved: boolean;
}

export interface AdjustSession {
  componentId: string;
  paramKey: string;
  startValue: number;
  min: number;
  max: number;
  step: number;
  startClientX: number;
  startClientY: number;
  axis: 'x' | 'y';
  transactionStarted: boolean;
}

export interface TransientSample {
  time: number;
  values: Record<string, number>;
}

export interface TransientRuntime {
  active: boolean;
  running: boolean;
  time: number;
  dt: number;
  capacitorVoltages: Record<string, number>;
  samples: TransientSample[];
}

interface EditorSnapshot extends CircuitSnapshot {
  activeLabId: string;
  mode: 'guided' | 'free';
  referencePortId: string | null;
}
interface HistoryState {
  past: EditorSnapshot[];
  future: EditorSnapshot[];
  transactionBefore: EditorSnapshot | null;
}

export interface LabStore {
  referencePortId: string | null;
  setReferencePort: (id: string | null) => void;
  replaceComponent: (id: string, type: ComponentType) => void;
  components: LabComponent[];
  wires: Wire[];
  result: SimulationResult;
  selectedId: string | null;
  selectedWireId: string | null;
  hoveredPortId: string | null;
  activeLabId: string;
  mode: 'guided' | 'free';
  sideTab: SideTab;
  libraryOpen: boolean;
  wireColor: string;
  interactionMode: InteractionMode;
  draftWire: DraftWire | null;
  dragSession: DragSession | null;
  adjustSession: AdjustSession | null;
  history: HistoryState;
  measurements: MeasurementRow[];
  transient: TransientRuntime;
  toasts: ToastMessage[];
  lastSavedAt: number | null;

  setSideTab: (tab: SideTab) => void;
  setLibraryOpen: (open: boolean) => void;
  setActiveLab: (labId: string) => void;
  setMode: (mode: 'guided' | 'free') => void;
  setWireColor: (color: string) => void;

  selectComponent: (componentId: string | null) => void;
  selectWire: (wireId: string | null) => void;
  removeSelected: () => void;
  removeComponent: (componentId: string) => void;
  addComponent: (type: ComponentType, position?: [number, number]) => void;
  rotateComponent: (componentId: string, deltaRadians: number) => void;
  setComponentPosition: (componentId: string, position: [number, number]) => void;

  beginMove: (componentId: string, planePoint: [number, number]) => void;
  updateMovePoint: (planePoint: [number, number]) => void;
  endMove: () => void;
  cancelMove: () => void;

  setParam: (componentId: string, key: string, value: ParamValue, record?: boolean) => void;
  beginControl: (
    componentId: string,
    paramKey: string,
    pointer: { x: number; y: number },
    axis?: 'x' | 'y',
  ) => void;
  updateControl: (pointer: { x: number; y: number }) => void;
  endControl: () => void;
  cancelControl: () => void;
  beginTransaction: () => void;
  commitTransaction: () => void;
  cancelTransaction: (revert?: boolean) => void;

  beginWire: (portId: string) => void;
  updateWirePointer: (portId: string | null, cursor: [number, number, number]) => void;
  completeWire: (targetPortId: string | null) => void;
  cancelWire: () => void;
  removeWire: (wireId: string) => void;

  undo: () => void;
  redo: () => void;

  loadLab: (labId: string, wired?: boolean) => void;
  arrangeBench: () => boolean;
  clearBench: () => void;

  recordMeasurement: () => void;
  deleteMeasurement: (id: string) => void;
  clearMeasurements: () => void;

  startTransient: () => void;
  resumeTransient: () => void;
  pauseTransient: () => void;
  resetTransient: () => void;
  tickTransient: () => void;

  saveLocal: () => void;
  loadLocal: () => void;
  importWorkspace: (workspace: SavedWorkspace) => void;
  getWorkspace: () => SavedWorkspace;

  pushToast: (kind: ToastKind, title: string, message?: string) => void;
  dismissToast: (id: string) => void;
}

interface InitialState {
  referencePortId?: string | null;
  components: LabComponent[];
  wires: Wire[];
  measurements: MeasurementRow[];
  activeLabId: string;
  mode: 'guided' | 'free';
}

const MAX_HISTORY = 60;
const MAX_WIRES_PER_PORT = 3;

function cloneSnapshot(snapshot: EditorSnapshot): EditorSnapshot {
  return {
    activeLabId: snapshot.activeLabId,
    mode: snapshot.mode,
    referencePortId: snapshot.referencePortId,
    components: snapshot.components.map((component) => ({
      ...component,
      position: [...component.position] as [number, number],
      params: { ...component.params },
    })),
    wires: snapshot.wires.map((wire) => ({ ...wire })),
  };
}

function currentSnapshot(state: Pick<LabStore, 'components' | 'wires' | 'activeLabId' | 'mode' | 'referencePortId'>): EditorSnapshot {
  return cloneSnapshot({ components: state.components, wires: state.wires, activeLabId: state.activeLabId, mode: state.mode, referencePortId: state.referencePortId });
}

function sameSnapshot(a: CircuitSnapshot, b: CircuitSnapshot): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function makeTransientRuntime(): TransientRuntime {
  return {
    active: false,
    running: false,
    time: 0,
    dt: TRANSIENT_SAMPLE_DT,
    capacitorVoltages: {},
    samples: [],
  };
}

function errorSimulation(message: string): SimulationResult {
  return {
    status: 'error',
    solved: false,
    nodeVoltages: {},
    elements: {},
    diagnostics: [
      {
        code: 'simulation-exception',
        level: 'error',
        message,
      },
    ],
  };
}

function simulateSafe(
  components: LabComponent[],
  wires: Wire[],
  transient?: SimulationOptions['transient'],
): SimulationResult {
  try {
    return simulateCircuit(
      { components, wires },
      transient ? { transient } : undefined,
    );
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return errorSimulation(`求解器遇到未处理异常：${detail}`);
  }
}

function initialData(): InitialState {
  const saved = readLocalWorkspace();
  if (saved) {
    return {
      components: saved.components,
      wires: saved.wires,
      measurements: saved.measurements,
      activeLabId: saved.activeLabId,
      mode: saved.mode,
      referencePortId: saved.referencePortId ?? null,
    };
  }
  const starter = buildLabCircuit('iv-characteristics', false);
  return {
    components: starter.components,
    wires: starter.wires,
    measurements: [],
    activeLabId: 'iv-characteristics',
    mode: 'guided',
  };
}

function nextComponentId(components: LabComponent[], type: ComponentType): string {
  const prefix = COMPONENT_DEFINITIONS[type].prefix;
  const existing = new Set(components.map((component) => component.id));
  let counter = 1;
  let candidate = `${prefix}-${counter}`;
  while (existing.has(candidate)) {
    counter += 1;
    candidate = `${prefix}-${counter}`;
  }
  return candidate;
}

function nextComponentName(components: LabComponent[], type: ComponentType): string {
  const definition = COMPONENT_DEFINITIONS[type];
  const count = components.filter((component) => component.type === type).length + 1;
  return `${definition.shortName} ${count}`;
}

function rectanglesOverlap(
  a: { x: number; z: number; width: number; depth: number },
  b: { x: number; z: number; width: number; depth: number },
  padding = 0.018,
): boolean {
  return (
    Math.abs(a.x - b.x) < (a.width + b.width) / 2 + padding &&
    Math.abs(a.z - b.z) < (a.depth + b.depth) / 2 + padding
  );
}

function findOpenPosition(type: ComponentType, components: LabComponent[]): [number, number] {
  const definition = COMPONENT_DEFINITIONS[type];
  const obstacles = components.map((component) => {
    const other = COMPONENT_DEFINITIONS[component.type];
    return {
      x: component.position[0],
      z: component.position[1],
      width: other.footprint[0],
      depth: other.footprint[1],
    };
  });
  const origin: [number, number] = [0.06, 0.1];
  const candidates: [number, number][] = [origin];
  for (let ring = 1; ring <= 8; ring += 1) {
    for (let dx = -ring; dx <= ring; dx += 1) {
      for (let dz = -ring; dz <= ring; dz += 1) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== ring) continue;
        candidates.push([origin[0] + dx * 0.13, origin[1] + dz * 0.1]);
      }
    }
  }
  for (const candidate of candidates) {
    const clamped = clampComponentPosition(type, candidate);
    const rect = {
      x: clamped[0],
      z: clamped[1],
      width: definition.footprint[0],
      depth: definition.footprint[1],
    };
    if (!obstacles.some((obstacle) => rectanglesOverlap(rect, obstacle))) {
      return clamped;
    }
  }
  return clampComponentPosition(type, [0, 0]);
}

function portLabel(component: LabComponent, portKey: string): string {
  const port = getDefinition(component.type).ports.find((item) => item.key === portKey);
  return port ? `${component.name} · ${port.label}` : `${component.name} · ${portKey}`;
}

function countWiresAtPort(wires: Wire[], portId: string): number {
  return wires.reduce(
    (count, wire) => count + Number(wire.fromPortId === portId) + Number(wire.toPortId === portId),
    0,
  );
}

function hasDuplicateWire(wires: Wire[], fromPortId: string, toPortId: string): boolean {
  return wires.some(
    (wire) =>
      (wire.fromPortId === fromPortId && wire.toPortId === toPortId) ||
      (wire.fromPortId === toPortId && wire.toPortId === fromPortId),
  );
}

function errorDiagnosticCount(diagnostics: Diagnostic[], level: 'warning' | 'error'): number {
  return diagnostics.filter((diagnostic) => diagnostic.level === level).length;
}

export const useLabStore = create<LabStore>()((set, get) => {
  let toastCounter = 0;
  const initial = initialData();
  const initialResult = simulateSafe(initial.components, initial.wires);

  const pushSnapshot = (): void => {
    const state = get();
    if (state.history.transactionBefore) return;
    const past = [...state.history.past, currentSnapshot(state)].slice(-MAX_HISTORY);
    set({ history: { past, future: [], transactionBefore: null } });
  };

  const resetInteraction = (): Partial<LabStore> => ({
    interactionMode: 'idle',
    draftWire: null,
    dragSession: null,
    adjustSession: null,
    hoveredPortId: null,
  });

  const capabilities = (componentId: string, portKey: string): { component: LabComponent | null; portId: string } => {
    const state = get();
    const component = state.components.find((item) => item.id === componentId) ?? null;
    return { component, portId: makePortId(componentId, portKey) };
  };

  const getTransientOptions = (): SimulationOptions['transient'] | undefined => {
    const transient = get().transient;
    if (!transient.active) return undefined;
    return {
      capacitorVoltages: transient.capacitorVoltages,
      dt: transient.dt,
      time: transient.time,
    };
  };

  const toast = (kind: ToastKind, title: string, message?: string): void => {
    toastCounter += 1;
    const id = `toast-${Date.now()}-${toastCounter}`;
    const next: ToastMessage = { id, kind, title, message };
    set((state) => ({ toasts: [...state.toasts.slice(-3), next] }));
    window.setTimeout(() => {
      get().dismissToast(id);
    }, kind === 'error' ? 5600 : 3800);
  };

  const solveWithCurrentMode = (
    components: LabComponent[],
    wires: Wire[],
    transientOverride?: SimulationOptions['transient'],
  ): SimulationResult => {
    if (transientOverride) return simulateSafe(components, wires, transientOverride);
    const transient = get().transient;
    if (transient.active) {
      return simulateSafe(components, wires, {
        capacitorVoltages: transient.capacitorVoltages,
        dt: transient.dt,
        time: transient.time,
      });
    }
    return simulateSafe(components, wires);
  };

  return {
    referencePortId: initial.referencePortId ?? null,
    components: initial.components,
    wires: initial.wires,
    result: initialResult,
    selectedId: null,
    selectedWireId: null,
    hoveredPortId: null,
    activeLabId: initial.activeLabId,
    mode: initial.mode,
    sideTab: 'lab',
    libraryOpen: typeof window === 'undefined' || window.innerWidth > 1020,
    wireColor: WIRE_COLORS[0].value,
    interactionMode: 'idle',
    draftWire: null,
    dragSession: null,
    adjustSession: null,
    history: { past: [], future: [], transactionBefore: null },
    measurements: initial.measurements,
    transient: makeTransientRuntime(),
    toasts: [],
    lastSavedAt: null,

    setSideTab: (sideTab) => set({ sideTab }),
    setLibraryOpen: (libraryOpen) => set({ libraryOpen }),
    setActiveLab: (activeLabId) => {
      get().loadLab(getLab(activeLabId).id, false);
    },
    setReferencePort: referencePortId => set({ referencePortId }),
    replaceComponent: (id, type) => {
      const state = get(), previous = state.components.find(c => c.id === id);
      if (!previous || previous.type === type) return;
      pushSnapshot();
      const components = state.components.map(c => c.id === id ? { ...c, type, name: getDefinition(type).shortName, params: createDefaultParams(type), position: clampComponentPosition(type, c.position) } : c);
      const valid = new Set(getDefinition(type).ports.map(p => `${id}:${p.key}`));
      const wires = state.wires.filter(w => [w.fromPortId, w.toPortId].every(p => !p.startsWith(id + ':') || valid.has(p)));
      set({ components, wires, result: solveWithCurrentMode(components, wires), ...resetInteraction() });
    },
    setMode: (mode) => set({ mode, sideTab: 'lab' }),
    setWireColor: (wireColor) => set({ wireColor }),

    selectComponent: (componentId) => {
      const exists = componentId
        ? get().components.some((component) => component.id === componentId)
        : false;
      set({
        selectedId: exists ? componentId : null,
        selectedWireId: null,
        sideTab: exists ? 'inspector' : get().sideTab,
      });
    },

    selectWire: (wireId) => {
      set({
        selectedWireId: wireId,
        selectedId: null,
        sideTab: wireId ? 'inspector' : get().sideTab,
      });
    },

    removeSelected: () => {
      const state = get();
      if (state.selectedWireId) {
        get().removeWire(state.selectedWireId);
        return;
      }
      if (state.selectedId) {
        get().removeComponent(state.selectedId);
      }
    },

    removeComponent: (componentId) => {
      const state = get();
      const component = state.components.find((item) => item.id === componentId);
      if (!component) return;
      pushSnapshot();
      const components = state.components.filter((item) => item.id !== componentId);
      const wires = state.wires.filter(
        (wire) =>
          parsePortId(wire.fromPortId)?.componentId !== componentId &&
          parsePortId(wire.toPortId)?.componentId !== componentId,
      );
      const result = simulateSafe(
        components,
        wires,
        get().transient.active ? getTransientOptions() : undefined,
      );
      const filteredCaps = Object.fromEntries(
        Object.entries(get().transient.capacitorVoltages).filter(([id]) =>
          components.some((item) => item.id === id && item.type === 'capacitor'),
        ),
      );
      set((current) => ({
        components,
        wires,
        result,
        selectedId: null,
        selectedWireId: null,
        ...resetInteraction(),
        transient:
          components.some((item) => item.type === 'capacitor') && current.transient.active
            ? { ...current.transient, capacitorVoltages: filteredCaps }
            : makeTransientRuntime(),
      }));
      toast('info', `已移除 ${component.name}`, '与器材相连的导线已一并清理。');
    },

    addComponent: (type, position) => {
      const state = get();
      const definition = getDefinition(type);
      const placement = clampComponentPosition(
        type,
        position ?? findOpenPosition(type, state.components),
      );
      pushSnapshot();
      const id = nextComponentId(get().components, type);
      const component: LabComponent = {
        id,
        type,
        name: nextComponentName(get().components, type),
        position: placement,
        rotationY: 0,
        params: createDefaultParams(type),
      };
      const components = [...get().components, component];
      const result = solveWithCurrentMode(components, get().wires);
      set({
        components,
        result,
        selectedId: id,
        selectedWireId: null,
        sideTab: 'inspector',
        ...resetInteraction(),
      });
      toast('success', `已添加${definition.shortName}`, '拖动器材可调整位置，点击接线柱开始接线。');
    },

    rotateComponent: (componentId, deltaRadians) => {
      const state = get();
      const component = state.components.find((item) => item.id === componentId);
      if (!component) return;
      pushSnapshot();
      const components = state.components.map((item) =>
        item.id === componentId
          ? { ...item, rotationY: (item.rotationY + deltaRadians) % (Math.PI * 2) }
          : item,
      );
      set({ components });
    },

    setComponentPosition: (componentId, position) => {
      const state = get();
      const component = state.components.find((item) => item.id === componentId);
      if (!component) return;
      const clamped = clampComponentPosition(component.type, position);
      set({
        components: state.components.map((item) =>
          item.id === componentId ? { ...item, position: clamped } : item,
        ),
      });
    },

    beginMove: (componentId, planePoint) => {
      const state = get();
      if (state.interactionMode !== 'idle') return;
      const component = state.components.find((item) => item.id === componentId);
      if (!component) return;
      get().beginTransaction();
      set({
        selectedId: componentId,
        selectedWireId: null,
        sideTab: 'inspector',
        interactionMode: 'dragging',
        dragSession: {
          componentId,
          offsetX: component.position[0] - planePoint[0],
          offsetZ: component.position[1] - planePoint[1],
          moved: false,
        },
      });
    },

    updateMovePoint: (planePoint) => {
      const state = get();
      const session = state.dragSession;
      if (!session || state.interactionMode !== 'dragging') return;
      const component = state.components.find((item) => item.id === session.componentId);
      if (!component) return;
      const position = clampComponentPosition(component.type, [
        planePoint[0] + session.offsetX,
        planePoint[1] + session.offsetZ,
      ]);
      const moved =
        session.moved ||
        Math.abs(position[0] - component.position[0]) > 1e-4 ||
        Math.abs(position[1] - component.position[1]) > 1e-4;
      set({
        components: state.components.map((item) =>
          item.id === session.componentId ? { ...item, position } : item,
        ),
        dragSession: { ...session, moved },
      });
    },

    endMove: () => {
      const state = get();
      if (state.interactionMode !== 'dragging') return;
      get().commitTransaction();
      set({ ...resetInteraction() });
    },

    cancelMove: () => {
      if (get().interactionMode !== 'dragging') return;
      get().cancelTransaction(true);
      set({ ...resetInteraction() });
    },

    setParam: (componentId, key, value, record = true) => {
      const state = get();
      const component = state.components.find((item) => item.id === componentId);
      if (!component) return;
      if (component.type === 'oscilloscope' && key === 'running' && value === false && component.params.running !== false) useScopeStore.getState().hold(componentId, { components: state.components, wires: state.wires, result: state.result, samples: state.transient.samples });
      if (record) pushSnapshot();
      const components = get().components.map((item) =>
        item.id === componentId
          ? { ...item, params: { ...item.params, [key]: value } }
          : item,
      );
      const result = solveWithCurrentMode(components, get().wires);
      set({ components, result });
    },

    beginControl: (componentId, paramKey, pointer, axis = 'y') => {
      const state = get();
      if (state.interactionMode !== 'idle') return;
      const component = state.components.find((item) => item.id === componentId);
      if (!component) return;
      const definition = getDefinition(component.type).params.find((param) => param.key === paramKey);
      if (!definition || (definition.kind !== 'slider' && definition.kind !== 'number')) return;
      get().beginTransaction();
      set({
        selectedId: componentId,
        selectedWireId: null,
        sideTab: 'inspector',
        interactionMode: 'adjusting',
        adjustSession: {
          componentId,
          paramKey,
          startValue: Number(component.params[paramKey] ?? definition.min),
          min: definition.min,
          max: definition.max,
          step: definition.step,
          startClientX: pointer.x,
          startClientY: pointer.y,
          axis,
          transactionStarted: true,
        },
      });
    },

    updateControl: (pointer) => {
      const state = get();
      const session = state.adjustSession;
      if (!session || state.interactionMode !== 'adjusting') return;
      const definition = getDefinition(
        state.components.find((item) => item.id === session.componentId)?.type ?? 'resistor',
      ).params.find((param) => param.key === session.paramKey);
      if (!definition || (definition.kind !== 'slider' && definition.kind !== 'number')) return;
      const delta =
        session.axis === 'x'
          ? pointer.x - session.startClientX
          : -(pointer.y - session.startClientY) + (pointer.x - session.startClientX) * 0.18;
      const range = session.max - session.min;
      let next = session.startValue + (delta / 260) * range;
      const step = session.step > 0 ? session.step : 0.01;
      next = Math.round(next / step) * step;
      next = Math.max(session.min, Math.min(session.max, next));
      next = Number(next.toFixed(6));
      const components = state.components.map((item) =>
        item.id === session.componentId
          ? { ...item, params: { ...item.params, [session.paramKey]: next } }
          : item,
      );
      const result = solveWithCurrentMode(components, get().wires);
      set({ components, result });
    },

    endControl: () => {
      if (get().interactionMode !== 'adjusting') return;
      get().commitTransaction();
      set({ ...resetInteraction() });
    },

    cancelControl: () => {
      if (get().interactionMode !== 'adjusting') return;
      get().cancelTransaction(true);
      set({ ...resetInteraction() });
    },

    beginTransaction: () => {
      const state = get();
      if (state.history.transactionBefore) return;
      set({
        history: {
          ...state.history,
          transactionBefore: currentSnapshot(state),
        },
      });
    },

    commitTransaction: () => {
      const state = get();
      const before = state.history.transactionBefore;
      if (!before) return;
      const after = currentSnapshot(state);
      const changed = !sameSnapshot(before, after);
      set({
        history: {
          past: changed ? [...state.history.past, before].slice(-MAX_HISTORY) : state.history.past,
          future: changed ? [] : state.history.future,
          transactionBefore: null,
        },
      });
    },

    cancelTransaction: (revert = true) => {
      const state = get();
      const before = state.history.transactionBefore;
      if (!before) return;
      if (revert) {
        const result = solveWithCurrentMode(before.components, before.wires);
        set({
          components: before.components,
          wires: before.wires,
          activeLabId: before.activeLabId,
          mode: before.mode,
          referencePortId: before.referencePortId,
          result,
          history: { ...state.history, transactionBefore: null },
        });
      } else {
        set({ history: { ...state.history, transactionBefore: null } });
      }
    },

    beginWire: (portId) => {
      const state = get();
      if (state.interactionMode !== 'idle') return;
      const owner = findPortOwner(state.components, portId);
      const parsed = parsePortId(portId);
      if (!owner || !parsed) {
        toast('error', '无法开始接线', '该端口已失效，请重新选择器材。');
        return;
      }
      if (countWiresAtPort(state.wires, portId) >= MAX_WIRES_PER_PORT) {
        toast('warning', '接线柱已占用', '每个接线柱最多堆叠 3 根教学导线，请先拔除一根。');
        return;
      }
      const port = getDefinition(owner.component.type).ports.find((item) => item.key === parsed.portKey);
      const cursor: [number, number, number] = port
        ? [
            owner.component.position[0] + port.position[0],
            port.position[1],
            owner.component.position[1] + port.position[2],
          ]
        : [owner.component.position[0], 0.08, owner.component.position[1]];
      set({
        interactionMode: 'wiring',
        selectedWireId: null,
        draftWire: {
          fromPortId: portId,
          cursor,
          targetPortId: null,
          valid: false,
        },
      });
    },

    updateWirePointer: (portId, cursor) => {
      const state = get();
      if (state.interactionMode !== 'wiring' || !state.draftWire) return;
      const draft = state.draftWire;
      let target: string | null = null;
      let valid = false;
      if (portId && portId !== draft.fromPortId) {
        const owner = findPortOwner(state.components, portId);
        if (owner) {
          target = portId;
          valid =
            !hasDuplicateWire(state.wires, draft.fromPortId, portId) &&
            countWiresAtPort(state.wires, portId) < MAX_WIRES_PER_PORT &&
            countWiresAtPort(state.wires, draft.fromPortId) < MAX_WIRES_PER_PORT;
        }
      }
      set({
        draftWire: { ...draft, cursor, targetPortId: target, valid },
        hoveredPortId: portId,
      });
    },

    completeWire: (targetPortId) => {
      const state = get();
      const draft = state.draftWire;
      if (!draft || state.interactionMode !== 'wiring') return;
      if (!targetPortId) {
        set({ ...resetInteraction() });
        return;
      }
      if (targetPortId === draft.fromPortId) {
        set({ ...resetInteraction() });
        return;
      }
      const fromOwner = findPortOwner(state.components, draft.fromPortId);
      const toOwner = findPortOwner(state.components, targetPortId);
      if (!fromOwner || !toOwner) {
        set({ ...resetInteraction() });
        toast('error', '连接失败', '端口已不存在，请重新选择。');
        return;
      }
      if (hasDuplicateWire(state.wires, draft.fromPortId, targetPortId)) {
        set({ ...resetInteraction() });
        toast('warning', '重复连接', '这两个端口之间已经存在一根导线。');
        return;
      }
      if (
        countWiresAtPort(state.wires, draft.fromPortId) >= MAX_WIRES_PER_PORT ||
        countWiresAtPort(state.wires, targetPortId) >= MAX_WIRES_PER_PORT
      ) {
        set({ ...resetInteraction() });
        toast('warning', '接线柱已满', '每个接线柱最多连接 3 根导线。');
        return;
      }
      pushSnapshot();
      let counter = 1;
      const usedWireIds = new Set(state.wires.map((wire) => wire.id));
      while (usedWireIds.has(`wire-${counter}`)) counter += 1;
      const wire: Wire = {
        id: `wire-${counter}`,
        fromPortId: draft.fromPortId,
        toPortId: targetPortId,
        color: state.wireColor,
      };
      const wires = [...state.wires, wire];
      const result = solveWithCurrentMode(get().components, wires);
      set({ wires, result, ...resetInteraction() });
      toast(
        'success',
        '导线已连接',
        `${portLabel(fromOwner.component, fromOwner.portKey)} ↔ ${portLabel(toOwner.component, toOwner.portKey)}`,
      );
    },

    cancelWire: () => {
      if (get().interactionMode !== 'wiring') return;
      set({ ...resetInteraction() });
    },

    removeWire: (wireId) => {
      const state = get();
      const wire = state.wires.find((item) => item.id === wireId);
      if (!wire) return;
      pushSnapshot();
      const wires = state.wires.filter((item) => item.id !== wireId);
      const result = solveWithCurrentMode(state.components, wires);
      set({
        wires,
        result,
        selectedWireId: state.selectedWireId === wireId ? null : state.selectedWireId,
        ...resetInteraction(),
      });
      toast('info', '导线已拔除');
    },

    undo: () => {
      const state = get();
      if (state.history.transactionBefore) {
        get().cancelTransaction(true);
        set({ ...resetInteraction(), selectedId: null, selectedWireId: null });
        return;
      }
      const previous = state.history.past[state.history.past.length - 1];
      if (!previous) return;
      const current = currentSnapshot(state);
      const result = simulateSafe(previous.components, previous.wires);
      set({
        components: previous.components,
        wires: previous.wires,
        activeLabId: previous.activeLabId,
        mode: previous.mode,
        referencePortId: previous.referencePortId,
        result,
        history: {
          past: state.history.past.slice(0, -1),
          future: [current, ...state.history.future].slice(0, MAX_HISTORY),
          transactionBefore: null,
        },
        selectedId: null,
        selectedWireId: null,
        transient: makeTransientRuntime(),
        ...resetInteraction(),
      });
      toast('info', '已撤销上一步操作');
    },

    redo: () => {
      const state = get();
      const next = state.history.future[0];
      if (!next) return;
      const current = currentSnapshot(state);
      const result = simulateSafe(next.components, next.wires);
      set({
        components: next.components,
        wires: next.wires,
        activeLabId: next.activeLabId,
        mode: next.mode,
        referencePortId: next.referencePortId,
        result,
        history: {
          past: [...state.history.past, current].slice(-MAX_HISTORY),
          future: state.history.future.slice(1),
          transactionBefore: null,
        },
        selectedId: null,
        selectedWireId: null,
        transient: makeTransientRuntime(),
        ...resetInteraction(),
      });
      toast('info', '已重做操作');
    },

    loadLab: (labId, wired = false) => {
      const lab = getLab(labId);
      const built = buildLabCircuit(lab.id, wired);
      pushSnapshot();
      const result = simulateSafe(built.components, built.wires);
      set({
        components: built.components,
        wires: built.wires,
        result,
        activeLabId: lab.id,
        referencePortId: null,
        mode: 'guided',
        selectedId: null,
        selectedWireId: null,
        sideTab: 'lab',
        transient: makeTransientRuntime(),
        ...resetInteraction(),
      });
      toast(
        wired ? 'success' : 'info',
        wired ? '已载入示范接线' : `${lab.title} · 器材已就位`,
        wired
          ? '该接线用于演示与自检，学生可拔除导线后重新完成实验。'
          : '请按实验步骤自行连接导线。',
      );
    },

    arrangeBench: () => {
      const state = get();
      const components = arrangeLesson(state.components, buildLabCircuit(state.activeLabId).components);
      if (!components) { toast('warning', '无法整理台面', '请移开占据预设位置的额外器材。'); return false; }
      const colors = new Map(colorDemoWires(components, state.wires).map(w => [w.id, w.color]));
      const wires = state.wires.map(w => w.id.startsWith(`${state.activeLabId}-demo-w`) ? { ...w, color: colors.get(w.id)! } : w);
      if (components.every((c, i) => c.rotationY === state.components[i].rotationY && c.position.every((v, axis) => v === state.components[i].position[axis])) &&
        wires.every((w, i) => w.color === state.wires[i].color)) return true;
      pushSnapshot();
      // Geometry and cable colours have no electrical meaning. Keep readings and acquired data intact.
      set({ components, wires, ...resetInteraction() });
      toast('success', '已整理台面');
      return true;
    },

    clearBench: () => {
      pushSnapshot();
      const result = simulateSafe([], []);
      set({
        components: [],
        wires: [],
        result,
        selectedId: null,
        selectedWireId: null,
        sideTab: 'lab',
        transient: makeTransientRuntime(),
        ...resetInteraction(),
      });
      toast('info', '实验台已清空', '可从左侧器材库重新开始，或载入一个实验模板。');
    },

    recordMeasurement: () => {
      const state = get();
      const phase = state.activeLabId.startsWith('three-phase-') ? threePhaseReadings(state, state.result) : null;
      const issue = measurementIssue(state.components, state.result) ?? (state.activeLabId.startsWith('three-phase-') && phase?.wiringValid !== 1 ? '三相负载接法与当前实验不符，请检查接线。' : null);
      if (issue) {
        toast('error', '无法记录数据', issue);
        return;
      }
      const findFirst = (type: ComponentType) => state.components.find((item) => item.type === type);
      const voltmeter = findFirst('voltmeter');
      const ammeter = findFirst('ammeter');
      const capacitor = findFirst('capacitor');
      const resistor = findFirst('resistor');
      const led = findFirst('led');
      const supply = findFirst('power-supply') ?? findFirst('programmable-supply');
      const dmm = findFirst('multimeter');
      const dmmResult = dmm ? state.result.elements[dmm.id] : undefined;
      const voltage =
        (voltmeter ? state.result.elements[voltmeter.id]?.reading : undefined) ?? (dmmResult?.readingUnit === 'V' ? dmmResult.reading : undefined) ??
        (capacitor
          ? state.result.elements[capacitor.id]?.voltage ?? state.transient.capacitorVoltages[capacitor.id]
          : undefined) ??
        (resistor ? state.result.elements[resistor.id]?.voltage : undefined) ??
        (supply ? state.result.elements[supply.id]?.voltage : undefined) ??
        null;
      const current =
        (ammeter ? state.result.elements[ammeter.id]?.reading : undefined) ?? (dmmResult?.readingUnit === 'A' ? dmmResult.reading : undefined) ??
        (led ? state.result.elements[led.id]?.current : undefined) ??
        (resistor ? state.result.elements[resistor.id]?.current : undefined) ??
        (supply ? state.result.elements[supply.id]?.current : undefined) ??
        null;
      if (voltage === null && current === null && dmmResult?.readingUnit !== 'Ω') {
        toast('warning', '暂时没有可记录的读数', '请接入仪表或形成完整测量回路。');
        return;
      }
      const finiteVoltage = typeof voltage === 'number' && Number.isFinite(voltage) ? voltage : null;
      const finiteCurrent = typeof current === 'number' && Number.isFinite(current) ? current : null;
      const resistance = dmmResult?.readingUnit === 'Ω' ? dmmResult.reading ?? null :
        finiteVoltage !== null &&
        finiteCurrent !== null &&
        Math.abs(finiteCurrent) > 1e-9
          ? Math.abs(finiteVoltage / finiteCurrent)
          : null;
      const lab = getLab(state.activeLabId);
      const existing = state.measurements.filter((row) => row.labId === state.activeLabId).length;
      const row: MeasurementRow = {
        id: `measure-${Date.now()}-${existing + 1}`,
        labId: state.activeLabId,
        createdAt: Date.now(),
        label: `${lab.title} · 第 ${existing + 1} 组`,
        voltage: finiteVoltage,
        current: finiteCurrent,
        resistance,
        note:
          '由当前三维接线、仪器参数与实时电路仿真结果生成；未对记录值做人工修正。',
        sourceComponentId: voltmeter?.id ?? ammeter?.id ?? dmm?.id ?? capacitor?.id ?? supply?.id,
        observation: captureObservation(state, state.result, state.referencePortId ?? (state.activeLabId === 'potentials' ? 'potentials-ps:negative' : null)),
      };
      set({ measurements: [...state.measurements, row], sideTab: 'data' });
      toast('success', '测量数据已记录', `${lab.title} 已保存第 ${existing + 1} 组读数。`);
    },

    deleteMeasurement: (id) => {
      set((state) => ({ measurements: state.measurements.filter((row) => row.id !== id) }));
    },

    clearMeasurements: () => {
      set({ measurements: [] });
      toast('info', '实验记录已清空');
    },

    startTransient: () => {
      const state = get();
      const capacitors = state.components.filter((component) => component.type === 'capacitor');
      if (capacitors.length === 0) {
        toast('warning', '没有电容', '请先添加至少一只电容再启动 RC 暂态。');
        return;
      }
      if (!state.result.solved) {
        toast('error', '电路尚未可解', '请先修复接线或参数错误，再启动暂态。');
        return;
      }
      const initialValues: Record<string, number> = {};
      for (const capacitor of capacitors) initialValues[capacitor.id] = 0;
      set({
        transient: {
          active: true,
          running: true,
          time: 0,
          dt: TRANSIENT_SAMPLE_DT,
          capacitorVoltages: initialValues,
          samples: [{ time: 0, values: initialValues }],
        },
        sideTab: 'data',
      });
      toast('info', 'RC 暂态已启动', '后向欧拉积分 2 ms、采样 20 ms；后台标签页自动冻结计时。');
    },

    resumeTransient: () => {
      const transient = get().transient;
      if (!transient.active) {
        get().startTransient();
        return;
      }
      set({ transient: { ...transient, running: true } });
    },

    pauseTransient: () => {
      const transient = get().transient;
      if (!transient.active) return;
      set({ transient: { ...transient, running: false } });
      toast('info', 'RC 暂态已暂停', '已保留电容状态和曲线，可继续运行或重置。');
    },

    resetTransient: () => {
      const state = get();
      const result = simulateSafe(state.components, state.wires);
      set({
        transient: makeTransientRuntime(),
        result,
      });
      toast('info', 'RC 暂态已重置', '已返回直流稳态；再次启动暂态时使用 0 V 初始条件。');
    },

    tickTransient: () => {
      const state = get();
      const transient = state.transient;
      if (!transient.active || !transient.running) return;
      const nextTime = transient.time + transient.dt;
      const result = advanceTransient(
        { components: state.components, wires: state.wires },
        transient.capacitorVoltages, transient.time, transient.dt, TRANSIENT_MAX_STEP,
      );
      if (!result.solved) {
        set({
          result,
          transient: { ...transient, running: false },
        });
        toast('error', '暂态求解停止', '电路出现无解或非有限结果，已在当前时间点暂停。');
        return;
      }
      const nextCapacitors = result.capacitorVoltages ?? transient.capacitorVoltages;
      const values: Record<string, number> = { ...nextCapacitors };
      for (const [id, voltage] of Object.entries(result.portVoltages ?? {})) values[`port:${id}`] = voltage;
      const samples = [...transient.samples, { time: nextTime, values }].slice(-1200);
      set({
        result,
        transient: {
          ...transient,
          time: nextTime,
          capacitorVoltages: nextCapacitors,
          samples,
          running: nextTime < 30,
        },
      });
    },

    saveLocal: () => {
      const state = get();
      const payload = makeWorkspacePayload({
        components: state.components,
        wires: state.wires,
        measurements: state.measurements,
        activeLabId: state.activeLabId,
        mode: state.mode,
        referencePortId: state.referencePortId,
      });
      const ok = writeLocalWorkspace(payload);
      if (ok) {
        set({ lastSavedAt: Date.now() });
        toast('success', '实验已保存到浏览器', '包含器材、参数、接线与测量记录，刷新后可恢复。');
      } else {
        toast('error', '浏览器存储失败', '可能是隐私模式或存储空间不足，请改用“导出 JSON”。');
      }
    },

    loadLocal: () => {
      const workspace = readLocalWorkspace();
      if (!workspace) {
        toast('warning', '没有找到本地存档', '请先保存实验，或导入一个 JSON 文件。');
        return;
      }
      get().importWorkspace(workspace);
    },

    importWorkspace: (workspace) => {
      useScopeStore.getState().reset();
      pushSnapshot();
      const result = simulateSafe(workspace.components, workspace.wires);
      set({
        components: workspace.components,
        wires: workspace.wires,
        measurements: workspace.measurements,
        activeLabId: workspace.activeLabId,
        mode: workspace.mode,
        referencePortId: workspace.referencePortId ?? null,
        result,
        selectedId: null,
        selectedWireId: null,
        sideTab: 'lab',
        transient: makeTransientRuntime(),
        ...resetInteraction(),
      });
      toast(
        'success',
        '实验工程已恢复',
        '已根据保存的器材、参数和端口拓扑重新计算，不依赖旧读数。',
      );
    },

    getWorkspace: () => {
      const state = get();
      return makeWorkspacePayload({
        components: state.components,
        wires: state.wires,
        measurements: state.measurements,
        activeLabId: state.activeLabId,
        mode: state.mode,
        referencePortId: state.referencePortId,
      });
    },

    pushToast: (kind, title, message) => toast(kind, title, message),
    dismissToast: (id) => set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) })),
  };
});

export const selectSelectedComponent = (state: LabStore): LabComponent | null =>
  state.components.find((component) => component.id === state.selectedId) ?? null;

export const selectSelectedWire = (state: LabStore): Wire | null =>
  state.wires.find((wire) => wire.id === state.selectedWireId) ?? null;

export const selectActiveLab = (state: LabStore) => getLab(state.activeLabId);

export const selectDiagnosticsSummary = (
  state: LabStore,
): { errors: number; warnings: number; messages: Diagnostic[] } => {
  const diagnostics = state.result.diagnostics;
  return {
    errors: errorDiagnosticCount(diagnostics, 'error'),
    warnings: errorDiagnosticCount(diagnostics, 'warning'),
    messages: diagnostics,
  };
};

/** 供界面预检查端口最大连接数，不参与电气求解。 */
export const MAX_PORT_WIRES = MAX_WIRES_PER_PORT;

/** 由端口 ID 推导世界坐标，用于落点/导线预览。 */
export function portWorldPosition(
  components: LabComponent[],
  portId: string,
): [number, number, number] | null {
  const owner = findPortOwner(components, portId);
  if (!owner) return null;
  const parsed = parsePortId(portId);
  if (!parsed) return null;
  const port = getDefinition(owner.component.type).ports.find((item) => item.key === parsed.portKey);
  if (!port) return null;
  const c = Math.cos(owner.component.rotationY);
  const s = Math.sin(owner.component.rotationY);
  return [
    owner.component.position[0] + port.position[0] * c + port.position[2] * s,
    port.position[1],
    owner.component.position[1] - port.position[0] * s + port.position[2] * c,
  ];
}

/** 面包板内部连通组的教学说明。 */
export function describeInternalPortGroups(component: LabComponent): number {
  return getInternalPortGroups(component).length;
}

export const BENCH_CONSTANTS = BENCH;
