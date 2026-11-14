import { useId, useMemo } from 'react';
import type { LabComponent } from '../circuit';
import { scopeFrame } from '../circuit/scope';
import { useLabStore } from '../store/labStore';
import { useScopeStore } from '../store/scopeStore';
export function useScopeFrame(component: LabComponent) {
  const result = useLabStore(s => s.result), wires = useLabStore(s => s.wires), components = useLabStore(s => s.components), samples = useLabStore(s => s.transient.samples);
  const held = useScopeStore(s => s.held[component.id]);
  const input = !component.params.running && held ? held : { result, wires, components, samples };
  return useMemo(() => scopeFrame(component, input, input.result, input.samples), [component, input.result, input.wires, input.components, input.samples]);
}
export function ScopeView({ component }: { component: LabComponent }) {
  const frame = useScopeFrame(component), clip = useId();
  return <div className="scope-view"><svg viewBox="0 0 760 470" role="img" aria-label="实际双通道电压波形">
    <defs><clipPath id={clip}><rect x="36" y="36" width="688" height="384" /></clipPath></defs>
    <rect width="760" height="470" rx="12" fill="#071715" />
    {Array.from({ length: 11 }, (_, i) => <line key={`x${i}`} x1={36 + i * 68.8} x2={36 + i * 68.8} y1="36" y2="420" stroke="#254039" strokeDasharray={i === 5 ? '3 3' : undefined} />)}
    {Array.from({ length: 9 }, (_, i) => <line key={`y${i}`} x1="36" x2="724" y1={36 + i * 48} y2={36 + i * 48} stroke="#254039" strokeDasharray={i === 4 ? '3 3' : undefined} />)}
    <text x="36" y="23" fill="#e4b65d">CH1 {Number(component.params.voltsDiv1)} V/div</text><text x="260" y="23" fill="#75d2d7">CH2 {Number(component.params.voltsDiv2)} V/div</text><text x="724" y="23" textAnchor="end" fill="#a7c3b8">{Number(component.params.timeDiv) * 1000} ms/div</text>
    <g clipPath={`url(#${clip})`}>{frame.traces.map((t, i) => <polyline key={i} fill="none" stroke={i ? '#75d2d7' : '#efbd5c'} strokeWidth="2.2" points={t.points.map(p => `${36 + p.time / frame.duration * 688},${228 - p.voltage / Number(component.params[`voltsDiv${i + 1}`]) * 48}`).join(' ')} />)}<line x1="36" x2="724" y1={228 - Number(component.params.triggerLevel) / Number(component.params.voltsDiv1) * 48} y2={228 - Number(component.params.triggerLevel) / Number(component.params.voltsDiv1) * 48} stroke="#d6a755" strokeDasharray="6 7" opacity="0.45" /></g>
    {!frame.traces.some(t => t.connected) && <text x="380" y="228" fill="#8bac9f" textAnchor="middle">CH1 / CH2 未接入</text>}
    <text x="36" y="450" fill="#8bac9f">{component.params.running ? 'RUN' : 'HOLD'} · {frame.sampled ? '实际暂态采样' : frame.frequency ? `${frame.frequency} Hz · AUTO ↑` : 'DC'}</text><text x="724" y="450" textAnchor="end" fill="#8bac9f">{(frame.duration * 1000).toFixed(0)} ms</text>
  </svg><div className="scope-metrics">{frame.traces.map((t, i) => <div key={i}><span>CH{i + 1} Vpp</span><strong>{t.vpp === null ? '—' : `${t.vpp.toFixed(3)} V`}</strong><span>RMS</span><strong>{t.rms === null ? '—' : `${t.rms.toFixed(3)} V`}</strong></div>)}<div><span>相位差 CH2−CH1</span><strong>{frame.phase === null ? '—' : `${frame.phase.toFixed(2)}°`}</strong></div></div></div>;
}
