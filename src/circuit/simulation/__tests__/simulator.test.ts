import { describe, expect, it } from 'vitest';
import { createDefaultParams } from '../../catalog';
import type { CircuitSnapshot, ComponentType, LabComponent, ParamBag, Wire } from '../../types';
import { simulateCircuit } from '../simulator';

let serial = 0;

function part(
  type: ComponentType,
  overrides: ParamBag = {},
  id?: string,
): LabComponent {
  serial += 1;
  return {
    id: id ?? `${type}-${serial}`,
    type,
    name: type,
    position: [0, 0],
    rotationY: 0,
    params: { ...createDefaultParams(type), ...overrides },
  };
}

function wire(a: LabComponent, aKey: string, b: LabComponent, bKey: string, id?: string): Wire {
  serial += 1;
  return {
    id: id ?? `w-${serial}`,
    fromPortId: `${a.id}:${aKey}`,
    toPortId: `${b.id}:${bKey}`,
    color: '#b53b32',
  };
}

function solve(components: LabComponent[], wires: Wire[], transient?: {
  capacitorVoltages: Record<string, number>;
  dt: number;
  time: number;
}) {
  return simulateCircuit({ components, wires }, transient ? { transient } : {});
}

function approx(actual: number | undefined, expected: number, tolerance: number) {
  expect(actual).toBeDefined();
  expect(Math.abs((actual as number) - expected)).toBeLessThanOrEqual(tolerance);
}

