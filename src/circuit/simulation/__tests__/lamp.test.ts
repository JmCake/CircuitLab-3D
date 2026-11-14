import { describe, it, expect } from 'vitest';
import { createDefaultParams, simulateCircuit, type LabComponent } from '../../index';
import { lampOperatingPoint } from '../lamp';
import { auditCircuit, analyzeThevenin } from '../../analysis';

const lamp: LabComponent = { id: 'lamp', name: 'lamp', type: 'bulb', position: [0, 0], rotationY: 0, params: createDefaultParams('bulb') };
describe('非线性灯泡教学模型', () => {
  it('额定点为 6 V / 0.3 W，冷态微分电阻为热阻十分之一', () => {
    expect(lampOperatingPoint(lamp, 6).current).toBeCloseTo(0.05, 12);
    expect(lampOperatingPoint(lamp, 0).conductance).toBeCloseTo(1 / 12, 12);
    expect(lampOperatingPoint(lamp, 1).resistance).toBeLessThan(lampOperatingPoint(lamp, 6).resistance);
  });
  it('伏安关系奇对称、单调、耗散功率非负，电阻随电压升高', () => {
    let before = -Infinity;
    for (const u of [-20, -6, -1, -0.01, 0, 0.01, 1, 6, 20]) {
      const p = lampOperatingPoint(lamp, u);
      expect(p.current).toBeGreaterThan(before); expect(p.conductance).toBeGreaterThan(0); expect(u * p.current).toBeGreaterThanOrEqual(0);
      expect(p.current).toBeCloseTo(-lampOperatingPoint(lamp, -u).current, 12); before = p.current;
    }
  });
  it.each([0.1, 1, 3, 6, 12, 20])('在 %s V 电源与有限内阻网络中收敛并守恒', voltage => {
    const ps: LabComponent = { ...lamp, id: 'ps', type: 'power-supply', params: { ...createDefaultParams('power-supply'), voltage } };
    const snapshot = { components: [ps, lamp], wires: [{ id: 'a', fromPortId: 'ps:positive', toPortId: 'lamp:a', color: '#333' }, { id: 'b', fromPortId: 'ps:negative', toPortId: 'lamp:b', color: '#333' }] };
    const r = simulateCircuit(snapshot); expect(r.solved).toBe(true); expect(auditCircuit(snapshot, r)?.passed).toBe(true);
    expect(r.elements.lamp.voltage + r.elements.lamp.current * 0.2).toBeCloseTo(voltage, 8);
    expect(analyzeThevenin(snapshot, 'lamp')).toBeNull();
  });
});
