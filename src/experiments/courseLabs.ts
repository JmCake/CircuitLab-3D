import { analyzeThevenin, auditCircuit } from '../circuit/analysis';
import { distinctRows, maxPowerEvidence, superpositionEvidence, theveninEvidence, threePhaseReadings } from './courseAnalysis';
import type { LabBuildSpec, LabContext, LabDefinition, LabStep, LabStepCheck } from './labs';
import { measurementIssue } from '../circuit/measurement';

const answer = (done: boolean, message: string): LabStepCheck => ({ done, message });
const observed = (c: LabContext, id: string) => c.measurements.filter(r => r.labId === id && r.observation);
const wired = (c: LabContext) => c.result.solved && c.result.status === 'ok' && !measurementIssue(c.components, c.result) && Object.values(c.result.elements).some(e => Math.abs(e.current) > 1e-6);
const prepared: LabStep = { id: 'kit', title: '准备器材', instruction: '检查电源、测量仪表和本实验的元件。', check: c => answer(c.components.length >= 5, '器材由当前实验提供，可在台面移动、旋转和接线。') };
const connected: LabStep = { id: 'connect', title: '接线并建立测量回路', instruction: '按电路连接导线，电流表串联，电压表并联；确认量程与测量模式。', check: c => answer(wired(c), wired(c) ? '回路已导通。' : '请完成接线并开启电源。') };
const dcModel = '直流测量计入电源 0.2 Ω、串联电流表 0.1 Ω 与电压表 10 MΩ 的影响。';
const dcKit: LabDefinition['kit'] = ['power-supply', 'switch', 'resistor', 'ammeter', 'voltmeter'];
const networkKit: LabDefinition['kit'] = ['power-supply', 'resistor', 'resistor', 'resistor-box', 'ammeter', 'voltmeter'];
const phaseKit: LabDefinition['kit'] = ['three-phase-source', 'resistor-box', 'resistor-box', 'resistor-box', 'ammeter', 'voltmeter'];

