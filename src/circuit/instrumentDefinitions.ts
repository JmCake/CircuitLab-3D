import type { ComponentDefinition, ParamDefinition, PortDefinition } from './types';
const post = (key: string, label: string, x: number, y: number, z: number, role: PortDefinition['role'] = 'bidirectional'): PortDefinition => ({ key, label, position: [x, y, z], normal: [0, 0, 1], role });
const toggle = (key: string, label: string): ParamDefinition => ({ key, label, kind: 'switch' });
const choices = (key: string, label: string, values: number[], unit: string): ParamDefinition => ({ key, label, kind: 'select', options: values.map(value => ({ value, label: `${value} ${unit}` })) });
export const INSTRUMENT_DEFINITIONS: Record<'programmable-supply' | 'multimeter' | 'oscilloscope', ComponentDefinition> = {
  'programmable-supply': {
    type: 'programmable-supply', name: '双路可编程直流电源', shortName: '双路电源', prefix: 'PSU', category: 'source',
    description: '两路独立浮地直流输出，电压可调，支持正向恒流限制；关闭通道后输出开路。', accent: '#3f7767', footprint: [0.56, 0.35], height: 0.24,
    ports: [post('positive', 'CH1 +', 0.16, 0.058, 0.18, 'positive'), post('negative', 'CH1 −', 0.23, 0.058, 0.18, 'negative'), post('positive2', 'CH2 +', 0.16, 0.107, 0.18, 'positive'), post('negative2', 'CH2 −', 0.23, 0.107, 0.18, 'negative')],
    defaults: { enabled: true, output1: true, output2: false, voltage: 5, voltage2: 5, currentLimit: 0.05, currentLimit2: 0.5, internalResistance: 0.2 },
    params: [toggle('enabled', '总电源'), ...[1, 2].flatMap((ch): ParamDefinition[] => [toggle(`output${ch}`, `CH${ch} 输出`), { key: ch === 1 ? 'voltage' : 'voltage2', label: `CH${ch} 电压`, kind: 'slider', min: 0, max: 30, step: 0.1, unit: 'V', precision: 1 }, { key: ch === 1 ? 'currentLimit' : 'currentLimit2', label: `CH${ch} 电流限制`, kind: 'number', min: 0.001, max: 3, step: 0.001, unit: 'A', precision: 3 }])],
    modelNote: '每路 0.2 Ω 内阻；达到正向电流设定值时转入恒流，通道间无内部连接。不含启动动态、真实保护和反向灌电流保护。',
  },
  multimeter: {
    type: 'multimeter', name: '台式数字万用表', shortName: '万用表', prefix: 'DMM', category: 'measurement', description: '独立 VΩ、A、COM 插孔；支持 AC/DC 电压、电流和断电线性电阻网络测量。', accent: '#a4803e', footprint: [0.37, 0.26], height: 0.19,
    ports: [post('positive', 'VΩ', 0.04, 0.052, 0.135, 'positive'), post('current', 'A', 0.105, 0.052, 0.135, 'positive'), post('negative', 'COM', 0.165, 0.052, 0.135, 'negative')],
    defaults: { enabled: true, mode: 'dcv', voltageRange: 200, currentRange: 2, resistanceRange: 1000000 },
    params: [toggle('enabled', '仪表电源'), { key: 'mode', label: '万用表功能', kind: 'select', options: [{ value: 'dcv', label: '直流电压 DCV' }, { value: 'acv', label: '交流电压 ACV' }, { value: 'dci', label: '直流电流 DCI' }, { value: 'aci', label: '交流电流 ACI' }, { value: 'ohms', label: '电阻 Ω' }] }, choices('voltageRange', '电压量程', [2, 20, 200], 'V'), choices('currentRange', '电流量程', [0.002, 0.02, 0.2, 2], 'A'), choices('resistanceRange', '电阻量程', [2000, 20000, 1000000], 'Ω')],
    modelNote: 'VΩ 输入 10 MΩ；A 插孔经 0.1 Ω 分流器接 COM，所有挡位均保留分流通路。电阻挡使用内部 1 V / 1 kΩ 测试源，只允许断电线性电阻网络。',
  },
  oscilloscope: {
    type: 'oscilloscope', name: '双通道数字示波器', shortName: '示波器', prefix: 'DSO', category: 'measurement', description: '两通道共用 COM，每通道输入 1 MΩ；显示实际直流、单频交流及已采集暂态。', accent: '#4a7b73', footprint: [0.52, 0.32], height: 0.35,
    ports: [post('ch1', 'CH1', -0.15, 0.06, 0.165), post('ch2', 'CH2', 0, 0.06, 0.165), post('negative', 'COM（两通道共用）', 0.15, 0.06, 0.165, 'negative')],
    defaults: { enabled: true, voltsDiv1: 10, voltsDiv2: 10, timeDiv: 0.002, triggerLevel: 0, running: true },
    params: [toggle('enabled', '示波器电源'), choices('voltsDiv1', 'CH1 垂直档位', [0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50], 'V/div'), choices('voltsDiv2', 'CH2 垂直档位', [0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50], 'V/div'), choices('timeDiv', '水平时基', [0.0005, 0.001, 0.002, 0.005, 0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1], 's/div'), { key: 'triggerLevel', label: '触发电平', kind: 'slider', min: -50, max: 50, step: 0.1, unit: 'V', precision: 1 }, toggle('running', '采集')],
    modelNote: '两通道共用参考端。单频波形由 RMS 相量还原，直流为恒定电平；暂态只显示实际采样点。未模拟带宽、噪声和 ADC 误差。',
  },
};
