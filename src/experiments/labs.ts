import {
  COMPONENT_DEFINITIONS,
  createDefaultParams,
  makePortId,
  type ComponentType,
  type LabComponent,
  type MeasurementRow,
  type ParamBag,
  type SimulationResult,
  type Wire,
} from '../circuit';
import { NETWORK_LABS, NETWORK_LAYOUTS, conservationCheck } from './networkLabs';

export interface LabStepCheck {
  done: boolean;
  message: string;
}

export interface LabContext {
  components: LabComponent[];
  wires: Wire[];
  result: SimulationResult;
  measurements: MeasurementRow[];
  transient: {
    running: boolean;
    time: number;
    samples: number;
    lastCapacitorVoltage: number;
  };
}

export interface LabStep {
  id: string;
  title: string;
  instruction: string;
  check: (context: LabContext) => LabStepCheck;
}

export interface LabDefinition {
  id: string;
  index: string;
  title: string;
  subtitle: string;
  objective: string;
  formula: string;
  kit: ComponentType[];
  modelNote: string;
  steps: LabStep[];
}

function componentsOfType(context: LabContext, type: ComponentType): LabComponent[] {
  return context.components.filter((component) => component.type === type);
}

function elementOf(context: LabContext, component: LabComponent) {
  return context.result.elements[component.id];
}

function hasKit(context: LabContext, types: ComponentType[]): { done: boolean; missing: ComponentType[] } {
  const required = new Map<ComponentType, number>();
  for (const type of types) required.set(type, (required.get(type) ?? 0) + 1);
  const missing: ComponentType[] = [];
  for (const [type, count] of required) {
    const present = context.components.filter((component) => component.type === type).length;
    for (let i = present; i < count; i += 1) missing.push(type);
  }
  return { done: missing.length === 0, missing };
}

function kitCheck(types: ComponentType[]): (context: LabContext) => LabStepCheck {
  return (context) => {
    const { done, missing } = hasKit(context, types);
    return {
      done,
      message: done
        ? '所需器材已就位。'
        : `还缺少：${missing.map((type) => COMPONENT_DEFINITIONS[type].name).join('、')}。`,
    };
  };
}

function activeSupply(context: LabContext): LabComponent | undefined {
  return componentsOfType(context, 'power-supply').find(
    (component) => Boolean(component.params.enabled),
  );
}

function closedSwitch(context: LabContext): LabComponent | undefined {
  return componentsOfType(context, 'switch').find((component) => Boolean(component.params.closed));
}

function firstMeterReading(context: LabContext, type: 'ammeter' | 'voltmeter'): number | null {
  const meter = componentsOfType(context, type)[0];
  if (!meter) return null;
  const reading = context.result.elements[meter.id]?.reading;
  return typeof reading === 'number' && Number.isFinite(reading) ? reading : null;
}

function measuredRatioCheck(context: LabContext): LabStepCheck {
  const rows = context.measurements.filter((row) => row.labId === 'ohms-law');
  if (rows.length === 0) {
    return { done: false, message: '尚无测量记录。请在“数据”页点击“记录当前读数”。' };
  }
  const resistor = componentsOfType(context, 'resistor')[0];
  const nominal = resistor ? Math.abs(Number(resistor.params.resistance)) : NaN;
  const row = rows[rows.length - 1];
  if (
    row.voltage === null ||
    row.current === null ||
    Math.abs(row.current) < 1e-9 ||
    !Number.isFinite(nominal)
  ) {
    return { done: false, message: '记录中的电压或电流无效，请检查接线后重新记录。' };
  }
  const measured = Math.abs(row.voltage / row.current);
  const error = Math.abs(measured - nominal) / nominal;
  const done = error <= 0.03;
  return {
    done,
    message: done
      ? `实测 R = U / I = ${measured.toFixed(1)} Ω，与标称 ${nominal.toFixed(0)} Ω 的相对误差 ${(error * 100).toFixed(2)}%。`
      : `实测 R = ${measured.toFixed(1)} Ω，与 ${nominal.toFixed(0)} Ω 相差 ${(error * 100).toFixed(1)}%，请确认电压表并联、电流表串联。`,
  };
}

