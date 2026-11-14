import { Box, Crosshair, Home, MousePointer2, PanelTop, Scan } from 'lucide-react';
import { findPortOwner, getDefinition, parsePortId } from '../circuit';
import { useLabStore } from '../store/labStore';
import { cameraBridge } from '../three/cameraBridge';
import { useViewStore } from '../store/viewStore';

function portName(components: ReturnType<typeof useLabStore.getState>['components'], portId: string): string {
  const parsed = parsePortId(portId);
  if (!parsed) return '未知端口';
  const owner = findPortOwner(components, portId);
  if (!owner) return '已失效端口';
  const port = getDefinition(owner.component.type).ports.find((item) => item.key === parsed.portKey);
  return `${owner.component.name} · ${port?.label ?? parsed.portKey}`;
}

export function SceneHud() {
  const blockedWires = useViewStore(s => s.blockedWires);
  const quality = useViewStore(s => s.quality);
  const setQuality = useViewStore(s => s.setQuality);
  const interactionMode = useLabStore((state) => state.interactionMode);
  const draft = useLabStore((state) => state.draftWire);
  const hoveredPortId = useLabStore((state) => state.hoveredPortId);
  const components = useLabStore((state) => state.components);
  const selectedId = useLabStore((state) => state.selectedId);
  const selected = components.find((component) => component.id === selectedId);
  const dragged = useLabStore((state) =>
    state.interactionMode === 'dragging' && state.dragSession
      ? state.components.find((component) => component.id === state.dragSession?.componentId)
      : null,
  );

  const focusSelected = () => {
    if (selected) cameraBridge.focus(selected.position);
  };

  return (
    <div className="scene-hud">
      <div className="scene-hud-top-left">
        <div className="view-toolbar" aria-label="实验台视角与画质">
          <button type="button" onClick={() => cameraBridge.view('perspective')} title="透视视角"><Box size={14} /><span>透视</span></button>
          <button type="button" onClick={() => cameraBridge.view('top')} title="顶视接线"><Scan size={14} /><span>顶视</span></button>
          <button type="button" onClick={() => cameraBridge.view('front')} title="前视仪表"><PanelTop size={14} /><span>前视</span></button>
          <span className="view-toolbar-separator" />
          <select aria-label="渲染画质" value={quality} onChange={e => setQuality(e.target.value as 'fine' | 'smooth')}><option value="fine">精细</option><option value="smooth">流畅</option></select>
        </div>
      </div>

      <div className="scene-hud-top-right">
        <button
          type="button"
          className="scene-tool"
          onClick={() => cameraBridge.reset()}
          title="恢复默认视角 (Home)"
          aria-label="恢复默认视角"
        >
          <Home size={16} />
        </button>
        <button
          type="button"
          className="scene-tool"
          onClick={focusSelected}
          disabled={!selected}
          title="聚焦选中器材 (F)"
          aria-label="聚焦选中器材"
        >
          <Crosshair size={16} />
        </button>
      </div>

      <div className="scene-object-picker">
        <select aria-label="选择台上器材" value={selectedId ?? ''} onChange={e => useLabStore.getState().selectComponent(e.target.value || null)}>
          <option value="">选择台上器材…</option>
          {components.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      {interactionMode === 'wiring' && draft && (
        <div className={`wire-prompt ${draft.valid ? 'is-valid' : draft.targetPortId ? 'is-invalid' : ''}`}>
          <span className="wire-prompt-dot" />
          <div>
            <strong>
              {draft.valid
                ? '松开完成接线'
                : draft.targetPortId
                  ? '该端口不可连接'
                  : '正在拉出导线'}
            </strong>
            <p>
              起点：{portName(components, draft.fromPortId)}
              {draft.targetPortId
                ? ` → ${portName(components, draft.targetPortId)}`
                : hoveredPortId
                  ? ` → ${portName(components, hoveredPortId)}`
                  : ' · 移到目标接线柱'}
            </p>
          </div>
          <kbd>Esc</kbd>
        </div>
      )}

      {interactionMode === 'dragging' && dragged && (
        <div className="interaction-prompt">
          <MousePointer2 size={14} />
          <span>正在移动 {dragged.name} · 松开放置</span>
        </div>
      )}

      {blockedWires > 0 && <div className="wire-obstruction" role="status">{blockedWires} 根导线被器材遮挡，电气连接保留。移开器材后恢复显示。</div>}
    </div>
  );
}
