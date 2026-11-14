import { findPortOwner, type LabComponent, type Wire } from '../circuit';

/** Colour is a teaching aid only. These groups never enter the electrical solver. */
export function colorDemoWires(components: LabComponent[], wires: Wire[]): Wire[] {
  const neighbors = new Map<string, string[]>();
  const link = (a: string, b: string) => { neighbors.set(a, [...(neighbors.get(a) ?? []), b]); neighbors.set(b, [...(neighbors.get(b) ?? []), a]); };
  for (const w of wires) link(w.fromPortId, w.toPortId);
  // Follow a phase through a series current meter / closed switch, without merging electrical nodes.
  for (const c of components) {
    if (c.type === 'ammeter') link(`${c.id}:positive`, `${c.id}:negative`);
    if (c.type === 'switch') link(`${c.id}:a`, `${c.id}:b`);
  }
  const colors = new Map<string, string>();
  const seed = (port: string, color: string) => {
    const queue = [port];
    for (let i = 0; i < queue.length; i++) {
      const p = queue[i]; if (colors.has(p)) continue;
      colors.set(p, color); queue.push(...(neighbors.get(p) ?? []));
    }
  };
  for (const c of components.filter(c => c.type === 'three-phase-source')) {
    for (const [port, color] of Object.entries({ a: '#bd9034', b: '#377c60', c: '#b94b43', n: '#426f9c' })) seed(`${c.id}:${port}`, color);
  }
  for (const c of components.filter(c => c.type === 'power-supply')) seed(`${c.id}:negative`, '#353e42');
  for (const c of components.filter(c => c.type === 'power-supply')) seed(`${c.id}:positive`, '#b94b43');
  const palette = ['#b4833c', '#4e7c84', '#76648b'];
  let index = 0;
  return wires.map(w => {
    for (const id of [w.fromPortId, w.toPortId]) {
      const owner = findPortOwner(components, id);
      if (owner?.component.type === 'voltmeter') return { ...w, color: owner.portKey === 'positive' ? '#b94b43' : '#353e42' };
    }
    if (!colors.has(w.fromPortId)) seed(w.fromPortId, palette[index++ % palette.length]);
    return { ...w, color: colors.get(w.fromPortId)! };
  });
}
