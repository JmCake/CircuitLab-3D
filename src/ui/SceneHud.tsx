import { Crosshair, Home, Info, MousePointer2 } from 'lucide-react';
import { findPortOwner, getDefinition, parsePortId } from '../circuit';
import { useLabStore } from '../store/labStore';
import { cameraBridge } from '../three/cameraBridge';

function portName(components: ReturnType<typeof useLabStore.getState>['components'], portId: string): string {
  const parsed = parsePortId(portId);
  if (!parsed) return '未知端口';
  const owner = findPortOwner(components, portId);
  if (!owner) return '已失效端口';
  const port = getDefinition(owner.component.type).ports.find((item) => item.key === parsed.portKey);
  return `${owner.component.name} · ${port?.label ?? parsed.portKey}`;
}

export function SceneHud() {
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
        <div className="scene-tag">
          <span className="live-dot" />
          LIVE 3D · ELECTRICAL LAB
        </div>
      </div>

      <div className="scene-hud-top-right">
        <button
          type="button"
          className="scene-tool"
          onClick={() => cameraBridge.reset()}
          title="恢复默认视角 (Home)"
        >
          <Home size={16} />
        </button>
        <button
          type="button"
          className="scene-tool"
          onClick={focusSelected}
          disabled={!selected}
          title="聚焦选中器材 (F)"
        >
          <Crosshair size={16} />
        </button>
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

      <div className="scene-hints">
        <div className="hint-line">
          <span><b>左键拖动</b> 移动器材</span>
          <span className="hint-sep" />
          <span><b>点击接线柱</b> 拉出导线</span>
          <span className="hint-sep" />
          <span><b>右键拖动</b> 平移</span>
          <span className="hint-sep" />
          <span><b>滚轮</b> 缩放</span>
        </div>
      </div>

      <div className="scene-webgl-note">
        <Info size={12} />
        WebGL 2 · 实时求解
      </div>
    </div>
  );
}
