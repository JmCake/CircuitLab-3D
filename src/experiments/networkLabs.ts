import { analyzeSuperposition, analyzeThevenin, auditCircuit } from '../circuit/analysis';
import type { LabBuildSpec, LabContext, LabDefinition, LabStepCheck } from './labs';

function loadOf(context: LabContext) { return context.components.find(c => c.type === 'resistor-box'); }
function equivalentCheck(context: LabContext): LabStepCheck {
  const load = loadOf(context);
  const eq = load && context.result.solved && context.result.status === 'ok' ? analyzeThevenin(context, load.id) : null;
  const actual = load ? context.result.elements[load.id]?.current : undefined;
  if (!eq || actual === undefined || Math.abs(actual) < 1e-7) return { done: false, message: '将电阻箱作为负载接入线性有源网络，在数据页查看等效分析。' };
  const error = Math.abs(actual - eq.predictedCurrent);
  const done = error < Math.max(1e-8, Math.abs(actual) * 1e-5);
  return { done, message: `Uth = ${eq.voltage.toFixed(4)} V，Rth = ${eq.resistance.toFixed(2)} Ω；负载实测 ${(actual * 1000).toFixed(4)} mA，等效预测 ${(eq.predictedCurrent * 1000).toFixed(4)} mA。` };
}
function records(id: string, count: number) {
  return (c: LabContext): LabStepCheck => {
    const rows = c.measurements.filter(r => r.labId === id && r.current !== null && Math.abs(r.current) > 1e-7);
    const distinct = new Set(rows.map(r => `${r.voltage?.toFixed(5)}:${r.current?.toFixed(8)}`)).size;
    return { done: distinct >= count, message: `已记录 ${distinct} / ${count} 组不同工作点；重复点击同一读数不计为新的工作点。` };
  };
}
function kitCheck(context: LabContext): LabStepCheck {
  const count = context.components.filter(c => c.type === 'resistor').length;
  return { done: !!loadOf(context) && count >= 2 && context.components.some(c => c.type === 'power-supply'), message: '使用两只定值电阻构成有源网络，电阻箱作为可调负载。' };
}
export const NETWORK_LABS: LabDefinition[] = [
  {
    id: 'thevenin', index: 'E07', title: '戴维南等效', subtitle: '有源二端网络 · 开路电压与等效电阻',
    objective: '改变负载，比较原网络电流与戴维南等效预测。分析时自动移除负载、抑制独立源并施加测试源；现场接线保持不变。',
    formula: 'I_L = U_th / (R_th + R_L)',
    kit: ['power-supply', 'resistor', 'resistor', 'resistor-box', 'ammeter', 'voltmeter'],
    modelNote: '仅适用于线性直流网络。Rth 保留电源内阻、串联电流表及电压表负载；抑制电压源是令其电动势为零，不是断开输出。',
    steps: [
      { id: 'kit', title: '搭建有源二端网络', instruction: '用 R₁、R₂ 构成分压网络，电阻箱接在 R₂ 两端作为负载，串入电流表。', check: kitCheck },
      { id: 'equivalent', title: '比较等效电路与原网络', instruction: '开启电源，在数据页查看 Uth、Rth、实测与预测负载电流。', check: equivalentCheck },
      { id: 'loads', title: '改变负载验证等效性', instruction: '至少选取两个不同负载，分别记录数据；每次比较等效预测与实测电流。', check: records('thevenin', 2) },
    ],
  },
  {
    id: 'superposition', index: 'E08', title: '叠加定理', subtitle: '多源线性网络 · 支路响应代数相加',
    objective: '两台电源通过各自串联电阻驱动同一负载。比较各源单独作用时的有符号电流之和与共同作用时的电流。',
    formula: 'I_L = I_L₁ + I_L₂    ·    P 不可直接叠加',
    kit: ['power-supply', 'power-supply', 'resistor', 'resistor', 'resistor-box', 'ammeter', 'voltmeter'],
    modelNote: '分析自动令其余已开启电源的电动势为零并保留内阻。功率是二次量，不能叠加；LED 非线性电路不支持此分析。',
    steps: [
      { id: 'kit', title: '连接两个独立电源', instruction: '各电源正极分别串接一只电阻，汇合后接入负载；负极共地。', check: c => ({ done: c.components.filter(p => p.type === 'power-supply' && p.params.enabled).length >= 2 && !!loadOf(c), message: '需要两台开启的电源及电阻箱负载，禁止直接并联不同电压的输出。' }) },
      { id: 'sum', title: '核查有符号电流叠加', instruction: '在数据页核查每个独立源对负载电流的贡献。', check: c => {
        const load = loadOf(c);
        const result = load ? analyzeSuperposition(c, load.id) : null;
        return { done: !!result && Math.abs(result.total) > 1e-7 && result.error < 1e-8,
          message: result ? `贡献之和 ${(result.sum * 1000).toFixed(4)} mA，总响应 ${(result.total * 1000).toFixed(4)} mA；残差 ${result.error.toExponential(2)} A。` : '请先组成可解的双源线性网络。' };
      } },
      { id: 'records', title: '改变源电压并记录', instruction: '调节其中一台电源，记录两个不同工作点，观察各源贡献如何变化。', check: records('superposition', 2) },
    ],
  },
  {
    id: 'max-power', index: 'E09', title: '最大功率传输', subtitle: '负载匹配 · 电压、电流与功率的权衡',
    objective: '扫描电阻箱负载，观察 P_L 随 R_L 的变化，并在 R_L = R_th 附近验证直流线性网络的最大功率条件。',
    formula: 'P_L = U_th² R_L / (R_th + R_L)²',
    kit: ['power-supply', 'resistor', 'resistor', 'resistor-box', 'ammeter', 'voltmeter'],
    modelNote: '只适用于本平台的线性直流阻性网络，不能推广为交流复阻抗匹配。匹配时效率并非最大。仪表内阻计入 Rth。',
    steps: [
      { id: 'kit', title: '准备可调负载网络', instruction: '用电阻箱作为负载，电流表串联、电压表跨接负载。', check: kitCheck },
      { id: 'sweep', title: '比较三个负载工作点', instruction: '依次设置约 100、500、2000 Ω，记录 U、I。数据页给出功率与匹配曲线。', check: records('max-power', 3) },
      { id: 'match', title: '调节到最大功率附近', instruction: '把电阻箱调到 Rth 附近，比较实际 U·I 与 Uth²/(4Rth)。', check: c => {
        const load = loadOf(c);
        const eq = load ? analyzeThevenin(c, load.id) : null;
        const p = load ? c.result.elements[load.id]?.power : undefined;
        const matched = !!eq && Math.abs(Number(load?.params.resistance) / eq.resistance - 1) < 0.03;
        return { done: matched && p !== undefined && !!eq && eq.maxPower > 1e-9 && Math.abs(p / eq.maxPower - 1) < 0.01,
          message: eq && p !== undefined ? `Rth = ${eq.resistance.toFixed(2)} Ω；P_L = ${(p * 1000).toFixed(3)} mW，Pmax = ${(eq.maxPower * 1000).toFixed(3)} mW。` : '请先完成接线并开启电源。' };
      } },
    ],
  },
];

