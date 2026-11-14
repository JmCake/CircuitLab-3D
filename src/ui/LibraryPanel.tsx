import type { CSSProperties } from 'react';
import {
  Activity,
  BatteryMedium,
  CircleDot,
  Gauge,
  GripVertical,
  Grid3X3,
  Lightbulb,
  Minus,
  MoveHorizontal,
  Plus,
  ChevronUp,
  ChevronDown,
  PanelLeftClose,
  SlidersHorizontal,
  ToggleLeft,
  Trash2,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import {
  COMPONENT_DEFINITIONS,
  WIRE_COLORS,
  type ComponentType,
} from '../circuit';
import { useLabStore } from '../store/labStore';
import { getLab } from '../experiments/labs';
import { useViewStore } from '../store/viewStore';

const PART_ICONS: Record<ComponentType, LucideIcon> = {
  'three-phase-source': Activity,
  'programmable-supply': Zap,
  multimeter: Gauge,
  oscilloscope: Activity,
  'power-supply': Zap,
  ammeter: Gauge,
  voltmeter: Activity,
  resistor: Minus,
  switch: ToggleLeft,
  'resistor-box': SlidersHorizontal,
  rheostat: MoveHorizontal,
  capacitor: BatteryMedium,
  led: CircleDot,
  bulb: Lightbulb,
  breadboard: Grid3X3,
};

const SECTIONS: { title: string; items: ComponentType[] }[] = [
  {
    title: '电源与测量',
    items: ['power-supply', 'programmable-supply', 'three-phase-source', 'ammeter', 'voltmeter', 'multimeter', 'oscilloscope'],
  },
  {
    title: '基础元件',
    items: ['resistor', 'resistor-box', 'rheostat', 'switch'],
  },
  {
    title: '其他器材',
    items: ['led', 'bulb', 'capacitor', 'breadboard'],
  },
];

export function LibraryPanel() {
  const addComponent = useLabStore((state) => state.addComponent);
  const clearBench = useLabStore((state) => state.clearBench);
  const components = useLabStore((state) => state.components);
  const wires = useLabStore((state) => state.wires);
  const libraryOpen = useLabStore((state) => state.libraryOpen);
  const wireColor = useLabStore((state) => state.wireColor);
  const setWireColor = useLabStore((state) => state.setWireColor);
  const activeLabId = useLabStore(s => s.activeLabId);
  const mode = useLabStore(s => s.mode);
  const folded = useViewStore(s => s.libraryFolded);
  const available = new Set(getLab(activeLabId).kit);
  if (activeLabId === 'iv-characteristics') available.add('bulb');
  if (available.has('power-supply')) available.add('programmable-supply');
  available.add('multimeter'); available.add('oscilloscope');
  const sections = SECTIONS.map(s => ({ ...s, items: s.items.filter(t => mode === 'free' || available.has(t)) })).filter(s => s.items.length > 0);

  if (!libraryOpen) return null;

  const counts = new Map<ComponentType, number>();
  for (const component of components) {
    counts.set(component.type, (counts.get(component.type) ?? 0) + 1);
  }

  return (
    <aside className={`library-panel ${folded ? 'is-folded' : ''}`}>
      <div className="panel-heading library-heading">
        <div>
          <h2>器材库</h2>
        </div>
        <button className="icon-button" aria-label={folded ? '向下展开器材库' : '向上折叠器材库'} onClick={() => useViewStore.getState().setLibraryFolded(!folded)}>{folded ? <ChevronDown size={17} /> : <ChevronUp size={17} />}</button>
        <button className="icon-button" aria-label="侧边收起器材库" onClick={() => useLabStore.getState().setLibraryOpen(false)}><PanelLeftClose size={17} /></button>
      </div>
      <div className="library-scroll">
        {sections.map((section) => (
          <section className="library-section" key={section.title}>
            <div className="library-section-heading">
              <span>{section.title}</span>
            </div>
            <div className="part-list">
              {section.items.map((type) => {
                const definition = COMPONENT_DEFINITIONS[type];
                const Icon = PART_ICONS[type];
                const count = counts.get(type) ?? 0;
                const style = { '--part-accent': definition.accent } as CSSProperties;
                return (
                  <div
                    key={type}
                    className="part-card"
                    draggable
                    style={style}
                    onClick={() => addComponent(type)}
                    onDragStart={(event) => {
                      event.dataTransfer.setData('application/x-circuitlab-part', type);
                      event.dataTransfer.effectAllowed = 'copy';
                    }}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        addComponent(type);
                      }
                    }}
                    title={`${definition.name}：${definition.description}`}
                  >
                    <span className="part-icon">
                      <Icon size={18} strokeWidth={1.8} />
                    </span>
                    <span className="part-copy">
                      <span className="part-name">
                        {definition.name}
                        {count > 0 && <em>×{count}</em>}
                      </span>
                    </span>
                    <span className="part-add">
                      <Plus size={15} />
                    </span>
                    <GripVertical size={12} className="part-grip" />
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>
      <div className="library-footer">
        <div className="wire-color-row">
          <span>导线颜色</span>
          <div className="wire-swatches">
            {WIRE_COLORS.map((color) => (
              <button
                key={color.value}
                type="button"
                className={wireColor === color.value ? 'wire-swatch is-active' : 'wire-swatch'}
                style={{ background: color.value }}
                title={color.name}
                aria-label={`使用${color.name}导线`}
                onClick={() => setWireColor(color.value)}
              />
            ))}
          </div>
        </div>
        <div className="bench-summary">
          <span className="summary-dot" />
          <span>{components.length} 个器材</span>
          <span className="summary-divider">·</span>
          <span>{wires.length} 根导线</span>
        </div>
        <button
          type="button"
          className="text-button danger-text"
          onClick={clearBench}
          disabled={components.length === 0 && wires.length === 0}
        >
          <Trash2 size={14} />
          清空台面
        </button>
      </div>
    </aside>
  );
}
