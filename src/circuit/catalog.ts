import type {
  ComponentDefinition,
  ComponentType,
  LabComponent,
  ParamBag,
  PortDefinition,
} from './types';

export const BENCH = {
  width: 2.24,
  depth: 1.16,
  thickness: 0.052,
  surfaceY: 0,
  height: 0.79,
  bounds: { minX: -0.96, maxX: 0.96, minZ: -0.44, maxZ: 0.46 },
  edgePadding: 0.035,
} as const;

export const DEFAULT_LAYOUT: Record<ComponentType, { position: [number, number]; rotationY: number }> = {
  'power-supply': { position: [-0.56, -0.15], rotationY: 0.055 },
  switch: { position: [-0.01, 0.22], rotationY: -0.03 },
  resistor: { position: [0.08, -0.15], rotationY: 0.02 },
  ammeter: { position: [0.45, -0.24], rotationY: -0.035 },
  voltmeter: { position: [0.49, 0.13], rotationY: 0.03 },
  'resistor-box': { position: [0.24, 0.04], rotationY: 0 },
  rheostat: { position: [0.03, -0.02], rotationY: 0 },
  capacitor: { position: [0.02, 0.02], rotationY: 0 },
  led: { position: [0.02, 0.02], rotationY: 0 },
  bulb: { position: [0.02, 0.02], rotationY: 0 },
  breadboard: { position: [0.15, 0.06], rotationY: 0 },
};

const front = (x: number, y: number, z: number): [number, number, number] => [x, y, z];

const post = (
  key: string,
  label: string,
  role: PortDefinition['role'],
  x: number,
  y: number,
  z: number,
): PortDefinition => ({
  key,
  label,
  role,
  position: front(x, y, z),
  normal: [0, 0, 1],
});

function breadboardPorts(): PortDefinition[] {
  const ports: PortDefinition[] = [];
  const columns = 6;
  const rows = 5;
  const x0 = -0.145;
  const dx = 0.058;
  const z0 = -0.028;
  const dz = 0.022;
  for (let c = 0; c < columns; c += 1) {
    for (let r = 0; r < rows; r += 1) {
      ports.push({
        key: `c${c}r${r}`,
        label: `${String.fromCharCode(65 + r)}${c + 1}`,
        role: 'hole',
        position: [x0 + c * dx, 0.031, z0 + r * dz],
        normal: [0, 1, 0],
        visible: false,
      });
    }
  }
  for (let c = 0; c < columns; c += 1) {
    ports.push({
      key: `railTop${c}`,
      label: `上排 +${c + 1}`,
      role: 'hole',
      position: [x0 + c * dx, 0.031, -0.092],
      normal: [0, 1, 0],
      visible: false,
    });
    ports.push({
      key: `railBottom${c}`,
      label: `下排 −${c + 1}`,
      role: 'hole',
      position: [x0 + c * dx, 0.031, 0.092],
      normal: [0, 1, 0],
      visible: false,
    });
  }
  return ports;
}

