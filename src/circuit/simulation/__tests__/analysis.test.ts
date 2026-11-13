import { describe, expect, it } from 'vitest';
import { analyzeSuperposition, analyzeThevenin, auditCircuit } from '../../analysis';
import { buildLabCircuit } from '../../../experiments/labs';
import { simulateCircuit } from '../simulator';
import { advanceTransient, SimulationClock } from '../transient';
import { createDefaultParams, type LabComponent } from '../../index';

describe('线性网络定理与守恒（含真实仪表内阻）', () => {
  it('变阻器的两段功率与三个端口电流均计入守恒', () => {
    const part = (id: string, type: LabComponent['type'], params = {}): LabComponent => ({ id, type, name: id, position: [0, 0], rotationY: 0, params: { ...createDefaultParams(type), ...params } });
    const components = [part('ps', 'power-supply', { voltage: 10 }), part('rh', 'rheostat', { maxResistance: 100, position: 0.5 })];
    const circuit = { components, wires: [
      { id: 'w1', fromPortId: 'ps:positive', toPortId: 'rh:a', color: '#000' },
      { id: 'w2', fromPortId: 'ps:negative', toPortId: 'rh:b', color: '#000' },
    ] };
    const result = simulateCircuit(circuit);
    expect(result.elements.rh.power).toBeCloseTo((10 / 100.2) ** 2 * 100, 7);
    expect(auditCircuit(circuit, result)?.passed).toBe(true);
  });
  it('戴维南开路电压、测试源电阻与解析值一致，分析不修改现场', () => {
    const circuit = buildLabCircuit('thevenin', true);
    const before = JSON.stringify(circuit);
    const load = circuit.components.find(c => c.type === 'resistor-box')!;
    const eq = analyzeThevenin(circuit, load.id)!;
    const sourceR = 1000.2;
    const rPort = 1 / (1 / sourceR + 1 / 1000) + 0.1;
    const expectedR = 1 / (1 / rPort + 1 / 1e7);
    const expectedV = (10 * 1000 / (sourceR + 1000)) * 1e7 / (1e7 + rPort);
    expect(eq.resistance).toBeCloseTo(expectedR, 5);
    expect(eq.voltage).toBeCloseTo(expectedV, 7);
    expect(JSON.stringify(circuit)).toBe(before);
  });
  it.each([10, 100, 500, 2000, 9000])('负载 %s Ω 的等效预测与原网表求解一致', resistance => {
    const circuit = buildLabCircuit('thevenin', true);
    const load = circuit.components.find(c => c.type === 'resistor-box')!;
    load.params.resistance = resistance;
    const eq = analyzeThevenin(circuit, load.id)!;
    const result = simulateCircuit(circuit);
    expect(eq.predictedCurrent).toBeCloseTo(result.elements[load.id].current, 9);
    expect(auditCircuit(circuit, result)?.passed).toBe(true);
  });
  it('最大功率在等效电阻处取得；两侧减小，摆放不影响结果', () => {
    const circuit = buildLabCircuit('max-power', true);
    const load = circuit.components.find(c => c.type === 'resistor-box')!;
    const eq = analyzeThevenin(circuit, load.id)!;
    const powers = [0.5, 1, 2].map(ratio => {
      load.params.resistance = eq.resistance * ratio;
      return simulateCircuit(circuit).elements[load.id].power;
    });
    expect(powers[1]).toBeCloseTo(eq.maxPower, 8);
    expect(powers[0]).toBeLessThan(powers[1]);
    expect(powers[2]).toBeLessThan(powers[1]);
    const before = simulateCircuit(circuit).elements[load.id].current;
    circuit.components.forEach(c => { c.position = [100, -200]; c.rotationY = 2.7; });
    expect(simulateCircuit(circuit).elements[load.id].current).toBe(before);
  });
  it('双源有符号响应叠加正确，而功率不能直接叠加', () => {
    const circuit = buildLabCircuit('superposition', true);
    const load = circuit.components.find(c => c.type === 'resistor-box')!;
    const response = analyzeSuperposition(circuit, load.id)!;
    expect(response.error).toBeLessThan(1e-9);
    const r = Number(load.params.resistance);
    const sumPowers = response.contributions.reduce((sum, c) => sum + c.current ** 2 * r, 0);
    expect(Math.abs(sumPowers - response.total ** 2 * r)).toBeGreaterThan(1e-4);
    expect(auditCircuit(circuit, simulateCircuit(circuit))?.passed).toBe(true);
  });
  it('未连接与 LED 非线性网络不伪造线性等效', () => {
    const unwired = buildLabCircuit('thevenin', false);
    const load = unwired.components.find(c => c.type === 'resistor-box')!;
    expect(analyzeThevenin(unwired, load.id)).toBeNull();
    const led = buildLabCircuit('led', true);
    expect(analyzeThevenin(led, led.components.find(c => c.type === 'resistor')!.id)).toBeNull();
  });
  it('独立守恒检查能发现被篡改的支路读数', () => {
    const circuit = buildLabCircuit('kirchhoff', true);
    const result = simulateCircuit(circuit);
    const r = circuit.components.find(c => c.type === 'resistor')!;
    result.elements[r.id].current += 0.01;
    expect(auditCircuit(circuit, result)?.passed).toBe(false);
  });
});