function powerLoopCheck(context: LabContext): LabStepCheck {
  const supply = activeSupply(context);
  if (!supply) return { done: false, message: '请先开启电源输出。' };
  const supplyCurrent = context.result.elements[supply.id]?.current ?? 0;
  const ammeterCurrent = firstMeterReading(context, 'ammeter');
  const resistor = componentsOfType(context, 'resistor')[0];
  const resistorCurrent = resistor ? context.result.elements[resistor.id]?.current ?? 0 : 0;
  if (!Number.isFinite(supplyCurrent) || Math.abs(supplyCurrent) < 1e-6) {
    return { done: false, message: '电源尚未形成闭合回路。请从输出 + 端开始，经开关、电流表与电阻回到 − 端。' };
  }
  if (ammeterCurrent === null) {
    return { done: false, message: '未找到电流表读数。请把电流表串入主回路。' };
  }
  const matches =
    Math.abs(Math.abs(ammeterCurrent) - Math.abs(resistorCurrent)) <
      Math.max(2e-5, Math.abs(resistorCurrent) * 0.02) &&
    Math.abs(Math.abs(ammeterCurrent) - Math.abs(supplyCurrent)) <
      Math.max(2e-5, Math.abs(supplyCurrent) * 0.02);
  return {
    done: matches,
    message: matches
      ? `主回路电流约 ${(Math.abs(ammeterCurrent) * 1000).toFixed(2)} mA，电流表确已串联。`
      : `电流表读数 ${(Math.abs(ammeterCurrent) * 1000).toFixed(2)} mA 与主回路不一致；请检查电流表是否误接成并联。`,
  };
}

function parallelVoltageCheck(context: LabContext): LabStepCheck {
  const resistors = componentsOfType(context, 'resistor');
  if (resistors.length < 1) return { done: false, message: '未检测到待测电阻。' };
  const resistor = resistors[0];
  const voltage = context.result.elements[resistor.id]?.voltage ?? 0;
  const voltmeterReading = firstMeterReading(context, 'voltmeter');
  if (voltmeterReading === null) return { done: false, message: '请将电压表并联在电阻两端。' };
  const current = Math.abs(context.result.elements[resistor.id]?.current ?? 0);
  const matches = Math.abs(Math.abs(voltmeterReading) - Math.abs(voltage)) < Math.max(0.01, Math.abs(voltage) * 0.005);
  return {
    done: matches && current > 1e-7,
    message:
      matches && current > 1e-7
        ? `电压表读数 ${Math.abs(voltmeterReading).toFixed(3)} V 与电阻端电压一致。`
        : `电压表读数 ${Math.abs(voltmeterReading).toFixed(3)} V 未能正确反映电阻端电压，请检查红黑表笔跨接位置。`,
  };
}

function switchAndSupplyCheck(context: LabContext): LabStepCheck {
  const supply = activeSupply(context);
  if (!supply) return { done: false, message: '电源输出关闭。' };
  const sw = closedSwitch(context);
  if (!sw) return { done: false, message: '请闭合回路中的开关。' };
  const supplyCurrent = context.result.elements[supply.id]?.current ?? 0;
  const done = Math.abs(supplyCurrent) > 1e-6;
  return {
    done,
    message: done
      ? '电源已开启、开关闭合，回路有电流通过。'
      : '开关虽闭合，但回路仍无电流，请检查断路点。',
  };
}

function recordCountCheck(labId: string, count: number): (context: LabContext) => LabStepCheck {
  return (context) => {
    const rows = context.measurements.filter((row) => row.labId === labId);
    return {
      done: rows.length >= count,
      message:
        rows.length >= count
          ? `已记录 ${rows.length} 组有效数据。`
          : `已记录 ${rows.length} / ${count} 组数据。`,
    };
  };
}

function seriesTwoResistorsCheck(context: LabContext): LabStepCheck {
  const resistors = componentsOfType(context, 'resistor');
  if (resistors.length < 2) return { done: false, message: '需要至少两只电阻。' };
  const current1 = context.result.elements[resistors[0].id]?.current ?? 0;
  const current2 = context.result.elements[resistors[1].id]?.current ?? 0;
  const equal = Math.abs(current1 - current2) < Math.max(1e-6, Math.abs(current1) * 0.01);
  const ammeter = firstMeterReading(context, 'ammeter');
  const ammeterOk =
    ammeter !== null && Math.abs(Math.abs(ammeter) - Math.abs(current1)) < Math.max(2e-5, Math.abs(current1) * 0.02);
  return {
    done: Math.abs(current1) > 1e-6 && equal && ammeterOk,
    message:
      Math.abs(current1) > 1e-6 && equal && ammeterOk
        ? `两电阻电流均为 ${(Math.abs(current1) * 1000).toFixed(2)} mA，符合串联电流相等。`
        : '两电阻电流尚不相等，请确认它们首尾相接且电流表位于同一串联支路。',
  };
}

