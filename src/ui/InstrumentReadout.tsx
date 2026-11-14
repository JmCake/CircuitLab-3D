import { useMemo, useState } from 'react';
import { Pause, Play, Power, ScanLine } from 'lucide-react';
import { getDefinition, type LabComponent } from '../circuit';
import { magnitude, sub, zero } from '../circuit/simulation/complex';
import { useLabStore } from '../store/labStore';
import { ScopeView, useScopeFrame } from './ScopeView';
import { autoScopeRanges, meterConnected, meterReading } from './instrumentPresentation';
import { formatCurrent, formatVoltage } from './format';

function SourcePhasors({ component }: { component: LabComponent }) {
  const result = useLabStore(s => s.result);
  const active = Boolean(component.params.enabled && result.solved && result.ac);
  const values = ['a', 'b', 'c'].map(p => sub(result.ac?.portVoltages[`${component.id}:${p}`] ?? zero(), result.ac?.portVoltages[`${component.id}:n`] ?? zero()));
  const peak = Math.max(...values.map(magnitude)), scale = Math.max(1e-9, peak);
  return <svg className="source-phasors" viewBox="0 0 320 165" role="img" aria-label="电源实际三相电压相量图">
    <circle cx="160" cy="82" r="60" fill="none" stroke="#35594c" /><path d="M85 82H235M160 12V152" stroke="#27473d" />
    {active && peak > 1e-9 ? values.map((v, i) => { const x = 160 + v.re / scale * 60, y = 82 - v.im / scale * 60; return <g key={i} stroke={['#dfb85b', '#6bb490', '#e17e71'][i]}><line x1="160" y1="82" x2={x} y2={y} strokeWidth="2" /><circle cx={x} cy={y} r="3" fill={['#dfb85b', '#6bb490', '#e17e71'][i]} /><text x={x + 7} y={y - 5} stroke="none" fill={['#dfb85b', '#6bb490', '#e17e71'][i]}>{'ABC'[i]} {formatVoltage(magnitude(v))}</text></g>; }) : <text x="160" y="85" textAnchor="middle" fill="#9bb9ab">{active ? '0 V' : '输出关闭'}</text>}
  </svg>;
}
function CapacitorReadout({ component }: { component: LabComponent }) {
  const samples = useLabStore(s => s.transient.samples), result = useLabStore(s => s.result);
  const rows = useMemo(() => samples.filter(s => Number.isFinite(s.values[component.id])).map(s => ({ t: s.time, v: s.values[component.id] })), [samples, component.id]);
  const end = Math.max(0.02, rows.at(-1)?.t ?? 0), min = Math.min(0, ...rows.map(r => r.v)), max = Math.max(min + 0.001, ...rows.map(r => r.v));
  return <div className="capacitor-readout"><strong>{result.solved ? formatVoltage(result.elements[component.id]?.voltage, 3) : '—'}</strong><svg viewBox="0 0 320 160" role="img" aria-label="电容电压实际采样曲线">
    {[30, 75, 120].map(y => <line key={y} x1="28" x2="300" y1={y} y2={y} stroke="#2d4c40" />)}
    {rows.length ? <polyline fill="none" stroke="#83d4b5" strokeWidth="2" points={rows.map(r => `${28 + r.t / end * 272},${120 - (r.v - min) / (max - min) * 90}`).join(' ')} /> : <text x="160" y="76" textAnchor="middle" fill="#9bb9ab">尚未采样</text>}
    <text x="28" y="148" fill="#9bb9ab">0 s</text><text x="300" y="148" textAnchor="end" fill="#9bb9ab">{end.toFixed(2)} s</text><text x="28" y="18" fill="#9bb9ab">{max.toFixed(2)} V</text>
  </svg></div>;
}
export function InstrumentReadout({ component: c, compact = false }: { component: LabComponent; compact?: boolean }) {
  const result = useLabStore(s => s.result), wires = useLabStore(s => s.wires);
  const e = result.elements[c.id], on = c.params.enabled !== false, valid = on && result.solved && !!e;
  const meter = ['multimeter', 'ammeter', 'voltmeter'].includes(c.type);
  return <div className={`instrument-readout ${compact ? 'is-compact' : ''} ${meter ? 'is-meter' : ''}`} aria-label={`${c.name}实时显示`}>
    {c.type === 'oscilloscope' ? <ScopeView component={c} compact={compact} /> : c.type === 'capacitor' ? <CapacitorReadout component={c} /> : c.type === 'programmable-supply' ? <div className="supply-channels">{[1, 2].map(ch => <div key={ch}><span>CH{ch}<b>{valid ? String(e.flags?.[`mode${ch}`] ?? 'OFF') : 'OFF'}</b></span><strong>{valid && c.params[`output${ch}`] ? formatVoltage(ch === 1 ? e.voltage : Number(e.flags?.voltage2)) : '—'}</strong><strong>{valid && c.params[`output${ch}`] ? formatCurrent(ch === 1 ? e.current : Number(e.flags?.current2)) : '—'}</strong></div>)}</div> : <>
      {c.type === 'three-phase-source' && <SourcePhasors component={c} />}
      <div className="console-digital" data-off={!on}><span>{meter ? c.type === 'multimeter' ? String(c.params.mode).toUpperCase() : `${c.params.mode === 'ac' ? 'AC' : 'DC'} ${c.type === 'ammeter' ? 'I' : 'V'}` : getDefinition(c.type).name}
        {meter && <em>{!on ? 'OFF' : meterConnected(c, e, wires) ? e?.flags?.invalidReading ? '检查接线' : '已接入' : '未接入'}</em>}</span>
        {['power-supply', 'three-phase-source'].includes(c.type) ? <div className="console-source-values"><strong>{valid ? formatVoltage(e.voltage) : '—'}</strong><strong>{valid ? formatCurrent(e.current) : '—'}</strong></div> : <strong>{meter ? meterReading(c, result, wires) : result.solved ? formatVoltage(e?.reading ?? e?.voltage) : '—'}</strong>}
      </div>
    </>}
  </div>;
}

