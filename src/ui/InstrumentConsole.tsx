import { getDefinition } from '../circuit';
import { measurementIssue } from '../circuit/measurement';
import { useLabStore } from '../store/labStore';
import { useViewStore } from '../store/viewStore';
import { ParamControl } from './InspectorPanel';
import { FloatingWindow } from './FloatingWindow';
import { ScopeView } from './ScopeView';
import { formatVoltage, formatCurrent, formatResistance } from './format';
export function InstrumentConsole() {
  const id = useViewStore(s => s.consoleId), components = useLabStore(s => s.components), result = useLabStore(s => s.result);
  const c = components.find(c => c.id === id);
  if (!c) return null;
  const d = getDefinition(c.type), e = result.elements[c.id], issue = measurementIssue(components, result);
  const params = d.params.filter(p => c.type !== 'multimeter' || !p.key.endsWith('Range') || p.key === (c.params.mode === 'ohms' ? 'resistanceRange' : String(c.params.mode).endsWith('i') ? 'currentRange' : 'voltageRange'));
  const reading = !result.solved || !e || !c.params.enabled && ['multimeter', 'programmable-supply', 'oscilloscope', 'power-supply', 'three-phase-source'].includes(c.type) ? '—' : e.flags?.openCircuit ? 'OL' : e.flags?.invalidReading ? '—' : e.overRange ? 'OL' : e.readingUnit === 'Ω' ? formatResistance(e.reading) : e.readingUnit === 'A' ? formatCurrent(e.reading) : formatVoltage(e.reading ?? e.voltage);
  return <FloatingWindow key={c.id} title={`${c.name} · 控制台`} onClose={() => useViewStore.getState().openConsole(null)}>
    <div className={`instrument-console-layout ${c.type === 'oscilloscope' ? 'is-scope' : ''}`}>
      <section className="instrument-console-display">
        {c.type === 'oscilloscope' ? <ScopeView component={c} /> : c.type === 'programmable-supply' ? <div className="supply-channels">{[1, 2].map(ch => <div key={ch}><span>CH{ch}<b>{String(e?.flags?.[`mode${ch}`] ?? 'OFF')}</b></span><strong>{formatVoltage(ch === 1 ? e?.voltage : Number(e?.flags?.voltage2 ?? 0))}</strong><strong>{formatCurrent(ch === 1 ? e?.current : Number(e?.flags?.current2 ?? 0))}</strong></div>)}</div> : <div className="console-digital"><span>{c.type === 'multimeter' ? String(c.params.mode).toUpperCase() : d.name}</span>{['power-supply', 'three-phase-source'].includes(c.type) ? <div className="console-source-values"><strong>{result.solved ? formatVoltage(e?.voltage) : '—'}</strong><strong>{result.solved ? formatCurrent(e?.current) : '—'}</strong></div> : <strong>{reading}</strong>}</div>}
        {result.diagnostics.filter(item => item.componentIds?.includes(c.id) && item.level !== 'info').map(item => <p key={item.code} role="status" className="course-issue">{item.message}</p>)}
        {['multimeter', 'ammeter', 'voltmeter'].includes(c.type) && <button className="button button-primary" disabled={!!issue || e?.reading === undefined} onClick={() => useLabStore.getState().recordMeasurement()}>记录当前读数</button>}
      </section>
      <section className="console-parameters" aria-label="仪器控制参数">{params.map(p => <ParamControl key={p.key} component={c} definition={p} />)}</section>
    </div>
  </FloatingWindow>;
}
