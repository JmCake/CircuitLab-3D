import * as THREE from 'three';
import { BENCH, findPortOwner, getDefinition, getPortWorldNormal, getPortWorldPosition, type LabComponent } from '../circuit';

export const WIRE_RADIUS = 0.0033;
const CLEARANCE = WIRE_RADIUS + 0.006;
const CORNER_CLEARANCE = 0.03;
const DESK_Y = 0.009;
const LEAD_LENGTH = 0.035;
const ROUNDING = 0.09;

export interface WireAttachment {
  pathPoint: THREE.Vector3;
  plugPoint: THREE.Vector3;
  normal: THREE.Vector3;
  isHole: boolean;
}
export interface WireObstacle {
  id: string;
  x: number;
  z: number;
  cos: number;
  sin: number;
  halfX: number;
  halfZ: number;
  height: number;
}
export interface WireRoutingScene {
  obstacles: WireObstacle[];
  floorNodes: THREE.Vector3[];
  floorEdges: { to: number; cost: number }[][];
}
export interface RoutedWire {
  curve: THREE.CurvePath<THREE.Vector3>;
  mode: 'direct' | 'desk' | 'overhead';
  segments: number;
}

export function getWireAttachment(components: LabComponent[], portId: string, stackIndex = 0): WireAttachment | null {
  const owner = findPortOwner(components, portId);
  if (!owner) return null;
  const port = getDefinition(owner.component.type).ports.find(p => p.key === owner.portKey)!;
  const world = getPortWorldPosition(owner.component, owner.portKey);
  if (!world) return null;
  const normal = new THREE.Vector3(...getPortWorldNormal(owner.component, owner.portKey)).normalize();
  const isHole = port.role === 'hole' || port.visible === false;
  const stack = isHole ? 0 : Math.max(0, stackIndex) * 0.024;
  const point = new THREE.Vector3(...world);
  return { normal, isHole,
    pathPoint: point.clone().addScaledVector(normal, (isHole ? 0.028 : 0.057) + stack),
    plugPoint: point.clone().addScaledVector(normal, (isHole ? 0.001 : 0.012) + stack) };
}

function localPoint(p: THREE.Vector3, box: WireObstacle): [number, number, number] {
  const dx = p.x - box.x;
  const dz = p.z - box.z;
  return [dx * box.cos - dz * box.sin, p.y, dx * box.sin + dz * box.cos];
}

/** Segment vs expanded oriented box, not just vertex/endpoint overlap. */
export function segmentHitsObstacle(a: THREE.Vector3, b: THREE.Vector3, box: WireObstacle, margin = CLEARANCE): boolean {
  const start = localPoint(a, box);
  const end = localPoint(b, box);
  const min = [-box.halfX - margin, -margin, -box.halfZ - margin];
  const max = [box.halfX + margin, box.height + margin, box.halfZ + margin];
  let near = 0;
  let far = 1;
  for (let i = 0; i < 3; i++) {
    const d = end[i] - start[i];
    if (Math.abs(d) < 1e-10) {
      if (start[i] <= min[i] || start[i] >= max[i]) return false;
    } else {
      const t1 = (min[i] - start[i]) / d;
      const t2 = (max[i] - start[i]) / d;
      near = Math.max(near, Math.min(t1, t2));
      far = Math.min(far, Math.max(t1, t2));
      if (near >= far - 1e-10) return false;
    }
  }
  return true;
}
function clearSegment(a: THREE.Vector3, b: THREE.Vector3, obstacles: WireObstacle[], margin = CLEARANCE): boolean {
  return !obstacles.some(box => segmentHitsObstacle(a, b, box, margin));
}
function onDesk(p: THREE.Vector3) {
  return Math.abs(p.x) <= BENCH.width / 2 - 0.01 && Math.abs(p.z) <= BENCH.depth / 2 - 0.01;
}

