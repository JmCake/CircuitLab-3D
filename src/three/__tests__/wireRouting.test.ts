import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createDefaultParams, getDefinition, type LabComponent } from '../../circuit';
import { buildLabCircuit, LABS, COURSE_LABS } from '../../experiments/labs';
import { createWireRoutingScene, getWireAttachment, routeWire, WIRE_RADIUS, type RoutedWire } from '../wireRouting';

const box = (id: string, x = 0, z = 0, rotationY = 0, type: LabComponent['type'] = 'resistor-box'): LabComponent => ({
  id, type, name: id, position: [x, z], rotationY, params: createDefaultParams(type),
});
const anchor = (x: number, y: number, z: number, normal: [number, number, number]) => ({ pathPoint: new THREE.Vector3(x, y, z), normal: new THREE.Vector3(...normal) });

// Independently sample the rendered centreline in each instrument's local frame, allowing for tube radius.
function verifyClear(route: RoutedWire, components: LabComponent[]) {
  const points = route.curve.getSpacedPoints(Math.ceil(route.curve.getLength() / 0.001));
  let deskClearance = Infinity;
  const closest = new Map<string, { clearance: number; point: number[] }>();
  for (const p of points) {
    deskClearance = Math.min(deskClearance, p.y);
    for (const c of components) {
      const d = getDefinition(c.type);
      const dx = p.x - c.position[0];
      const dz = p.z - c.position[1];
      const x = dx * Math.cos(c.rotationY) - dz * Math.sin(c.rotationY);
      const z = dx * Math.sin(c.rotationY) + dz * Math.cos(c.rotationY);
      const outside = Math.max(Math.abs(x) - d.footprint[0] / 2, Math.abs(z) - d.footprint[1] / 2,
        p.y - d.height - (c.type === 'breadboard' ? 0 : 0.025), -p.y);
      if (outside < (closest.get(c.id)?.clearance ?? Infinity)) closest.set(c.id, { clearance: outside, point: p.toArray() });
    }
  }
  expect(deskClearance).toBeGreaterThanOrEqual(WIRE_RADIUS);
  for (const [id, nearest] of closest) expect(nearest.clearance, `${id} collision at ${nearest.point}`).toBeGreaterThan(WIRE_RADIUS + 0.004);
}
describe('导线三维避障与圆角安全', () => {
  it('无遮挡的短线以连续缓弧拱起，保持插头出线切向', () => {
    const from = anchor(-0.18, 0.04, 0, [0, 0, 1]), to = anchor(0.18, 0.04, 0, [0, 0, 1]);
    const route = routeWire(createWireRoutingScene([]), from, to)!;
    expect(route.mode).toBe('direct');
    expect(Math.max(...route.curve.getSpacedPoints(100).map(p => p.y))).toBeGreaterThan(0.055);
    expect(Math.min(...route.curve.getSpacedPoints(100).map(p => p.y))).toBeGreaterThanOrEqual(0.04);
    expect(route.curve.getTangent(0).dot(from.normal)).toBeGreaterThan(0.999);
    expect(route.curve.getTangent(1).dot(to.normal)).toBeLessThan(-0.999);
    const join = route.curve.curves[0].getTangent(1).dot(route.curve.curves[1].getTangent(0));
    expect(join).toBeGreaterThan(0.99999);
  });
  it('交换短线两端不改变导线形状', () => {
    const from = anchor(-0.18, 0.04, 0, [0, 0, 1]), to = anchor(0.18, 0.07, 0.1, [0, 0, 1]);
    const scene = createWireRoutingScene([]);
    const forward = routeWire(scene, from, to)!, reverse = routeWire(scene, to, from)!;
    for (let i = 0; i <= 20; i++) expect(forward.curve.getPoint(i / 20).distanceTo(reverse.curve.getPoint(1 - i / 20))).toBeLessThan(1e-6);
  });
  it('避开机箱占位之外凸出的接线柱金属头', () => {
    const components = [box('switch-posts', 0, 0, 0, 'switch')];
    const route = routeWire(createWireRoutingScene(components), anchor(-0.6, 0.03, 0.104, [1, 0, 0]), anchor(0.6, 0.03, 0.104, [-1, 0, 0]));
    expect(route).not.toBeNull();
    expect(route!.mode).not.toBe('direct');
    verifyClear(route!, components);
  });
  it('直达路径被实验箱截断时绕行，平滑后仍不穿过箱体', () => {
    const components = [box('obstacle')];
    const route = routeWire(createWireRoutingScene(components), anchor(-0.65, 0.06, 0, [1, 0, 0]), anchor(0.65, 0.06, 0, [-1, 0, 0]));
    expect(route).not.toBeNull();
    expect(route!.mode).toBe('desk');
    verifyClear(route!, components);
  });
  it.each([Math.PI / 12, Math.PI / 4, Math.PI / 2, -Math.PI / 3])('处理旋转 %s rad 的实验箱', rotation => {
    const components = [box('rotated', 0, 0, rotation)];
    const route = routeWire(createWireRoutingScene(components), anchor(-0.7, 0.06, 0, [1, 0, 0]), anchor(0.7, 0.06, 0, [-1, 0, 0]));
    expect(route).not.toBeNull();
    verifyClear(route!, components);
  });
  it('第三件无接线器材移入导线路径后也会改变路线', () => {
    const start = anchor(-0.7, 0.06, 0, [1, 0, 0]);
    const end = anchor(0.7, 0.06, 0, [-1, 0, 0]);
    const before = routeWire(createWireRoutingScene([box('mover', 0, 0.4)]), start, end)!;
    const after = routeWire(createWireRoutingScene([box('mover')]), start, end)!;
    expect(before.mode).toBe('direct');
    expect(after.curve.getSpacedPoints(32).map(p => p.toArray())).not.toEqual(before.curve.getSpacedPoints(32).map(p => p.toArray()));
    verifyClear(after, [box('mover')]);
  });
  it('仪器堵住桌面通道时可以从上方绕过', () => {
    const components = [-0.65, -0.4, -0.15, 0.1, 0.35, 0.6].map((z, i) => box(`wall-${i}`, 0, z));
    const route = routeWire(createWireRoutingScene(components), anchor(-0.7, 0.06, 0, [1, 0, 0]), anchor(0.7, 0.06, 0, [-1, 0, 0]));
    expect(route?.mode).toBe('overhead');
    verifyClear(route!, components);
  });
  it('面包板跳线从顶部出线，不向下穿过底板', () => {
    const components = [box('board', 0, 0, 0, 'breadboard')];
    const from = getWireAttachment(components, 'board:c0r0')!;
    const to = getWireAttachment(components, 'board:c4r3')!;
    const route = routeWire(createWireRoutingScene(components), from, to)!;
    expect(route).not.toBeNull();
    verifyClear(route, components);
  });
  it('保持端子处的出线方向和端点，允许三层插头堆叠', () => {
    const components = [box('source', -0.5, -0.1, 0.4, 'power-supply'), box('load', 0.4, 0.15)];
    for (let slot = 0; slot < 3; slot++) {
      const from = getWireAttachment(components, 'source:positive', slot)!;
      const to = getWireAttachment(components, 'load:a', slot)!;
      const route = routeWire(createWireRoutingScene(components), from, to)!;
      expect(route).not.toBeNull();
      expect(route.curve.getPoint(0).distanceTo(from.pathPoint)).toBeLessThan(1e-8);
      expect(route.curve.getPoint(1).distanceTo(to.pathPoint)).toBeLessThan(1e-8);
      expect(route.curve.getTangent(0).dot(from.normal)).toBeGreaterThan(0.999);
      expect(route.curve.getTangent(1).dot(to.normal)).toBeLessThan(-0.999);
      verifyClear(route, components);
    }
  });
  it('接线柱被另一件器材完全覆盖时返回受阻状态，不生成穿模路径', () => {
    const components = [box('cover')];
    expect(routeWire(createWireRoutingScene(components), anchor(0, 0.05, 0, [0, 0, 1]), anchor(0.7, 0.06, 0, [-1, 0, 0]))).toBeNull();
  });
  for (const lab of [...LABS, ...COURSE_LABS.filter(c => !LABS.some(l => l.id === c.id))]) {
    it(`${lab.index} 全部示范导线避开每件器材`, () => {
      const circuit = buildLabCircuit(lab.id, true);
      const scene = createWireRoutingScene(circuit.components);
      const slots = new Map<string, number>();
      for (const wire of circuit.wires) {
        const attachment = (id: string) => { const slot = slots.get(id) ?? 0; slots.set(id, slot + 1); return getWireAttachment(circuit.components, id, slot)!; };
        const from = attachment(wire.fromPortId);
        const to = attachment(wire.toPortId);
        const route = routeWire(scene, from, to);
        expect(route, wire.id).not.toBeNull();
        verifyClear(route!, circuit.components);
      }
    });
  }
});
