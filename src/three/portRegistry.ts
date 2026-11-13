import * as THREE from 'three';

/**
 * 可拾取端口注册表。真实端口锚点由电路域中的局部坐标决定；
 * 这里只保存用于射线检测的透明命中体，不保存电气连接关系。
 */
const targets = new Map<string, THREE.Object3D>();

export function registerPortTarget(portId: string, object: THREE.Object3D | null): void {
  if (!object) {
    targets.delete(portId);
    return;
  }
  object.userData.portId = portId;
  object.userData.interactive = 'port';
  targets.set(portId, object);
}

export function unregisterPortTarget(portId: string, object?: THREE.Object3D | null): void {
  const current = targets.get(portId);
  if (!current) return;
  if (object && current !== object) return;
  targets.delete(portId);
}

export function getPortTargets(): THREE.Object3D[] {
  return Array.from(targets.values());
}

export function getPortTarget(portId: string): THREE.Object3D | undefined {
  return targets.get(portId);
}
