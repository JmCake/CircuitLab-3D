/**
 * CircuitLab-3D 电路域模型
 *
 * 这一层不依赖 React / Three.js。导线与端口是电气拓扑的唯一事实来源，
 * 三维网格的位置只决定导线如何绘制，不参与“是否连通”的判断。
 */

export type ComponentType =
  | 'power-supply'
  | 'ammeter'
  | 'voltmeter'
  | 'resistor'
  | 'switch'
  | 'resistor-box'
  | 'rheostat'
  | 'capacitor'
  | 'led'
  | 'bulb'
  | 'breadboard';

export type PortRole =
  | 'positive'
  | 'negative'
  | 'bidirectional'
  | 'anode'
  | 'cathode'
  | 'wiper'
  | 'hole';

export interface PortDefinition {
  /** 器材内部的稳定端口键，完整端口 ID = `${componentId}:${key}` */
  key: string;
  label: string;
  role: PortRole;
  /** 相对器材局部原点的坐标（米）。y 为离桌面高度。 */
  position: [number, number, number];
  /** 端口法线方向，用来摆放插头和生成第一段导线曲率。 */
  normal?: [number, number, number];
  /** 视觉上是否画出接线柱，面包板孔位使用 false。 */
  visible?: boolean;
}

export type ParamDefinition =
  | {
      key: string;
      label: string;
      kind: 'slider';
      min: number;
      max: number;
      step: number;
      unit: string;
      unitScale?: number;
      precision?: number;
      suggestions?: number[];
      description?: string;
    }
  | {
      key: string;
      label: string;
      kind: 'number';
      min: number;
      max: number;
      step: number;
      unit: string;
      unitScale?: number;
      precision?: number;
      suggestions?: number[];
      description?: string;
    }
  | {
      key: string;
      label: string;
      kind: 'select';
      options: { value: string | number; label: string }[];
      description?: string;
    }
  | {
      key: string;
      label: string;
      kind: 'switch';
      onLabel?: string;
      offLabel?: string;
      description?: string;
    };

export interface ComponentDefinition {
  type: ComponentType;
  name: string;
  shortName: string;
  prefix: string;
  category: 'source' | 'measurement' | 'passive' | 'semiconductor' | 'control';
  description: string;
  accent: string;
  /** 桌面占位尺寸 [x, z]，用于边界约束与初始布局。 */
  footprint: [number, number];
  height: number;
  ports: PortDefinition[];
  params: ParamDefinition[];
  defaults: Record<string, number | string | boolean>;
  modelNote?: string;
}

export type ParamValue = number | string | boolean;
export type ParamBag = Record<string, ParamValue>;

export interface LabComponent {
  id: string;
  type: ComponentType;
  name: string;
  /** 桌面坐标 [x, z]，单位米。y 永远贴桌面。 */
  position: [number, number];
  rotationY: number;
  params: ParamBag;
}

export interface Wire {
  id: string;
  fromPortId: string;
  toPortId: string;
  color: string;
}

export interface CircuitSnapshot {
  components: LabComponent[];
  wires: Wire[];
}

export type SimulationStatus = 'ok' | 'incomplete' | 'error';

export type DiagnosticLevel = 'info' | 'warning' | 'error';

export interface Diagnostic {
  code: string;
  level: DiagnosticLevel;
  message: string;
  componentIds?: string[];
  portIds?: string[];
}

export interface ElementResult {
  /** 由端口 0 流向端口 1 的约定正方向电流（A）。 */
  current: number;
  /** 端口 0 到端口 1 的电压（V）。 */
  voltage: number;
  power: number;
  /** 仪表或显示屏使用的读数。 */
  reading?: number;
  readingUnit?: 'V' | 'A' | 'Ω' | 'W';
  brightness?: number;
  overRange?: boolean;
  /** 器材特有的附加状态（例如电源短路、LED 模型状态）。 */
  flags?: Record<string, number | string | boolean>;
}

export interface TransientState {
  /** 每只电容上一时间步的端电压（V），键为 componentId。 */
  capacitorVoltages: Record<string, number>;
  time: number;
  dt: number;
  active: boolean;
}

export interface SimulationOptions {
  transient?: {
    capacitorVoltages: Record<string, number>;
    dt: number;
    time: number;
  };
}

export interface SimulationResult {
  status: SimulationStatus;
  solved: boolean;
  nodeVoltages: Record<string, number>;
  elements: Record<string, ElementResult>;
  diagnostics: Diagnostic[];
  /** 本次解算对应的电容电压（暂态） */
  capacitorVoltages?: Record<string, number>;
  totalPower?: number;
  solveMs?: number;
}

export interface MeasurementRow {
  id: string;
  labId: string;
  createdAt: number;
  label: string;
  voltage: number | null;
  current: number | null;
  resistance: number | null;
  note?: string;
  sourceComponentId?: string;
}

export interface SavedWorkspace {
  schema: 'circuitlab-3d/workspace';
  version: 1;
  savedAt: string;
  activeLabId: string;
  mode: 'guided' | 'free';
  components: LabComponent[];
  wires: Wire[];
  measurements: MeasurementRow[];
}

export interface ScenarioData {
  components: LabComponent[];
  wires: Wire[];
}

export const PORT_SEPARATOR = ':';

export function makePortId(componentId: string, portKey: string): string {
  return `${componentId}${PORT_SEPARATOR}${portKey}`;
}

export function parsePortId(portId: string): { componentId: string; portKey: string } | null {
  const index = portId.indexOf(PORT_SEPARATOR);
  if (index <= 0 || index === portId.length - 1) return null;
  return {
    componentId: portId.slice(0, index),
    portKey: portId.slice(index + 1),
  };
}

export const WIRE_COLORS = [
  { name: '朱红', value: '#b53b32' },
  { name: '炭黑', value: '#26292b' },
  { name: '钴蓝', value: '#2e5e8c' },
  { name: '琥珀', value: '#c89a3d' },
  { name: '松绿', value: '#3f6e58' },
] as const;
