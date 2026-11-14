import * as THREE from 'three';
import { WIRE_RADIUS } from './wireRouting';

/** Development-only scene reference; production does not mount the diagnostic API. */
export const wireInspection = { scene: null as THREE.Scene | null };

/** Inspect the actual rendered TubeGeometry against actual instrument triangles, not routing boxes. */
export function inspectRenderedWires() {
  const scene = wireInspection.scene;
  if (!scene) return null;
  scene.updateMatrixWorld(true);
  const bodies: { mesh: THREE.Mesh; componentId: string; bounds: THREE.Box3 }[] = [];
  const wires: THREE.Mesh<THREE.TubeGeometry>[] = [];
  scene.traverse(object => {
    if (object.userData.componentId && object instanceof THREE.Group) {
      const componentId = String(object.userData.componentId);
      object.traverse(child => {
        if (!(child instanceof THREE.Mesh) || child.userData.skipShadow || !child.visible) return;
        const materials = Array.isArray(child.material) ? child.material : [child.material];
        if (materials.every(m => !m.visible || (m.transparent && m.opacity < 0.25))) return;
        bodies.push({ mesh: child, componentId, bounds: new THREE.Box3().setFromObject(child) });
      });
    }
    if (object instanceof THREE.Mesh && object.geometry instanceof THREE.TubeGeometry && object.userData.wireId && object.userData.routingMode) wires.push(object);
  });
  const ray = new THREE.Raycaster();
  const hitPoint = new THREE.Vector3();
  const collisions: { wireId: string; componentId: string; position: number[] }[] = [];
  const offsets = [new THREE.Vector3(), ...[0, 1, 2].flatMap(axis => [-1, 1].map(sign => new THREE.Vector3().setComponent(axis, sign * WIRE_RADIUS)))];
  const paths = wires.map(wire => {
    const points = wire.geometry.parameters.path.getSpacedPoints(wire.geometry.parameters.tubularSegments).map(p => p.applyMatrix4(wire.matrixWorld));
    const seen = new Set<string>();
    for (let i = 1; i < points.length; i++) {
      const direction = points[i].clone().sub(points[i - 1]);
      const distance = direction.length();
      if (distance < 1e-8) continue;
      direction.divideScalar(distance);
      for (const offset of offsets) {
        const origin = points[i - 1].clone().add(offset);
        ray.set(origin, direction);
        ray.near = 0.00001;
        ray.far = distance;
        for (const body of bodies) {
          if (seen.has(body.componentId)) continue;
          if (!body.bounds.containsPoint(origin)) {
            if (!ray.ray.intersectBox(body.bounds, hitPoint) || origin.distanceTo(hitPoint) > distance) continue;
          }
          const hit = ray.intersectObject(body.mesh, false)[0];
          if (hit) {
            seen.add(body.componentId);
            collisions.push({ wireId: String(wire.userData.wireId), componentId: body.componentId, position: hit.point.toArray() });
          }
        }
      }
    }
    let hash = 0;
    for (const point of points) for (const v of point.toArray()) hash = Math.imul(hash, 31) + Math.round(v * 1e6) | 0;
    return { id: String(wire.userData.wireId), mode: String(wire.userData.routingMode), fingerprint: hash, vertices: wire.geometry.getAttribute('position').count };
  });
  return { wires: paths, collisions, bodyMeshes: bodies.length };
}
