import { useEffect, useMemo, useState } from 'react';
import {
  Cable,
  CircleDot,
  Crosshair,
  RotateCcw,
  RotateCw,
  Trash2,
  Unplug,
} from 'lucide-react';
import {
  findPortOwner,
  getDefinition,
  getInternalPortGroups,
  type ComponentType,
  type LabComponent,
  type ParamDefinition,
  type Wire,
} from '../circuit';
import { useLabStore } from '../store/labStore';
import { cameraBridge } from '../three/cameraBridge';
import { InstrumentPowerControl, InstrumentQuickControls, InstrumentReadout, quickControlKeys } from './InstrumentReadout';
import { hasInstrumentDisplay, instrumentParams } from './instrumentPresentation';
import {
  formatCurrent,
  formatParamValue,
  formatPower,
  formatResistance,
  formatVoltage,
} from './format';

const ROLE_COLORS: Record<string, string> = {
  positive: '#ad493e',
  negative: '#343635',
  anode: '#ad493e',
  cathode: '#343635',
  wiper: '#a27a45',
  bidirectional: '#8b806b',
  hole: '#9e8d67',
};

function portDisplay(component: LabComponent, portKey: string): string {
  const port = getDefinition(component.type).ports.find((item) => item.key === portKey);
  return port?.label ?? portKey;
}

