import { describe, expect, it } from 'vitest';
import { simulateCircuit, type CircuitSnapshot, type MeasurementRow } from '../../circuit';
import { analyzeThevenin } from '../../circuit/analysis';
import { buildLabCircuit, COURSE_LABS, type LabContext } from '../labs';
import { captureObservation, courseCsv, courseRecordFields, maxPowerEvidence, superpositionEvidence, theveninEvidence, threePhaseReadings } from '../courseAnalysis';

let nextRecord = 0;
function record(id: string, c: CircuitSnapshot, referencePortId?: string): MeasurementRow {
  const result = simulateCircuit(c), vm = c.components.find(c => c.type === 'voltmeter'), am = c.components.find(c => c.type === 'ammeter');
  return { id: String(++nextRecord), labId: id, createdAt: 0, label: id, voltage: vm ? result.elements[vm.id].reading! : null,
    current: am ? result.elements[am.id].reading! : null, resistance: null, observation: captureObservation(c, result, referencePortId) };
}
function context(id: string, c: CircuitSnapshot, measurements: MeasurementRow[] = []): LabContext {
  return { ...c, result: simulateCircuit(c), measurements, transient: { running: false, time: 0, samples: 0, lastCapacitorVoltage: 0 } };
}
describe('用户提供的八项大学电路实验', () => {
  it('主目录严格为八项，顺序对应用户课程', () => {
    expect(COURSE_LABS.map(l => l.id)).toEqual(['iv-characteristics', 'potentials', 'kirchhoff', 'superposition', 'thevenin', 'max-power', 'three-phase-star', 'three-phase-delta']);
  });
  for (const lab of COURSE_LABS) it(`${lab.index}：示范可解、空台断电、端口不超三根`, () => {
    const c = buildLabCircuit(lab.id, true), result = simulateCircuit(c);
    expect(result.status).toBe('ok'); expect(result.solved).toBe(true);
    expect(result.diagnostics.filter(d => d.level === 'error')).toEqual([]);
    const ports = new Map<string, number>();
    for (const w of c.wires) for (const id of [w.fromPortId, w.toPortId]) ports.set(id, (ports.get(id) ?? 0) + 1);
    expect(Math.max(...ports.values())).toBeLessThanOrEqual(3);
    const blank = buildLabCircuit(lab.id, false);
    expect(blank.wires).toEqual([]);
    expect(blank.components.filter(c => c.type.includes('source') || c.type === 'power-supply').every(c => c.params.enabled === false)).toBe(true);
    expect(lab.steps.slice(1).some(s => s.check(context(lab.id, blank)).done)).toBe(false);
  });
  it('电位参考点改变只平移电位图，两点电压不变，CSV 保留参考点', () => {
    const c = buildLabCircuit('potentials', true), result = simulateCircuit(c), v = result.portVoltages!;
    const a = record('potentials', c, 'potentials-ps:negative'), b = record('potentials', c, 'potentials-r2:a');
    const af = courseRecordFields(a), bf = courseRecordFields(b);
    expect(af['φA(V)']).toBe(0); expect(bf['φC(V)']).toBe(0);
    expect(af['U_BC(V)']).toBeCloseTo(Number(bf['U_BC(V)']), 12);
    expect(v['potentials-r1:a'] - v['potentials-r2:a']).toBeGreaterThan(1.9);
    expect(COURSE_LABS[1].steps.at(-1)!.check(context('potentials', c, [a, b])).done).toBe(true);
    expect(courseCsv([a, b])).toContain('"参考点"'); expect(courseCsv([a, b])).toContain('"C"');
  });
  it('叠加与齐次性由四种实际解的记录验证，关闭电源不能冒充置零', () => {
    const c = buildLabCircuit('superposition', true), ps = c.components.filter(c => c.type === 'power-supply');
    const take = (a: number, b: number) => { ps[0].params.voltage = a; ps[1].params.voltage = b; return record('superposition', c); };
    const rows = [take(6, 3), take(6, 0), take(0, 3), take(12, 6)];
    const evidence = superpositionEvidence(rows);
    expect(evidence.additive!.residual).toBeLessThan(1e-9); expect(evidence.homogeneous!.residual).toBeLessThan(1e-9);
    expect(evidence.homogeneous!.factor).toBeCloseTo(2);
    ps[1].params.enabled = false; ps[0].params.voltage = 6;
    expect(superpositionEvidence([rows[0], rows[2], record('superposition', c)]).additive).toBeNull();
  });
  it('两负载伏安法估算戴维南参数，计入仪表负载影响', () => {
    const c = buildLabCircuit('thevenin', true), load = c.components.find(c => c.id === 'thevenin-load')!;
    load.params.resistance = 200; const a = record('thevenin', c);
    load.params.resistance = 1500; const b = record('thevenin', c);
    const measured = theveninEvidence([a, b])!, eq = analyzeThevenin(c, load.id)!;
    expect(measured).not.toBeNull(); expect(Math.abs(measured.resistance / eq.resistance - 1)).toBeLessThan(0.001);
    expect(Math.abs(measured.voltage / eq.voltage - 1)).toBeLessThan(0.001);
    c.components.find(c => c.type === 'power-supply')!.params.voltage = 12;
    expect(theveninEvidence([a, record('thevenin', c)])).toBeNull();
  });
  it('功率匹配记录使用实际负载功率，两侧小于匹配点', () => {
    const c = buildLabCircuit('max-power', true), load = c.components.find(c => c.id === 'max-power-load')!;
    const eq = analyzeThevenin(c, load.id)!;
    const ps = [0.2, 1, 4].map(k => { load.params.resistance = eq.resistance * k; const row = record('max-power', c); return row.observation!.values['p:max-power-load']; });
    expect(ps[1]).toBeGreaterThan(ps[0]); expect(ps[1]).toBeGreaterThan(ps[2]); expect(ps[1]).toBeCloseTo(eq.maxPower, 7);
  });
  it('星形实验的对称、不对称有中线、断中线记录完成教学验证', () => {
    const c = buildLabCircuit('three-phase-star', true), rows = [record('three-phase-star', c)];
    c.components.find(c => c.id.endsWith('-rb'))!.params.resistance = 500;
    rows.push(record('three-phase-star', c));
    c.components.find(c => c.type === 'switch')!.params.closed = false;
    rows.push(record('three-phase-star', c));
    const v = threePhaseReadings(c, simulateCircuit(c))!;
    expect(v.neutralShift).toBeGreaterThan(1);
    expect(COURSE_LABS[6].steps.every(s => s.check(context('three-phase-star', c, rows)).done)).toBe(true);
  });
  it('重复记录同一个点不能完成伏安测绘', () => {
    const c = buildLabCircuit('iv-characteristics', true), row = record('iv-characteristics', c);
    expect(COURSE_LABS[0].steps[2].check(context('iv-characteristics', c, Array(6).fill(row))).done).toBe(false);
  });
  it('断电的零读数不能用于验证电位图、叠加和齐次性', () => {
    const p = buildLabCircuit('potentials', true); p.components.find(c => c.type === 'power-supply')!.params.enabled = false;
    const a = record('potentials', p, 'potentials-ps:negative'), b = record('potentials', p, 'potentials-r2:a');
    expect(COURSE_LABS[1].steps.at(-1)!.check(context('potentials', p, [a, b])).done).toBe(false);
    const c = buildLabCircuit('superposition', true); c.wires = c.wires.filter(w => !w.fromPortId.endsWith('am:negative') && !w.toPortId.endsWith('am:negative'));
    const ps = c.components.filter(c => c.type === 'power-supply');
    const cases = [[6, 3], [6, 0], [0, 3], [12, 6]].map(([a, b]) => { ps[0].params.voltage = a; ps[1].params.voltage = b; return record('superposition', c); });
    expect(superpositionEvidence(cases).additive).toBeNull(); expect(superpositionEvidence(cases).homogeneous).toBeNull();
  });
  it('功率匹配必须在同一有源网络记录，不能拼凑不同电源或断电数据', () => {
    const c = buildLabCircuit('max-power', true), load = c.components.find(c => c.id.endsWith('-load'))!, source = c.components.find(c => c.type === 'power-supply')!;
    const rows = [100, 500, 2000].map((r, i) => { load.params.resistance = r; source.params.voltage = 6 + i; return record('max-power', c); });
    expect(maxPowerEvidence(rows).matched).toBe(false);
    source.params.enabled = false;
    const off = [100, 500, 2000].map(r => { load.params.resistance = r; return record('max-power', c); });
    expect(maxPowerEvidence(off).count).toBe(0);
  });
  it('星形课程不能用三角形接线冒充，并检查实际中性线连续性', () => {
    const c = buildLabCircuit('three-phase-star', true);
    expect(threePhaseReadings(c, simulateCircuit(c))!.wiringValid).toBe(1);
    const missingNeutral = { ...c, wires: c.wires.filter(w => ![w.fromPortId, w.toPortId].includes('three-phase-star-ps:n')) };
    expect(threePhaseReadings(missingNeutral, simulateCircuit(missingNeutral))!.neutralConnected).toBe(0);
    const wrong = { ...c, wires: c.wires.filter(w => ![w.fromPortId, w.toPortId].includes('three-phase-star-rb:a')) };
    expect(threePhaseReadings(wrong, simulateCircuit(wrong))!.wiringValid).toBe(0);
  });
});
