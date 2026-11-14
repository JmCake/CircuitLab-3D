import { getDefinition, getInternalPortGroups } from '../circuit/catalog';
import type { CircuitSnapshot, CourseObservation, MeasurementRow, ParamBag, SimulationResult } from '../circuit/types';
import { UnionFind } from '../circuit/simulation/unionFind';
import { magnitude, sub, zero } from '../circuit/simulation/complex';
import { analyzeThevenin } from '../circuit/analysis';

export function topologyKey(snapshot: CircuitSnapshot): string {
  const union = new UnionFind();
  const ports = snapshot.components.flatMap(c => getDefinition(c.type).ports.map(p => `${c.id}:${p.key}`));
  const known = new Set(ports);
  for (const id of ports) union.add(id);
  for (const c of snapshot.components) for (const group of getInternalPortGroups(c)) for (const p of group.slice(1)) union.union(`${c.id}:${group[0]}`, `${c.id}:${p}`);
  for (const w of snapshot.wires) if (known.has(w.fromPortId) && known.has(w.toPortId)) union.union(w.fromPortId, w.toPortId);
  const groups = new Map<string, string[]>();
  for (const id of ports) { const root = union.find(id); groups.set(root, [...(groups.get(root) ?? []), id]); }
  return JSON.stringify([...groups.values()].map(g => g.sort()).sort((a, b) => a[0].localeCompare(b[0])));
}

export function threePhaseReadings(snapshot: CircuitSnapshot, result: SimulationResult) {
  if (!result.solved || !result.ac) return null;
  const source = snapshot.components.find(c => c.type === 'three-phase-source');
  const loads = ['ra', 'rb', 'rc'].map(alias => snapshot.components.find(c => c.id.endsWith(`-${alias}`)));
  if (!source || loads.some(l => !l)) return null;
  const connectivity = new UnionFind();
  for (const c of snapshot.components) {
    for (const p of getDefinition(c.type).ports) connectivity.add(`${c.id}:${p.key}`);
    if (c.type === 'ammeter') connectivity.union(`${c.id}:positive`, `${c.id}:negative`);
    if (c.type === 'switch' && c.params.closed) connectivity.union(`${c.id}:a`, `${c.id}:b`);
  }
  for (const w of snapshot.wires) connectivity.union(w.fromPortId, w.toPortId);
  const same = (a: string, b: string) => connectivity.find(a) === connectivity.find(b);
  const delta = source.id.startsWith('three-phase-delta');
  const v = (id: string) => result.ac!.portVoltages[id] ?? zero();
  const current = (id: string) => result.ac!.terminalCurrents[id] ?? zero();
  const n = v(`${source.id}:n`);
  const values: Record<string, number> = {};
  const phases = ['A', 'B', 'C'];
  for (let i = 0; i < 3; i++) {
    const c = loads[i]!;
    const key = phases[i].toLowerCase();
    values[`phaseU${phases[i]}`] = result.elements[c.id].voltage;
    values[`phaseI${phases[i]}`] = result.elements[c.id].current;
    values[`lineI${phases[i]}`] = magnitude(current(`${source.id}:${key}`));
    values[`sourceU${phases[i]}`] = magnitude(sub(v(`${source.id}:${key}`), n));
    values[`lineU${phases[i]}${phases[(i + 1) % 3]}`] = magnitude(sub(v(`${source.id}:${key}`), v(`${source.id}:${phases[(i + 1) % 3].toLowerCase()}`)));
    values[`resistance${phases[i]}`] = Number(c.params.resistance);
  }
  values.neutralI = magnitude(current(`${source.id}:n`));
  values.neutralShift = magnitude(sub(v(`${loads[0]!.id}:b`), n));
  values.neutralConnected = same(`${loads[0]!.id}:b`, `${source.id}:n`) ? 1 : 0;
  const pins = ['a', 'b', 'c'].map(p => `${source.id}:${p}`);
  const distinctPhases = new Set(pins.map(p => connectivity.find(p))).size === 3;
  values.wiringValid = distinctPhases && (delta
    ? loads.every((load, i) => same(`${load!.id}:a`, pins[i]) && same(`${load!.id}:b`, pins[(i + 1) % 3]))
    : loads.every((load, i) => same(`${load!.id}:a`, pins[i]) && same(`${load!.id}:b`, `${loads[0]!.id}:b`)) && !pins.some(p => same(p, `${loads[0]!.id}:b`))) ? 1 : 0;
  values.kclResidual = result.ac.audit.kclResidualA;
  values.powerResidual = result.ac.audit.powerResidualW;
  return values;
}