export const COMPONENT_DEFINITIONS: Record<ComponentType, ComponentDefinition> = {
  'power-supply': {
    type: 'power-supply',
    name: '直流稳压电源',
    shortName: '稳压电源',
    prefix: 'PS',
    category: 'source',
    description:
      '0–20 V 可调单路直流电源。数字屏分别显示输出电压与负载电流，红黑香蕉插孔为浮地输出端。',
    accent: '#8f6a43',
    footprint: [0.48, 0.35],
    height: 0.22,
    ports: [
      post('positive', '输出 +（红）', 'positive', 0.135, 0.06, 0.174),
      post('negative', '输出 −（黑）', 'negative', 0.058, 0.06, 0.174),
    ],
    defaults: {
      voltage: 6,
      enabled: true,
      internalResistance: 0.2,
    },
    params: [
      {
        key: 'voltage',
        label: '输出电压设定',
        kind: 'slider',
        min: 0,
        max: 20,
        step: 0.1,
        unit: 'V',
        precision: 1,
        suggestions: [1.5, 3, 5, 6, 9, 12],
        description: '旋钮调节的设定值。实际端电压会因 0.2 Ω 模拟内阻产生微小压降。',
      },
      {
        key: 'enabled',
        label: '输出开关',
        kind: 'switch',
        onLabel: 'ON',
        offLabel: 'OFF',
        description: '关闭输出后电源支路断开，显示屏熄灭，但接线保持不变。',
      },
    ],
    modelNote: '理想电压源 + 0.2 Ω 串联内阻的线性戴维南模型。',
  },
  ammeter: {
    type: 'ammeter',
    name: '数字电流表',
    shortName: '电流表',
    prefix: 'AM',
    category: 'measurement',
    description: '低内阻直流电流表，应串入待测支路。支持 2 mA / 20 mA / 200 mA / 2 A 量程。',
    accent: '#2c6b74',
    footprint: [0.26, 0.21],
    height: 0.17,
    ports: [
      post('positive', '电流输入 +（红）', 'positive', -0.052, 0.052, 0.11),
      post('negative', '电流输出 −（黑）', 'negative', 0.052, 0.052, 0.11),
    ],
    defaults: { range: 0.02, internalResistance: 0.1 },
    params: [
      {
        key: 'range',
        label: '电流量程',
        kind: 'select',
        options: [
          { value: 0.002, label: '2 mA' },
          { value: 0.02, label: '20 mA' },
          { value: 0.2, label: '200 mA' },
          { value: 2, label: '2 A' },
        ],
        description: '量程过小会提示超量程，但不会产生无穷大读数。',
      },
    ],
    modelNote: '串联 0.1 Ω 采样电阻；读数带符号，负值表示电流由黑端流入。',
  },
  voltmeter: {
    type: 'voltmeter',
    name: '数字电压表',
    shortName: '电压表',
    prefix: 'VM',
    category: 'measurement',
    description: '高输入阻抗直流电压表，应并联在待测元件两端。支持 2 V / 20 V / 200 V 量程。',
    accent: '#3d6387',
    footprint: [0.26, 0.21],
    height: 0.17,
    ports: [
      post('positive', '电压输入 +（红）', 'positive', -0.052, 0.052, 0.11),
      post('negative', '公共端 −（黑）', 'negative', 0.052, 0.052, 0.11),
    ],
    defaults: { range: 20, internalResistance: 10_000_000 },
    params: [
      {
        key: 'range',
        label: '电压量程',
        kind: 'select',
        options: [
          { value: 2, label: '2 V' },
          { value: 20, label: '20 V' },
          { value: 200, label: '200 V' },
        ],
        description: '输入电阻约 10 MΩ，并联测量会引入极小的负载效应。',
      },
    ],
    modelNote: '输入电阻 10 MΩ 的高阻电压表等效模型。',
  },
  resistor: {
    type: 'resistor',
    name: '固定电阻器',
    shortName: '电阻',
    prefix: 'R',
    category: 'passive',
    description: '轴向金属膜电阻教学模块，陶瓷本体与四色环标识，通过两端接线柱接入电路。',
    accent: '#a68a60',
    footprint: [0.34, 0.17],
    height: 0.11,
    ports: [
      post('a', '端子 A', 'bidirectional', -0.12, 0.034, 0.09),
      post('b', '端子 B', 'bidirectional', 0.12, 0.034, 0.09),
    ],
    defaults: { resistance: 1000, tolerance: 0.01 },
    params: [
      {
        key: 'resistance',
        label: '标称阻值',
        kind: 'number',
        min: 1,
        max: 1_000_000,
        step: 1,
        unit: 'Ω',
        precision: 0,
        suggestions: [100, 220, 330, 470, 1000, 2200, 4700, 10000],
        description: '色环随阻值实时重绘，仿真中按理想线性电阻计算。',
      },
    ],
    modelNote: '理想线性电阻，未建模温度系数与功率温升。',
  },
  switch: {
    type: 'switch',
    name: '单刀单掷开关',
    shortName: '开关',
    prefix: 'SW',
    category: 'control',
    description: '带金属触点与红色拨杆的教学开关模块，拨杆可真实闭合/断开。',
    accent: '#a24b3e',
    footprint: [0.21, 0.16],
    height: 0.09,
    ports: [
      post('a', '触点 A', 'bidirectional', -0.066, 0.025, 0.082),
      post('b', '触点 B', 'bidirectional', 0.066, 0.025, 0.082),
    ],
    defaults: { closed: false, onResistance: 0.01 },
    params: [
      {
        key: 'closed',
        label: '触点状态',
        kind: 'switch',
        onLabel: '闭合',
        offLabel: '断开',
        description: '闭合等效为 10 mΩ 接触电阻，断开时支路开路。',
      },
    ],
    modelNote: '闭合 0.01 Ω，断开视为开路。',
  },
  'resistor-box': {
    type: 'resistor-box',
    name: '旋转式电阻箱',
    shortName: '电阻箱',
    prefix: 'RB',
    category: 'passive',
    description: '四位十进制电阻箱，四只带刻度的旋钮分别设置千、百、十、个位，读数屏显示总阻值。',
    accent: '#6c675b',
    footprint: [0.38, 0.29],
    height: 0.18,
    ports: [
      post('a', '接线端 A', 'bidirectional', -0.148, 0.048, 0.152),
      post('b', '接线端 B', 'bidirectional', 0.148, 0.048, 0.152),
    ],
    defaults: { resistance: 1000 },
    params: [
      {
        key: 'resistance',
        label: '总阻值',
        kind: 'number',
        min: 0,
        max: 9999,
        step: 1,
        unit: 'Ω',
        precision: 0,
        suggestions: [100, 470, 1000, 2200, 4700],
        description: '也可以直接拖动前面板四只十进制旋钮。',
      },
    ],
    modelNote: '各十进制档位按理想串联电阻叠加。',
  },
  rheostat: {
    type: 'rheostat',
    name: '滑动变阻器',
    shortName: '变阻器',
    prefix: 'RH',
    category: 'passive',
    description: '陶瓷管绕线式滑动变阻器，包含 A、W、B 三端，移动滑片改变分压比例。',
    accent: '#846342',
    footprint: [0.40, 0.23],
    height: 0.2,
    ports: [
      post('a', '固定端 A', 'bidirectional', -0.145, 0.036, 0.122),
      post('w', '滑片端 W', 'wiper', 0, 0.036, 0.122),
      post('b', '固定端 B', 'bidirectional', 0.145, 0.036, 0.122),
    ],
    defaults: { maxResistance: 50, position: 0.5, maxCurrent: 0.5 },
    params: [
      {
        key: 'maxResistance',
        label: '最大阻值',
        kind: 'number',
        min: 5,
        max: 200,
        step: 5,
        unit: 'Ω',
        precision: 0,
        suggestions: [20, 50, 100, 200],
      },
      {
        key: 'position',
        label: '滑片位置',
        kind: 'slider',
        min: 0,
        max: 1,
        step: 0.01,
        unit: '',
        precision: 2,
        description: 'A–W 电阻 = 总阻值 × 位置，W–B 电阻 = 总阻值 × (1 − 位置)。',
      },
    ],
    modelNote: '三端线性电位器模型；滑片位置映射为 A–W / W–B 两段电阻。',
  },
  capacitor: {
    type: 'capacitor',
    name: '电解电容',
    shortName: '电容',
    prefix: 'C',
    category: 'passive',
    description: '直插式极性电解电容，顶部防爆槽与负极色带用于识别极性。支持 RC 充放电暂态。',
    accent: '#334f63',
    footprint: [0.21, 0.18],
    height: 0.18,
    ports: [
      post('positive', '正极 +', 'positive', -0.045, 0.03, 0.09),
      post('negative', '负极 −', 'negative', 0.045, 0.03, 0.09),
    ],
    defaults: { capacitanceUf: 220, voltageRating: 25 },
    params: [
      {
        key: 'capacitanceUf',
        label: '电容量',
        kind: 'number',
        min: 1,
        max: 2200,
        step: 1,
        unit: 'µF',
        precision: 0,
        suggestions: [47, 100, 220, 470, 1000],
      },
    ],
    modelNote: '直流稳态开路；暂态使用后向欧拉伴随模型，步长 20 ms。',
  },
  led: {
    type: 'led',
    name: '发光二极管',
    shortName: 'LED',
    prefix: 'D',
    category: 'semiconductor',
    description: '教学放大 LED 模块，透明圆头封装、极性识别面与内部芯片。采用明确标注的分段线性正向模型。',
    accent: '#b34b3b',
    footprint: [0.19, 0.17],
    height: 0.15,
    ports: [
      post('anode', '阳极 +', 'anode', -0.042, 0.028, 0.09),
      post('cathode', '阴极 −', 'cathode', 0.042, 0.028, 0.09),
    ],
    defaults: { color: 'red' },
    params: [
      {
        key: 'color',
        label: '发光颜色',
        kind: 'select',
        options: [
          { value: 'red', label: '红色 · 1.8 V' },
          { value: 'yellow', label: '黄色 · 2.0 V' },
          { value: 'green', label: '绿色 · 2.2 V' },
          { value: 'blue', label: '蓝色 · 2.8 V' },
        ],
        description: '颜色同时决定简化正向阈值电压。',
      },
    ],
    modelNote: '分段线性 LED：阈值 Vf + 14 Ω 动态电阻，反向为微安级漏电。教学近似，非完整 Shockley 模型。',
  },
  bulb: {
    type: 'bulb',
    name: '白炽小灯泡',
    shortName: '小灯泡',
    prefix: 'L',
    category: 'semiconductor',
    description: '玻璃罩钨丝小灯泡与接线底座，亮度由实际耗散功率映射。',
    accent: '#b8934a',
    footprint: [0.23, 0.20],
    height: 0.22,
    ports: [
      post('a', '灯座端子 A', 'bidirectional', -0.055, 0.033, 0.102),
      post('b', '灯座端子 B', 'bidirectional', 0.055, 0.033, 0.102),
    ],
    defaults: { resistance: 120, ratedPower: 0.3 },
    params: [
      {
        key: 'resistance',
        label: '冷态电阻',
        kind: 'number',
        min: 10,
        max: 500,
        step: 1,
        unit: 'Ω',
        precision: 0,
        suggestions: [50, 100, 120, 220],
      },
      {
        key: 'ratedPower',
        label: '额定功率',
        kind: 'number',
        min: 0.05,
        max: 3,
        step: 0.05,
        unit: 'W',
        precision: 2,
        suggestions: [0.1, 0.3, 0.5, 1],
      },
    ],
    modelNote: '线性电阻模型 + 功率—亮度映射；未建模钨丝热效应导致的电阻变化。',
  },
  breadboard: {
    type: 'breadboard',
    name: '教学面包板',
    shortName: '面包板',
    prefix: 'BB',
    category: 'passive',
    description: '迷你面包板：每列 5 个孔内部连通，两组电源轨内部纵向连通，孔位可自由接线。',
    accent: '#9a9b94',
    footprint: [0.50, 0.24],
    height: 0.04,
    ports: breadboardPorts(),
    defaults: {},
    params: [],
    modelNote: '孔位连通规则为理想导体，未建模接触电阻和孔位寿命。',
  },
};