function dividerCheck(context: LabContext): LabStepCheck {
  const resistors = componentsOfType(context, 'resistor');
  if (resistors.length < 2) return { done: false, message: '需要两只串联电阻。' };
  const v1 = context.result.elements[resistors[0].id]?.voltage ?? 0;
  const v2 = context.result.elements[resistors[1].id]?.voltage ?? 0;
  const supply = activeSupply(context);
  const supplyVoltage = supply ? Math.abs(context.result.elements[supply.id]?.voltage ?? 0) : 0;
  const sum = Math.abs(v1) + Math.abs(v2);
  const r1 = Math.max(0.001, Math.abs(Number(resistors[0].params.resistance)));
  const r2 = Math.max(0.001, Math.abs(Number(resistors[1].params.resistance)));
  const expectedRatio = r1 / r2;
  const measuredRatio = Math.abs(v2) > 1e-9 ? Math.abs(v1 / v2) : 0;
  const ratioError = Math.abs(measuredRatio - expectedRatio) / expectedRatio;
  const ratioOk =
    Math.abs(sum - supplyVoltage) < Math.max(0.02, supplyVoltage * 0.02) &&
    Math.abs(v1) > 1e-6 &&
    Math.abs(v2) > 1e-6 &&
    ratioError < 0.05;
  return {
    done: ratioOk,
    message: ratioOk
      ? `U₁ + U₂ = ${sum.toFixed(3)} V，分压比 ${measuredRatio.toFixed(3)} 与 R₁/R₂ = ${expectedRatio.toFixed(3)} 相符。`
      : `分压验证尚未通过：U₁ + U₂ = ${sum.toFixed(3)} V，实测比 ${measuredRatio.toFixed(3)}，理论比 ${expectedRatio.toFixed(3)}。`,
  };
}

function parallelBranchesCheck(context: LabContext): LabStepCheck {
  const resistors = componentsOfType(context, 'resistor');
  if (resistors.length < 2) return { done: false, message: '需要至少两只并联电阻。' };
  const v1 = context.result.elements[resistors[0].id]?.voltage ?? 0;
  const v2 = context.result.elements[resistors[1].id]?.voltage ?? 0;
  const i1 = Math.abs(context.result.elements[resistors[0].id]?.current ?? 0);
  const i2 = Math.abs(context.result.elements[resistors[1].id]?.current ?? 0);
  const equalVoltage = Math.abs(Math.abs(v1) - Math.abs(v2)) < Math.max(0.01, Math.abs(v1) * 0.01);
  const supply = activeSupply(context);
  const supplyCurrent = Math.abs(supply ? context.result.elements[supply.id]?.current ?? 0 : 0);
  const kcl = Math.abs(i1 + i2 - supplyCurrent) < Math.max(2e-5, supplyCurrent * 0.02);
  return {
    done: equalVoltage && kcl && i1 > 1e-7 && i2 > 1e-7,
    message:
      equalVoltage && kcl && i1 > 1e-7 && i2 > 1e-7
        ? `两支路端电压一致，I₁ + I₂ = ${((i1 + i2) * 1000).toFixed(2)} mA，与干路电流相符。`
        : '并联条件尚未满足：请把两只电阻接在相同两个节点之间，并把电流表放在干路。',
  };
}

function multiBranchCheck(context: LabContext): LabStepCheck {
  const resistors = componentsOfType(context, 'resistor');
  const currents = resistors
    .map((component) => Math.abs(context.result.elements[component.id]?.current ?? 0))
    .filter((current) => current > 1e-7);
  const voltmeters = componentsOfType(context, 'voltmeter');
  const ammeters = componentsOfType(context, 'ammeter');
  const done = currents.length >= 2 && voltmeters.length > 0 && ammeters.length > 0;
  return {
    done,
    message: done
      ? `已识别到 ${currents.length} 条有电流的电阻支路，可同时测量节点电流与回路电压。`
      : '需要形成至少两条导通支路，并接入电流表与电压表。',
  };
}

function ledConductingCheck(context: LabContext): LabStepCheck {
  const led = componentsOfType(context, 'led')[0];
  if (!led) return { done: false, message: '请加入 LED。' };
  const element = elementOf(context, led);
  const current = element?.current ?? 0;
  const brightness = element?.brightness ?? 0;
  const forward = Boolean(element?.flags?.on);
  if (forward && current > 0.0005) {
    return {
      done: true,
      message: `LED 正向导通：${(current * 1000).toFixed(2)} mA，相对亮度 ${(Math.min(brightness, 1) * 100).toFixed(0)}%。`,
    };
  }
  return {
    done: false,
    message: 'LED 未点亮。请检查阳极接向电源正端，并串联合适的限流电阻。',
  };
}

