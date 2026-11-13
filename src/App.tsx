import { useEffect, useState } from 'react';
import { LibraryPanel } from './ui/LibraryPanel';
import { SceneHud } from './ui/SceneHud';
import { SidePanel } from './ui/SidePanel';
import { ToastLayer } from './ui/ToastLayer';
import { TopBar } from './ui/TopBar';
import { HelpModal } from './ui/HelpModal';
import { SceneCanvas } from './three/SceneCanvas';
import { cameraBridge } from './three/cameraBridge';
import { useLabStore } from './store/labStore';
import { writeLocalWorkspace } from './store/persistence';

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName.toLowerCase();
  return (
    tag === 'input' ||
    tag === 'textarea' ||
    tag === 'select' ||
    target.isContentEditable
  );
}

export default function App() {
  const libraryOpen = useLabStore((state) => state.libraryOpen);
  const running = useLabStore((state) => state.transient.running);
  const [helpOpen, setHelpOpen] = useState(false);

  // RC 暂态由真实时间驱动，每 50 ms 推进一个 20 ms 的求解步。
  useEffect(() => {
    if (!running) return;
    const interval = window.setInterval(() => {
      useLabStore.getState().tickTransient();
    }, 50);
    return () => window.clearInterval(interval);
  }, [running]);

  // 事件驱动的防抖自动保存：只序列化可复现的电路状态，不保存求解缓存。
  useEffect(() => {
    let timer: number | undefined;
    const unsubscribe = useLabStore.subscribe((state, previous) => {
      const circuitChanged =
        state.components !== previous.components ||
        state.wires !== previous.wires ||
        state.measurements !== previous.measurements ||
        state.activeLabId !== previous.activeLabId ||
        state.mode !== previous.mode;
      if (!circuitChanged) return;
      if (timer !== undefined) window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        writeLocalWorkspace(state.getWorkspace());
      }, 900);
    });
    return () => {
      unsubscribe();
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (event.key === 'Escape') {
        if (helpOpen) {
          setHelpOpen(false);
          event.preventDefault();
          return;
        }
        const state = useLabStore.getState();
        if (state.interactionMode === 'idle') {
          state.selectComponent(null);
          state.selectWire(null);
        }
        return;
      }
      if (isTypingTarget(event.target)) return;
      const state = useLabStore.getState();
      const mod = event.ctrlKey || event.metaKey;
      if (mod && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        if (event.shiftKey) state.redo();
        else state.undo();
        return;
      }
      if (mod && event.key.toLowerCase() === 'y') {
        event.preventDefault();
        state.redo();
        return;
      }
      if (mod) return;
      if (event.key === '?' || event.key.toLowerCase() === 'h') {
        event.preventDefault();
        setHelpOpen((open) => !open);
        return;
      }
      if (event.key === 'Delete' || event.key === 'Backspace') {
        if (!state.selectedId && !state.selectedWireId) return;
        event.preventDefault();
        state.removeSelected();
        return;
      }
      if (event.key.toLowerCase() === 'r') {
        if (!state.selectedId) return;
        event.preventDefault();
        const delta = event.shiftKey ? -Math.PI / 12 : Math.PI / 12;
        state.rotateComponent(state.selectedId, delta);
        return;
      }
      if (event.key.toLowerCase() === 'f') {
        if (!state.selectedId) return;
        const component = state.components.find((item) => item.id === state.selectedId);
        if (component) {
          event.preventDefault();
          cameraBridge.focus(component.position);
        }
        return;
      }
      if (event.key === 'Home') {
        event.preventDefault();
        cameraBridge.reset();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [helpOpen]);

  return (
    <div className="app">
      <TopBar onOpenHelp={() => setHelpOpen(true)} />
      <div className={`main-grid ${libraryOpen ? 'library-open' : 'library-closed'}`}>
        <LibraryPanel />
        <main className="scene-column">
          <SceneCanvas />
          <SceneHud />
        </main>
        <SidePanel />
      </div>
      <ToastLayer />
      {helpOpen && <HelpModal onClose={() => setHelpOpen(false)} />}
    </div>
  );
}