export const COMPONENT_ORDER: ComponentType[] = [
  'power-supply',
  'ammeter',
  'voltmeter',
  'resistor',
  'resistor-box',
  'rheostat',
  'switch',
  'capacitor',
  'led',
  'bulb',
  'breadboard',
];

export function getDefinition(type: ComponentType): ComponentDefinition {
  return COMPONENT_DEFINITIONS[type];
}

export function getPortDefinition(type: ComponentType, portKey: string): PortDefinition | undefined {
  return COMPONENT_DEFINITIONS[type].ports.find((port) => port.key === portKey);
}

export function createDefaultParams(type: ComponentType): ParamBag {
  return { ...COMPONENT_DEFINITIONS[type].defaults };
}

export function clampComponentPosition(
  type: ComponentType,
  position: [number, number],
): [number, number] {
  const footprint = COMPONENT_DEFINITIONS[type].footprint;
  const halfX = footprint[0] / 2;
  const halfZ = footprint[1] / 2;
  const padding = BENCH.edgePadding;
  return [
    Math.min(
      Math.max(position[0], BENCH.bounds.minX + halfX + padding),
      BENCH.bounds.maxX - halfX - padding,
    ),
    Math.min(
      Math.max(position[1], BENCH.bounds.minZ + halfZ + padding),
      BENCH.bounds.maxZ - halfZ - padding,
    ),
  ];
}

