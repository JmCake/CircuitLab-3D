import type {
  ComponentType,
  LabComponent,
  MeasurementRow,
  SavedWorkspace,
  Wire,
} from '../circuit';
import { COMPONENT_DEFINITIONS, getDefinition, makePortId } from '../circuit';

export const WORKSPACE_STORAGE_KEY = 'circuitlab-3d:workspace:v1';

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isValidComponent(value: unknown): value is LabComponent {
  if (!value || typeof value !== 'object') return false;
  const component = value as Partial<LabComponent>;
  if (typeof component.id !== 'string' || !component.id || component.id.includes(':') || typeof component.type !== 'string') return false;
  if (!Object.hasOwn(COMPONENT_DEFINITIONS, component.type)) return false;
  if (typeof component.name !== 'string') return false;
  if (!Array.isArray(component.position) || component.position.length !== 2) return false;
  if (!component.position.every(isFiniteNumber)) return false;
  if (!isFiniteNumber(component.rotationY)) return false;
  if (!component.params || typeof component.params !== 'object' || Array.isArray(component.params)) return false;
  for (const value of Object.values(component.params)) {
    if (!['number', 'string', 'boolean'].includes(typeof value)) return false;
    if (typeof value === 'number' && !Number.isFinite(value)) return false;
  }
  return true;
}

function isValidWire(value: unknown, portIds: Set<string>): value is Wire {
  if (!value || typeof value !== 'object') return false;
  const wire = value as Partial<Wire>;
  if (typeof wire.id !== 'string' || typeof wire.fromPortId !== 'string') return false;
  if (typeof wire.toPortId !== 'string' || typeof wire.color !== 'string') return false;
  return portIds.has(wire.fromPortId) && portIds.has(wire.toPortId) && wire.fromPortId !== wire.toPortId;
}

function isValidMeasurement(value: unknown): value is MeasurementRow {
  if (!value || typeof value !== 'object') return false;
  const row = value as Partial<MeasurementRow>;
  return (
    typeof row.id === 'string' &&
    typeof row.labId === 'string' &&
    isFiniteNumber(row.createdAt) &&
    typeof row.label === 'string' &&
    (row.voltage === null || isFiniteNumber(row.voltage)) &&
    (row.current === null || isFiniteNumber(row.current)) &&
    (row.resistance === null || isFiniteNumber(row.resistance))
  );
}

export function validateWorkspace(value: unknown): SavedWorkspace | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<SavedWorkspace>;
  if (candidate.schema !== 'circuitlab-3d/workspace' || candidate.version !== 1) return null;
  if (!Array.isArray(candidate.components) || !Array.isArray(candidate.wires)) return null;
  if (candidate.components.length > 128 || candidate.wires.length > 512) return null;
  if (!candidate.components.every(isValidComponent)) return null;
  const componentIds = new Set(candidate.components.map((component) => component.id));
  if (componentIds.size !== candidate.components.length) return null;
  const portIds = new Set(candidate.components.flatMap(c => getDefinition(c.type).ports.map(p => makePortId(c.id, p.key))));
  const validWires = candidate.wires.filter((wire) => isValidWire(wire, portIds));
  if (validWires.length !== candidate.wires.length) return null;
  if (new Set(validWires.map(w => w.id)).size !== validWires.length) return null;
  const pairs = new Set<string>();
  const counts = new Map<string, number>();
  for (const wire of validWires) {
    const pair = [wire.fromPortId, wire.toPortId].sort().join('|');
    if (pairs.has(pair)) return null;
    pairs.add(pair);
    for (const id of [wire.fromPortId, wire.toPortId]) {
      const count = (counts.get(id) ?? 0) + 1;
      if (count > 3) return null;
      counts.set(id, count);
    }
  }
  const measurements = Array.isArray(candidate.measurements)
    ? candidate.measurements.filter(isValidMeasurement)
    : [];
  return {
    schema: 'circuitlab-3d/workspace',
    version: 1,
    savedAt: typeof candidate.savedAt === 'string' ? candidate.savedAt : new Date().toISOString(),
    activeLabId: typeof candidate.activeLabId === 'string' ? candidate.activeLabId : 'ohms-law',
    mode: candidate.mode === 'free' ? 'free' : 'guided',
    components: candidate.components,
    wires: validWires,
    measurements,
  };
}

export function makeWorkspacePayload(input: {
  components: LabComponent[];
  wires: Wire[];
  measurements: MeasurementRow[];
  activeLabId: string;
  mode: 'guided' | 'free';
}): SavedWorkspace {
  return {
    schema: 'circuitlab-3d/workspace',
    version: 1,
    savedAt: new Date().toISOString(),
    activeLabId: input.activeLabId,
    mode: input.mode,
    components: input.components,
    wires: input.wires,
    measurements: input.measurements,
  };
}

export function readLocalWorkspace(): SavedWorkspace | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(WORKSPACE_STORAGE_KEY);
    if (!raw) return null;
    return validateWorkspace(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function writeLocalWorkspace(workspace: SavedWorkspace): boolean {
  if (typeof localStorage === 'undefined') return false;
  try {
    localStorage.setItem(WORKSPACE_STORAGE_KEY, JSON.stringify(workspace));
    return true;
  } catch {
    return false;
  }
}

export function clearLocalWorkspace(): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.removeItem(WORKSPACE_STORAGE_KEY);
  } catch {
    // 忽略存储配额/隐私模式错误；用户仍可导出 JSON 文件。
  }
}

export function isKnownComponentType(type: string): type is ComponentType {
  return type in COMPONENT_DEFINITIONS;
}
