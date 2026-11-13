import { Suspense } from 'react';
import { useLabStore } from '../store/labStore';
import { InstrumentRenderer } from './instruments/InstrumentRenderer';
import { CameraRig } from './CameraRig';
import { InteractionController } from './InteractionController';
import { SceneEnvironment } from './SceneEnvironment';
import { WireSystem } from './WireSystem';

function CircuitBench() {
  const components = useLabStore((state) => state.components);
  const selectedId = useLabStore((state) => state.selectedId);
  return (
    <group>
      {components.map((component) => (
        <InstrumentRenderer
          key={component.id}
          component={component}
          selected={component.id === selectedId}
        />
      ))}
    </group>
  );
}

export function SceneRoot() {
  return (
    <Suspense fallback={null}>
      <SceneEnvironment />
      <CircuitBench />
      <WireSystem />
      <CameraRig />
      <InteractionController />
    </Suspense>
  );
}
