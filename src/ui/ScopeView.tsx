import { useId, useMemo } from 'react';
import type { LabComponent } from '../circuit';
import { scopeFrame } from '../circuit/scope';
import { useLabStore } from '../store/labStore';
import { useScopeStore } from '../store/scopeStore';
import { formatVoltage } from './format';
export function useScopeFrame(component: LabComponent) {
  const result = useLabStore(s => s.result), wires = useLabStore(s => s.wires), components = useLabStore(s => s.components), samples = useLabStore(s => s.transient.samples);
  const held = useScopeStore(s => s.held[component.id]);
  const input = !component.params.running && held ? held : { result, wires, components, samples };
  // Model poses and display gain do not change the acquired signal.
  return useMemo(() => scopeFrame(component, input, input.result, input.samples), [component.id, component.params.enabled, component.params.timeDiv, component.params.triggerLevel, input.result, input.wires, input.samples]);
}
export function ScopeView({ component, compact = false }: { component: LabComponent; compact?: boolean }) {
  const frame = useScopeFrame(component), clip = useId();
  const g = compact ? { w: 360, h: 208, x: 16, y: 28, width: 328, height: 160 } : { w: 760, h: 470, x: 36, y: 36, width: 688, height: 384 };
  const right = g.x + g.width, bottom = g.y + g.height, center = g.y + g.height / 2;
  const y = (v: number, ch = 1) => center - v / Number(component.params[`voltsDiv${ch}`]) * g.height / 8;
  return <div className={`scope-view ${compact ? 'is-compact' : ''}`}><svg viewBox={`0 0 ${g.w} ${g.h}`} role="img" aria-label="实际双通道电压波形">
    <defs><clipPath id={clip}><rect x={g.x} y={g.y} width={g.width} height={g.height} /></clipPath></defs>
    <rect width={g.w} height={g.h} rx="12" fill="#071715" />
    {Array.from({ length: 11 }, (_, i) => <line key={`x${i}`} x1={g.x + i * g.width / 10} x2={g.x + i * g.width / 10} y1={g.y} y2={bottom} stroke="#254039" strokeDasharray={i === 5 ? '3 3' : undefined} />)}
    {Array.from({ length: 9 }, (_, i) => <line key={`y${i}`} x1={g.x} x2={right} y1={g.y + i * g.height / 8} y2={g.y + i * g.height / 8} stroke="#254039" strokeDasharray={i === 4 ? '3 3' : undefined} />)}
    <text x={g.x} y={g.y - 10} fill="#e4b65d">CH1 {Number(component.params.voltsDiv1)} V/div</text><text x={compact ? 130 : 260} y={g.y - 10} fill="#75d2d7">CH2 {Number(component.params.voltsDiv2)} V/div</text><text x={right} y={g.y - 10} textAnchor="end" fill="#a7c3b8">{Number(component.params.timeDiv) * 1000} ms/div</text>
    <g clipPath={`url(#${clip})`}>{frame.traces.map((t, i) => <polyline key={i} fill="none" stroke={i ? '#75d2d7' : '#efbd5c'} strokeWidth={compact ? 1.5 : 2.2} points={t.points.map(p => `${g.x + p.time / frame.duration * g.width},${y(p.voltage, i + 1)}`).join(' ')} />)}<line x1={g.x} x2={right} y1={y(Number(component.params.triggerLevel))} y2={y(Number(component.params.triggerLevel))} stroke="#d6a755" strokeDasharray="6 7" opacity="0.45" /></g>
    {!frame.traces.some(t => t.connected) && <text x={g.w / 2} y={center} fill="#8bac9f" textAnchor="middle">CH1 / CH2 未接入</text>}
    {!compact && <><text x="36" y="450" fill="#8bac9f">{component.params.running ? 'RUN' : 'HOLD'} · {frame.sampled ? '实际暂态采样' : frame.frequency ? `${frame.frequency} Hz · AUTO ↑` : 'DC'}</text><text x="724" y="450" textAnchor="end" fill="#8bac9f">{(frame.duration * 1000).toFixed(0)} ms</text></>}
  </svg>{compact ? <><div className="scope-channel-cards">{frame.traces.map((t, i) => <div key={i} className={`channel-${i + 1}`}><span>CH{i + 1}</span><strong>{t.vpp === null ? '—' : `${t.vpp.toFixed(2)} Vpp`}</strong><span>{!t.connected ? '未接入' : frame.sampled ? `${t.points.length} 点采样` : !frame.frequency ? `DC ${formatVoltage(t.points[0]?.voltage, 3)}` : `${formatVoltage(t.rms, 3)} RMS`}</span></div>)}</div>{frame.phase !== null && <div className="scope-phase"><span>CH2−CH1</span><strong>{frame.phase.toFixed(2)}°</strong><span>{frame.frequency} Hz</span></div>}</> : <div className="scope-metrics">{frame.traces.map((t, i) => <div key={i}><span>CH{i + 1} Vpp</span><strong>{t.vpp === null ? '—' : `${t.vpp.toFixed(3)} V`}</strong><span>RMS</span><strong>{t.rms === null ? '—' : `${t.rms.toFixed(3)} V`}</strong></div>)}<div><span>相位差 CH2−CH1</span><strong>{frame.phase === null ? '—' : `${frame.phase.toFixed(2)}°`}</strong></div></div>}</div>;
}
