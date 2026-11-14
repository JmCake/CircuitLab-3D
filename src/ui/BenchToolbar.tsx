import { Hand, Home, LayoutGrid, MousePointer2, SlidersHorizontal, Undo2, Redo2 } from 'lucide-react';
import { useLabStore } from '../store/labStore';
import { useViewStore } from '../store/viewStore';
import { cameraBridge } from '../three/cameraBridge';

export function BenchToolbar() {
  const selected = useLabStore(s => s.selectedId);
  const canUndo = useLabStore(s => s.history.past.length > 0), canRedo = useLabStore(s => s.history.future.length > 0);
  const pan = useViewStore(s => s.panMode);
  const canArrange = useLabStore(s => s.components.some(c => c.id.startsWith(`${s.activeLabId}-`)));
  return <div className="bench-toolbar" role="toolbar" aria-label="实验台操作">
    <button aria-label="选择与旋转视角" title="选择与旋转视角" aria-pressed={!pan} onClick={() => useViewStore.getState().setPanMode(false)}><MousePointer2 size={20} /></button>
    <button aria-label="平移视角" title="平移视角" aria-pressed={pan} onClick={() => useViewStore.getState().setPanMode(true)}><Hand size={20} /></button>
    <span />
    <button aria-label="撤销" title="撤销 (Ctrl+Z)" disabled={!canUndo} onClick={() => useLabStore.getState().undo()}><Undo2 size={21} /></button>
    <button aria-label="重做" title="重做 (Ctrl+Shift+Z)" disabled={!canRedo} onClick={() => useLabStore.getState().redo()}><Redo2 size={21} /></button>
    <span />
    <button aria-label="打开器材控制台" title="器材控制台" disabled={!selected} onClick={() => selected && useViewStore.getState().openConsole(selected)}><SlidersHorizontal size={20} /></button>
    <button aria-label="整理台面" title="整理台面" disabled={!canArrange} onClick={() => { if (useLabStore.getState().arrangeBench()) cameraBridge.reset(); }}><LayoutGrid size={20} /></button>
    <button aria-label="恢复默认视角" title="恢复默认视角" onClick={() => cameraBridge.reset()}><Home size={20} /></button>
  </div>;
}
