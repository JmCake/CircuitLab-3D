import { useLayoutEffect, useRef } from 'react';
import { Database, FlaskConical, SlidersHorizontal, PanelRightClose, MonitorUp } from 'lucide-react';
import { useViewStore } from '../store/viewStore';
import { useLabStore, type SideTab } from '../store/labStore';
import { DataPanel } from './DataPanel';
import { InspectorPanel } from './InspectorPanel';
import { LabPanel } from './LabPanel';
import { formatCurrent, formatVoltage } from './format';

const TABS: { id: SideTab; label: string; icon: typeof FlaskConical }[] = [
  { id: 'lab', label: '实验', icon: FlaskConical },
  { id: 'inspector', label: '属性', icon: SlidersHorizontal },
  { id: 'data', label: '数据', icon: Database },
];

export function SidePanel() {
  const sideTab = useLabStore((state) => state.sideTab);
  const open = useViewStore(s => s.sideOpen);
  const consoleId = useViewStore(s => s.consoleId);
  const setSideTab = useLabStore((state) => state.setSideTab);
  const components = useLabStore((state) => state.components);
  const wires = useLabStore((state) => state.wires);
  const result = useLabStore((state) => state.result);
  const selectedId = useLabStore((state) => state.selectedId);
  const selectedWireId = useLabStore((state) => state.selectedWireId);
  const activeLabId = useLabStore((state) => state.activeLabId);
  const content = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (content.current) content.current.scrollTop = 0;
    useViewStore.getState().setSideOpen(true);
  }, [sideTab, selectedId, selectedWireId, activeLabId]);

  const errors = result.diagnostics.filter((item) => item.level === 'error');
  const warnings = result.diagnostics.filter((item) => item.level === 'warning');
  const isOn = (c: typeof components[number]) => Boolean(c.params.enabled) && (c.type !== 'programmable-supply' || Boolean(c.params.output1 || c.params.output2));
  const supplies = components.filter(c => result.domain === 'ac' ? c.type === 'three-phase-source' : c.type === 'power-supply' || c.type === 'programmable-supply');
  const supply = supplies.find(isOn) ?? supplies[0];
  const supplyElement = supply ? result.elements[supply.id] : undefined;
  const enabledSupply = supply ? isOn(supply) : false;
  const channel2 = supply?.type === 'programmable-supply' && !supply.params.output1 && supply.params.output2;
  const status = errors.length > 0
    ? { tone: 'error', label: errors[0].code === 'supply-short' ? '短路告警' : '求解异常' }
    : !result.solved
      ? { tone: 'error', label: '无法求解' }
      : warnings.length > 0
        ? { tone: 'warning', label: '需注意' }
        : components.length === 0
          ? { tone: 'idle', label: '空实验台' }
          : !enabledSupply
            ? { tone: 'idle', label: '电源未开启' }
            : { tone: 'ok', label: '电路正常' };

  if (consoleId) return null;
  return (
    <aside className={`side-panel ${open ? '' : 'is-closed'}`}>
      <div className="floating-panel-heading"><span>实验面板</span><button className="icon-button" aria-label="放大当前数据" title="放大当前数据" onClick={() => useViewStore.getState().setDataScreen(true)}><MonitorUp size={17} /></button><button className="icon-button" aria-label="收起实验面板" title="收起实验面板" onClick={() => useViewStore.getState().setSideOpen(false)}><PanelRightClose size={17} /></button></div>
      <div className="side-tabs" role="tablist" aria-label="实验台面板">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const active = sideTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={active}
              className={active ? 'is-active' : ''}
              onClick={() => setSideTab(tab.id)}
            >
              <Icon size={15} />
              {tab.label}
              {(tab.id === 'inspector' && (selectedId || selectedWireId)) && <i className="tab-dot" />}
              {tab.id === 'data' && errors.length + warnings.length > 0 && <i className="tab-badge">{errors.length + warnings.length}</i>}
            </button>
          );
        })}
      </div>

      <div className="live-strip">
        <div className={`circuit-status ${status.tone}`}>
          <span className="status-dot" />
          <strong>{status.label}</strong>
        </div>
        <div className="live-metrics">
          {supplyElement && enabledSupply ? (
            <>
              <span>
                <em>{result.domain === 'ac' ? 'U_AN' : supply?.type === 'programmable-supply' ? channel2 ? 'U₂' : 'U₁' : 'U'}</em>
                {formatVoltage(channel2 ? Number(supplyElement.flags?.voltage2) : typeof supplyElement.flags?.outputVoltage === 'number' ? (supplyElement.flags.outputVoltage as number) : supplyElement.voltage)}
              </span>
              <span>
                <em>{result.domain === 'ac' ? 'I_A' : supply?.type === 'programmable-supply' ? channel2 ? 'I₂' : 'I₁' : 'I'}</em>
                {formatCurrent(channel2 ? Number(supplyElement.flags?.current2) : supplyElement.current)}
              </span>
            </>
          ) : (
            <span className="live-muted">{components.length} 器材 · {wires.length} 导线</span>
          )}
        </div>
        {(errors.length > 0 || warnings.length > 0) && (
          <button
            type="button"
            className={`diagnostic-pill ${errors.length > 0 ? 'error' : 'warning'}`}
            onClick={() => setSideTab('data')}
          >
            {errors.length + warnings.length}
          </button>
        )}
      </div>

      <div className="side-panel-content" ref={content}>
        {sideTab === 'lab' && <LabPanel />}
        {sideTab === 'inspector' && <InspectorPanel />}
        {sideTab === 'data' && <DataPanel />}
      </div>
    </aside>
  );
}