function ledCurrentSafeCheck(context: LabContext): LabStepCheck {
  const led = componentsOfType(context, 'led')[0];
  const resistor = componentsOfType(context, 'resistor')[0];
  if (!led || !resistor) return { done: false, message: '需要 LED 与限流电阻。' };
  const element = elementOf(context, led);
  const current = element?.current ?? 0;
  const limit = Number(element?.flags?.maxCurrent ?? 0.02);
  const safe = Boolean(element?.flags?.on) && current > 0.001 && current <= limit;
  return {
    done: safe,
    message: safe
      ? `限流电阻 ${Number(resistor.params.resistance).toFixed(0)} Ω 将 LED 电流限制在 ${(current * 1000).toFixed(2)} mA。`
      : '电流不在安全范围，或 LED 尚未导通。请调整限流电阻或电源电压。',
  };
}

function rcWiringCheck(context: LabContext): LabStepCheck {
  const capacitor = componentsOfType(context, 'capacitor')[0];
  const voltmeter = componentsOfType(context, 'voltmeter')[0];
  if (!capacitor || !voltmeter) return { done: false, message: '需要电容与电压表。' };
  const capVoltage = context.result.elements[capacitor.id]?.voltage ?? 0;
  const meterReading = context.result.elements[voltmeter.id]?.reading ?? 0;
  const matches = Math.abs(Math.abs(capVoltage) - Math.abs(meterReading)) < 0.05;
  return {
    done: context.transient.time > 0 && matches,
    message:
      context.transient.time > 0 && matches
        ? `电压表读数 ${Math.abs(meterReading).toFixed(3)} V 与电容端电压一致。`
        : '请把电压表跨接在电容两端，并在数据页启动 RC 暂态。',
  };
}

function rcProgressCheck(context: LabContext): LabStepCheck {
  const supply = activeSupply(context);
  const capacitor = componentsOfType(context, 'capacitor')[0];
  if (!supply || !capacitor) return { done: false, message: '需要电源与电容。' };
  const target = Math.abs(Number(supply.params.voltage)) * 0.632;
  const voltage = Math.abs(context.transient.lastCapacitorVoltage);
  const done = context.transient.time > 0 && voltage >= target;
  return {
    done,
    message: done
      ? `电容电压达到 ${voltage.toFixed(2)} V，已越过一个时间常数附近的 63.2% 目标值 ${target.toFixed(2)} V。`
      : `当前电容电压 ${voltage.toFixed(2)} V，目标约为 ${target.toFixed(2)} V；继续运行或检查 RC 接线。`,
  };
}

function rcCurveCheck(context: LabContext): LabStepCheck {
  const resistor = componentsOfType(context, 'resistor')[0];
  const capacitor = componentsOfType(context, 'capacitor')[0];
  if (!resistor || !capacitor) return { done: false, message: '需要 R 与 C。' };
  const tau = Math.abs(Number(resistor.params.resistance)) * Number(capacitor.params.capacitanceUf) * 1e-6;
  const done = context.transient.samples >= 8 && context.transient.lastCapacitorVoltage > 0;
  return {
    done,
    message: done
      ? `已采集 ${context.transient.samples} 个时间点；理论 τ = RC = ${(tau * 1000).toFixed(1)} ms。`
      : '计时数据不足，请运行 RC 暂态并等待曲线展开。',
  };
}

