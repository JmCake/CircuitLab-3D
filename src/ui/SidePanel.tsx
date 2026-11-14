import { useLayoutEffect, useRef } from 'react';
import { Database, FlaskConical, SlidersHorizontal } from 'lucide-react';
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
  }, [sideTab, selectedId, selectedWireId, activeLabId]);

  const errors = result.diagnostics.filter((item) => item.level === 'error');
  const warnings = result.diagnostics.filter((item) => item.level === 'warning');
  const supply = components.find((component) => component.type === 'power-supply');
  const supplyElement = supply ? result.elements[supply.id] : undefined;
  const enabledSupply = supply ? Boolean(supply.params.enabled) : false;
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

  return (
    <aside className="side-panel">
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
                <em>U</em>
                {formatVoltage(typeof supplyElement.flags?.outputVoltage === 'number' ? (supplyElement.flags.outputVoltage as number) : supplyElement.voltage)}
              </span>
              <span>
                <em>I</em>
                {formatCurrent(supplyElement.current)}
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