const equivalentLayout: LabBuildSpec = {
  components: [
    { alias: 'ps', type: 'power-supply', position: [-0.94, -0.28], params: { voltage: 10 } },
    { alias: 'r1', type: 'resistor', position: [-0.28, -0.30], params: { resistance: 1000 } },
    { alias: 'r2', type: 'resistor', position: [0.34, -0.30], params: { resistance: 1000 } },
    { alias: 'load', type: 'resistor-box', position: [0.30, 0.27], params: { resistance: 500 } },
    { alias: 'vm', type: 'voltmeter', position: [0.96, 0.29], params: { range: 20 } },
    { alias: 'am', type: 'ammeter', position: [0.96, -0.30], params: { range: 0.02 } },
  ],
  wires: [
    ['ps', 'positive', 'r1', 'a'], ['r1', 'b', 'r2', 'a'], ['r2', 'b', 'ps', 'negative'],
    ['r2', 'a', 'am', 'positive'], ['am', 'negative', 'load', 'a'], ['load', 'b', 'ps', 'negative'],
    ['vm', 'positive', 'load', 'a'], ['vm', 'negative', 'load', 'b'],
  ],
};
export const NETWORK_LAYOUTS: Record<string, LabBuildSpec> = {
  thevenin: equivalentLayout,
  'max-power': equivalentLayout,
  superposition: {
    components: [
      { alias: 'ps1', type: 'power-supply', position: [-0.94, -0.30], params: { voltage: 6 } },
      { alias: 'ps2', type: 'power-supply', position: [-0.94, 0.27], params: { voltage: 3 } },
      { alias: 'r1', type: 'resistor', position: [-0.28, -0.30], params: { resistance: 1000 } },
      { alias: 'r2', type: 'resistor', position: [-0.28, 0.27], params: { resistance: 1500 } },
      { alias: 'load', type: 'resistor-box', position: [0.34, 0.27], params: { resistance: 1000 } },
      { alias: 'vm', type: 'voltmeter', position: [0.96, 0.27], params: { range: 20 } },
      { alias: 'am', type: 'ammeter', position: [0.34, -0.30], params: { range: 0.02 } },
    ],
    wires: [
      ['ps1', 'positive', 'r1', 'a'], ['ps2', 'positive', 'r2', 'a'],
      ['r1', 'b', 'r2', 'b'], ['r2', 'b', 'am', 'positive'], ['am', 'negative', 'load', 'a'],
      ['load', 'b', 'ps1', 'negative'], ['ps1', 'negative', 'ps2', 'negative'],
      ['vm', 'positive', 'load', 'a'], ['vm', 'negative', 'load', 'b'],
    ],
  },
};

export function conservationCheck(c: LabContext): LabStepCheck {
  const audit = auditCircuit(c, c.result);
  const active = c.components.filter(p => p.type === 'resistor' && Math.abs(c.result.elements[p.id]?.current ?? 0) > 1e-7).length >= 2;
  return { done: c.result.status === 'ok' && active && !!audit?.passed && c.measurements.filter(r => r.labId === 'kirchhoff').length >= 3,
    message: audit ? `实际节点 ΣI 残差 ${audit.kclResidual.toExponential(2)} A；全网功率平衡残差 ${audit.powerResidual.toExponential(2)} W。请保留三组测量记录；各回路电压按统一节点电势作差自动闭合。` : '请先修复电路，再核查节点守恒与回路电压。' };
}
