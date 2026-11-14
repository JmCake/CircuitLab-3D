import { getDefinition, type LabComponent } from '../circuit';

/** Conservative clearance between rotated footprints, including room for front panel operation. */
export function footprintGap(a: LabComponent, b: LabComponent): number {
  const extent = (c: LabComponent) => {
    const [w, d] = getDefinition(c.type).footprint;
    return [(Math.abs(Math.cos(c.rotationY)) * w + Math.abs(Math.sin(c.rotationY)) * d) / 2,
      (Math.abs(Math.sin(c.rotationY)) * w + Math.abs(Math.cos(c.rotationY)) * d) / 2];
  };
  const ea = extent(a), eb = extent(b);
  const dx = Math.abs(a.position[0] - b.position[0]) - ea[0] - eb[0];
  const dz = Math.abs(a.position[1] - b.position[1]) - ea[1] - eb[1];
  return dx < 0 && dz < 0 ? Math.max(dx, dz) : Math.hypot(Math.max(0, dx), Math.max(0, dz));
}

export function arrangeLesson(components: LabComponent[], preset: LabComponent[]): LabComponent[] | null {
  const poses = new Map(preset.map(c => [c.id, c]));
  if (!components.some(c => poses.has(c.id))) return null;
  const next = components.map(c => { const pose = poses.get(c.id); return pose ? { ...c, position: [...pose.position] as [number, number], rotationY: pose.rotationY } : c; });
  // Additional instruments remain where the student put them. Do not move a lesson over them.
  if (next.some((c, i) => next.slice(i + 1).some(other => (poses.has(c.id) || poses.has(other.id)) && footprintGap(c, other) < 0.04))) return null;
  return next;
}
