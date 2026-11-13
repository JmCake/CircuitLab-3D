import type {
  ComponentType,
  LabComponent,
  MeasurementRow,
  SavedWorkspace,
  Wire,
} from '../circuit';
import { COMPONENT_DEFINITIONS } from '../circuit';

export const WORKSPACE_STORAGE_KEY = 'circuitlab-3d:workspace:v1';

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isValidComponent(value: unknown): value is LabComponent {
  if (!value || typeof value !== 'object') return false;
  const component = value as Partial<LabComponent>;
  if (typeof component.id !== 'string' || typeof component.type !== 'string') return false;
  if (!(component.type in COMPONENT_DEFINITIONS)) return false;
  if (typeof component.name !== 'string') return false;
  if (!Array.isArray(component.position) || component.position.length !== 2) return false;
  if (!component.position.every(isFiniteNumber)) return false;
  if (!isFiniteNumber(component.rotationY)) return false;
  if (!component.params || typeof component.params !== 'object') return false;
  for (const value of Object.values(component.params)) {
    if (!['number', 'string', 'boolean'].includes(typeof value)) return false;
    if (typeof value === 'number' && !Number.isFinite(value)) return false;
  }
  return true;
}

function isValidWire(value: unknown, componentIds: Set<string>): value is Wire {
  if (!value || typeof value !== 'object') return false;
  const wire = value as Partial<Wire>;
  if (typeof wire.id !== 'string' || typeof wire.fromPortId !== 'string') return false;
  if (typeof wire.toPortId !== 'string' || typeof wire.color !== 'string') return false;
  const from = wire.fromPortId.split(':')[0];
  const to = wire.toPortId.split(':')[0];
  return componentIds.has(from) && componentIds.has(to);
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
  if (!candidate.components.every(isValidComponent)) return null;
  const componentIds = new Set(candidate.components.map((component) => component.id));
  if (new Set(componentIds).size !== componentIds.size) return null;
  const validWires = candidate.wires.filter((wire) => isValidWire(wire, componentIds));
  if (validWires.length !== candidate.wires.length) return null;
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
