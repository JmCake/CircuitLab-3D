import { Billboard } from '@react-three/drei';
import { getPortWorldPosition } from '../circuit';
import { POTENTIAL_POINTS } from '../experiments/labs';
import { useLabStore } from '../store/labStore';
import { LabelPlane } from './graphics';

/** Test-point letters are part of the experimental circuit, not persistent app instructions. */
export function CourseTestPoints() {
  const id = useLabStore(s => s.activeLabId), mode = useLabStore(s => s.mode), components = useLabStore(s => s.components), reference = useLabStore(s => s.referencePortId);
  if (id !== 'potentials' || mode !== 'guided') return null;
  return <group>{POTENTIAL_POINTS.map(p => {
    const component = components.find(c => c.id === `potentials-${p.alias}`);
    const point = component && getPortWorldPosition(component, p.key);
    if (!point) return null;
    const selected = (reference ?? 'potentials-ps:negative') === `${component.id}:${p.key}`;
    return <Billboard key={p.label} position={[point[0], point[1] + 0.055, point[2]]}>
      <LabelPlane text={p.label} width={0.03} height={0.028} background={selected ? '#365e54' : '#f5f1e7'} color={selected ? '#ffffff' : '#364a43'} border="#607b6f" fontSize={65} fontWeight={700} />
    </Billboard>;
  })}</group>;
}