function NumberParam({
  component,
  definition,
}: {
  component: LabComponent;
  definition: Extract<ParamDefinition, { kind: 'number' }>;
}) {
  const setParam = useLabStore((state) => state.setParam);
  const current = Number(component.params[definition.key] ?? definition.min);
  const [focused, setFocused] = useState(false);
  const [draft, setDraft] = useState(String(current));

  useEffect(() => {
    if (!focused) setDraft(String(Number(current.toFixed(6))));
  }, [current, focused]);

  const commit = () => {
    const parsed = Number(draft);
    if (Number.isFinite(parsed)) {
      const stepped = Math.round(parsed / definition.step) * definition.step;
      const clamped = Math.min(definition.max, Math.max(definition.min, stepped));
      setParam(component.id, definition.key, clamped);
      setDraft(String(Number(clamped.toFixed(6))));
    } else {
      setDraft(String(current));
    }
    setFocused(false);
  };

  return (
    <div className="param-field">
      <div className="param-label-row">
        <label htmlFor={`param-${component.id}-${definition.key}`} title={definition.description}>{definition.label}</label>
        <span className="param-limit">
          {definition.min} – {definition.max} {definition.unit}
        </span>
      </div>
      <div className="number-input-wrap">
        <input
          id={`param-${component.id}-${definition.key}`}
          className="text-input"
          type="number"
          value={draft}
          min={definition.min}
          max={definition.max}
          step={definition.step}
          onFocus={() => setFocused(true)}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.currentTarget.blur();
            }
          }}
        />
        <span>{definition.unit}</span>
      </div>
      {definition.suggestions && definition.suggestions.length > 0 && (
        <div className="quick-values">
          {definition.suggestions.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              className="quick-value"
              onClick={() => setParam(component.id, definition.key, suggestion)}
            >
              {formatParamValue(suggestion, 0)}{definition.unit}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function SliderParam({
  component,
  definition,
}: {
  component: LabComponent;
  definition: Extract<ParamDefinition, { kind: 'slider' }>;
}) {
  const setParam = useLabStore((state) => state.setParam);
  const beginTransaction = useLabStore((state) => state.beginTransaction);
  const commitTransaction = useLabStore((state) => state.commitTransaction);
  const raw = Number(component.params[definition.key] ?? definition.min);
  const value = Number.isFinite(raw) ? raw : definition.min;
  const percentage = ((value - definition.min) / (definition.max - definition.min)) * 100;
  const display = formatParamValue(value, definition.precision ?? 2);

  return (
    <div className="param-field">
      <div className="param-label-row">
        <label htmlFor={`param-${component.id}-${definition.key}`} title={definition.description}>{definition.label}</label>
        <strong className="param-value">
          {display}
          <em>{definition.unit}</em>
        </strong>
      </div>
      <input
        id={`param-${component.id}-${definition.key}`}
        className="range-input"
        type="range"
        min={definition.min}
        max={definition.max}
        step={definition.step}
        value={value}
        style={{ '--range-progress': `${percentage}%` } as React.CSSProperties}
        onPointerDown={beginTransaction}
        onFocus={beginTransaction}
        onChange={(event) =>
          setParam(component.id, definition.key, Number(event.target.value), false)
        }
        onPointerUp={commitTransaction}
        onBlur={commitTransaction}
      />
      <div className="range-scale">
        <span>{definition.min}</span>
        <span>{definition.max} {definition.unit}</span>
      </div>
      {definition.suggestions && definition.suggestions.length > 0 && (
        <div className="quick-values">
          {definition.suggestions.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              className="quick-value"
              onClick={() => setParam(component.id, definition.key, suggestion)}
            >
              {formatParamValue(suggestion, definition.precision ?? 1)}{definition.unit}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function SelectParam({
  component,
  definition,
}: {
  component: LabComponent;
  definition: Extract<ParamDefinition, { kind: 'select' }>;
}) {
  const setParam = useLabStore((state) => state.setParam);
  return (
    <div className="param-field">
      <div className="param-label-row">
        <label htmlFor={`param-${component.id}-${definition.key}`} title={definition.description}>{definition.label}</label>
      </div>
      <select
        id={`param-${component.id}-${definition.key}`}
        className="select-control full"
        value={String(component.params[definition.key] ?? definition.options[0]?.value ?? '')}
        onChange={(event) => {
          const next = definition.options.find((option) => String(option.value) === event.target.value);
          if (next) setParam(component.id, definition.key, next.value);
        }}
      >
        {definition.options.map((option) => (
          <option key={String(option.value)} value={String(option.value)}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function SwitchParam({
  component,
  definition,
}: {
  component: LabComponent;
  definition: Extract<ParamDefinition, { kind: 'switch' }>;
}) {
  const setParam = useLabStore((state) => state.setParam);
  const on = Boolean(component.params[definition.key]);
  return (
    <div className="param-field switch-field">
      <div>
        <label title={definition.description}>{definition.label}</label>
        <span className={`switch-state ${on ? 'on' : ''}`}>
          {on ? definition.onLabel ?? '开' : definition.offLabel ?? '关'}
        </span>
      </div>
      <button
        type="button"
        className={`toggle-control ${on ? 'is-on' : ''}`}
        onClick={() => setParam(component.id, definition.key, !on)}
        aria-label={`切换${definition.label}`}
      >
        <span />
      </button>
    </div>
  );
}

export function ParamControl({
  component,
  definition,
}: {
  component: LabComponent;
  definition: ParamDefinition;
}) {
  switch (definition.kind) {
    case 'slider':
      return <SliderParam component={component} definition={definition} />;
    case 'number':
      return <NumberParam component={component} definition={definition} />;
    case 'select':
      return <SelectParam component={component} definition={definition} />;
    case 'switch':
      return <SwitchParam component={component} definition={definition} />;
    default:
      return null;
  }
}

function LiveValues({ component }: { component: LabComponent }) {
  const element = useLabStore((state) => state.result.elements[component.id]);
  const result = useLabStore((state) => state.result);
  if (!result.solved || !element) {
    return <div className="empty-inline">当前电路无有效读数</div>;
  }
  if (component.type === 'multimeter') return <div className="live-values"><div className="value-tile"><span>仪表读数</span><strong>{element.flags?.invalidReading ? '—' : element.overRange || element.flags?.openCircuit ? 'OL' : element.readingUnit === 'Ω' ? formatResistance(element.reading) : element.readingUnit === 'A' ? formatCurrent(element.reading) : formatVoltage(element.reading)}</strong></div><div className="value-tile"><span>功能</span><strong>{String(component.params.mode).toUpperCase()}</strong></div></div>;
  if (component.type === 'programmable-supply') return <div className="live-values">{[1, 2].map(ch => <div className="value-tile" key={ch}><span>CH{ch} · {String(element.flags?.[`mode${ch}`])}</span><strong>{formatVoltage(ch === 1 ? element.voltage : Number(element.flags?.voltage2))}</strong><strong>{formatCurrent(ch === 1 ? element.current : Number(element.flags?.current2))}</strong></div>)}</div>;
  const readingLabel = component.type === 'three-phase-source' ? '相电压 U_AN' :
    component.type === 'ammeter'
      ? '仪表读数'
      : component.type === 'voltmeter'
        ? '仪表读数'
        : component.type === 'power-supply'
          ? '输出端电压'
          : '端电压';
  return (
    <div className="live-values">
      <div className="value-tile">
        <span>{readingLabel}</span>
        <strong>{formatVoltage(element.voltage)}</strong>
      </div>
      <div className="value-tile">
        <span>{component.type === 'three-phase-source' ? '线电流 I_A' : component.type === 'power-supply' ? '输出电流' : '支路电流'}</span>
        <strong>{formatCurrent(element.current)}</strong>
      </div>
      <div className="value-tile">
        <span>{component.type === 'three-phase-source' ? '三相有功功率' : component.type === 'bulb' || component.type === 'led' ? '耗散功率' : '功率'}</span>
        <strong>{formatPower(element.power)}</strong>
      </div>
      {component.type === 'resistor' && (
        <div className="value-tile">
          <span>标称阻值</span>
          <strong>{formatResistance(Number(component.params.resistance))}</strong>
        </div>
      )}
      {component.type === 'led' && (
        <div className="value-tile">
          <span>相对亮度</span>
          <strong>{Math.round(Math.min(1, element.brightness ?? 0) * 100)}%</strong>
        </div>
      )}
      {component.type === 'bulb' && (
        <div className="value-tile">
          <span>相对亮度</span>
          <strong>{Math.round(Math.min(1, element.brightness ?? 0) * 100)}%</strong>
        </div>
      )}
      {component.type === 'capacitor' && (
        <div className="value-tile">
          <span>电容电压</span>
          <strong>{formatVoltage(element.voltage)}</strong>
        </div>
      )}
      {component.type === 'switch' && (
        <div className="value-tile">
          <span>触点状态</span>
          <strong>{element.flags?.closed ? '闭合' : '断开'}</strong>
        </div>
      )}
    </div>
  );
}

function WireInspector({ wire }: { wire: Wire }) {
  const components = useLabStore((state) => state.components);
  const removeWire = useLabStore((state) => state.removeWire);
  const selectComponent = useLabStore((state) => state.selectComponent);
  const from = findPortOwner(components, wire.fromPortId);
  const to = findPortOwner(components, wire.toPortId);

  const endpoint = (owner: ReturnType<typeof findPortOwner>) => {
    if (!owner) return { name: '端口已失效', port: wire.fromPortId, componentId: '' };
    return {
      name: `${owner.component.name} · ${portDisplay(owner.component, owner.portKey)}`,
      port: owner.portKey,
      componentId: owner.component.id,
    };
  };
  const fromEndpoint = endpoint(from);
  const toEndpoint = endpoint(to);

  return (
    <div className="panel-stack">
      <div className="inspector-header">
        <div className="inspector-title">
          <span className="inspector-icon wire" style={{ background: wire.color }}>
            <Cable size={18} />
          </span>
          <div>
            <h2>导线</h2>
          </div>
        </div>
      </div>
      <div className="wire-endpoint-list">
        <div className="wire-endpoint">
          <span className="wire-end-dot" style={{ background: wire.color }} />
          <div>
            <small>起点</small>
            <button
              type="button"
              className="link-button"
              onClick={() => fromEndpoint.componentId && selectComponent(fromEndpoint.componentId)}
            >
              {fromEndpoint.name}
            </button>
          </div>
        </div>
        <div className="wire-endpoint">
          <span className="wire-end-dot" style={{ background: wire.color }} />
          <div>
            <small>终点</small>
            <button
              type="button"
              className="link-button"
              onClick={() => toEndpoint.componentId && selectComponent(toEndpoint.componentId)}
            >
              {toEndpoint.name}
            </button>
          </div>
        </div>
      </div>
      <button type="button" className="button button-danger full" onClick={() => removeWire(wire.id)}>
        <Unplug size={15} />
        拔除这根导线
      </button>
    </div>
  );
}

function EmptyInspector() {
  return (
    <div className="empty-inspector">
      <div className="empty-illustration">
        <span className="empty-ring" />
        <Crosshair size={28} />
      </div>
      <h2>选择器材</h2>
    </div>
  );
}

export function InspectorPanel() {
  const selectedId = useLabStore((state) => state.selectedId);
  const selectedWireId = useLabStore((state) => state.selectedWireId);
  const components = useLabStore((state) => state.components);
  const wires = useLabStore((state) => state.wires);
  const removeComponent = useLabStore((state) => state.removeComponent);
  const rotateComponent = useLabStore((state) => state.rotateComponent);
  const removeWire = useLabStore((state) => state.removeWire);
  const wire = useMemo(
    () => (selectedWireId ? wires.find((item) => item.id === selectedWireId) : undefined),
    [selectedWireId, wires],
  );
  const component = useMemo(
    () => components.find((item) => item.id === selectedId),
    [components, selectedId],
  );

  if (wire) return <WireInspector wire={wire} />;
  if (!component) return <EmptyInspector />;

  const definition = getDefinition(component.type);
  const display = hasInstrumentDisplay(component.type);
  const handled = quickControlKeys(component);
  const params = instrumentParams(component).filter(p => !display || !handled.has(p.key));
  const parameterFields = params.length ? <div className="param-list">{params.map(param => <ParamControl key={param.key} component={component} definition={param} />)}</div> : <div className="empty-inline">该器材没有可调参数。</div>;
  const connectedWires = wires.filter(
    (item) =>
      item.fromPortId.startsWith(`${component.id}:`) ||
      item.toPortId.startsWith(`${component.id}:`),
  );
  const portsToShow =
    definition.ports.length > 8
      ? definition.ports.filter((port) =>
          connectedWires.some(
            (item) =>
              item.fromPortId === `${component.id}:${port.key}` ||
              item.toPortId === `${component.id}:${port.key}`,
          ),
        )
      : definition.ports;
  const internalGroups = getInternalPortGroups(component).length;

  return (
    <div className={`panel-stack ${display ? 'has-instrument-display' : ''}`}>
      <div className="inspector-header">
        <div className="inspector-title">
          <span className="inspector-icon" style={{ background: definition.accent }}>
            <CircleDot size={18} />
          </span>
          <div>
            <h2 title={definition.description}>{component.name}</h2>
          </div>
        </div>
        {display && <InstrumentPowerControl component={component} />}
      </div>

      {display && <section className="instrument-preview" key={component.id} aria-label="仪器实时预览">
        <InstrumentReadout component={component} compact />
        <InstrumentQuickControls component={component} />
      </section>}

      <details className="inspector-pose" open={!display} key={`pose-${component.id}`}><summary>器材操作</summary><div className="inspector-actions">
        <button
          type="button"
          className="tool-button"
          onClick={() => cameraBridge.focus(component.position)}
          title="聚焦器材 (F)"
        >
          <Crosshair size={15} />
          聚焦
        </button>
        <button
          type="button"
          className="tool-button"
          onClick={() => rotateComponent(component.id, -Math.PI / 12)}
          title="逆时针旋转 15°"
          aria-label="逆时针旋转器材"
        >
          <RotateCcw size={15} />
        </button>
        <button
          type="button"
          className="tool-button"
          onClick={() => rotateComponent(component.id, Math.PI / 12)}
          title="顺时针旋转 15°"
          aria-label="顺时针旋转器材"
        >
          <RotateCw size={15} />
        </button>
        <button
          type="button"
          className="tool-button danger-text"
          onClick={() => removeComponent(component.id)}
          title="删除器材 (Delete)"
          aria-label="删除选中项"
        >
          <Trash2 size={15} />
        </button>
      </div></details>

      {display ? <details className="panel-section inspector-parameters" key={`params-${component.id}`}><summary>参数配置</summary>{parameterFields}</details> : <section className="panel-section">
        <div className="panel-card-title">参数配置</div>
        {parameterFields}
      </section>}

      {!display && <section className="panel-section">
        <div className="panel-card-title">实时状态</div>
        <LiveValues component={component} />
      </section>}

      <section className="panel-section">
        <div className="panel-card-title">
          接线端口
          <span>{definition.ports.length} 个</span>
        </div>
        {definition.type === 'breadboard' && (
          <p className="param-help">
            42 个孔位，{internalGroups} 组内部理想连通：每列 5 孔与两条纵向电源轨。
            仅显示已接线孔位。
          </p>
        )}
        <div className="port-list">
          {portsToShow.length === 0 && (
            <div className="empty-inline">
              {definition.type === 'breadboard' ? '尚未连接任何孔位。' : '该器材没有端口。'}
            </div>
          )}
          {portsToShow.map((port) => {
            const portId = `${component.id}:${port.key}`;
            const portWires = connectedWires.filter(
              (item) => item.fromPortId === portId || item.toPortId === portId,
            );
            return (
              <div className="port-row" key={port.key}>
                <span
                  className="port-dot"
                  style={{ background: ROLE_COLORS[port.role] ?? '#8b806b' }}
                />
                <div className="port-copy">
                  <strong>{port.label}</strong>
                  {portWires.length > 0 && <span>{portWires.length} 根导线</span>}
                </div>
                {port.role === 'positive' || port.role === 'anode' ? (
                  <span className="port-polarity positive">POS</span>
                ) : port.role === 'negative' || port.role === 'cathode' ? (
                  <span className="port-polarity negative">COM</span>
                ) : null}
              </div>
            );
          })}
        </div>
        {connectedWires.length > 0 && (
          <div className="wire-list">
            <div className="panel-card-title subtle">已连接导线</div>
            {connectedWires.map((connected) => {
              const otherPortId =
                connected.fromPortId.startsWith(`${component.id}:`)
                  ? connected.toPortId
                  : connected.fromPortId;
              const owner = findPortOwner(components, otherPortId);
              return (
                <div className="connected-wire-row" key={connected.id}>
                  <span className="wire-color-dot" style={{ background: connected.color }} />
                  <span>
                    {owner
                      ? `${owner.component.name} · ${portDisplay(owner.component, owner.portKey)}`
                      : '无效端口'}
                  </span>
                  <button
                    type="button"
                    className="icon-button tiny"
                    onClick={() => removeWire(connected.id)}
                    title="拔除导线"
                  >
                    <Unplug size={13} />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {definition.modelNote && (
        <details className="model-note collapsible">
          <summary>电学模型</summary>
          <p>{definition.modelNote}</p>
        </details>
      )}
    </div>
  );
}
