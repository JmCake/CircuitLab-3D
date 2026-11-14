import { describe, expect, it } from 'vitest';
import { buildLabCircuit, COURSE_LABS, LABS } from '../labs';
import { footprintGap } from '../benchLayout';
import { BENCH, getDefinition } from '../../circuit';
import { createWireRoutingScene, curveIsClear, routeWires } from '../../three/wireRouting';

describe('课堂器材间距与成组走线', () => {
  for (const lab of [...LABS, ...COURSE_LABS.filter(c => !LABS.some(l => l.id === c.id))]) {
    it(`${lab.id} 留出操作间距，整组走线保持安全端点`, () => {
      const { components, wires } = buildLabCircuit(lab.id, true);
      for (const [i, c] of components.entries()) {
        for (const other of components.slice(i + 1)) expect(footprintGap(c, other), `${c.id}/${other.id}`).toBeGreaterThanOrEqual(0.12);
        const [w, d] = getDefinition(c.type).footprint;
        expect(Math.abs(c.position[0]) + w / 2).toBeLessThan(BENCH.width / 2 - 0.04);
        expect(Math.abs(c.position[1]) + d / 2).toBeLessThan(BENCH.depth / 2 - 0.04);
      }
      const scene = createWireRoutingScene(components);
      for (const lead of routeWires(components, wires, scene)) {
        expect(lead.route, lead.wire.id).not.toBeNull();
        expect(curveIsClear(lead.route!.curve, scene), lead.wire.id).toBe(true);
        expect(lead.route!.curve.getPoint(0).distanceTo(lead.from!.pathPoint)).toBeLessThan(1e-7);
        expect(lead.route!.curve.getPoint(1).distanceTo(lead.to!.pathPoint)).toBeLessThan(1e-7);
      }
    });
  }
  it('三相相色跟随串联电流表，电压表的红黑表笔保持可辨', () => {
    const { wires } = buildLabCircuit('three-phase-delta', true);
    const color = (n: number) => wires[n - 1].color;
    expect(color(1)).toBe(color(2)); expect(color(2)).toBe(color(3));
    expect(new Set([color(1), color(4), color(6)]).size).toBe(3);
    expect(color(8)).not.toBe(color(9));
  });
});