describe('暂态精度、能量与墙钟调度', () => {
  it('RC 一个时间常数时与加载后的解析解误差小于 0.01 V', () => {
    const circuit = buildLabCircuit('rc', true);
    const cap = circuit.components.find(c => c.type === 'capacitor')!;
    const resistance = 1000.31;
    const req = 1 / (1 / resistance + 1 / 1e7);
    const tau = req * 220e-6;
    const final = 5 * 1e7 / (1e7 + resistance);
    const result = advanceTransient(circuit, { [cap.id]: 0 }, 0, tau);
    expect(Math.abs(result.capacitorVoltages![cap.id] - final * (1 - Math.exp(-1)))).toBeLessThan(0.01);
    expect(auditCircuit(circuit, result)?.passed).toBe(true);
  });
  it('源电动势置零后，电容经电阻放电，端口功率为负且能量递减', () => {
    const circuit = buildLabCircuit('rc', true);
    const cap = circuit.components.find(c => c.type === 'capacitor')!;
    circuit.components.find(c => c.type === 'power-supply')!.params.voltage = 0;
    let voltage = 5;
    for (let i = 0; i < 10; i++) {
      const result = advanceTransient(circuit, { [cap.id]: voltage }, i * 0.02);
      expect(result.elements[cap.id].power).toBeLessThan(0);
      expect(result.capacitorVoltages![cap.id]).toBeLessThan(voltage);
      expect(auditCircuit(circuit, result)?.passed).toBe(true);
      voltage = result.capacitorVoltages![cap.id];
    }
    const expected = 5 * Math.exp(-0.2 / ((1 / (1 / 1000.31 + 1 / 1e7)) * 220e-6));
    expect(Math.abs(voltage - expected)).toBeLessThan(0.01);
  });
  it('缩小步长提高精度，异常步长与超额计算请求明确拒绝', () => {
    const circuit = buildLabCircuit('rc', true);
    const cap = circuit.components.find(c => c.type === 'capacitor')!;
    const exact = 5 * 1e7 / (1e7 + 1000.31) * (1 - Math.exp(-0.22 / (1 / (1 / 1000.31 + 1 / 1e7) * 220e-6)));
    const coarse = advanceTransient(circuit, {}, 0, 0.22, 0.02).capacitorVoltages![cap.id];
    const fine = advanceTransient(circuit, {}, 0, 0.22).capacitorVoltages![cap.id];
    expect(Math.abs(fine - exact)).toBeLessThan(Math.abs(coarse - exact));
    expect(() => advanceTransient(circuit, {}, 0, NaN)).toThrow();
    expect(() => advanceTransient(circuit, {}, 0, 100)).toThrow();
  });
  it('不规则回调累计准确的时间，积压不被静默丢弃', () => {
    const clock = new SimulationClock();
    let ticks = 0;
    for (const elapsed of [0.05, 0.03, 0.09, 0.01, 0.12]) ticks += clock.consume(elapsed).ticks;
    expect(ticks).toBe(15);
    const backlog = clock.consume(1);
    expect(backlog.ticks).toBe(10);
    expect(backlog.lag).toBeCloseTo(0.8);
    expect(clock.consume(NaN).ticks).toBe(0);
  });
});
