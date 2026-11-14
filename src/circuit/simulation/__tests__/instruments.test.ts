import { describe, expect, it } from 'vitest';
import { createDefaultParams } from '../../catalog';
import { auditCircuit } from '../../analysis';
import { measurementIssue } from '../../measurement';
import type { CircuitSnapshot, LabComponent } from '../../types';
import { simulateCircuit } from '../simulator';
const part = (id: string, type: LabComponent['type'], params = {}): LabComponent => ({ id, type, name: id, position: [0, 0], rotationY: 0, params: { ...createDefaultParams(type), ...params } });
const wire = (a: string, b: string) => ({ id: a + b, fromPortId: a, toPortId: b, color: '#222222' });
describe('真实仪器电气支路', () => {
  it.each([10, 1000, 1000000])('双路源 %s Ω 负载自动选择 CV 或 CC', r => {
    const s: CircuitSnapshot = { components: [part('p', 'programmable-supply'), part('r', 'resistor', { resistance: r })], wires: [wire('p:positive', 'r:a'), wire('p:negative', 'r:b')] };
    const result = simulateCircuit(s), p = result.elements.p;
    const current = Math.min(5 / (r + 0.2), 0.05);
    expect(result.solved).toBe(true); expect(p.current).toBeCloseTo(current, 8); expect(p.voltage).toBeCloseTo(current * r, 7);
    expect(p.flags?.mode1).toBe(r === 10 ? 'CC' : 'CV'); expect(auditCircuit(s, result)?.passed).toBe(true);
  });
  it('两路源可串联，关闭通道会开路，不产生内部共地', () => {
    const s: CircuitSnapshot = { components: [part('p', 'programmable-supply', { output2: true, voltage2: 3, currentLimit: 1 }), part('r', 'resistor', { resistance: 1000 })], wires: [wire('p:negative', 'p:positive2'), wire('p:positive', 'r:a'), wire('p:negative2', 'r:b')] };
    const result = simulateCircuit(s); expect(result.elements.r.current).toBeCloseTo(8 / 1000.4, 9); expect(auditCircuit(s, result)?.passed).toBe(true);
    s.components[0].params.output2 = false; expect(simulateCircuit(s).elements.r.current).toBeCloseTo(0, 9);
  });
  it('两路 30 V 空载仍收敛为 CV；反向灌电流明确阻止实验记录', () => {
    const p = part('p', 'programmable-supply', { voltage: 30, voltage2: 30, output2: true, currentLimit: 0.001, currentLimit2: 0.001 });
    const open = simulateCircuit({ components: [p], wires: [] }); expect(open.solved).toBe(true); expect(open.elements.p.voltage).toBeCloseTo(30, 7); expect(open.elements.p.flags?.voltage2).toBeCloseTo(30, 7); expect(open.elements.p.current).toBeCloseTo(0, 9);
    p.params.voltage = 5; p.params.output2 = false;
    const backfeed = simulateCircuit({ components: [p, part('other', 'power-supply')], wires: [wire('p:positive', 'other:positive'), wire('p:negative', 'other:negative')] });
    expect(backfeed.status).toBe('error'); expect(backfeed.diagnostics.some(d => d.code === 'psu-backfeed')).toBe(true);
  });
  it('万用表电压输入计入 10 MΩ 负载，电流插孔保持独立', () => {
    const s: CircuitSnapshot = { components: [part('p', 'power-supply'), part('d', 'multimeter')], wires: [wire('p:positive', 'd:positive'), wire('p:negative', 'd:negative')] };
    const result = simulateCircuit(s); expect(result.elements.d.reading).toBeCloseTo(6 * 1e7 / (1e7 + 0.2), 8); expect(auditCircuit(s, result)?.passed).toBe(true);
    s.components[1].params.mode = 'dci'; s.wires[0] = wire('p:positive', 'd:current');
    const short = simulateCircuit(s);
    expect(short.elements.d.reading).toBeCloseTo(20, 6); expect(short.elements.d.overRange).toBe(true);
    expect(measurementIssue(s.components, short)).not.toBeNull();
  });
  it('电阻挡从测试电流测等效电阻，拒绝带电网络及非线性器件', () => {
    const s: CircuitSnapshot = { components: [part('d', 'multimeter', { mode: 'ohms' }), part('r', 'resistor', { resistance: 1200 })], wires: [wire('d:positive', 'r:a'), wire('d:negative', 'r:b')] };
    const result = simulateCircuit(s); expect(result.elements.d.reading).toBeCloseTo(1200, 7); expect(auditCircuit(s, result)?.passed).toBe(true);
    s.components.push(part('p', 'power-supply')); expect(simulateCircuit(s).elements.d.reading).toBeUndefined(); expect(simulateCircuit(s).elements.d.flags?.invalidReading).toBe(true);
    s.components.pop(); s.components[1] = part('r', 'bulb'); expect(simulateCircuit(s).elements.d.reading).toBeUndefined();
  });
  it('万用表测量并联等效电阻，未接表笔的仪表不生成测量值', () => {
    const s: CircuitSnapshot = { components: [part('d', 'multimeter', { mode: 'ohms' }), part('a', 'resistor', { resistance: 1000 }), part('b', 'resistor', { resistance: 2000 })], wires: [wire('d:positive', 'a:a'), wire('d:negative', 'a:b'), wire('a:a', 'b:a'), wire('a:b', 'b:b')] };
    expect(simulateCircuit(s).elements.d.reading).toBeCloseTo(1 / (1 / 1000 + 1 / 2000), 7);
    s.wires = []; expect(simulateCircuit(s).elements.d.reading).toBeUndefined();
  });
  it('示波器每通道以 1 MΩ 真实并联，共用 COM，改变被测负载', () => {
    const s: CircuitSnapshot = { components: [part('p', 'power-supply'), part('d', 'oscilloscope')], wires: [wire('p:positive', 'd:ch1'), wire('p:negative', 'd:negative')] };
    const result = simulateCircuit(s); expect(result.elements.d.flags?.ch1).toBeCloseTo(6 * 1e6 / (1e6 + 0.2), 8); expect(auditCircuit(s, result)?.passed).toBe(true);
    expect(Object.keys(result.portVoltages!).some(k => k.includes('~branch'))).toBe(false);
  });
});
