import { describe, expect, it } from 'vitest';
import { createDefaultParams, type CircuitSnapshot, type LabComponent } from '../../circuit';
import { simulateCircuit } from '../../circuit/simulation/simulator';
import { scopeFrame } from '../../circuit/scope';
import { autoScopeRanges, meterReading } from '../instrumentPresentation';

const part = (id: string, type: LabComponent['type'], params = {}): LabComponent => ({ id, type, name: id, position: [0, 0], rotationY: 0, params: { ...createDefaultParams(type), ...params } });
const wires = (pairs: string[][]) => pairs.map(([fromPortId, toPortId], i) => ({ id: String(i), fromPortId, toPortId, color: '#222222' }));
describe('仪器显示使用真实电学结果', () => {
  it('电流表显示支路电流而非分流器端电压', () => {
    const a = part('a', 'ammeter'), s: CircuitSnapshot = { components: [part('p', 'power-supply'), part('r', 'resistor', { resistance: 1000 }), a], wires: wires([['p:positive', 'a:positive'], ['a:negative', 'r:a'], ['r:b', 'p:negative']]) };
    const result = simulateCircuit(s);
    expect(result.elements.a.current).toBeCloseTo(0.006, 5);
    expect(meterReading(a, result, s.wires)).toMatch(/^6\.00 mA$/);
    a.params.mode = 'ac'; expect(meterReading(a, result, s.wires)).toBe('—');
  });
  it('万用表未接入和关闭时不把零当测量值，超量程显示 OL', () => {
    const d = part('d', 'multimeter'), s: CircuitSnapshot = { components: [part('p', 'power-supply'), d], wires: [] };
    expect(meterReading(d, simulateCircuit(s), s.wires)).toBe('—');
    s.wires = wires([['p:positive', 'd:positive'], ['p:negative', 'd:negative']]);
    expect(meterReading(d, simulateCircuit(s), s.wires)).toBe('6.000 V');
    d.params.enabled = false; expect(meterReading(d, simulateCircuit(s), s.wires)).toBe('—');
    d.params.enabled = true; d.params.voltageRange = 2;
    expect(meterReading(d, simulateCircuit(s), s.wires)).toBe('OL');
  });
  it('电阻挡拒绝带电网络，不展示伪电阻值', () => {
    const d = part('d', 'multimeter', { mode: 'ohms' }), s: CircuitSnapshot = { components: [part('p', 'power-supply'), d], wires: wires([['p:positive', 'd:positive'], ['p:negative', 'd:negative']]) };
    expect(meterReading(d, simulateCircuit(s), s.wires)).toBe('—');
  });
  it.each([1, -1])('AUTO 以真实直流峰值选挡，包含负电平 %s 且保留未接通道', sign => {
    const d = part('d', 'oscilloscope', { voltsDiv1: 0.1, voltsDiv2: 20 }), s: CircuitSnapshot = { components: [part('p', 'power-supply'), d], wires: wires([[`p:${sign > 0 ? 'positive' : 'negative'}`, 'd:ch1'], [`p:${sign > 0 ? 'negative' : 'positive'}`, 'd:negative']]) };
    const frame = scopeFrame(d, s, simulateCircuit(s)), ranges = autoScopeRanges(d, frame);
    expect(ranges).toEqual([2, 20]);
    expect(Math.max(...frame.traces[0].points.map(p => Math.abs(p.voltage))) / ranges[0]).toBeLessThan(3.6);
  });
  it('AUTO 使用交流瞬时峰值，而不是 RMS 数值', () => {
    const d = part('d', 'oscilloscope'), s: CircuitSnapshot = { components: [part('p', 'three-phase-source'), d], wires: wires([['p:a', 'd:ch1'], ['p:b', 'd:ch2'], ['p:n', 'd:negative']]) };
    const frame = scopeFrame(d, s, simulateCircuit(s));
    expect(autoScopeRanges(d, frame)).toEqual([10, 10]);
    expect(frame.phase).toBeCloseTo(-120, 6);
  });
});