export const COURSE_LABS: LabDefinition[] = [
  { id: 'iv-characteristics', index: 'E01', title: '线性与非线性伏安特性验证', subtitle: '',
    objective: '分别测量电阻与小灯泡的多个工作点，比较伏安曲线和 U/I 的变化。', formula: 'R = U / I', kit: dcKit,
    modelNote: dcModel + '小灯泡采用稳态热电阻经验模型：温升使电阻增大；该曲线为教学模型，不是具体灯泡的实测标定。',
    steps: [prepared, connected,
      { id: 'linear', title: '测绘线性电阻', instruction: '在数据页选电阻，调节电源，在 1–6 V 内记录至少五个不同电压点。', check: c => { const count = distinctRows(c.measurements, 'iv-characteristics', 'resistor').length; return answer(count >= 5, `电阻：${count} / 5 个工作点。`); } },
      { id: 'nonlinear', title: '测绘非线性小灯泡', instruction: '切换小灯泡，在额定电压以内从低到高记录至少五个不同工作点。', check: c => { const count = distinctRows(c.measurements, 'iv-characteristics', 'bulb').length; return answer(count >= 5, `小灯泡：${count} / 5 个工作点。`); } },
      { id: 'compare', title: '比较两条伏安曲线', instruction: '比较两组数据的 U/I：线性电阻近似恒定，小灯泡随电压升高而增大。', check: c => {
        const resistance = (type: string) => distinctRows(c.measurements, 'iv-characteristics', type).filter(r => r.voltage !== null && r.current !== null && Math.abs(r.voltage) > 0.2 && Math.abs(r.current) > 1e-8).map(r => Math.abs(r.voltage! / r.current!));
        const r = resistance('resistor'), b = resistance('bulb');
        return answer(r.length >= 5 && b.length >= 5 && Math.max(...r) / Math.min(...r) < 1.03 && Math.max(...b) / Math.min(...b) > 1.2, '用已记录的电阻与灯泡数据判断线性，不能用同一点重复记录代替测绘。');
      } },
    ] },
  { id: 'potentials', index: 'E02', title: '电位、电压的测定及电位图的绘制', subtitle: '',
    objective: '测量 A、B、C、D 各点电位，改变参考点并比较两点之间的电压。', formula: 'U_BC = φ_B − φ_C',
    kit: ['power-supply', 'resistor', 'resistor', 'resistor', 'voltmeter'], modelNote: dcModel + '改变参考点只平移电位图，不增添接地导线，也不改变电路。',
    steps: [prepared, connected,
      { id: 'potential', title: '以 A 点为参考记录电位', instruction: '在数据页选择 A 为参考点，测量并记录各点电位与 U_BC。', check: c => answer(observed(c, 'potentials').some(r => r.observation?.settings.referencePortId === 'potentials-ps:negative'), '记录 A 为零电位时的数据。') },
      { id: 'reference', title: '改变参考点并绘制电位图', instruction: '将参考点改为 C，再记录一次；比较两张电位图和 U_BC。', check: c => {
        const rows = observed(c, 'potentials').filter(r => r.observation!.settings['potentials-ps.enabled'] === true && Math.abs(r.observation!.values['v:potentials-r1:a'] - r.observation!.values['v:potentials-r2:a']) > 0.05);
        const a = rows.find(r => r.observation!.settings.referencePortId === 'potentials-ps:negative');
        const b = rows.find(r => r.observation!.settings.referencePortId === 'potentials-r2:a' && a && r.observation!.topology === a.observation!.topology);
        const u = (r: NonNullable<typeof a>) => r.observation!.values['v:potentials-r1:a'] - r.observation!.values['v:potentials-r2:a'];
        return answer(!!a && !!b && Math.abs(u(a) - u(b)) < 1e-6, '参考点改变后，各点电位整体平移，U_BC 保持不变。');
      } },
    ] },
  { id: 'kirchhoff', index: 'E03', title: '验证基尔霍夫定律', subtitle: '', objective: '测量干路、支路电流与回路电压，按约定方向验证 KCL 和 KVL。',
    formula: 'ΣI = 0 · ΣU = 0', kit: ['power-supply', 'switch', 'resistor', 'resistor', 'ammeter', 'voltmeter'], modelNote: dcModel,
    steps: [prepared, connected,
      { id: 'records', title: '记录三组不同工作点', instruction: '改变电源电压或电阻，记录三组支路电流和回路电压。', check: c => { const n = distinctRows(c.measurements, 'kirchhoff').length; return answer(n >= 3, `已记录 ${n} / 3 组不同工作点。`); } },
      { id: 'verify', title: '核对节点与回路', instruction: '在数据页核对带参考方向的电流代数和与闭合回路电压代数和。', check: c => { const a = auditCircuit(c, c.result); return answer(wired(c) && !!a?.passed && distinctRows(c.measurements, 'kirchhoff').length >= 3, a ? `最大节点残差 ${a.kclResidual.toExponential(2)} A。` : '请先建立有效测量回路。'); } },
    ] },
  { id: 'superposition', index: 'E04', title: '线性电路叠加性和齐次性验证', subtitle: '', objective: '分别测量各电源单独和共同作用的响应，再将两路电源同时按比例变化。',
    formula: 'I(U₁,U₂) = I(U₁,0) + I(0,U₂) · I(kU₁,kU₂) = kI',
    kit: ['power-supply', 'power-supply', 'resistor', 'resistor', 'resistor-box', 'ammeter', 'voltmeter'],
    modelNote: dcModel + '电压源置零时保留内阻与输出连接。叠加和齐次性只适用于线性响应，功率不满足叠加。',
    steps: [prepared, connected,
      { id: 'additivity', title: '验证叠加性', instruction: '分别记录共同作用、仅 U₁、仅 U₂ 三种状态，比较有符号电流。', check: c => { const a = superpositionEvidence(c.measurements).additive; return answer(!!a && a.residual < 1e-7, a ? `叠加残差 ${a.residual.toExponential(2)} A。` : '需要同一网络的三种电源状态记录。'); } },
      { id: 'homogeneity', title: '验证齐次性', instruction: '同时将两路电源乘以同一系数，记录响应并与原值乘以该系数比较。', check: c => { const h = superpositionEvidence(c.measurements).homogeneous; return answer(!!h && h.residual < 1e-7, h ? `k = ${h.factor.toFixed(2)}，齐次残差 ${h.residual.toExponential(2)} A。` : '请记录一次两路电源同比变化后的响应。'); } },
    ] },
  { id: 'thevenin', index: 'E05', title: '验证戴维南定理', subtitle: '', objective: '用不同负载的端电压与电流估算戴维南参数，再与原网络求解比较。', formula: 'U = U_th − I_L R_th', kit: networkKit,
    modelNote: dcModel + '采用两负载伏安法估算参数；分析中的开路电压与测试源电阻保留仪表内阻。改变负载之外的参数后需重新分组。',
    steps: [prepared, connected,
      { id: 'estimate', title: '用不同负载估算等效参数', instruction: '保持电源和网络电阻不变，记录至少两种负载，利用端口伏安关系求 Uth 与 Rth。', check: c => answer(!!theveninEvidence(c.measurements), '需要同一网络、不同负载的两组有效记录。') },
      { id: 'equivalent', title: '比较原网络与等效响应', instruction: '改变负载，比较原网络电流与戴维南等效预测。', check: c => { const load = c.components.find(x => x.id === 'thevenin-load'); const eq = load ? analyzeThevenin(c, load.id) : null; const e = theveninEvidence(c.measurements); return answer(wired(c) && !!eq && !!e && Math.abs(e.resistance - eq.resistance) / eq.resistance < 0.01, '核对实测参数、测试源法参数及负载预测。'); } },
    ] },
  { id: 'max-power', index: 'E06', title: '最大功率传输条件研究', subtitle: '', objective: '改变负载电阻，记录功率，找到最大功率附近的工作点。', formula: 'R_L = R_th · P_max = U_th² / (4R_th)', kit: networkKit,
    modelNote: dcModel + '匹配条件针对线性直流电阻网络；不等于效率最大。当前不模拟电源保护环与热损坏。',
    steps: [prepared, connected,
      { id: 'scan', title: '测量负载功率曲线', instruction: '保持网络与电源不变，至少记录三种负载，覆盖等效内阻两侧以及匹配点附近。', check: c => answer(maxPowerEvidence(c.measurements).count >= 3, '至少记录同一网络的三种有效负载工作点。') },
      { id: 'match', title: '验证最大功率条件', instruction: '比较 R_L < Rth、R_L ≈ Rth 和 R_L > Rth 的功率。', check: c => {
        return answer(maxPowerEvidence(c.measurements).matched, '记录匹配点附近及两侧的数据，避免仅凭一组读数判定最大值。');
      } },
    ] },
  ...(['star', 'delta'] as const).map((kind, index): LabDefinition => ({
    id: `three-phase-${kind}`, index: `E0${7 + index}`, title: kind === 'star' ? '三相交流星形电路连接的测量' : '三相交流电路三角形连接的测量', subtitle: '',
    objective: kind === 'star' ? '测量线量与相量，改变负载并观察中性线的作用。' : '测量线量与相量，比较对称和不对称三角形负载。',
    formula: kind === 'star' ? '对称负载：U_L = √3 U_P · I_L = I_P' : '对称负载：U_L = U_P · I_L = √3 I_P',
    kit: [...phaseKit, ...(kind === 'star' ? ['switch' as const] : [])],
    modelNote: '所有交流读数为有效值，默认 50 Hz、24 V 相电压。三相源各相 0.2 Ω、仪表负载均计入。√3 比例的比较要求相应的对称条件；不对称负载与中点漂移由节点相量计算，不套用比例。',
    steps: [prepared, connected,
      { id: 'symmetric', title: '测量对称负载', instruction: '三相电阻均设为 1000 Ω，选择交流量程并记录线电压、相电压、线电流、相电流。', check: c => {
        const rows = observed(c, `three-phase-${kind}`), has = rows.some(r => { const v = r.observation!.values;
          const voltageRatio = v.lineUAB / v.phaseUA, currentRatio = v.lineIA / v.phaseIA;
          return v.wiringValid === 1 && v.phaseIA > 1e-5 && v.resistanceA === v.resistanceB && v.resistanceB === v.resistanceC
            && Math.abs(voltageRatio - (kind === 'star' ? Math.sqrt(3) : 1)) < 0.01 && Math.abs(currentRatio - (kind === 'star' ? 1 : Math.sqrt(3))) < 0.01;
        });
        return answer(has, '先记录三相负载相同的工作点。');
      } },
      { id: 'asymmetric', title: kind === 'star' ? '比较不对称负载与中性线' : '测量不对称负载', instruction: kind === 'star' ? '改变其中一相电阻，分别记录中性线接通与断开时的电流和中点位移。' : '改变其中一相电阻，记录各相与各线电流，观察 √3 比例的适用条件。', check: c => {
        const rows = observed(c, `three-phase-${kind}`).filter(r => { const v = r.observation!.values; return v.wiringValid === 1 && v.phaseIA > 1e-5 && new Set([v.resistanceA, v.resistanceB, v.resistanceC]).size > 1; });
        const conditions = (r: typeof rows[number]) => JSON.stringify(Object.entries(r.observation!.settings).filter(([key]) => key !== 'three-phase-star-sw.closed').sort(([a], [b]) => a.localeCompare(b)));
        const done = kind === 'delta' ? rows.length > 0 : rows.some(r => r.observation!.values.neutralConnected === 1 && rows.some(other => other.observation!.values.neutralConnected === 0 && other.observation!.values.neutralShift > 0.1 && conditions(r) === conditions(other)));
        const now = threePhaseReadings(c, c.result);
        return answer(done && !!now, kind === 'star' ? '记录同一不对称负载在有中线、无中线时的数据。' : '不对称时，线电流按相量差计算，不能统一乘 √3。');
      } },
    ],
  })),
];