describe('MNA 直流求解 — 解析解回归', () => {
  it('SIM-01: 10 V / 1 kΩ -> 约 10 mA，电阻两端 10 V', () => {
    const supply = part('power-supply', { voltage: 10, internalResistance: 0.0001 });
    const resistor = part('resistor', { resistance: 1000 });
    const result = solve(
      [supply, resistor],
      [
        wire(supply, 'positive', resistor, 'a'),
        wire(resistor, 'b', supply, 'negative'),
      ],
    );
    expect(result.solved).toBe(true);
    approx(result.elements[resistor.id].current, 0.01, 2e-6);
    approx(result.elements[resistor.id].voltage, 10, 0.002);
    approx(result.elements[supply.id].current, 0.01, 2e-6);
    approx(Math.abs(result.elements[supply.id].voltage), 10, 0.002);
  });

  it('SIM-02: 5 V / 1 kΩ -> 5 mA', () => {
    const supply = part('power-supply', { voltage: 5 });
    const resistor = part('resistor', { resistance: 1000 });
    const result = solve(
      [supply, resistor],
      [
        wire(supply, 'positive', resistor, 'a'),
        wire(resistor, 'b', supply, 'negative'),
      ],
    );
    approx(result.elements[resistor.id].current, 5 / 1000.2, 2e-6);
  });

  it('SIM-03: 10 V 串联两个 1 kΩ -> 5 mA，各分压 5 V', () => {
    const supply = part('power-supply', { voltage: 10 });
    const r1 = part('resistor', { resistance: 1000 });
    const r2 = part('resistor', { resistance: 1000 });
    const result = solve(
      [supply, r1, r2],
      [
        wire(supply, 'positive', r1, 'a'),
        wire(r1, 'b', r2, 'a'),
        wire(r2, 'b', supply, 'negative'),
      ],
    );
    approx(result.elements[r1.id].current, 10 / 2000.2, 1e-6);
    approx(result.elements[r1.id].voltage, 4.9995, 2e-3);
    approx(result.elements[r2.id].voltage, 4.9995, 2e-3);
  });

  it('SIM-04: 10 V 并联两个 1 kΩ -> 总电流约 20 mA，各支路约 10 mA', () => {
    const supply = part('power-supply', { voltage: 10 });
    const r1 = part('resistor', { resistance: 1000 });
    const r2 = part('resistor', { resistance: 1000 });
    const result = solve(
      [supply, r1, r2],
      [
        wire(supply, 'positive', r1, 'a'),
        wire(supply, 'positive', r2, 'a'),
        wire(r1, 'b', supply, 'negative'),
        wire(r2, 'b', supply, 'negative'),
      ],
    );
    approx(result.elements[r1.id].current, 10 / 1000.2, 2e-6);
    approx(result.elements[r2.id].current, 10 / 1000.2, 2e-6);
    approx(result.elements[supply.id].current, 20 / 1000.2, 4e-6);
  });

  it('SIM-05: 断开串联开关 -> 回路电流为零，但电源仍有设定电压', () => {
    const supply = part('power-supply', { voltage: 6 });
    const sw = part('switch', { closed: false });
    const resistor = part('resistor', { resistance: 1000 });
    const result = solve(
      [supply, sw, resistor],
      [
        wire(supply, 'positive', sw, 'a'),
        wire(sw, 'b', resistor, 'a'),
        wire(resistor, 'b', supply, 'negative'),
      ],
    );
    expect(result.solved).toBe(true);
    expect(result.elements[resistor.id].current).toBeCloseTo(0, 10);
    approx(result.elements[supply.id].voltage, 6, 1e-8);
    expect(result.elements[supply.id].current).toBeCloseTo(0, 10);
  });

  it('SIM-06: 电源输出直接短接 -> 有限电流并给出短路诊断，无 NaN/Infinity', () => {
    const supply = part('power-supply', { voltage: 10, internalResistance: 0.2 });
    const result = solve(
      [supply],
      [wire(supply, 'positive', supply, 'negative')],
    );
    expect(result.solved).toBe(true);
    expect(Number.isFinite(result.elements[supply.id].current)).toBe(true);
    expect(result.elements[supply.id].current).toBeGreaterThan(1);
    expect(result.diagnostics.some((item) => item.code === 'supply-short')).toBe(true);
  });

  it('SIM-07: 无源浮置电阻网络 -> 0 V / 0 A 并标记无源，而非 NaN', () => {
    const r1 = part('resistor', { resistance: 1000 });
    const r2 = part('resistor', { resistance: 2200 });
    const result = solve([r1, r2], [wire(r1, 'a', r2, 'a'), wire(r1, 'b', r2, 'b')]);
    expect(result.solved).toBe(true);
    expect(result.status).toBe('incomplete');
    expect(result.elements[r1.id].current).toBeCloseTo(0, 12);
    expect(result.diagnostics.some((item) => item.code === 'no-active-source')).toBe(true);
  });

  it('SIM-08: 电压表并联测电阻电压；电流表串联测量支路电流', () => {
    const supply = part('power-supply', { voltage: 8 });
    const ammeter = part('ammeter', { range: 0.02 });
    const voltmeter = part('voltmeter', { range: 20 });
    const resistor = part('resistor', { resistance: 1000 });
    const result = solve(
      [supply, ammeter, voltmeter, resistor],
      [
        wire(supply, 'positive', ammeter, 'positive'),
        wire(ammeter, 'negative', resistor, 'a'),
        wire(resistor, 'b', supply, 'negative'),
        wire(voltmeter, 'positive', resistor, 'a'),
        wire(voltmeter, 'negative', resistor, 'b'),
      ],
    );
    approx(result.elements[ammeter.id].reading ?? 0, 8 / 1000.3, 1e-5);
    approx(result.elements[voltmeter.id].reading ?? 0, result.elements[resistor.id].voltage, 1e-5);
    expect(result.elements[voltmeter.id].overRange).toBe(false);
  });

  it('电流表误并联时给出高电压降警告，并保持有限读数', () => {
    const supply = part('power-supply', { voltage: 6, internalResistance: 0.2 });
    const ammeter = part('ammeter', { range: 0.02 });
    const result = solve(
      [supply, ammeter],
      [
        wire(supply, 'positive', ammeter, 'positive'),
        wire(ammeter, 'negative', supply, 'negative'),
      ],
    );
    expect(result.solved).toBe(true);
    expect(Number.isFinite(result.elements[ammeter.id].reading)).toBe(true);
    expect(result.elements[ammeter.id].overRange).toBe(true);
    expect(result.diagnostics.some((item) => item.code === 'ammeter-large-voltage')).toBe(true);
  });

  it('未接线的电容在直流稳态仍可求解，且不会误连两侧节点', () => {
    const capacitor = part('capacitor');
    const result = solve([capacitor], []);
    expect(result.solved).toBe(true);
    expect(result.diagnostics.some((item) => item.level === 'error')).toBe(false);
  });

  it('存在脱离电源的浮置子网络时给出明确诊断', () => {
    const supply = part('power-supply', { voltage: 6 });
    const resistor = part('resistor', { resistance: 1000 });
    const floating = part('resistor', { resistance: 2200 });
    const result = solve(
      [supply, resistor, floating],
      [
        wire(supply, 'positive', resistor, 'a'),
        wire(resistor, 'b', supply, 'negative'),
      ],
    );
    expect(result.solved).toBe(true);
    expect(result.diagnostics.some((item) => item.code === 'floating-network')).toBe(true);
  });

  it('SIM-09: 修改电源电压后，读数随新状态重新计算', () => {
    const supply = part('power-supply', { voltage: 5 });
    const resistor = part('resistor', { resistance: 1000 });
    const wires = [
      wire(supply, 'positive', resistor, 'a'),
      wire(resistor, 'b', supply, 'negative'),
    ];
    const first = solve([supply, resistor], wires);
    const changed = { ...supply, params: { ...supply.params, voltage: 10 } };
    const second = solve([changed, resistor], wires);
    approx(first.elements[resistor.id].current, 0.005, 2e-6);
    approx(second.elements[resistor.id].current, 0.01, 2e-6);
  });
});

