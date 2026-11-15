import { useMemo, useState } from 'react';
import { Download, Plus, Trash2 } from 'lucide-react';
import { useLabStore } from '../store/labStore';
import { analyzeThevenin, auditCircuit } from '../circuit/analysis';
import { measurementIssue } from '../circuit/measurement';
import { magnitude, sub, zero } from '../circuit/simulation/complex';
import { COURSE_LABS, POTENTIAL_POINTS } from '../experiments/labs';
import { courseCsv, courseRecordFields, distinctRows, superpositionEvidence, theveninEvidence, threePhaseReadings } from '../experiments/courseAnalysis';
import type { MeasurementRow } from '../circuit';
import { formatCurrent, formatPower, formatResistance, formatVoltage } from './format';

type Point = { x: number; y: number };
type Series = { name: string; color: string; points: Point[]; connect?: boolean; markers?: boolean };
function Plot({ series, xTitle, yTitle, xLabels, label, yBounds }: { series: Series[]; xTitle: string; yTitle: string; xLabels?: string[]; label: string; yBounds?: [number, number] }) {
  const points = series.flatMap(s => s.points).filter(p => Number.isFinite(p.x) && Number.isFinite(p.y));
  const xMin = Math.min(0, ...points.map(p => p.x)), xMax = Math.max(1, ...points.map(p => p.x));
  const yMin = yBounds?.[0] ?? Math.min(0, ...points.map(p => p.y)), yMax = yBounds?.[1] ?? Math.max(1e-3, ...points.map(p => p.y));
  const px = (x: number) => 42 + (x - xMin) / (xMax - xMin) * 272;
  const py = (y: number) => 166 - (y - yMin) / (yMax - yMin) * 134;
  const number = (v: number) => Math.abs(v) < 0.00001 ? '0' : Math.abs(v) >= 100 ? v.toFixed(0) : Number(v.toPrecision(3)).toString();
  return <div className="course-plot">
    <svg viewBox="0 0 340 210" role="img" aria-label={label}>
      {[0, 0.5, 1].map(t => { const y = yMin + (yMax - yMin) * t; return <g key={t}><line x1="42" x2="314" y1={py(y)} y2={py(y)} className="chart-grid" /><text x="36" y={py(y) + 4} textAnchor="end">{number(y)}</text></g>; })}
      <line x1="42" x2="314" y1={py(0)} y2={py(0)} className="course-zero" />
      {(xLabels ? xLabels.map((text, i) => ({ text, x: i })) : [0, 0.5, 1].map(t => ({ text: number(xMin + (xMax - xMin) * t), x: xMin + (xMax - xMin) * t }))).map((t, i) => <text key={i} x={px(t.x)} y="184" textAnchor="middle">{t.text}</text>)}
      <text x="42" y="17">{yTitle}</text><text x="314" y="204" textAnchor="end">{xTitle}</text>
      {series.map(s => <g key={s.name}>
        {s.connect !== false && s.points.length > 1 && <polyline points={[...s.points].sort((a, b) => a.x - b.x).map(p => `${px(p.x)},${py(p.y)}`).join(' ')} fill="none" stroke={s.color} strokeWidth="2" />}
        {s.markers !== false && s.points.length < 70 && s.points.map((p, i) => <circle key={i} cx={px(p.x)} cy={py(p.y)} r="3.4" fill={s.color} />)}
      </g>)}
    </svg>
    {series.length > 1 && <div className="course-legend">{series.map(s => <span key={s.name}><i style={{ background: s.color }} />{s.name}</span>)}</div>}
  </div>;
}

