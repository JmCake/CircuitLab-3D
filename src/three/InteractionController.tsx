import { useEffect, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { portWorldPosition, useLabStore } from '../store/labStore';
import { getPortTargets } from './portRegistry';

const TABLE_PLANE = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

/**
 * 统一处理相机操作与三维器材操作的输入仲裁：
 * - 拖动机器时 OrbitControls 禁用；
 * - 旋钮拖动时只更新参数，不旋转视角；
 * - 拖线期间射线只用于寻找可吸附端口。
 */
export function InteractionController() {
  const gl = useThree((state) => state.gl);
  const camera = useThree((state) => state.camera);
  const raycaster = useRef(new THREE.Raycaster());
  const pointer = useRef(new THREE.Vector2());

  useEffect(() => {
    const canvas = gl.domElement;
    const setCanvasCursor = (cursor: string) => {
      if (canvas.style.cursor !== cursor) canvas.style.cursor = cursor;
    };

    const updateRay = (clientX: number, clientY: number) => {
      const rect = canvas.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return false;
      pointer.current.set(
        ((clientX - rect.left) / rect.width) * 2 - 1,
        -((clientY - rect.top) / rect.height) * 2 + 1,
      );
      raycaster.current.setFromCamera(pointer.current, camera);
      return true;
    };

    const findPort = (): string | null => {
      const targets = getPortTargets();
      if (targets.length === 0) return null;
      const intersections = raycaster.current.intersectObjects(targets, false);
      for (const hit of intersections) {
        const portId = hit.object.userData.portId;
        if (typeof portId === 'string') return portId;
      }
      return null;
    };

    const tablePoint = (): [number, number, number] | null => {
      const point = new THREE.Vector3();
      if (!raycaster.current.ray.intersectPlane(TABLE_PLANE, point)) return null;
      return [point.x, 0.04, point.z];
    };

    const onPointerMove = (event: PointerEvent) => {
      if (!updateRay(event.clientX, event.clientY)) return;
      const state = useLabStore.getState();
      if (state.interactionMode === 'dragging') {
        const point = new THREE.Vector3();
        if (raycaster.current.ray.intersectPlane(TABLE_PLANE, point)) {
          state.updateMovePoint([point.x, point.z]);
        }
        setCanvasCursor('grabbing');
        return;
      }
      if (state.interactionMode === 'adjusting') {
        state.updateControl({ x: event.clientX, y: event.clientY });
        setCanvasCursor(state.adjustSession?.axis === 'x' ? 'ew-resize' : 'ns-resize');
        return;
      }
      if (state.interactionMode === 'wiring') {
        const portId = findPort();
        let cursor = tablePoint();
        if (portId) {
          const world = portWorldPosition(state.components, portId);
          if (world) cursor = world;
        }
        state.updateWirePointer(portId, cursor ?? [0, 0.04, 0]);
        setCanvasCursor('crosshair');
        return;
      }

      const portId = findPort();
      const previous = state.hoveredPortId;
      if (previous !== portId) {
        useLabStore.setState({ hoveredPortId: portId });
      }
      setCanvasCursor(portId ? 'pointer' : 'grab');
    };

    const onPointerUp = (event: PointerEvent) => {
      const state = useLabStore.getState();
      if (state.interactionMode === 'dragging') {
        state.endMove();
        setCanvasCursor('grab');
        return;
      }
      if (state.interactionMode === 'adjusting') {
        state.endControl();
        setCanvasCursor('grab');
        return;
      }
      if (state.interactionMode === 'wiring') {
        if (event.target === canvas && updateRay(event.clientX, event.clientY)) {
          const targetPort = findPort();
          state.completeWire(targetPort);
        } else {
          state.cancelWire();
        }
        setCanvasCursor('grab');
      }
    };

    const onPointerCancel = () => {
      const state = useLabStore.getState();
      if (state.interactionMode === 'dragging') state.cancelMove();
      if (state.interactionMode === 'adjusting') state.cancelControl();
      if (state.interactionMode === 'wiring') state.cancelWire();
      setCanvasCursor('grab');
    };

    const onPointerLeave = () => {
      const state = useLabStore.getState();
      if (state.interactionMode === 'idle' && state.hoveredPortId) {
        useLabStore.setState({ hoveredPortId: null });
      }
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      const state = useLabStore.getState();
      if (state.interactionMode === 'dragging') state.cancelMove();
      if (state.interactionMode === 'adjusting') state.cancelControl();
      if (state.interactionMode === 'wiring') state.cancelWire();
    };

    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerleave', onPointerLeave);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerCancel);
    window.addEventListener('keydown', onKeyDown);
    setCanvasCursor('grab');

    return () => {
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerleave', onPointerLeave);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerCancel);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [camera, gl]);

  return null;
}
