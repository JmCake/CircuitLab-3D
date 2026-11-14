import { describe, expect, it } from 'vitest';
import { COMPONENT_DEFINITIONS, simulateCircuit, type ComponentType } from '../../circuit';
import type { LabContext } from '../labs';
import { buildLabCircuit, LABS } from '../labs';

function requiredCounts(types: ComponentType[]): Map<ComponentType, number> {
  const counts = new Map<ComponentType, number>();
  for (const type of types) counts.set(type, (counts.get(type) ?? 0) + 1);
  return counts;
}

describe('教学实验装配与真实求解', () => {
  it('蓝色 LED 在 20–25 mA 之间不能被误判为安全电流', () => {
    const circuit = buildLabCircuit('led', true);
    circuit.components.find(c => c.type === 'led')!.params.color = 'blue';
    circuit.components.find(c => c.type === 'resistor')!.params.resistance = 80;
    const context: LabContext = { ...circuit, result: simulateCircuit(circuit), measurements: [], transient: { running: false, time: 0, samples: 0, lastCapacitorVoltage: 0 } };
    const led = circuit.components.find(c => c.type === 'led')!;
    expect(context.result.elements[led.id].current).toBeGreaterThan(0.02);
    expect(context.result.elements[led.id].current).toBeLessThan(0.025);
    expect(LABS.find(l => l.id === 'led')!.steps.find(s => s.id === 'safe')!.check(context).done).toBe(false);
  });
  for (const lab of LABS) {
    it(`${lab.index} ${lab.title} 的示范接线可以求解，且覆盖完整器材清单`, () => {
      const built = buildLabCircuit(lab.id, true);
      const result = simulateCircuit(built);
      expect(built.wires.length).toBeGreaterThan(0);
      expect(result.solved).toBe(true);
      expect(result.status).toBe('ok');
      const counts = requiredCounts(lab.kit);
      for (const [type, count] of counts) {
        expect(built.components.filter((component) => component.type === type)).toHaveLength(count);
      }
      for (const element of Object.values(result.elements)) {
        expect(Number.isFinite(element.current)).toBe(true);
        expect(Number.isFinite(element.voltage)).toBe(true);
        expect(Number.isFinite(element.power)).toBe(true);
      }
      if (lab.id === 'ohms-law') {
        const resistor = built.components.find((component) => component.type === 'resistor')!;
        const current = result.elements[resistor.id].current;
        expect(Math.abs(current - 0.006)).toBeLessThan(2e-4);
      }
      if (lab.id === 'led') {
        const led = built.components.find((component) => component.type === 'led')!;
        expect(result.elements[led.id].flags?.on).toBe(true);
        expect(result.elements[led.id].brightness ?? 0).toBeGreaterThan(0.2);
      }
      if (lab.id === 'kirchhoff') {
        const context: LabContext = {
          components: built.components,
          wires: built.wires,
          result,
          measurements: [],
          transient: { running: false, time: 0, samples: 0, lastCapacitorVoltage: 0 },
        };
        expect(lab.steps[1].check(context).done).toBe(true);
      }
      if (lab.id === 'rc') {
        const capacitor = built.components.find((component) => component.type === 'capacitor')!;
        let voltage = 0;
        for (let step = 0; step < 20; step += 1) {
          const transient = simulateCircuit(built, {
            transient: {
              capacitorVoltages: { [capacitor.id]: voltage },
              dt: 0.02,
              time: (step + 1) * 0.02,
            },
          });
          voltage = transient.capacitorVoltages?.[capacitor.id] ?? voltage;
        }
        expect(voltage).toBeGreaterThan(1);
      }
    });
  }

  it('E01 完成接线并记录数据后，全部教学检查通过', () => {
    const lab = LABS.find((item) => item.id === 'ohms-law')!;
    const built = buildLabCircuit('ohms-law', true);
    const result = simulateCircuit(built);
    const voltmeter = built.components.find((component) => component.type === 'voltmeter')!;
    const ammeter = built.components.find((component) => component.type === 'ammeter')!;
    const voltage = result.elements[voltmeter.id].reading!;
    const current = result.elements[ammeter.id].reading!;
    const context: LabContext = {
      components: built.components,
      wires: built.wires,
      result,
      measurements: [
        {
          id: 'm1',
          labId: 'ohms-law',
          createdAt: Date.now(),
          label: '测试记录',
          voltage,
          current,
          resistance: Math.abs(voltage / current),
        },
      ],
      transient: { running: false, time: 0, samples: 0, lastCapacitorVoltage: 0 },
    };
    const checks = lab.steps.map((step) => step.check(context));
    expect(checks.every((check) => check.done)).toBe(true);
  });

  it('空教学台只满足器材存在类检查，不会误报实验完成', () => {
    const lab = LABS[0];
    const built = buildLabCircuit('ohms-law', false);
    const result = simulateCircuit(built);
    const context: LabContext = {
      components: built.components,
      wires: built.wires,
      result,
      measurements: [],
      transient: { running: false, time: 0, samples: 0, lastCapacitorVoltage: 0 },
    };
    const checks = lab.steps.map((step) => step.check(context));
    expect(checks[0].done).toBe(true);
    expect(checks.slice(1).every((check) => !check.done)).toBe(true);
  });

  it('所有教学实验都能构建出完整器材清单（未接线时）', () => {
    for (const lab of LABS) {
      const built = buildLabCircuit(lab.id, false);
      expect(built.components.length).toBe(lab.kit.length);
      expect(built.wires).toHaveLength(0);
      const result = simulateCircuit(built);
      expect(result.solved).toBe(true);
      for (const type of new Set(lab.kit)) {
        expect(COMPONENT_DEFINITIONS[type]).toBeDefined();
      }
    }
  });
});
