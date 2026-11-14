import { describe, expect, it } from 'vitest';
import { createDefaultParams, simulateCircuit, type CircuitSnapshot, type LabComponent, type ParamBag } from '../../index';
import { add, sub, scale, polar, magnitude, realPower } from '../complex';
import { threePhaseReadings } from '../../../experiments/courseAnalysis';

const part = (id: string, type: LabComponent['type'], params: ParamBag = {}): LabComponent => ({ id, type, name: id, position: [0, 0], rotationY: 0, params: { ...createDefaultParams(type), ...params } });
function circuit(kind: 'star' | 'delta', resistances = [1000, 1000, 1000], neutral = true): CircuitSnapshot {
  const components = [part('test-ps', 'three-phase-source'), ...resistances.map((r, i) => part(`test-r${'abc'[i]}`, 'resistor-box', { resistance: r }))];
  const edges: string[][] = kind === 'star' ? [
    ['test-ps:a', 'test-ra:a'], ['test-ps:b', 'test-rb:a'], ['test-ps:c', 'test-rc:a'],
    ['test-ra:b', 'test-rb:b'], ['test-rb:b', 'test-rc:b'], ...(neutral ? [['test-ra:b', 'test-ps:n']] : []),
  ] : [['test-ps:a', 'test-ra:a'], ['test-ra:b', 'test-ps:b'], ['test-ps:b', 'test-rb:a'], ['test-rb:b', 'test-ps:c'], ['test-ps:c', 'test-rc:a'], ['test-rc:b', 'test-ps:a']];
  return { components, wires: edges.map(([fromPortId, toPortId], i) => ({ id: `w${i}`, fromPortId, toPortId, color: '#333' })) };
}
describe('独立单频有效值三相求解', () => {
  it('对称星形：计入源内阻后与解析解一致，中线电流为零', () => {
    const c = circuit('star'), r = simulateCircuit(c), v = threePhaseReadings(c, r)!;
    expect(r.status).toBe('ok'); expect(r.domain).toBe('ac');
    for (const phase of ['A', 'B', 'C']) {
      expect(v[`phaseI${phase}`]).toBeCloseTo(24 / 1000.2, 10);
      expect(v[`phaseU${phase}`]).toBeCloseTo(24 * 1000 / 1000.2, 9);
      expect(v[`lineI${phase}`]).toBeCloseTo(v[`phaseI${phase}`], 10);
    }
    expect(v.lineUAB / v.phaseUA).toBeCloseTo(Math.sqrt(3), 10);
    expect(v.neutralI).toBeLessThan(1e-10); expect(r.ac!.audit.passed).toBe(true);
  });
  it('对称三角形：线电流为相电流相量差，匹配解析源压降', () => {
    const c = circuit('delta'), r = simulateCircuit(c), v = threePhaseReadings(c, r)!;
    const lineVoltage = Math.sqrt(3) * 24 / (1 + 3 * 0.2 / 1000);
    expect(v.phaseUA).toBeCloseTo(lineVoltage, 9);
    expect(v.lineUAB).toBeCloseTo(v.phaseUA, 10);
    expect(v.lineIA).toBeCloseTo(Math.sqrt(3) * lineVoltage / 1000, 10);
    expect(v.lineIA / v.phaseIA).toBeCloseTo(Math.sqrt(3), 9);
    expect(r.ac!.audit.passed).toBe(true);
  });
  it('不对称星形有中线：各相负载电压按实际源内阻计算', () => {
    const c = circuit('star', [1000, 500, 2000]), r = simulateCircuit(c), v = threePhaseReadings(c, r)!;
    const currents = [0, -120, 120].map((a, i) => scale(polar(24, a), 1 / ([1000, 500, 2000][i] + 0.2)));
    expect(v.neutralI).toBeCloseTo(magnitude(currents.reduce(add)), 9);
    expect(v.neutralShift).toBeLessThan(1e-10);
    expect(v.phaseUB).toBeCloseTo(24 * 500 / 500.2, 9);
  });
  it('不对称星形断中线：用导纳加权解析解验证中点漂移', () => {
    const resistances = [1000, 500, 2000], c = circuit('star', resistances, false), r = simulateCircuit(c);
    const g = resistances.map(x => 1 / (x + 0.2));
    const neutral = scale([0, -120, 120].map((a, i) => scale(polar(24, a), g[i])).reduce(add), 1 / g.reduce((a, b) => a + b));
    const v = threePhaseReadings(c, r)!;
    expect(v.neutralShift).toBeCloseTo(magnitude(neutral), 9);
    expect(v.neutralI).toBeLessThan(1e-10);
    for (let i = 0; i < 3; i++) {
      const current = scale(sub(polar(24, [0, -120, 120][i]), neutral), g[i]);
      expect(v[`phaseU${'ABC'[i]}`]).toBeCloseTo(magnitude(current) * resistances[i], 8);
    }
    expect(Math.max(v.phaseUA, v.phaseUB, v.phaseUC) - Math.min(v.phaseUA, v.phaseUB, v.phaseUC)).toBeGreaterThan(5);
  });
  it('不对称三角形不能统一使用 √3 电流比', () => {
    const c = circuit('delta', [1000, 500, 2000]), r = simulateCircuit(c), v = threePhaseReadings(c, r)!;
    const terminal = r.ac!.terminalCurrents;
    const lineA = sub(terminal['test-ra:a'], terminal['test-rc:a']);
    expect(v.lineIA).toBeCloseTo(magnitude(lineA), 9);
    expect(Math.abs(v.lineIA / v.phaseIA - Math.sqrt(3))).toBeGreaterThan(0.1);
    expect(r.ac!.audit.passed).toBe(true);
  });
  it('ABC / ACB 相序反转时相位反转而有效值不变', () => {
    const c = circuit('star'), a = simulateCircuit(c);
    c.components[0].params.sequence = 'ACB'; const b = simulateCircuit(c);
    expect(a.ac!.portVoltages['test-ps:b'].im).toBeLessThan(0);
    expect(b.ac!.portVoltages['test-ps:b'].im).toBeGreaterThan(0);
    expect(a.elements['test-rb'].current).toBeCloseTo(b.elements['test-rb'].current, 12);
  });
  it('交流表读有效值，直流档不伪装成交流读数，量程会检查', () => {
    const c = circuit('star'); c.components.push(part('vm', 'voltmeter', { mode: 'ac', range: 20 }));
    c.wires.push({ id: 'vp', fromPortId: 'vm:positive', toPortId: 'test-ps:a', color: '#333' }, { id: 'vn', fromPortId: 'vm:negative', toPortId: 'test-ps:n', color: '#333' });
    const ac = simulateCircuit(c); expect(ac.elements.vm.reading).toBeGreaterThan(23); expect(ac.elements.vm.overRange).toBe(true);
    c.components.at(-1)!.params.mode = 'dc'; expect(simulateCircuit(c).elements.vm.reading).toBe(0);
  });
  it('相间短路产生有限故障电流，记录状态为错误', () => {
    const c = circuit('star'); c.wires.push({ id: 'short', fromPortId: 'test-ps:a', toPortId: 'test-ps:b', color: '#333' });
    const r = simulateCircuit(c); expect(r.status).toBe('error'); expect(r.diagnostics.some(d => d.code === 'ac-over-current')).toBe(true);
    expect(Object.values(r.elements).every(e => Number.isFinite(e.current))).toBe(true);
  });
  it('拒绝不同频率源和未实现的交流非线性模型', () => {
    const c = circuit('star'); c.components.push(part('other', 'three-phase-source', { frequencyHz: 60 }));
    expect(simulateCircuit(c).solved).toBe(false);
    c.components.pop(); c.components.push(part('lamp', 'bulb')); c.wires.push({ id: 'lamp', fromPortId: 'lamp:a', toPortId: 'test-ps:a', color: '#333' });
    expect(simulateCircuit(c).diagnostics.some(d => d.code === 'unsupported-ac-element')).toBe(true);
  });
  it('功率平衡使用 RMS 端电压与相量电流，而非幅值直接相乘', () => {
    const c = circuit('star', [300, 700, 1700], false), r = simulateCircuit(c);
    const input = ['a', 'b', 'c'].reduce((sum, p) => sum - realPower(sub(r.ac!.portVoltages[`test-ps:${p}`], r.ac!.portVoltages['test-ps:n']), r.ac!.terminalCurrents[`test-ps:${p}`]), 0);
    expect(input).toBeCloseTo(r.totalPower!, 8); expect(r.ac!.audit.powerResidualW).toBeLessThan(1e-8);
  });
  it('明确拒绝相量稳态与电容时域混算；关闭的孤立交流源不破坏直流暂态', () => {
    const c = circuit('star');
    expect(simulateCircuit(c, { transient: { capacitorVoltages: {}, dt: 0.002, time: 0 } }).diagnostics.some(d => d.code === 'ac-transient-unsupported')).toBe(true);
    c.components[0].params.enabled = false;
    c.components.push(part('dc', 'power-supply', { enabled: false }), part('cap', 'capacitor'));
    c.wires.push({ id: 'r-cap', fromPortId: 'cap:positive', toPortId: 'test-ra:a', color: '#333' }, { id: 'r-cap-n', fromPortId: 'cap:negative', toPortId: 'test-ra:b', color: '#333' });
    const r = simulateCircuit(c, { transient: { capacitorVoltages: { cap: 5 }, dt: 0.002, time: 0 } });
    expect(r.domain).toBe('dc'); expect(r.capacitorVoltages!.cap).toBeGreaterThan(4.9);
  });
});
