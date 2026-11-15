import { useEffect, useRef } from 'react';
import { OrbitControls } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { useLabStore } from '../store/labStore';
import { getDefinition } from '../circuit';
import { cameraBridge } from './cameraBridge';
import { useViewStore } from '../store/viewStore';

const DEFAULT_POSITION = new THREE.Vector3(0.64, 0.78, 1.62);
const DEFAULT_TARGET = new THREE.Vector3(0, 0.12, -0.02);
/**
 * 实验室四壁内表面在 ±3.95 m、天花板 2.4 m。相机与观察中心的距离一旦超过 4 m，
 * 就会退到前墙之外，整屏只剩一片米色墙面。所有取景与缩放都必须留出这段余量。
 */
const MAX_VIEW_DISTANCE = 3.4;

interface CameraTween {
  active: boolean;
  elapsed: number;
  duration: number;
  fromPosition: THREE.Vector3;
  toPosition: THREE.Vector3;
  fromTarget: THREE.Vector3;
  toTarget: THREE.Vector3;
}

export function CameraRig() {
  const controlsRef = useRef<OrbitControlsImpl>(null);
  const camera = useThree((state) => state.camera);
  const gl = useThree((state) => state.gl);
  const invalidate = useThree((state) => state.invalidate);
  const aspect = useThree((state) => state.size.width / state.size.height);
  const size = useThree(s => s.size);
  const libraryOpen = useLabStore(s => s.libraryOpen), sideOpen = useViewStore(s => s.sideOpen);
  const layoutKey = useLabStore(state => state.components.map(c => c.id).join('|'));
  const interactionMode = useLabStore((state) => state.interactionMode);
  const panMode = useViewStore(s => s.panMode);
  const tween = useRef<CameraTween>({
    active: false,
    elapsed: 0,
    duration: 0.55,
    fromPosition: new THREE.Vector3(),
    toPosition: new THREE.Vector3(),
    fromTarget: new THREE.Vector3(),
    toTarget: new THREE.Vector3(),
  });

  const startTween = (target: THREE.Vector3, position: THREE.Vector3, duration = 0.55) => {
    const controls = controlsRef.current;
    if (!controls) return;
    tween.current = {
      active: true,
      elapsed: 0,
      duration,
      fromPosition: camera.position.clone(),
      toPosition: position.clone(),
      fromTarget: controls.target.clone(),
      toTarget: target.clone(),
    };
    invalidate();
  };

  useEffect(() => {
    if (!(camera instanceof THREE.PerspectiveCamera)) return;
    // Opening the inspector must not move the ray underneath a held pointer.
    if (interactionMode !== 'idle') return;
    const left = size.width > 760 && libraryOpen ? size.width > 1100 ? 262 : 237 : 0;
    const right = size.width > 760 && sideOpen ? size.width > 1100 ? 402 : 367 : 0;
    camera.setViewOffset(size.width, size.height, (right - left) / 2, 0, size.width, size.height);
    camera.updateProjectionMatrix(); invalidate();
  }, [camera, size, libraryOpen, sideOpen, interactionMode, invalidate]);

  useEffect(() => {
    const frameBench = (preset: 'perspective' | 'top' | 'front') => {
      const components = useLabStore.getState().components;
      const corners: THREE.Vector3[] = [];
      for (const component of components) {
        const d = getDefinition(component.type);
        const rotation = new THREE.Matrix4().makeRotationY(component.rotationY);
        for (const x of [-d.footprint[0] / 2 - 0.02, d.footprint[0] / 2 + 0.02]) {
          for (const z of [-d.footprint[1] / 2 - 0.03, d.footprint[1] / 2 + 0.09]) {
            for (const y of [0, d.height + 0.015]) {
              corners.push(new THREE.Vector3(x, y, z).applyMatrix4(rotation).add(new THREE.Vector3(component.position[0], 0, component.position[1])));
            }
          }
        }
      }
      if (corners.length === 0) { startTween(DEFAULT_TARGET, new THREE.Vector3(1.4, 1.4, 2.4)); return; }
      const bounds = new THREE.Box3().setFromPoints(corners);
      const target = bounds.getCenter(new THREE.Vector3());
      const offset = preset === 'top' ? new THREE.Vector3(0, 1, 0.01)
        : preset === 'front' ? new THREE.Vector3(0, 0.28, 1) : DEFAULT_POSITION.clone().sub(DEFAULT_TARGET);
      const backward = offset.normalize();
      const forward = backward.clone().negate();
      const right = new THREE.Vector3().crossVectors(forward, camera.up).normalize();
      const up = new THREE.Vector3().crossVectors(right, forward).normalize();
      const tanV = Math.tan(THREE.MathUtils.degToRad((camera as THREE.PerspectiveCamera).fov) / 2);
      const ui = useViewStore.getState();
      const margin = size.width > 760 ? (useLabStore.getState().libraryOpen ? size.width > 1100 ? 262 : 237 : 30) + (ui.sideOpen ? size.width > 1100 ? 402 : 367 : 30) : 30;
      const usableAspect = Math.max(0.25, (size.width - margin) / size.height);
      let distance = 1.6;
      for (const corner of corners) {
        const relative = corner.clone().sub(target);
        distance = Math.max(distance, Math.abs(relative.dot(right)) / (tanV * usableAspect * 0.85) - relative.dot(forward),
          Math.abs(relative.dot(up)) / (tanV * 0.76) - relative.dot(forward));
      }
      startTween(target, target.clone().addScaledVector(backward, THREE.MathUtils.clamp(distance, 1.6, MAX_VIEW_DISTANCE)));
    };

    cameraBridge.reset = () => {
      frameBench('perspective');
    };
    cameraBridge.view = (preset) => {
      frameBench(preset);
    };
    frameBench('perspective');
    cameraBridge.focus = (position) => {
      const controls = controlsRef.current;
      if (!controls) return;
      const target = new THREE.Vector3(position[0], 0.085, position[1]);
      const direction = camera.position.clone().sub(controls.target).normalize();
      if (direction.lengthSq() < 0.2) direction.set(0.5, 0.6, 0.62).normalize();
      const distance = 1.12;
      const nextPosition = target.clone().add(direction.multiplyScalar(distance));
      startTween(target, nextPosition, 0.5);
    };
    cameraBridge.pan = (horizontal, vertical) => {
      const controls = controlsRef.current;
      if (!controls) return;
      const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
      const offset = right.multiplyScalar(horizontal).add(new THREE.Vector3(0, vertical, 0));
      startTween(controls.target.clone().add(offset), camera.position.clone().add(offset), 0.18);
    };
    cameraBridge.getPose = () => controlsRef.current ? { position: camera.position.toArray(), target: controlsRef.current.target.toArray() } : null;
    cameraBridge.screenToTable = (clientX, clientY) => {
      const rect = gl.domElement.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return null;
      const ndc = new THREE.Vector2(
        ((clientX - rect.left) / rect.width) * 2 - 1,
        -((clientY - rect.top) / rect.height) * 2 + 1,
      );
      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(ndc, camera);
      const point = new THREE.Vector3();
      if (!raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), point)) {
        return null;
      }
      return [point.x, point.z];
    };
    cameraBridge.worldToScreen = (point) => {
      const rect = gl.domElement.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return null;
      // A demand-rendered camera may have a changed view offset before its next frame.
      if (camera instanceof THREE.PerspectiveCamera) camera.updateProjectionMatrix();
      camera.updateMatrixWorld(true);
      const projected = new THREE.Vector3(...point).project(camera);
      return [
        rect.left + (projected.x * 0.5 + 0.5) * rect.width,
        rect.top + (-projected.y * 0.5 + 0.5) * rect.height,
      ];
    };
    cameraBridge.getRenderStats = () => ({
      frame: gl.info.render.frame,
      calls: gl.info.render.calls,
      triangles: gl.info.render.triangles,
      lines: gl.info.render.lines,
      geometries: gl.info.memory.geometries,
      textures: gl.info.memory.textures,
      dpr: gl.getPixelRatio(),
      buffer: [gl.domElement.width, gl.domElement.height],
    });

    return () => {
      cameraBridge.reset = () => undefined;
      cameraBridge.pan = () => undefined;
      cameraBridge.getPose = () => null;
      cameraBridge.view = () => undefined;
      cameraBridge.focus = () => undefined;
      cameraBridge.screenToTable = () => null;
      cameraBridge.worldToScreen = () => null;
      cameraBridge.getRenderStats = () => null;
    };
  }, [camera, gl, aspect, layoutKey]);

  useFrame((_, delta) => {
    const controls = controlsRef.current;
    if (!controls) return;
    if (tween.current.active) {
      tween.current.elapsed += delta;
      const t = Math.min(1, tween.current.elapsed / tween.current.duration);
      const eased = 1 - Math.pow(1 - t, 3);
      camera.position.lerpVectors(tween.current.fromPosition, tween.current.toPosition, eased);
      controls.target.lerpVectors(tween.current.fromTarget, tween.current.toTarget, eased);
      controls.update();
      if (t >= 1) tween.current.active = false;
      else invalidate();
    }
    // 限制平移目标，使实验台始终位于画面中心区域，且不会进入桌面内部。
    const beforeX = controls.target.x;
    const beforeY = controls.target.y;
    const beforeZ = controls.target.z;
    controls.target.x = THREE.MathUtils.clamp(controls.target.x, -1.1, 1.1);
    controls.target.y = THREE.MathUtils.clamp(controls.target.y, 0.02, 0.7);
    controls.target.z = THREE.MathUtils.clamp(controls.target.z, -0.55, 0.55);
    if (
      beforeX !== controls.target.x ||
      beforeY !== controls.target.y ||
      beforeZ !== controls.target.z
    ) {
      camera.position.add(new THREE.Vector3(controls.target.x - beforeX, controls.target.y - beforeY, controls.target.z - beforeZ));
      controls.update();
    }
    // 最后一道拦截：实验室侧墙与前后墙内表面都在 ±3.95 m，相机一旦越过去，
    // 画面里就只剩一片墙面颜色。把位置夹在室内，越界时由 OrbitControls 收小半径。
    const roomLimit = 3.6;
    if (Math.abs(camera.position.x) > roomLimit || Math.abs(camera.position.z) > roomLimit) {
      camera.position.x = THREE.MathUtils.clamp(camera.position.x, -roomLimit, roomLimit);
      camera.position.z = THREE.MathUtils.clamp(camera.position.z, -roomLimit, roomLimit);
      controls.update();
    }
  });

  return (
    <OrbitControls
      ref={controlsRef}
      makeDefault
      enabled={interactionMode === 'idle'}
      target={DEFAULT_TARGET}
      enableDamping
      dampingFactor={0.075}
      rotateSpeed={0.6}
      panSpeed={0.55}
      zoomSpeed={0.75}
      minDistance={1.15}
      maxDistance={MAX_VIEW_DISTANCE}
      minPolarAngle={0.01}
      maxPolarAngle={1.34}
      onStart={() => {
        tween.current.active = false;
      }}
      mouseButtons={{
        LEFT: panMode ? THREE.MOUSE.PAN : THREE.MOUSE.ROTATE,
        MIDDLE: THREE.MOUSE.DOLLY,
        RIGHT: THREE.MOUSE.PAN,
      }}
    />
  );
}