function ScopeControls({ component: c }: { component: LabComponent }) {
  const [channel, setChannel] = useState(1), frame = useScopeFrame(c);
  const set = useLabStore(s => s.setParam), definition = getDefinition(c.type);
  const vertical = definition.params.find(p => p.key === `voltsDiv${channel}`), time = definition.params.find(p => p.key === 'timeDiv');
  return <div className="scope-quick-controls">
    <div className="scope-quick-row"><div className="scope-channel-switch" role="group" aria-label="垂直档位通道">{[1, 2].map(ch => <button key={ch} aria-pressed={ch === channel} onClick={() => setChannel(ch)}>CH{ch}</button>)}</div>
      <button aria-label="自动垂直档位" title="自动垂直档位" onClick={() => { const store = useLabStore.getState(); store.beginTransaction(); autoScopeRanges(c, frame).forEach((value, i) => store.setParam(c.id, `voltsDiv${i + 1}`, value, false)); store.commitTransaction(); }}><ScanLine size={14} />AUTO</button>
      <button aria-label="切换采集" aria-pressed={!c.params.running} title={c.params.running ? '暂停采集' : '恢复采集'} onClick={() => set(c.id, 'running', !c.params.running)}>{c.params.running ? <Pause size={14} /> : <Play size={14} />}{c.params.running ? 'RUN' : 'HOLD'}</button>
    </div>
    <div className="scope-quick-row scope-selects"><label>CH{channel}<select aria-label={`CH${channel} 垂直档位`} value={Number(c.params[`voltsDiv${channel}`])} onChange={e => set(c.id, `voltsDiv${channel}`, Number(e.target.value))}>{vertical?.kind === 'select' && vertical.options.map(o => <option key={String(o.value)} value={String(o.value)}>{o.label}</option>)}</select></label>
      <label>时基<select aria-label="水平时基" value={Number(c.params.timeDiv)} onChange={e => set(c.id, 'timeDiv', Number(e.target.value))}>{time?.kind === 'select' && time.options.map(o => <option key={String(o.value)} value={String(o.value)}>{Number(o.value) * 1000} ms/div</option>)}</select></label>
    </div>
  </div>;
}
export function InstrumentPowerControl({ component: c }: { component: LabComponent }) {
  const set = useLabStore(s => s.setParam);
  return 'enabled' in c.params ? <button className={`preview-power ${c.params.enabled ? 'is-on' : ''}`} title="电源" aria-label={`切换${getDefinition(c.type).params.find(p => p.key === 'enabled')?.label ?? '电源'}`} aria-pressed={Boolean(c.params.enabled)} onClick={() => set(c.id, 'enabled', !c.params.enabled)}><Power size={15} /></button> : null;
}
export function InstrumentQuickControls({ component: c }: { component: LabComponent }) {
  const set = useLabStore(s => s.setParam), running = useLabStore(s => s.transient.running);
  const toggleTransient = () => { const store = useLabStore.getState(); if (running) store.pauseTransient(); else { store.resumeTransient(); store.setSideTab('inspector'); } };
  const mode = getDefinition(c.type).params.find(p => p.key === 'mode');
  return <>
    {c.type === 'oscilloscope' ? <ScopeControls component={c} /> : mode?.kind === 'select' ? <div className="instrument-modes" role="group" aria-label={mode.label}>{mode.options.map(o => <button key={String(o.value)} aria-pressed={c.params.mode === o.value} onClick={() => set(c.id, 'mode', o.value)}>{c.type === 'multimeter' ? o.value === 'ohms' ? 'Ω' : String(o.value).toUpperCase() : o.label}</button>)}</div> : c.type === 'programmable-supply' ? <div className="instrument-modes">{[1, 2].map(ch => <button key={ch} aria-label={`切换CH${ch} 输出`} aria-pressed={Boolean(c.params[`output${ch}`])} onClick={() => set(c.id, `output${ch}`, !c.params[`output${ch}`])}>CH{ch} {c.params[`output${ch}`] ? 'ON' : 'OFF'}</button>)}</div> : c.type === 'capacitor' ? <div className="instrument-modes"><button onClick={toggleTransient}>{running ? <Pause size={14} /> : <Play size={14} />}{running ? '暂停暂态' : '开始暂态'}</button></div> : null}
  </>;
}
export function quickControlKeys(c: LabComponent) {
  return new Set(['enabled', ...(['multimeter', 'ammeter', 'voltmeter'].includes(c.type) ? ['mode'] : []), ...(c.type === 'oscilloscope' ? ['running', 'timeDiv', 'voltsDiv1', 'voltsDiv2'] : []), ...(c.type === 'programmable-supply' ? ['output1', 'output2'] : [])]);
}
