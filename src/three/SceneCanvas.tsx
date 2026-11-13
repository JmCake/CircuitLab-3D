import { useEffect, useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import * as THREE from 'three';
import { COMPONENT_DEFINITIONS, type ComponentType } from '../circuit';
import { useLabStore } from '../store/labStore';
import { cameraBridge } from './cameraBridge';
import { SceneRoot } from './SceneRoot';
import { useViewStore } from '../store/viewStore';

function supportsWebGL2(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return Boolean(canvas.getContext('webgl2'));
  } catch {
    return false;
  }
}

export function SceneCanvas() {
  const quality = useViewStore(s => s.quality);
  const containerRef = useRef<HTMLDivElement>(null);
  const [webgl2] = useState(supportsWebGL2);
  const addComponent = useLabStore((state) => state.addComponent);
  const [dragOver, setDragOver] = useState(false);

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragOver(false);
    const type = event.dataTransfer.getData('application/x-circuitlab-part') as ComponentType;
    if (!type || !(type in COMPONENT_DEFINITIONS)) return;
    const tablePoint = cameraBridge.screenToTable(event.clientX, event.clientY);
    addComponent(type, tablePoint ?? undefined);
  };

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    if (!Array.from(event.dataTransfer.types).includes('application/x-circuitlab-part')) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
    setDragOver(true);
  };

  useEffect(() => {
    const onContextMenu = (event: MouseEvent) => event.preventDefault();
    const element = containerRef.current;
    element?.addEventListener('contextmenu', onContextMenu);
    return () => element?.removeEventListener('contextmenu', onContextMenu);
  }, []);

  if (!webgl2) {
    return (
      <div className="webgl-fallback">
        <div className="webgl-fallback-card">
          <div className="webgl-fallback-icon">3D</div>
          <h2>当前浏览器未启用 WebGL 2</h2>
          <p>
            CircuitLab-3D 需要支持 WebGL 2 的桌面浏览器。请使用较新版本的 Chrome、Edge 或
            Firefox，并确认浏览器未禁用硬件加速。
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={`scene-canvas ${dragOver ? 'is-drag-over' : ''}`}
      onDragOver={handleDragOver}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
    >
      <Canvas
        shadows={quality === 'fine'}
        frameloop="demand"
        dpr={quality === 'fine' ? [1, 1.5] : 1}
        camera={{ position: [0.64, 0.78, 1.62], fov: 42, near: 0.04, far: 30 }}
        gl={{
          antialias: true,
          alpha: false,
          powerPreference: 'high-performance',
          stencil: false,
        }}
        onCreated={({ gl }) => {
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = 0.95;
          gl.shadowMap.type = THREE.PCFSoftShadowMap;
        }}
        onPointerMissed={() => {
          useLabStore.getState().selectComponent(null);
          useLabStore.getState().selectWire(null);
        }}
      >
        <SceneRoot />
      </Canvas>
      {dragOver && (
        <div className="drop-hint">
          <span>松开以放到实验台</span>
        </div>
      )}
    </div>
  );
}
