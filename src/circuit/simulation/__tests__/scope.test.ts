import { describe, expect, it } from 'vitest';
import { createDefaultParams } from '../../catalog';
import type { CircuitSnapshot, LabComponent } from '../../types';
import { scopeFrame } from '../../scope';
import { simulateCircuit } from '../simulator';
import { add, magnitude, zero } from '../complex';
const part = (id: string, type: LabComponent['type']): LabComponent => ({ id, type, name: id, position: [0, 0], rotationY: 0, params: createDefaultParams(type) });
const wires = (pairs: string[][]) => pairs.map(([fromPortId, toPortId], i) => ({ id: String(i), fromPortId, toPortId, color: '#222222' }));
describe('示波器波形源于求解结果', () => {
  it('50 Hz 相量恢复峰值与 RMS，保持两通道 −120° 相位差和 COM 电流守恒', () => {
    const d = part('d', 'oscilloscope'), s: CircuitSnapshot = { components: [part('p', 'three-phase-source'), d], wires: wires([['p:a', 'd:ch1'], ['p:b', 'd:ch2'], ['p:n', 'd:negative']]) };
    const result = simulateCircuit(s), frame = scopeFrame(d, s, result);
    expect(result.ac?.audit.passed).toBe(true); expect(frame.frequency).toBe(50); expect(frame.phase).toBeCloseTo(-120, 7);
    expect(frame.traces[0].rms).toBeCloseTo(24 / 1.0000002, 6); expect(frame.traces[0].vpp).toBeCloseTo(2 * Math.SQRT2 * frame.traces[0].rms!, 8);
    expect(Math.max(...frame.traces[0].points.map(p => p.voltage))).toBeCloseTo(Math.SQRT2 * frame.traces[0].rms!, 3);
    const sum = ['ch1', 'ch2', 'negative'].reduce((v, p) => add(v, result.ac!.terminalCurrents[`d:${p}`] ?? zero()), zero()); expect(magnitude(sum)).toBeLessThan(1e-9);
  });
  it('直流显示恒定电平，不伪造交流波形；缺参考线时无信号', () => {
    const d = part('d', 'oscilloscope'), s: CircuitSnapshot = { components: [part('p', 'power-supply'), d], wires: wires([['p:positive', 'd:ch1'], ['p:negative', 'd:negative']]) };
    const frame = scopeFrame(d, s, simulateCircuit(s)); expect(frame.traces[0].vpp).toBe(0); expect(new Set(frame.traces[0].points.map(p => p.voltage)).size).toBe(1); expect(frame.phase).toBeNull();
    s.wires.pop(); expect(scopeFrame(d, s, simulateCircuit(s)).traces[0].connected).toBe(false);
  });
  it('时域只画已采集节点样本，不填补不存在的暂态点', () => {
    const d = part('d', 'oscilloscope'); d.params.timeDiv = 0.1;
    const s: CircuitSnapshot = { components: [part('p', 'power-supply'), d], wires: wires([['p:positive', 'd:ch1'], ['p:negative', 'd:negative']]) };
    const frame = scopeFrame(d, s, simulateCircuit(s), [0.02, 0.04, 0.06].map((time, i) => ({ time, values: { 'port:d:ch1': i + 1, 'port:d:negative': 0 } })));
    expect(frame.sampled).toBe(true); expect(frame.traces[0].points.map(p => p.voltage)).toEqual([1, 2, 3]); expect(frame.traces[0].rms).toBeNull();
  });
});
