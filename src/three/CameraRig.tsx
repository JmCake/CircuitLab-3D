import { useEffect, useRef } from 'react';
import { OrbitControls } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { useLabStore } from '../store/labStore';
import { cameraBridge } from './cameraBridge';

const DEFAULT_POSITION = new THREE.Vector3(1.78, 1.62, 2.55);
const DEFAULT_TARGET = new THREE.Vector3(0, 0.075, -0.02);

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
  const interactionMode = useLabStore((state) => state.interactionMode);
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
  };

  useEffect(() => {
    camera.position.copy(DEFAULT_POSITION);
    camera.lookAt(DEFAULT_TARGET);
    if (controlsRef.current) {
      controlsRef.current.target.copy(DEFAULT_TARGET);
      controlsRef.current.update();
    }

    cameraBridge.reset = () => {
      startTween(DEFAULT_TARGET, DEFAULT_POSITION);
    };
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
      const projected = new THREE.Vector3(...point).project(camera);
      return [
        rect.left + (projected.x * 0.5 + 0.5) * rect.width,
        rect.top + (-projected.y * 0.5 + 0.5) * rect.height,
      ];
    };
    cameraBridge.getRenderStats = () => ({
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
      cameraBridge.focus = () => undefined;
      cameraBridge.screenToTable = () => null;
      cameraBridge.worldToScreen = () => null;
      cameraBridge.getRenderStats = () => null;
    };
  }, [camera, gl]);

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
    }
    // 限制平移目标，使实验台始终位于画面中心区域，且不会进入桌面内部。
    const beforeX = controls.target.x;
    const beforeY = controls.target.y;
    const beforeZ = controls.target.z;
    controls.target.x = THREE.MathUtils.clamp(controls.target.x, -0.72, 0.72);
    controls.target.y = THREE.MathUtils.clamp(controls.target.y, 0.02, 0.3);
    controls.target.z = THREE.MathUtils.clamp(controls.target.z, -0.34, 0.34);
    if (
      beforeX !== controls.target.x ||
      beforeY !== controls.target.y ||
      beforeZ !== controls.target.z
    ) {
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
      maxDistance={3.8}
      minPolarAngle={0.34}
      maxPolarAngle={1.34}
      onStart={() => {
        tween.current.active = false;
      }}
      mouseButtons={{
        LEFT: THREE.MOUSE.ROTATE,
        MIDDLE: THREE.MOUSE.DOLLY,
        RIGHT: THREE.MOUSE.PAN,
      }}
    />
  );
}