function ThreePhasePanel() {
  const components = useLabStore(s => s.components), wires = useLabStore(s => s.wires), result = useLabStore(s => s.result), id = useLabStore(s => s.activeLabId);
  const state = useLabStore;
  const values = threePhaseReadings({ components, wires }, result);
  const source = components.find(c => c.type === 'three-phase-source');
  if (!values || !source) return <div className="empty-inline">请接入三相电源和三相负载。</div>;
  const changeLoads = (unbalanced: boolean) => {
    state.getState().beginTransaction();
    for (const [index, alias] of ['ra', 'rb', 'rc'].entries()) state.getState().setParam(`${id}-${alias}`, 'resistance', unbalanced ? [1000, 500, 2000][index] : 1000, false);
    state.getState().commitTransaction();
  };
  const neutral = components.find(c => c.id === `${id}-sw`);
  const balanced = values.resistanceA === values.resistanceB && values.resistanceB === values.resistanceC;
  const phasors = result.ac!.portVoltages;
  const vectors = ['ra', 'rb', 'rc'].map(alias => sub(phasors[`${id}-${alias}:a`] ?? zero(), phasors[`${id}-${alias}:b`] ?? zero()));
  const max = Math.max(1e-9, ...vectors.map(magnitude));
  return <>
    <div className="course-controls" role="group" aria-label="三相负载设置">
      <button className="button button-secondary compact" type="button" aria-pressed={balanced} onClick={() => changeLoads(false)}>对称负载</button>
      <button className="button button-secondary compact" type="button" aria-pressed={!balanced} onClick={() => changeLoads(true)}>不对称负载</button>
      {neutral && <button type="button" className="button button-secondary compact" aria-pressed={Boolean(neutral.params.closed)} onClick={() => state.getState().setParam(neutral.id, 'closed', !neutral.params.closed)}>中性线{neutral.params.closed ? '接通' : '断开'}</button>}
    </div>
    <table className="measurement-table course-phase-table"><caption>交流有效值</caption><thead><tr><th>相</th><th>U相 / V</th><th>U线 / V</th><th>I相 / mA</th><th>I线 / mA</th></tr></thead><tbody>
      {['A', 'B', 'C'].map((p, i) => <tr key={p}><th>{p}</th><td>{values[`phaseU${p}`].toFixed(2)}</td><td>{values[`lineU${p}${'ABC'[(i + 1) % 3]}`].toFixed(2)}</td><td>{(values[`phaseI${p}`] * 1000).toFixed(2)}</td><td>{(values[`lineI${p}`] * 1000).toFixed(2)}</td></tr>)}
    </tbody></table>
    {neutral && <div className="course-metrics"><div><span>中线电流</span><strong>{formatCurrent(values.neutralI)}</strong></div><div><span>中点位移</span><strong>{formatVoltage(values.neutralShift)}</strong></div></div>}
    {max > 1e-8 && <svg viewBox="0 0 340 190" role="img" aria-label="三相负载相电压相量图" className="course-phasors">
      <text x="10" y="18">负载相电压</text><text x="330" y="18" textAnchor="end">外环 {max.toFixed(2)} V</text>
      <circle cx="170" cy="95" r="66" fill="none" className="chart-grid" /><line x1="85" x2="255" y1="95" y2="95" className="chart-grid" /><line x1="170" x2="170" y1="14" y2="176" className="chart-grid" />
      {vectors.map((v, i) => { const x = 170 + v.re / max * 66, y = 95 - v.im / max * 66, color = ['#a58439', '#3f7861', '#ab5b50'][i]; return <g key={i}><line x1="170" y1="95" x2={x} y2={y} stroke={color} strokeWidth="2.5" /><circle cx={x} cy={y} r="3.5" fill={color} /><text x={x + 8} y={y - 5} fill={color}>{'ABC'[i]}</text></g>; })}
    </svg>}
  </>;
}

