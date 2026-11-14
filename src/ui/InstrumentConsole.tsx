import { measurementIssue } from '../circuit/measurement';
import { useLabStore } from '../store/labStore';
import { useViewStore } from '../store/viewStore';
import { ParamControl } from './InspectorPanel';
import { FloatingWindow } from './FloatingWindow';
import { InstrumentReadout } from './InstrumentReadout';
import { instrumentParams } from './instrumentPresentation';
export function InstrumentConsole() {
  const id = useViewStore(s => s.consoleId), components = useLabStore(s => s.components), result = useLabStore(s => s.result);
  const c = components.find(c => c.id === id);
  if (!c) return null;
  const e = result.elements[c.id], issue = measurementIssue(components, result), params = instrumentParams(c);
  return <FloatingWindow key={c.id} title={`${c.name} · 控制台`} onClose={() => useViewStore.getState().openConsole(null)}>
    <div className={`instrument-console-layout ${c.type === 'oscilloscope' ? 'is-scope' : ''}`}>
      <section className="instrument-console-display">
        <InstrumentReadout component={c} />
        {result.diagnostics.filter(item => item.componentIds?.includes(c.id) && item.level !== 'info').map(item => <p key={item.code} role="status" className="course-issue">{item.message}</p>)}
        {['multimeter', 'ammeter', 'voltmeter'].includes(c.type) && <button className="button button-primary" disabled={!!issue || e?.reading === undefined} onClick={() => useLabStore.getState().recordMeasurement()}>记录当前读数</button>}
      </section>
      <section className="console-parameters" aria-label="仪器控制参数">{params.map(p => <ParamControl key={p.key} component={c} definition={p} />)}</section>
    </div>
  </FloatingWindow>;
}