export function captureObservation(snapshot: CircuitSnapshot, result: SimulationResult, referencePortId?: string | null): CourseObservation {
  const settings: ParamBag = {};
  const values: Record<string, number> = {};
  for (const c of snapshot.components) {
    settings[`${c.id}.type`] = c.type;
    for (const [key, value] of Object.entries(c.params)) settings[`${c.id}.${key}`] = value;
    const e = result.elements[c.id];
    if (e) { values[`u:${c.id}`] = e.voltage; values[`i:${c.id}`] = e.current; values[`p:${c.id}`] = e.power; }
  }
  for (const [id, value] of Object.entries(result.portVoltages ?? {})) values[`v:${id}`] = value;
  if (referencePortId) settings.referencePortId = referencePortId;
  Object.assign(values, threePhaseReadings(snapshot, result) ?? {});
  const load = snapshot.components.find(c => ['thevenin-load', 'max-power-load'].includes(c.id));
  const eq = load && result.solved ? analyzeThevenin(snapshot, load.id) : null;
  if (eq) Object.assign(values, { theveninR: eq.resistance, theveninU: eq.voltage, maxPower: eq.maxPower });
  return { version: 1, topology: topologyKey(snapshot), settings, values };
}

export function courseRecordFields(row: MeasurementRow): Record<string, string | number | null> {
  const o = row.observation, id = row.labId;
  const basic = { '电压(V)': row.voltage, '电流(A)': row.current };
  if (!o) return basic;
  const v = o.values, s = o.settings;
  if (id === 'iv-characteristics') return { '器件': s[`${id}-r1.type`] === 'bulb' ? '小灯泡' : '电阻', ...basic, 'U/I(Ω)': row.resistance };
  if (id === 'potentials') {
    const ref = String(s.referencePortId ?? 'potentials-ps:negative'), r = v[`v:${ref}`] ?? 0;
    const label = ref === 'potentials-ps:negative' ? 'A' : ref === 'potentials-r1:a' ? 'B' : ref === 'potentials-r2:a' ? 'C' : 'D';
    return { '参考点': label, 'φB(V)': v['v:potentials-r1:a'] - r, 'φC(V)': v['v:potentials-r2:a'] - r,
      'U_BC(V)': v['v:potentials-r1:a'] - v['v:potentials-r2:a'], 'φA(V)': v['v:potentials-ps:negative'] - r, 'φD(V)': v['v:potentials-r3:a'] - r };
  }
  if (id === 'superposition') return { 'U1(V)': Number(s['superposition-ps1.voltage']), 'U2(V)': Number(s['superposition-ps2.voltage']), ...basic };
  if (id === 'thevenin' || id === 'max-power') return { '负载(Ω)': Number(s[`${id}-load.resistance`]), ...basic, '负载功率(W)': v[`p:${id}-load`], 'Rth(Ω)': v.theveninR, 'Uth(V)': v.theveninU };
  if (id.startsWith('three-phase-')) {
    const balanced = v.resistanceA === v.resistanceB && v.resistanceB === v.resistanceC;
    const fields: Record<string, string | number> = { '负载': balanced ? '对称' : '不对称', 'A相电压(V)': v.phaseUA, 'AB线电压(V)': v.lineUAB, 'A相电流(A)': v.phaseIA, 'A线电流(A)': v.lineIA };
    for (const p of ['B', 'C']) Object.assign(fields, { [`${p}相电压(V)`]: v[`phaseU${p}`], [`${p}相电流(A)`]: v[`phaseI${p}`], [`${p}线电流(A)`]: v[`lineI${p}`] });
    Object.assign(fields, { 'BC线电压(V)': v.lineUBC, 'CA线电压(V)': v.lineUCA, 'RA(Ω)': v.resistanceA, 'RB(Ω)': v.resistanceB, 'RC(Ω)': v.resistanceC });
    if (id.endsWith('star')) Object.assign(fields, { '中线': v.neutralConnected ? '接通' : '断开', '中线电流(A)': v.neutralI, '中点位移(V)': v.neutralShift });
    return fields;
  }
  return { ...basic, ...Object.fromEntries(Object.entries(v).filter(([key]) => /^[uip]:/.test(key))) };
}

export function courseCsv(rows: MeasurementRow[]): string {
  const fields = rows.map(courseRecordFields);
  const columns = [...new Set(fields.flatMap(f => Object.keys(f)))];
  const quote = (value: unknown) => '"' + String(value ?? '').replaceAll('"', '""') + '"';
  return '\uFEFF' + [['时间', ...columns].map(quote).join(','), ...rows.map((r, i) => [new Date(r.createdAt).toISOString(), ...columns.map(key => fields[i][key])].map(quote).join(','))].join('\n');
}

