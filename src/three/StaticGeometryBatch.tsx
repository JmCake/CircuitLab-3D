import { useLayoutEffect, useRef, type ReactNode } from 'react';
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/** Batch only the static room. Transparent labels and all interactive instruments stay separate. */
export function StaticGeometryBatch({ children }: { children: ReactNode }) {
  const root = useRef<THREE.Group>(null);
  useLayoutEffect(() => {
    const group = root.current;
    if (!group) return;
    group.updateWorldMatrix(true, true);
    const inverse = group.matrixWorld.clone().invert();
    const batches = new Map<string, { material: THREE.Material; geometries: THREE.BufferGeometry[]; meshes: THREE.Mesh[] }>();
    group.traverse(object => {
      if (!(object instanceof THREE.Mesh) || Array.isArray(object.material) || object.material.transparent || !object.visible) return;
      const geometry = object.geometry.index ? object.geometry.toNonIndexed() : object.geometry.clone();
      geometry.applyMatrix4(inverse.clone().multiply(object.matrixWorld));
      const signature = `${object.material.uuid}:${object.castShadow}:${object.receiveShadow}:${Object.keys(geometry.attributes).sort().join(',')}`;
      let batch = batches.get(signature);
      if (!batch) { batch = { material: object.material, geometries: [], meshes: [] }; batches.set(signature, batch); }
      batch.geometries.push(geometry);
      batch.meshes.push(object);
    });
    const merged: THREE.Mesh[] = [];
    const hidden: THREE.Mesh[] = [];
    for (const batch of batches.values()) {
      if (batch.meshes.length > 1) {
        const geometry = mergeGeometries(batch.geometries, false);
        if (geometry) {
          const mesh = new THREE.Mesh(geometry, batch.material);
          mesh.castShadow = batch.meshes[0].castShadow;
          mesh.receiveShadow = batch.meshes[0].receiveShadow;
          group.add(mesh);
          merged.push(mesh);
          for (const original of batch.meshes) { original.visible = false; hidden.push(original); }
        }
      }
      batch.geometries.forEach(g => g.dispose());
    }
    return () => {
      for (const mesh of merged) { group.remove(mesh); mesh.geometry.dispose(); }
      for (const mesh of hidden) mesh.visible = true;
    };
  }, []);
  return <group ref={root}>{children}</group>;
}