/** Shared visibility graph, rebuilt when ANY instrument moves/rotates, reused by all leads. */
export function createWireRoutingScene(components: LabComponent[]): WireRoutingScene {
  const obstacles = components.map(c => {
    const d = getDefinition(c.type);
    const cos = Math.cos(c.rotationY);
    const sin = Math.sin(c.rotationY);
    let minX = -d.footprint[0] / 2;
    let maxX = d.footprint[0] / 2;
    let minZ = -d.footprint[1] / 2;
    let maxZ = d.footprint[1] / 2;
    // Banana posts protrude beyond the catalogue footprint. Include their collars and metal tips.
    for (const port of d.ports) {
      if (port.visible === false || port.role === 'hole') continue;
      const normal = port.normal ?? [0, 0, 1];
      const extentX = Math.abs(normal[0]) * 0.027 + (1 - Math.abs(normal[0])) * 0.022;
      const extentZ = Math.abs(normal[2]) * 0.027 + (1 - Math.abs(normal[2])) * 0.022;
      minX = Math.min(minX, port.position[0] + Math.min(0, normal[0] * extentX) - (normal[0] ? 0 : extentX));
      maxX = Math.max(maxX, port.position[0] + Math.max(0, normal[0] * extentX) + (normal[0] ? 0 : extentX));
      minZ = Math.min(minZ, port.position[2] + Math.min(0, normal[2] * extentZ) - (normal[2] ? 0 : extentZ));
      maxZ = Math.max(maxZ, port.position[2] + Math.max(0, normal[2] * extentZ) + (normal[2] ? 0 : extentZ));
    }
    const centerX = (minX + maxX) / 2;
    const centerZ = (minZ + maxZ) / 2;
    return { id: c.id, x: c.position[0] + centerX * cos + centerZ * sin, z: c.position[1] - centerX * sin + centerZ * cos, cos, sin,
      halfX: (maxX - minX) / 2, halfZ: (maxZ - minZ) / 2,
      // Board sockets exit upwards; the board's catalogue height already encloses the substrate.
      height: d.height + (c.type === 'breadboard' ? 0 : 0.025) };
  });
  const floorNodes: THREE.Vector3[] = [];
  for (const box of obstacles) {
    for (const x of [-box.halfX - CORNER_CLEARANCE, box.halfX + CORNER_CLEARANCE]) {
      for (const z of [-box.halfZ - CORNER_CLEARANCE, box.halfZ + CORNER_CLEARANCE]) {
        const p = new THREE.Vector3(box.x + x * box.cos + z * box.sin, DESK_Y, box.z - x * box.sin + z * box.cos);
        if (onDesk(p) && clearSegment(p, p, obstacles)) floorNodes.push(p);
      }
    }
  }
  for (const x of [-BENCH.width / 2 + 0.014, BENCH.width / 2 - 0.014]) {
    for (const z of [-BENCH.depth / 2 + 0.014, BENCH.depth / 2 - 0.014]) {
      const p = new THREE.Vector3(x, DESK_Y, z);
      if (clearSegment(p, p, obstacles)) floorNodes.push(p);
    }
  }
  const floorEdges = floorNodes.map(() => [] as { to: number; cost: number }[]);
  for (let i = 0; i < floorNodes.length; i++) {
    for (let j = 0; j < i; j++) {
      if (!clearSegment(floorNodes[i], floorNodes[j], obstacles)) continue;
      const cost = floorNodes[i].distanceTo(floorNodes[j]);
      floorEdges[i].push({ to: j, cost });
      floorEdges[j].push({ to: i, cost });
    }
  }
  return { obstacles, floorNodes, floorEdges };
}