export const POTENTIAL_POINTS = [
  { label: 'A', alias: 'ps', key: 'negative' }, { label: 'B', alias: 'r1', key: 'a' },
  { label: 'C', alias: 'r2', key: 'a' }, { label: 'D', alias: 'r3', key: 'a' },
] as const;

const phaseBase: LabBuildSpec['components'] = [
  { alias: 'ps', type: 'three-phase-source', position: [-0.97, -0.30] },
  { alias: 'ra', type: 'resistor-box', position: [-0.32, -0.30], params: { resistance: 1000 } },
  { alias: 'rb', type: 'resistor-box', position: [0.34, -0.30], params: { resistance: 1000 } },
  { alias: 'rc', type: 'resistor-box', position: [1.00, -0.30], params: { resistance: 1000 } },
  { alias: 'am', type: 'ammeter', position: [-1.01, 0.30], params: { range: 0.2, mode: 'ac' } },
  { alias: 'vm', type: 'voltmeter', position: [-0.21, 0.30], params: { range: 200, mode: 'ac' } },
];
const measurementLayout: LabBuildSpec = {
  components: [
    { alias: 'ps', type: 'power-supply', position: [-0.94, -0.30], params: { voltage: 6 } },
    { alias: 'sw', type: 'switch', position: [-0.94, 0.28], rotationY: Math.PI, params: { closed: false } },
    { alias: 'r1', type: 'resistor', position: [0.34, -0.30], params: { resistance: 1000 } },
    { alias: 'am', type: 'ammeter', position: [-0.28, -0.30], params: { range: 0.02 } },
    { alias: 'vm', type: 'voltmeter', position: [0.96, -0.30], params: { range: 20 } },
  ],
  wires: [['ps', 'positive', 'sw', 'a'], ['sw', 'b', 'am', 'positive'], ['am', 'negative', 'r1', 'a'],
    ['r1', 'b', 'ps', 'negative'], ['vm', 'positive', 'r1', 'a'], ['vm', 'negative', 'r1', 'b']],
};
export const COURSE_LAYOUTS: Record<string, LabBuildSpec> = {
  'iv-characteristics': measurementLayout,
  'ohms-law': measurementLayout,
  kirchhoff: {
    components: [
      { alias: 'ps', type: 'power-supply', position: [-0.94, -0.30], params: { voltage: 9 } },
      { alias: 'sw', type: 'switch', position: [-0.94, 0.28], rotationY: Math.PI, params: { closed: true } },
      { alias: 'am', type: 'ammeter', position: [-0.28, -0.30], params: { range: 0.02 } },
      { alias: 'r1', type: 'resistor', position: [0.34, -0.30], params: { resistance: 1000 } },
      { alias: 'r2', type: 'resistor', position: [0.34, 0.28], rotationY: Math.PI, params: { resistance: 1500 } },
      { alias: 'vm', type: 'voltmeter', position: [0.96, -0.30], params: { range: 20 } },
    ],
    wires: [['ps', 'positive', 'sw', 'a'], ['sw', 'b', 'am', 'positive'], ['am', 'negative', 'r1', 'a'], ['am', 'negative', 'r2', 'a'],
      ['r1', 'b', 'ps', 'negative'], ['r2', 'b', 'ps', 'negative'], ['vm', 'positive', 'r1', 'a'], ['vm', 'negative', 'r1', 'b']],
  },
  potentials: { components: [
    { alias: 'ps', type: 'power-supply', position: [-0.94, -0.28], params: { voltage: 12 } },
    { alias: 'r1', type: 'resistor', position: [-0.28, -0.30], params: { resistance: 1000 } },
    { alias: 'r2', type: 'resistor', position: [0.34, -0.30], params: { resistance: 2000 } },
    { alias: 'r3', type: 'resistor', position: [0.96, -0.30], params: { resistance: 3000 } },
    { alias: 'vm', type: 'voltmeter', position: [0.04, 0.30], params: { range: 20 } },
  ], wires: [['ps', 'positive', 'r1', 'a'], ['r1', 'b', 'r2', 'a'], ['r2', 'b', 'r3', 'a'], ['r3', 'b', 'ps', 'negative'], ['vm', 'positive', 'r1', 'a'], ['vm', 'negative', 'r2', 'a']] },
  'three-phase-star': { components: [...phaseBase, { alias: 'sw', type: 'switch', position: [-0.61, 0.30], params: { closed: true } }],
    wires: [['ps', 'a', 'am', 'positive'], ['am', 'negative', 'ra', 'a'], ['ps', 'b', 'rb', 'a'], ['ps', 'c', 'rc', 'a'],
      ['ra', 'b', 'rb', 'b'], ['rb', 'b', 'rc', 'b'], ['ra', 'b', 'sw', 'a'], ['sw', 'b', 'ps', 'n'], ['vm', 'positive', 'ra', 'a'], ['vm', 'negative', 'ra', 'b']] },
  'three-phase-delta': { components: phaseBase,
    wires: [['ps', 'a', 'am', 'positive'], ['am', 'negative', 'ra', 'a'], ['ra', 'a', 'rc', 'b'],
      ['ps', 'b', 'ra', 'b'], ['ra', 'b', 'rb', 'a'], ['ps', 'c', 'rb', 'b'], ['rb', 'b', 'rc', 'a'], ['vm', 'positive', 'ra', 'a'], ['vm', 'negative', 'ra', 'b']] },
};