function PotentialPanel() {
  const result = useLabStore(s => s.result), reference = useLabStore(s => s.referencePortId), setReference = useLabStore(s => s.setReferencePort);
  const ref = reference ?? 'potentials-ps:negative';
  const v = result.portVoltages ?? {}, relative = (port: string) => (v[port] ?? 0) - (v[ref] ?? 0);
  const points = POTENTIAL_POINTS.map((p, i) => ({ x: i, y: relative(`potentials-${p.alias}:${p.key}`) }));
  const span = Math.max(1, Math.max(...points.map(p => p.y)) - Math.min(...points.map(p => p.y)));
  points.push({ x: 4, y: points[0].y });
  return <>
    <label className="course-control-label">参考点<select className="select-control" aria-label="电位参考点" value={ref} onChange={e => setReference(e.target.value)}>{POTENTIAL_POINTS.map(p => <option key={p.label} value={`potentials-${p.alias}:${p.key}`}>{p.label}</option>)}</select></label>
    <Plot series={[{ name: '电位', color: '#3f786b', points }]} xTitle="沿回路各点" yTitle="φ / V" xLabels={['A', 'B', 'C', 'D', 'A']} label="电路电位图" yBounds={[-span, span]} />
    <div className="course-metrics"><div><span>U_BC</span><strong>{formatVoltage((v['potentials-r1:a'] ?? 0) - (v['potentials-r2:a'] ?? 0))}</strong></div><div><span>U_CD</span><strong>{formatVoltage((v['potentials-r2:a'] ?? 0) - (v['potentials-r3:a'] ?? 0))}</strong></div></div>
  </>;
}

function KirchhoffPanel() {
  const result = useLabStore(s => s.result), components = useLabStore(s => s.components), wires = useLabStore(s => s.wires);
  const e = result.elements;
  const current = (alias: string) => e[`kirchhoff-${alias}`]?.current ?? 0;
  const voltage = (alias: string) => e[`kirchhoff-${alias}`]?.voltage ?? 0;
  const audit = auditCircuit({ components, wires }, result);
  const kcl = current('am') - current('r1') - current('r2') - current('vm');
  const loop = (r: string) => voltage('ps') - voltage('sw') - voltage('am') - voltage(r);
  return <>
    <table className="measurement-table"><thead><tr><th>支路</th><th>U / V</th><th>I / mA</th></tr></thead><tbody>{['am', 'r1', 'r2', 'vm'].map(a => <tr key={a}><th>{a.toUpperCase()}</th><td>{voltage(a).toFixed(4)}</td><td>{(current(a) * 1000).toFixed(4)}</td></tr>)}</tbody></table>
    <div className="course-equations"><div><span>I_AM − I_R1 − I_R2 − I_VM</span><code>{kcl.toExponential(2)} A</code></div><div><span>回路 PS → SW → AM → R1</span><code>{loop('r1').toExponential(2)} V</code></div><div><span>回路 PS → SW → AM → R2</span><code>{loop('r2').toExponential(2)} V</code></div></div>
    {audit && <div className={`course-check ${audit.passed ? 'is-ok' : ''}`}>{audit.passed ? '节点电流与功率平衡通过' : '请检查守恒残差'}</div>}
  </>;
}