function simplify(points: THREE.Vector3[]) {
  const result: THREE.Vector3[] = [];
  for (const p of points) {
    if (!result.length || result[result.length - 1].distanceToSquared(p) > 1e-10) result.push(p.clone());
  }
  return result;
}
function roundedPath(input: THREE.Vector3[], radius: number) {
  const points = simplify(input);
  const path = new THREE.CurvePath<THREE.Vector3>();
  let cursor = points[0];
  for (let i = 1; i < points.length - 1; i++) {
    const previous = points[i - 1];
    const corner = points[i];
    const next = points[i + 1];
    const trim = Math.min(radius, previous.distanceTo(corner) * 0.35, next.distanceTo(corner) * 0.35);
    const a = corner.clone().addScaledVector(previous.clone().sub(corner).normalize(), trim);
    const b = corner.clone().addScaledVector(next.clone().sub(corner).normalize(), trim);
    if (cursor.distanceToSquared(a) > 1e-12) path.add(new THREE.LineCurve3(cursor, a));
    if (trim > 1e-6) path.add(new THREE.QuadraticBezierCurve3(a, corner, b));
    cursor = b;
  }
  const end = points[points.length - 1];
  if (cursor.distanceToSquared(end) > 1e-12) path.add(new THREE.LineCurve3(cursor, end));
  return path;
}

/** Check the rounded curves too: a Catmull-Rom shortcut can cut through an otherwise safe corner. */
export function curveIsClear(curve: THREE.CurvePath<THREE.Vector3>, scene: WireRoutingScene): boolean {
  for (const part of curve.curves) {
    const samples = part instanceof THREE.LineCurve3 ? [part.v1, part.v2] : part.getPoints(Math.min(256, Math.max(16, Math.ceil(part.getLength() / 0.004))));
    for (let i = 1; i < samples.length; i++) {
      if (samples[i].y < WIRE_RADIUS || !clearSegment(samples[i - 1], samples[i], scene.obstacles, CLEARANCE + 0.0003)) return false;
    }
  }
  return curve.curves.length > 0;
}
function finish(points: THREE.Vector3[], scene: WireRoutingScene, mode: RoutedWire['mode']): RoutedWire | null {
  for (const radius of [ROUNDING, ROUNDING / 2, 0.018, 0.009, 0]) {
    const curve = roundedPath(points, radius);
    if (curveIsClear(curve, scene)) return { curve, mode, segments: Math.min(280, Math.max(48, Math.ceil(curve.getLength() / 0.006))) };
  }
  return null;
}
function chainClear(points: THREE.Vector3[], obstacles: WireObstacle[]) {
  return points.every((p, i) => !i || clearSegment(points[i - 1], p, obstacles));
}
function chainLength(points: THREE.Vector3[]) {
  return points.reduce((sum, p, i) => sum + (i ? p.distanceTo(points[i - 1]) : 0), 0);
}

/** A relaxed lead has two continuous bends, following each plug before gently arching between them.
 * Test the whole curved span against every enclosure; the desktop planner remains the fallback.
 */
function relaxedSpan(scene: WireRoutingScene, start: Pick<WireAttachment, 'pathPoint' | 'normal'>, end: Pick<WireAttachment, 'pathPoint' | 'normal'>): RoutedWire | null {
  const a = start.pathPoint, b = end.pathPoint;
  const distance = a.distanceTo(b);
  if (distance < 0.018) return null;
  const tangent = b.clone().sub(a).normalize();
  for (const scale of [1, 0.65]) {
    const handle = Math.min(0.16, Math.max(0.028, distance * 0.28)) * scale;
    const middle = a.clone().lerp(b, 0.5);
    middle.y += Math.min(0.045, 0.014 + distance * 0.025) * scale;
    // Keep the relaxed loop in front of front-facing sockets, without random lateral jitter.
    middle.addScaledVector(start.normal.clone().add(end.normal).setY(0), handle * 0.25);
    const middleHandle = distance * 0.22;
    const curve = new THREE.CurvePath<THREE.Vector3>();
    curve.add(new THREE.CubicBezierCurve3(a, a.clone().addScaledVector(start.normal, handle), middle.clone().addScaledVector(tangent, -middleHandle), middle));
    curve.add(new THREE.CubicBezierCurve3(middle, middle.clone().addScaledVector(tangent, middleHandle), b.clone().addScaledVector(end.normal, handle), b));
    if (curveIsClear(curve, scene)) return { curve, mode: 'direct', segments: Math.min(280, Math.max(48, Math.ceil(curve.getLength() / 0.006))) };
  }
  return null;
}