export function rotatePointY(
  point: [number, number, number],
  rotationY: number,
): [number, number, number] {
  const c = Math.cos(rotationY);
  const s = Math.sin(rotationY);
  return [point[0] * c + point[2] * s, point[1], -point[0] * s + point[2] * c];
}

export function getPortWorldPosition(
  component: LabComponent,
  portKey: string,
): [number, number, number] | null {
  const port = getPortDefinition(component.type, portKey);
  if (!port) return null;
  const rotated = rotatePointY(port.position, component.rotationY);
  return [
    component.position[0] + rotated[0],
    rotated[1],
    component.position[1] + rotated[2],
  ];
}

export function getPortWorldNormal(
  component: LabComponent,
  portKey: string,
): [number, number, number] {
  const port = getPortDefinition(component.type, portKey);
  const normal = port?.normal ?? [0, 0, 1];
  return rotatePointY(normal, component.rotationY);
}

export function findComponent(
  components: LabComponent[],
  componentId: string,
): LabComponent | undefined {
  return components.find((component) => component.id === componentId);
}

export function findPortOwner(
  components: LabComponent[],
  portId: string,
): { component: LabComponent; portKey: string } | null {
  const separator = portId.indexOf(':');
  if (separator < 0) return null;
  const componentId = portId.slice(0, separator);
  const portKey = portId.slice(separator + 1);
  const component = findComponent(components, componentId);
  if (!component) return null;
  const port = getPortDefinition(component.type, portKey);
  return port ? { component, portKey: port.key } : null;
}

/**
 * 器材内部的理想导体分组。面包板是唯一具有内部短接的器材。
 */
export function getInternalPortGroups(component: LabComponent): string[][] {
  if (component.type !== 'breadboard') return [];
  const groups: string[][] = [];
  for (let c = 0; c < 6; c += 1) {
    groups.push([0, 1, 2, 3, 4].map((r) => `c${c}r${r}`));
  }
  groups.push(Array.from({ length: 6 }, (_, c) => `railTop${c}`));
  groups.push(Array.from({ length: 6 }, (_, c) => `railBottom${c}`));
  return groups;
}

export function getBreadboardHoleMeta(
  component: LabComponent,
  portKey: string,
): { column: number; row: number; rail: 'top' | 'bottom' | null } | null {
  if (component.type !== 'breadboard') return null;
  const match = /^c(\d)r(\d)$/.exec(portKey);
  if (match) {
    return { column: Number(match[1]), row: Number(match[2]), rail: null };
  }
  const railMatch = /^rail(Top|Bottom)(\d)$/.exec(portKey);
  if (railMatch) {
    return {
      column: Number(railMatch[2]),
      row: 0,
      rail: railMatch[1] === 'Top' ? 'top' : 'bottom',
    };
  }
  return null;
}
