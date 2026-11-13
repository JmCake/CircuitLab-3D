import { describe, expect, it } from 'vitest';
import { createDefaultParams } from '../../catalog';
import type { CircuitSnapshot, ComponentType, LabComponent, ParamBag, Wire } from '../../types';
import { solveLinearSystem } from '../linalg';
import { simulateCircuit } from '../simulator';

let serial = 0;

function part(type: ComponentType, overrides: ParamBag = {}): LabComponent {
  serial += 1;
  return {
    id: `${type}-${serial}`,
    type,
    name: type,
    position: [0, 0],
    rotationY: 0,
    params: { ...createDefaultParams(type), ...overrides },
  };
}

function wire(a: LabComponent, aKey: string, b: LabComponent, bKey: string): Wire {
  serial += 1;
  return {
    id: `w-${serial}`,
    fromPortId: `${a.id}:${aKey}`,
    toPortId: `${b.id}:${bKey}`,
    color: '#b53b32',
  };
}

function solve(components: LabComponent[], wires: Wire[], transient?: { capacitorVoltages: Record<string, number>; dt: number; time: number }) {
  const snapshot: CircuitSnapshot = { components, wires };
  return simulateCircuit(snapshot, transient ? { transient } : undefined);
}

describe('面包板内部连通规则', () => {
  it('同一列的五个孔位在电气上连通，可形成真实电流回路', () => {
    const supply = part('power-supply', { voltage: 5, internalResistance: 0.0001 });
    const resistor = part('resistor', { resistance: 1000 });
    const breadboard = part('breadboard');
    const result = solve(
      [supply, resistor, breadboard],
      [
        wire(supply, 'positive', breadboard, 'c0r0'),
        wire(breadboard, 'c0r3', resistor, 'a'),
        wire(resistor, 'b', supply, 'negative'),
      ],
    );
    expect(result.solved).toBe(true);
    expect(result.elements[resistor.id].current).toBeGreaterThan(0.0045);
    expect(result.elements[resistor.id].current).toBeLessThan(0.0055);
  });

  it('不同列的孔位互不连通，不会仅因空间位置相邻而导通', () => {
    const supply = part('power-supply', { voltage: 5, internalResistance: 0.0001 });
    const resistor = part('resistor', { resistance: 1000 });
    const breadboard = part('breadboard');
    const result = solve(
      [supply, resistor, breadboard],
      [
        wire(supply, 'positive', breadboard, 'c0r0'),
        wire(breadboard, 'c1r3', resistor, 'a'),
        wire(resistor, 'b', supply, 'negative'),
      ],
    );
    expect(result.solved).toBe(true);
    expect(Math.abs(result.elements[resistor.id].current)).toBeLessThan(1e-9);
  });

  it('上电源轨纵向连通，下电源轨与上电源轨相互独立', () => {
    const supply = part('power-supply', { voltage: 5, internalResistance: 0.0001 });
    const resistor = part('resistor', { resistance: 1000 });
    const breadboard = part('breadboard');
    const result = solve(
      [supply, resistor, breadboard],
      [
        wire(supply, 'positive', breadboard, 'railTop0'),
        wire(breadboard, 'railTop5', resistor, 'a'),
        wire(resistor, 'b', supply, 'negative'),
      ],
    );
    expect(result.elements[resistor.id].current).toBeGreaterThan(0.0045);
  });
});

describe('滑动变阻器三端模型', () => {
  it('滑片位置改变会改变 A–W 段电阻和支路电流', () => {
    const supply = part('power-supply', { voltage: 10, internalResistance: 0.0001 });
    const rheostat = part('rheostat', { maxResistance: 100, position: 0.5 });
    const ammeter = part('ammeter', { range: 2 });
    const wires = [
      wire(supply, 'positive', rheostat, 'a'),
      wire(rheostat, 'w', ammeter, 'positive'),
      wire(ammeter, 'negative', supply, 'negative'),
    ];
    const first = solve([supply, rheostat, ammeter], wires);
    expect(first.solved).toBe(true);
    expect(first.elements[ammeter.id].reading).toBeCloseTo(10 / 50.1, 2);
    // electrical reference direction through the rheostat is a→w
    expect(Math.abs(first.elements[rheostat.id].current)).toBeCloseTo(10 / 50.1, 2);

    const moved = { ...rheostat, params: { ...rheostat.params, position: 1 } };
    const second = solve([supply, moved, ammeter], wires);
    expect(second.elements[ammeter.id].reading).toBeCloseTo(10 / 100.1, 2);
  });
});

describe('线性求解器边界', () => {
  it('发现奇异矩阵而不产生 NaN', () => {
    const result = solveLinearSystem(
      [
        [1, 1],
        [2, 2],
      ],
      [1, 2],
    );
    expect(result.singular).toBe(true);
    expect(result.solution).toBeNull();
  });

  it('普通矩阵可解', () => {
    const result = solveLinearSystem(
      [
        [2, 1],
        [1, 3],
      ],
      [5, 10],
    );
    expect(result.singular).toBe(false);
    expect(result.solution).toEqual([1, 3]);
  });
});