export function routeWire(scene: WireRoutingScene, start: Pick<WireAttachment, 'pathPoint' | 'normal'>, end: Pick<WireAttachment, 'pathPoint' | 'normal'>): RoutedWire | null {
  const a = start.pathPoint;
  const b = end.pathPoint;
  const escape = (point: THREE.Vector3, normal: THREE.Vector3) => {
    for (const length of [LEAD_LENGTH, 0.02, 0.01, 0.004]) {
      const lead = point.clone().addScaledVector(normal, length);
      if (clearSegment(point, lead, scene.obstacles)) return lead;
    }
    return null;
  };
  const leadA = escape(a, start.normal);
  const leadB = escape(b, end.normal);
  // An instrument covering a socket makes that physical connection impossible. Never draw through it.
  if (!leadA || !leadB) return null;
  const relaxed = relaxedSpan(scene, start, end);
  if (relaxed) return relaxed;
  const middle = a.clone().lerp(b, 0.5);
  middle.y = DESK_Y;
  const direct = finish([a, leadA, middle, leadB, b], scene, 'direct');
  if (direct) return direct;
  // Jumper wires on a breadboard may stay above the board rather than descending through its body.
  if (start.normal.y > 0.5 && end.normal.y > 0.5) {
    const jumper = finish([a, leadA, leadB, b], scene, 'direct');
    if (jumper) return jumper;
  }

  const nodes = [...scene.floorNodes];
  const edges = scene.floorEdges.map(e => [...e]);
  for (const lead of [leadA, leadB]) {
    const p = new THREE.Vector3(lead.x, DESK_Y, lead.z);
    if (!onDesk(p) || !clearSegment(p, p, scene.obstacles)) continue;
    const index = nodes.length;
    edges.push([]);
    for (let i = 0; i < nodes.length; i++) {
      if (!clearSegment(p, nodes[i], scene.obstacles)) continue;
      const cost = p.distanceTo(nodes[i]);
      edges[index].push({ to: i, cost });
      edges[i].push({ to: index, cost });
    }
    nodes.push(p);
  }
  const gateway = (point: THREE.Vector3, lead: THREE.Vector3, ground: THREE.Vector3) => {
    const path = simplify([point, lead, new THREE.Vector3(ground.x, lead.y, ground.z), ground]);
    return chainClear(path, scene.obstacles) ? path : null;
  };
  const from = nodes.map(n => gateway(a, leadA, n));
  const to = nodes.map(n => gateway(b, leadB, n));
  const distances = from.map(path => path ? chainLength(path) : Infinity);
  const previous = nodes.map(() => -1);
  const visited = nodes.map(() => false);
  for (let step = 0; step < nodes.length; step++) {
    let next = -1;
    for (let i = 0; i < nodes.length; i++) if (!visited[i] && Number.isFinite(distances[i]) && (next < 0 || distances[i] < distances[next])) next = i;
    if (next < 0) break;
    visited[next] = true;
    for (const edge of edges[next]) {
      if (distances[next] + edge.cost < distances[edge.to]) {
        distances[edge.to] = distances[next] + edge.cost;
        previous[edge.to] = next;
      }
    }
  }
  let best = -1;
  let total = Infinity;
  for (let i = 0; i < nodes.length; i++) {
    const tail = to[i];
    if (tail && distances[i] + chainLength(tail) < total) { total = distances[i] + chainLength(tail); best = i; }
  }
  if (best >= 0) {
    const chain = [best];
    while (previous[chain[0]] >= 0) chain.unshift(previous[chain[0]]);
    const path = [...from[chain[0]]!, ...chain.slice(1).map(i => nodes[i]), ...to[best]!.slice(0, -1).reverse()];
    const routed = finish(path, scene, 'desk');
    if (routed) return routed;
  }
  // A wall of instruments can block every desktop passage. Cross safely above their full envelopes.
  const height = Math.max(a.y, b.y, ...scene.obstacles.map(o => o.height)) + 0.065;
  return finish([a, leadA, new THREE.Vector3(leadA.x, height, leadA.z), new THREE.Vector3(leadB.x, height, leadB.z), leadB, b], scene, 'overhead');
}