export const LABS: LabDefinition[] = [
  {
    id: 'ohms-law',
    index: 'E01',
    title: '欧姆定律验证',
    subtitle: '直流线性电阻 · 伏安法测电阻',
    objective: '用电流表与电压表测量电阻的端电压和支路电流，验证 U = I·R，并认识仪表内阻带来的微小偏差。',
    formula: 'R = U / I    ·    U = I × R',
    kit: ['power-supply', 'switch', 'resistor', 'ammeter', 'voltmeter'],
    modelNote: '电流表按 0.1 Ω 串联电阻建模，电压表按 10 MΩ 并联电阻建模；因此 U/I 与标称阻值存在极小偏差。',
    steps: [
      {
        id: 'kit',
        title: '确认实验器材',
        instruction: '从器材库选取电源、开关、定值电阻、电流表和电压表。',
        check: kitCheck(['power-supply', 'switch', 'resistor', 'ammeter', 'voltmeter']),
      },
      {
        id: 'series',
        title: '连接串联主回路',
        instruction: '电源 + → 开关 → 电流表红端，电流表黑端 → 电阻 A，电阻 B → 电源 −。电流表必须串联。',
        check: powerLoopCheck,
      },
      {
        id: 'voltmeter',
        title: '并联接入电压表',
        instruction: '将电压表红端接电阻 A、黑端接电阻 B，使电压表与待测电阻并联。',
        check: parallelVoltageCheck,
      },
      {
        id: 'powered',
        title: '通电并设定测量条件',
        instruction: '开启电源输出，闭合开关，将电压调到约 6 V。观察两只仪表读数。',
        check: switchAndSupplyCheck,
      },
      {
        id: 'record',
        title: '记录并验证 U = I·R',
        instruction: '在数据页记录当前电压与电流；改变电源电压后再记录一组，比较 U/I 与电阻标称值。',
        check: measuredRatioCheck,
      },
    ],
  },
  {
    id: 'series',
    index: 'E02',
    title: '串联电阻与分压',
    subtitle: '电流相等 · 电压相加',
    objective: '搭建两只电阻的串联电路，验证串联电流处处相等，并测量各电阻分压与总电压的关系。',
    formula: 'I = I₁ = I₂    ·    U = U₁ + U₂',
    kit: ['power-supply', 'switch', 'resistor', 'resistor', 'ammeter', 'voltmeter'],
    modelNote: '固定电阻按理想线性电阻计算；导线电阻与接触电阻忽略不计。',
    steps: [
      {
        id: 'kit',
        title: '准备两个电阻',
        instruction: '添加电源、开关、两只定值电阻、电流表和电压表。',
        check: kitCheck(['power-supply', 'switch', 'resistor', 'resistor', 'ammeter', 'voltmeter']),
      },
      {
        id: 'series',
        title: '组成串联支路',
        instruction: '把两只电阻首尾相接，主回路中串入电流表；用电压表分别测量分压。',
        check: seriesTwoResistorsCheck,
      },
      {
        id: 'divider',
        title: '验证分压关系',
        instruction: '分别测量 R₁、R₂ 两端电压并记录，比较 U₁ + U₂ 与电源端电压。',
        check: dividerCheck,
      },
      {
        id: 'record',
        title: '保存实验数据',
        instruction: '在数据页记录至少两组不同电压下的测量结果，用于比较电流一致性。',
        check: recordCountCheck('series', 2),
      },
    ],
  },
  {
    id: 'parallel',
    index: 'E03',
    title: '并联电阻与分流',
    subtitle: '电压相等 · 干路电流等于支路之和',
    objective: '搭建两条并联电阻支路，测量各支路电流与端电压，验证并联电压相等及 KCL 电流关系。',
    formula: 'U = U₁ = U₂    ·    I = I₁ + I₂',
    kit: ['power-supply', 'switch', 'resistor', 'resistor', 'ammeter', 'voltmeter'],
    modelNote: '两电阻位于相同节点之间，仿真自动识别并联关系；电流表 0.1 Ω 采样电阻引起微量压降。',
    steps: [
      {
        id: 'kit',
        title: '准备并联支路器材',
        instruction: '添加电源、开关、两只电阻、电流表和电压表。',
        check: kitCheck(['power-supply', 'switch', 'resistor', 'resistor', 'ammeter', 'voltmeter']),
      },
      {
        id: 'branches',
        title: '搭建并联节点',
        instruction: '把两只电阻的 A 端接到同一节点，B 端接到另一节点；电压表跨接在两个公共节点上。',
        check: parallelBranchesCheck,
      },
      {
        id: 'kcl',
        title: '测量干路与支路电流',
        instruction: '将电流表置于干路，读取总电流；比较各支路电流与干路电流。',
        check: parallelBranchesCheck,
      },
      {
        id: 'record',
        title: '记录数据',
        instruction: '记录至少两组并联测量数据，改变电源电压后重复测量。',
        check: recordCountCheck('parallel', 2),
      },
    ],
  },
  {
    id: 'kirchhoff',
    index: 'E04',
    title: '基尔霍夫定律',
    subtitle: 'KCL 节点守恒 · KVL 回路电压平衡',
    objective: '使用多支路电阻网络测量节点与回路数据，在真实仿真拓扑中核对电流守恒与电压平衡。',
    formula: 'Σ I_in = Σ I_out    ·    Σ U_loop = 0',
    kit: ['power-supply', 'switch', 'resistor', 'resistor', 'ammeter', 'voltmeter'],
    modelNote:
      '示范电路采用两条并联支路：干路电流等于两条支路之和，公共节点电压一致。电流表可移到不同支路测量，教学判断依据真实仿真结果与记录，而非固定摆放位置。',
    steps: [
      {
        id: 'kit',
        title: '准备多支路测量系统',
        instruction: '摆放电源、开关、两只电阻、电流表与电压表，构成一个以上节点的网络。',
        check: kitCheck(['power-supply', 'switch', 'resistor', 'resistor', 'ammeter', 'voltmeter']),
      },
      {
        id: 'active',
        title: '建立导通的多支路',
        instruction: '完成接线、闭合开关并开启电源，确保至少两条电阻支路有电流。',
        check: multiBranchCheck,
      },
      {
        id: 'records',
        title: '记录 KCL / KVL 数据',
        instruction: '在数据页记录至少三组节点电流与回路电压数据，并注明测量对象。',
        check: recordCountCheck('kirchhoff', 3),
      },
      {
        id: 'balance',
        title: '核对数值平衡',
        instruction: '利用仿真节点电压核查每个闭合回路的电压代数和；改变电阻后观察电流重新分配。',
        check: conservationCheck,
      },
    ],
  },
  {
    id: 'led',
    index: 'E05',
    title: 'LED 限流与导通',
    subtitle: '非线性元件 · 极性与安全电流',
    objective: '观察 LED 正向导通与反向截止，调限流电阻使 LED 工作在安全亮度范围，理解分段线性模型。',
    formula: 'U_LED = V_f + I·r_d    ·    I ≈ (U_s − V_f)/(R + r_d)',
    kit: ['power-supply', 'switch', 'resistor', 'led', 'ammeter', 'voltmeter'],
    modelNote: 'LED 使用 Vf + 14 Ω 的教学分段线性近似；真实器件的指数伏安特性和温度效应未建模。',
    steps: [
      {
        id: 'kit',
        title: '准备 LED 电路',
        instruction: '添加电源、开关、限流电阻、LED、电流表与并联在 LED 两端的电压表。',
        check: kitCheck(['power-supply', 'switch', 'resistor', 'led', 'ammeter', 'voltmeter']),
      },
      {
        id: 'conducting',
        title: '使 LED 正向导通',
        instruction: '把 LED 阳极接到电阻一端，阴极回到电源负端，闭合开关并观察发光。',
        check: ledConductingCheck,
      },
      {
        id: 'safe',
        title: '调整限流电阻',
        instruction: '改变限流电阻或电源电压，使 LED 电流保持在推荐范围并观察亮度变化。',
        check: ledCurrentSafeCheck,
      },
      {
        id: 'record',
        title: '记录 LED 工作点',
        instruction: '记录 LED 两端电压、支路电流以及限流电阻值。',
        check: recordCountCheck('led', 1),
      },
    ],
  },
  {
    id: 'rc',
    index: 'E06',
    title: 'RC 充放电',
    subtitle: '一阶暂态 · 时间常数 τ = RC',
    objective: '搭建电阻—电容串联电路，启动后向欧拉暂态仿真，观察电容电压指数上升并验证时间常数。',
    formula: 'u_C(t) = U_s(1 − e^(−t/RC))    ·    τ = RC',
    kit: ['power-supply', 'switch', 'resistor', 'capacitor', 'voltmeter', 'ammeter'],
    modelNote: '理想电容 + 后向欧拉积分 2 ms、曲线采样 20 ms；小于积分步长的快速暂态精度受限。开关断开后主要通过电压表的 10 MΩ 输入放电，并非仍以原 R 放电。',
    steps: [
      {
        id: 'kit',
        title: '准备 RC 电路器材',
        instruction: '添加电源、开关、电阻、电容、电压表与电流表。',
        check: kitCheck(['power-supply', 'switch', 'resistor', 'capacitor', 'voltmeter', 'ammeter']),
      },
      {
        id: 'wiring',
        title: '正确接成 RC 回路',
        instruction: '电源 → 开关 → 电阻 → 电容正极，电容负极回电源负端；电压表跨接电容。',
        check: rcWiringCheck,
      },
      {
        id: 'run',
        title: '启动暂态测量',
        instruction: '在数据页启动 RC 暂态，观察充电曲线、时间与电容端电压。',
        check: rcCurveCheck,
      },
      {
        id: 'time-constant',
        title: '验证时间常数',
        instruction: '继续运行，使电容电压越过一个 τ 对应的 63.2% 目标值，比较理论 τ = RC。',
        check: rcProgressCheck,
      },
      {
        id: 'record',
        title: '保存曲线数据',
        instruction: '记录至少一组 RC 工作点数据，作为实验报告曲线与时标依据。',
        check: recordCountCheck('rc', 1),
      },
    ],
  },
  ...NETWORK_LABS,
];