function comparableKey(row: MeasurementRow, excluded: (key: string) => boolean) {
  const o = row.observation;
  if (!o) return null;
  return o.topology + JSON.stringify(Object.entries(o.settings).filter(([key]) => !excluded(key)).sort(([a], [b]) => a.localeCompare(b)));
}
export function superpositionEvidence(rows: MeasurementRow[]) {
  const id = 'superposition';
  const sourceIds = [`${id}-ps1`, `${id}-ps2`];
  const good = rows.filter(r => r.labId === id && r.observation && r.current !== null && r.observation.settings[`${sourceIds[0]}.enabled`] && r.observation.settings[`${sourceIds[1]}.enabled`]);
  const volts = (r: MeasurementRow) => sourceIds.map(s => Number(r.observation!.settings[`${s}.voltage`]));
  const key = (r: MeasurementRow) => comparableKey(r, k => sourceIds.some(s => k === `${s}.voltage`));
  let additive: { residual: number; expected: number; measured: number } | null = null;
  let homogeneous: { residual: number; factor: number; expected: number; measured: number } | null = null;
  for (const base of good) {
    const [u1, u2] = volts(base);
    if (Math.abs(u1) < 1e-6 || Math.abs(u2) < 1e-6) continue;
    const peers = good.filter(r => key(r) === key(base));
    const one = peers.find(r => Math.abs(volts(r)[0] - u1) < 1e-6 && Math.abs(volts(r)[1]) < 1e-6);
    const two = peers.find(r => Math.abs(volts(r)[1] - u2) < 1e-6 && Math.abs(volts(r)[0]) < 1e-6);
    if (one && two && Math.max(Math.abs(one.current!), Math.abs(two.current!)) > 1e-7) {
      const expected = one.current! + two.current!, measured = base.current!;
      const residual = Math.abs(expected - measured);
      if (!additive || residual < additive.residual) additive = { residual, expected, measured };
    }
    for (const r of peers) {
      if (Math.abs(base.current!) < 1e-7) continue;
      const [a, b] = volts(r), factor = a / u1;
      if (Math.abs(factor) < 0.1 || Math.abs(factor - 1) < 0.1 || Math.abs(b / u2 - factor) > 1e-6) continue;
      const expected = base.current! * factor, measured = r.current!, residual = Math.abs(expected - measured);
      if (!homogeneous || residual < homogeneous.residual) homogeneous = { residual, factor, expected, measured };
    }
  }
  return { additive, homogeneous };
}

/** Two-load experimental estimate; all non-load parameters and wiring must remain identical. */
export function theveninEvidence(rows: MeasurementRow[], labId = 'thevenin') {
  const good = rows.filter(r => r.labId === labId && r.observation && r.voltage !== null && r.current !== null && Math.abs(r.current) > 1e-8);
  let best: { resistance: number; voltage: number; points: number } | null = null;
  for (const a of good) for (const b of good) {
    if (a === b) continue;
    const excluded = (key: string) => key === `${labId}-load.resistance`;
    if (comparableKey(a, excluded) !== comparableKey(b, excluded)) continue;
    const di = b.current! - a.current!;
    if (Math.abs(di) < 1e-7) continue;
    const resistance = (a.voltage! - b.voltage!) / di;
    const voltage = a.voltage! + resistance * a.current!;
    if (resistance > 0 && Number.isFinite(voltage)) best = { resistance, voltage, points: good.length };
  }
  return best;
}

export function distinctRows(rows: MeasurementRow[], labId: string, type?: string) {
  const valid = rows.filter(r => r.labId === labId && r.observation && (!type || r.observation.settings['iv-characteristics-r1.type'] === type));
  const groups = new Map<string, MeasurementRow[]>();
  for (const r of valid) {
    const key = labId === 'iv-characteristics' ? comparableKey(r, k => k === 'iv-characteristics-ps.voltage' || k.endsWith('.range'))! : 'all';
    const group = groups.get(key) ?? [];
    if (!group.some(x => x.voltage !== null && r.voltage !== null && Math.abs(x.voltage - r.voltage) < 1e-4)) group.push(r);
    groups.set(key, group);
  }
  return [...groups.values()].sort((a, b) => b.length - a.length)[0] ?? [];
}

export function maxPowerEvidence(rows: MeasurementRow[]) {
  const groups = new Map<string, MeasurementRow[]>();
  for (const r of rows.filter(r => r.labId === 'max-power' && r.observation && r.observation.values.maxPower > 1e-9 && r.observation.values['p:max-power-load'] > 1e-9)) {
    const key = comparableKey(r, k => k === 'max-power-load.resistance')!;
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  let count = 0, matched = false;
  for (const group of groups.values()) {
    const rth = group[0].observation!.values.theveninR;
    const ratios = [...new Set(group.map(r => Number(r.observation!.settings['max-power-load.resistance']) / rth))];
    count = Math.max(count, ratios.length);
    const near = ratios.some(r => Math.abs(r - 1) < 0.1), below = ratios.some(r => r < 0.8), above = ratios.some(r => r > 1.2);
    matched ||= near && below && above;
  }
  return { count, matched };
}