describe('非线性与暂态教学模型', () => {
  it('LED 串联限流电阻时按分段模型正向导通，并产生亮度', () => {
    const supply = part('power-supply', { voltage: 5 });
    const resistor = part('resistor', { resistance: 220 });
    const led = part('led', { color: 'red' });
    const result = solve(
      [supply, resistor, led],
      [
        wire(supply, 'positive', resistor, 'a'),
        wire(resistor, 'b', led, 'anode'),
        wire(led, 'cathode', supply, 'negative'),
      ],
    );
    expect(result.solved).toBe(true);
    expect(result.elements[led.id].current).toBeGreaterThan(0.009);
    expect(result.elements[led.id].current).toBeLessThan(0.025);
    expect(result.elements[led.id].brightness ?? 0).toBeGreaterThan(0.3);
  });

  it('LED 反接不导通，亮度为零', () => {
    const supply = part('power-supply', { voltage: 5 });
    const resistor = part('resistor', { resistance: 220 });
    const led = part('led', { color: 'red' });
    const result = solve(
      [supply, resistor, led],
      [
        wire(supply, 'positive', resistor, 'a'),
        wire(resistor, 'b', led, 'cathode'),
        wire(led, 'anode', supply, 'negative'),
      ],
    );
    expect(result.elements[led.id].current).toBeLessThan(1e-6);
    expect(result.elements[led.id].brightness).toBe(0);
  });

  it('RC 后向欧拉暂态电压单调上升，1 s 后接近 5 V', () => {
    const supply = part('power-supply', { voltage: 5, internalResistance: 0.0001 });
    const resistor = part('resistor', { resistance: 1000 });
    const capacitor = part('capacitor', { capacitanceUf: 100 });
    const components = [supply, resistor, capacitor];
    const wires = [
      wire(supply, 'positive', resistor, 'a'),
      wire(resistor, 'b', capacitor, 'positive'),
      wire(capacitor, 'negative', supply, 'negative'),
    ];
    let voltage = 0;
    let time = 0;
    const samples: number[] = [];
    for (let step = 0; step < 50; step += 1) {
      time += 0.02;
      const result = solve(components, wires, {
        capacitorVoltages: { [capacitor.id]: voltage },
        dt: 0.02,
        time,
      });
      expect(result.solved).toBe(true);
      voltage = result.capacitorVoltages?.[capacitor.id] ?? voltage;
      samples.push(voltage);
    }
    expect(samples[0]).toBeGreaterThan(0);
    for (let i = 1; i < samples.length; i += 1) {
      expect(samples[i]).toBeGreaterThanOrEqual(samples[i - 1] - 1e-9);
    }
    expect(voltage).toBeGreaterThan(4.5);
    expect(voltage).toBeLessThan(5.01);
  });
});

describe('错误输入与诊断', () => {
  it('无效导线端点被忽略而不是崩溃', () => {
    const resistor = part('resistor');
    const result = simulateCircuit({
      components: [resistor],
      wires: [
        {
          id: 'bad',
          fromPortId: `${resistor.id}:a`,
          toPortId: 'missing:port',
          color: '#000',
        },
      ],
    });
    expect(result.solved).toBe(true);
    expect(result.diagnostics.some((item) => item.code === 'invalid-wire-endpoint')).toBe(true);
  });

  it('电流表超量程产生 warning，读数仍有限', () => {
    const supply = part('power-supply', { voltage: 6 });
    const resistor = part('resistor', { resistance: 10 });
    const ammeter = part('ammeter', { range: 0.002 });
    const result = solve(
      [supply, resistor, ammeter],
      [
        wire(supply, 'positive', ammeter, 'positive'),
        wire(ammeter, 'negative', resistor, 'a'),
        wire(resistor, 'b', supply, 'negative'),
      ],
    );
    expect(result.elements[ammeter.id].overRange).toBe(true);
    expect(Number.isFinite(result.elements[ammeter.id].reading)).toBe(true);
    expect(result.diagnostics.some((item) => item.code === 'ammeter-over-range')).toBe(true);
  });
});