export function CourseDataPanel({ presentation = false }: { presentation?: boolean }) {
  const state = useLabStore;
  const id = useLabStore(s => s.activeLabId), components = useLabStore(s => s.components), wires = useLabStore(s => s.wires), result = useLabStore(s => s.result), measurements = useLabStore(s => s.measurements);
  const rows = useMemo(() => measurements.filter(r => r.labId === id), [measurements, id]);
  const [factor, setFactor] = useState(2);
  const lab = COURSE_LABS.find(l => l.id === id)!;
  const source = components.find(c => c.type === 'power-supply');
  const load = components.find(c => c.id === `${id}-load`);
  const eq = useMemo(() => load && ['thevenin', 'max-power'].includes(id) && result.solved ? analyzeThevenin({ components, wires }, load.id) : null, [components, wires, load, id, result]);
  const phaseValues = id.startsWith('three-phase-') ? threePhaseReadings({ components, wires }, result) : null;
  const issue = measurementIssue(components, result) ?? (id.startsWith('three-phase-') && phaseValues?.wiringValid !== 1 ? '请按本实验的星形或三角形接法连接负载。' : null);
  const am = components.find(c => c.type === 'ammeter'), vm = components.find(c => c.type === 'voltmeter');
  const additive = superpositionEvidence(rows), measuredEq = theveninEvidence(rows);
  const specimen = components.find(c => c.id === 'iv-characteristics-r1');
  const fields = rows.map(courseRecordFields), columns = Object.keys(fields[0] ?? {}).slice(0, presentation ? undefined : id.startsWith('three-phase-') ? 5 : 4);
  const formatCell = (value: string | number | null | undefined) => typeof value === 'number' ? Number(value.toPrecision(5)).toString() : value ?? '—';
  const setSources = (kind: 'both' | 'one' | 'two' | 'scale') => {
    state.getState().beginTransaction();
    for (const [index, alias] of ['ps1', 'ps2'].entries()) {
      const voltage = kind === 'one' && index === 1 || kind === 'two' && index === 0 ? 0 : [6, 3][index] * (kind === 'scale' ? factor : 1);
      state.getState().setParam(`superposition-${alias}`, 'enabled', true, false);
      state.getState().setParam(`superposition-${alias}`, 'voltage', voltage, false);
    }
    state.getState().commitTransaction();
  };
  const exportCsv = () => {
    const url = URL.createObjectURL(new Blob([courseCsv(rows)], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a'); a.href = url; a.download = `circuitlab-${id}.csv`; a.click(); window.setTimeout(() => URL.revokeObjectURL(url), 10000);
  };
  return <div className="panel-stack course-data" aria-label="本实验测量">
    <div className="course-main">
    <h2>{lab.title}</h2>
    {id === 'iv-characteristics' && <div className="course-controls" role="group" aria-label="伏安特性器件">
      <button type="button" className="button button-secondary" aria-pressed={specimen?.type === 'resistor'} onClick={() => state.getState().replaceComponent('iv-characteristics-r1', 'resistor')}>电阻</button>
      <button type="button" className="button button-secondary" aria-pressed={specimen?.type === 'bulb'} onClick={() => state.getState().replaceComponent('iv-characteristics-r1', 'bulb')}>小灯泡</button>
    </div>}
    {id === 'iv-characteristics' && source && <label className="course-voltage">电源 U <strong>{Number(source.params.voltage).toFixed(1)} V</strong><input type="range" aria-label="伏安测量电源电压" min="0" max="6" step="0.1" value={Number(source.params.voltage)} onPointerDown={() => state.getState().beginTransaction()} onChange={e => state.getState().setParam(source.id, 'voltage', Number(e.target.value), false)} onPointerUp={() => state.getState().commitTransaction()} onFocus={() => state.getState().beginTransaction()} onBlur={() => state.getState().commitTransaction()} /></label>}
    {id === 'superposition' && <div className="course-source-cases">
      <div className="course-controls"><button type="button" className="button button-secondary compact" onClick={() => setSources('both')}>共同作用</button><button type="button" className="button button-secondary compact" onClick={() => setSources('one')}>仅 U₁</button><button type="button" className="button button-secondary compact" onClick={() => setSources('two')}>仅 U₂</button></div>
      <div className="course-controls"><label>倍率<select aria-label="齐次性倍率" value={factor} onChange={e => setFactor(Number(e.target.value))}><option value="0.5">0.5</option><option value="2">2</option><option value="3">3</option></select></label><button type="button" className="button button-secondary compact" onClick={() => setSources('scale')}>两路同比变化</button></div>
    </div>}
    {!id.startsWith('three-phase-') && <div className="course-metrics">{vm && <div><span>电压表</span><strong>{formatVoltage(result.elements[vm.id]?.reading)}</strong></div>}{am && <div><span>电流表</span><strong>{formatCurrent(result.elements[am.id]?.reading)}</strong></div>}</div>}
    <div className="course-controls"><button type="button" className="button button-primary" disabled={!!issue} onClick={() => state.getState().recordMeasurement()}><Plus size={15} />记录当前读数</button><button type="button" className="button button-ghost" disabled={!rows.length} onClick={exportCsv}><Download size={14} />导出 CSV</button></div>
    {issue && <p className="course-issue" role="status">{issue}</p>}
    <div className="course-results"><div className="lesson-analysis">
    {id === 'iv-characteristics' && <Plot label="电阻与小灯泡伏安特性测量曲线" xTitle="U / V" yTitle="I / mA" series={['resistor', 'bulb'].map((type, index) => ({ name: index ? '小灯泡' : '电阻', color: index ? '#b4893f' : '#3d786a', points: distinctRows(rows, id, type).filter(r => r.voltage !== null && r.current !== null).map(r => ({ x: r.voltage!, y: r.current! * 1000 })) }))} />}
    {id === 'potentials' && <PotentialPanel />}
    {id === 'kirchhoff' && <KirchhoffPanel />}
    {id === 'superposition' && <div className="course-equations">
      <div><span>叠加残差</span><code>{additive.additive ? `${additive.additive.residual.toExponential(2)} A` : '待三种状态记录'}</code></div><div><span>齐次残差</span><code>{additive.homogeneous ? `${additive.homogeneous.residual.toExponential(2)} A` : '待同比变化记录'}</code></div>
    </div>}
    {eq && <div className="course-metrics"><div><span>Uth</span><strong>{formatVoltage(eq.voltage)}</strong></div><div><span>Rth</span><strong>{formatResistance(eq.resistance)}</strong></div></div>}
    {id === 'thevenin' && <div className="course-equations"><div><span>两负载法 Uth</span><code>{measuredEq ? formatVoltage(measuredEq.voltage) : '待不同负载记录'}</code></div><div><span>两负载法 Rth</span><code>{measuredEq ? formatResistance(measuredEq.resistance) : '—'}</code></div>{eq && load && <div><span>等效预测 I_L</span><code>{formatCurrent(eq.predictedCurrent)}</code></div>}</div>}
    {id === 'max-power' && eq && <><div className="course-metrics"><div><span>负载功率</span><strong>{formatPower(load ? result.elements[load.id]?.power : 0)}</strong></div><div><span>理论最大功率</span><strong>{formatPower(eq.maxPower)}</strong></div></div><Plot label="最大功率传输曲线" xTitle="R_L / R_th" yTitle="P_L / P_max" series={[
      { name: '理论', color: '#3d786a', markers: false, points: Array.from({ length: 65 }, (_, i) => { const x = i / 16; return { x, y: 4 * x / (1 + x) ** 2 }; }) },
      { name: '测量', color: '#b4893f', connect: false, points: rows.filter(r => r.observation?.values.maxPower).map(r => ({ x: Number(r.observation!.settings['max-power-load.resistance']) / r.observation!.values.theveninR, y: r.observation!.values['p:max-power-load'] / r.observation!.values.maxPower })) },
    ]} /></>}
    {id.startsWith('three-phase-') && <ThreePhasePanel />}
    </div>
    </div>
    </div>
    <section className="course-records"><h3>记录 <span>{rows.length}</span></h3>
      {rows.length ? <div className="measurement-table-wrap"><table className="measurement-table"><thead><tr>{columns.map(c => <th key={c}>{c}</th>)}<th /></tr></thead><tbody>{(presentation ? rows : rows.slice(-12)).map((r: MeasurementRow) => { const f = courseRecordFields(r); return <tr key={r.id}>{columns.map(c => <td key={c}>{formatCell(f[c])}</td>)}<td><button className="icon-button tiny" type="button" aria-label="删除测量记录" onClick={() => state.getState().deleteMeasurement(r.id)}><Trash2 size={13} /></button></td></tr>; })}</tbody></table></div> : <div className="empty-inline">暂无测量记录</div>}
    </section>
  </div>;
}