export function getLab(labId: string): LabDefinition {
  return LABS.find((lab) => lab.id === labId) ?? LABS[0];
}

export interface BuildComponentSpec {
  alias: string;
  type: ComponentType;
  position: [number, number];
  rotationY?: number;
  params?: ParamBag;
}

export interface LabBuildSpec {
  components: BuildComponentSpec[];
  wires: [string, string, string, string][];
}

const LAB_LAYOUTS: Record<string, LabBuildSpec> = {
  ...NETWORK_LAYOUTS,
  'ohms-law': {
    components: [
      { alias: 'ps', type: 'power-supply', position: [-0.58, -0.16], rotationY: 0.055, params: { voltage: 6 } },
      { alias: 'sw', type: 'switch', position: [-0.03, 0.21], rotationY: -0.03, params: { closed: false } },
      { alias: 'r1', type: 'resistor', position: [0.07, -0.16], rotationY: 0.02, params: { resistance: 1000 } },
      { alias: 'am', type: 'ammeter', position: [0.46, -0.25], rotationY: -0.04, params: { range: 0.02 } },
      { alias: 'vm', type: 'voltmeter', position: [0.52, 0.15], rotationY: 0.03, params: { range: 20 } },
    ],
    wires: [
      ['ps', 'positive', 'sw', 'a'],
      ['sw', 'b', 'am', 'positive'],
      ['am', 'negative', 'r1', 'a'],
      ['r1', 'b', 'ps', 'negative'],
      ['vm', 'positive', 'r1', 'a'],
      ['vm', 'negative', 'r1', 'b'],
    ],
  },
  series: {
    components: [
      { alias: 'ps', type: 'power-supply', position: [-0.62, -0.17], rotationY: 0.04, params: { voltage: 10 } },
      { alias: 'sw', type: 'switch', position: [-0.42, 0.22], rotationY: -0.02, params: { closed: true } },
      { alias: 'r1', type: 'resistor', position: [-0.12, -0.15], rotationY: 0.01, params: { resistance: 1000 } },
      { alias: 'r2', type: 'resistor', position: [0.25, -0.15], rotationY: -0.015, params: { resistance: 1000 } },
      { alias: 'am', type: 'ammeter', position: [0.56, -0.26], rotationY: -0.035, params: { range: 0.02 } },
      { alias: 'vm', type: 'voltmeter', position: [0.58, 0.14], rotationY: 0.03, params: { range: 20 } },
    ],
    wires: [
      ['ps', 'positive', 'sw', 'a'],
      ['sw', 'b', 'am', 'positive'],
      ['am', 'negative', 'r1', 'a'],
      ['r1', 'b', 'r2', 'a'],
      ['r2', 'b', 'ps', 'negative'],
      ['vm', 'positive', 'r1', 'a'],
      ['vm', 'negative', 'r1', 'b'],
    ],
  },
  parallel: {
    components: [
      { alias: 'ps', type: 'power-supply', position: [-0.62, -0.18], rotationY: 0.04, params: { voltage: 8 } },
      { alias: 'sw', type: 'switch', position: [-0.40, 0.22], rotationY: -0.02, params: { closed: true } },
      { alias: 'am', type: 'ammeter', position: [0.48, -0.30], rotationY: -0.03, params: { range: 0.02 } },
      { alias: 'r1', type: 'resistor', position: [-0.12, 0.10], rotationY: 0.01, params: { resistance: 1000 } },
      { alias: 'r2', type: 'resistor', position: [0.27, 0.10], rotationY: -0.01, params: { resistance: 1000 } },
      { alias: 'vm', type: 'voltmeter', position: [0.65, 0.17], rotationY: 0.02, params: { range: 20 } },
    ],
    wires: [
      ['ps', 'positive', 'sw', 'a'],
      ['sw', 'b', 'am', 'positive'],
      ['am', 'negative', 'r1', 'a'],
      ['am', 'negative', 'r2', 'a'],
      ['r1', 'b', 'ps', 'negative'],
      ['r2', 'b', 'ps', 'negative'],
      ['vm', 'positive', 'r1', 'a'],
      ['vm', 'negative', 'r1', 'b'],
    ],
  },
  kirchhoff: {
    components: [
      { alias: 'ps', type: 'power-supply', position: [-0.62, -0.18], rotationY: 0.04, params: { voltage: 9 } },
      { alias: 'sw', type: 'switch', position: [-0.42, 0.21], rotationY: -0.02, params: { closed: true } },
      { alias: 'am', type: 'ammeter', position: [0.57, -0.33], rotationY: -0.03, params: { range: 0.02 } },
      { alias: 'r1', type: 'resistor', position: [-0.10, -0.10], rotationY: 0.01, params: { resistance: 1000 } },
      { alias: 'r2', type: 'resistor', position: [0.29, -0.10], rotationY: -0.01, params: { resistance: 1500 } },
      { alias: 'vm', type: 'voltmeter', position: [0.65, 0.18], rotationY: 0.02, params: { range: 20 } },
    ],
    wires: [
      ['ps', 'positive', 'sw', 'a'],
      ['sw', 'b', 'am', 'positive'],
      ['am', 'negative', 'r1', 'a'],
      ['am', 'negative', 'r2', 'a'],
      ['r1', 'b', 'ps', 'negative'],
      ['r2', 'b', 'ps', 'negative'],
      ['vm', 'positive', 'r1', 'a'],
      ['vm', 'negative', 'r1', 'b'],
    ],
  },
  led: {
    components: [
      { alias: 'ps', type: 'power-supply', position: [-0.60, -0.14], rotationY: 0.04, params: { voltage: 5 } },
      { alias: 'sw', type: 'switch', position: [-0.36, 0.20], rotationY: -0.02, params: { closed: true } },
      { alias: 'r1', type: 'resistor', position: [-0.02, -0.14], rotationY: 0.01, params: { resistance: 220 } },
      { alias: 'led', type: 'led', position: [0.28, 0.01], rotationY: 0.02, params: { color: 'red' } },
      { alias: 'am', type: 'ammeter', position: [0.58, 0.16], rotationY: -0.02, params: { range: 0.02 } },
      { alias: 'vm', type: 'voltmeter', position: [0.58, -0.22], rotationY: 0.015, params: { range: 20 } },
    ],
    wires: [
      ['ps', 'positive', 'sw', 'a'],
      ['sw', 'b', 'am', 'positive'],
      ['am', 'negative', 'r1', 'a'],
      ['r1', 'b', 'led', 'anode'],
      ['led', 'cathode', 'ps', 'negative'],
      ['vm', 'positive', 'led', 'anode'],
      ['vm', 'negative', 'led', 'cathode'],
    ],
  },
  rc: {
    components: [
      { alias: 'ps', type: 'power-supply', position: [-0.60, -0.14], rotationY: 0.04, params: { voltage: 5 } },
      { alias: 'sw', type: 'switch', position: [-0.36, 0.22], rotationY: -0.02, params: { closed: true } },
      { alias: 'r1', type: 'resistor', position: [-0.04, -0.15], rotationY: 0.01, params: { resistance: 1000 } },
      { alias: 'c1', type: 'capacitor', position: [0.26, 0.01], rotationY: 0.02, params: { capacitanceUf: 220 } },
      { alias: 'vm', type: 'voltmeter', position: [0.62, -0.24], rotationY: -0.02, params: { range: 20 } },
      { alias: 'am', type: 'ammeter', position: [0.62, 0.13], rotationY: 0.02, params: { range: 0.02 } },
    ],
    wires: [
      ['ps', 'positive', 'sw', 'a'],
      ['sw', 'b', 'am', 'positive'],
      ['am', 'negative', 'r1', 'a'],
      ['r1', 'b', 'c1', 'positive'],
      ['c1', 'negative', 'ps', 'negative'],
      ['vm', 'positive', 'c1', 'positive'],
      ['vm', 'negative', 'c1', 'negative'],
    ],
  },
};

export interface BuiltLabCircuit {
  components: LabComponent[];
  wires: Wire[];
}

/**
 * 以真实端口 ID 生成教学实验的器材布局。`wired` 仅用于课堂演示与自检，
 * 正常教学流程由学生自己完成导线连接。
 */
export function buildLabCircuit(labId: string, wired = false): BuiltLabCircuit {
  const spec = LAB_LAYOUTS[labId] ?? LAB_LAYOUTS['ohms-law'];
  const seenTypeCounts = new Map<ComponentType, number>();
  const aliasToComponent = new Map<string, LabComponent>();
  const components = spec.components.map((item) => {
    const definition = COMPONENT_DEFINITIONS[item.type];
    const count = (seenTypeCounts.get(item.type) ?? 0) + 1;
    seenTypeCounts.set(item.type, count);
    const component: LabComponent = {
      id: `${labId}-${item.alias}`,
      type: item.type,
      name: `${definition.shortName} ${labId === 'ohms-law' ? count : item.alias.toUpperCase()}`,
      position: item.position,
      rotationY: item.rotationY ?? 0,
      params: {
        ...createDefaultParams(item.type),
        ...(item.params ?? {}),
        ...(wired && item.type === 'switch' ? { closed: true } : {}),
      },
    };
    aliasToComponent.set(item.alias, component);
    return component;
  });

  const wires: Wire[] = wired
    ? spec.wires.map(([fromAlias, fromKey, toAlias, toKey], index) => {
        const from = aliasToComponent.get(fromAlias)!;
        const to = aliasToComponent.get(toAlias)!;
        return {
          id: `${labId}-demo-w${index + 1}`,
          fromPortId: makePortId(from.id, fromKey),
          toPortId: makePortId(to.id, toKey),
          color: from.type === 'power-supply' && fromKey === 'positive' ? '#b53b32' : '#2f3234',
        };
      })
    : [];

  return { components, wires };
}

export function createStarterCircuit(): BuiltLabCircuit {
  return buildLabCircuit('ohms-law', false);
}
