import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { GripVertical, Maximize, Minimize, X } from 'lucide-react';
export function FloatingWindow({ title, onClose, children, presentation = false }: { title: string; onClose: () => void; children: React.ReactNode; presentation?: boolean }) {
  const ref = useRef<HTMLDivElement>(null), drag = useRef<{ x: number; y: number; ox: number; oy: number; left: number; right: number; top: number; bottom: number } | null>(null);
  const [offset, setOffset] = useState({ x: 0, y: 0 }), [full, setFull] = useState(false);
  const closeRef = useRef(onClose); closeRef.current = onClose;
  useEffect(() => {
    const container = ref.current;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    ref.current?.querySelector<HTMLButtonElement>('button')?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeRef.current(); }
      if (e.key === 'Tab' && ref.current) {
        const targets = [...ref.current.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex="0"]')];
        const first = targets[0], last = targets.at(-1);
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
      }
    };
    const onResize = () => setOffset({ x: 0, y: 0 });
    const onFull = () => setFull(Boolean(document.fullscreenElement));
    window.addEventListener('keydown', onKey, true); window.addEventListener('resize', onResize); document.addEventListener('fullscreenchange', onFull);
    return () => { window.removeEventListener('keydown', onKey, true); window.removeEventListener('resize', onResize); document.removeEventListener('fullscreenchange', onFull); if (document.fullscreenElement && document.fullscreenElement === container) void document.exitFullscreen().catch(() => undefined); previous?.focus(); };
  }, []);
  return <div className={presentation ? 'presentation-backdrop' : 'console-layer'}>
    <div ref={ref} className={`floating-window ${presentation ? 'data-presentation' : 'instrument-console'}`} role="dialog" aria-modal={presentation} aria-label={title} style={{ '--offset-x': `${offset.x}px`, '--offset-y': `${offset.y}px` } as CSSProperties}>
      <header className="console-heading" onPointerDown={e => { if (presentation || (e.target as HTMLElement).closest('button, input, select')) return; const r = ref.current!.getBoundingClientRect(); drag.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y, left: r.left, right: r.right, top: r.top, bottom: r.bottom }; e.currentTarget.setPointerCapture(e.pointerId); }} onPointerMove={e => { const d = drag.current; if (!d) return; setOffset({ x: d.ox + Math.min(innerWidth - d.right - 8, Math.max(8 - d.left, e.clientX - d.x)), y: d.oy + Math.min(innerHeight - d.bottom - 8, Math.max(8 - d.top, e.clientY - d.y)) }); }} onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}>
        {!presentation && <GripVertical size={20} />}<h2>{title}</h2>
        {presentation && <button className="icon-button" aria-label={full ? '退出全屏' : '进入全屏'} title="全屏演示" onClick={async () => { try { if (document.fullscreenElement) await document.exitFullscreen(); else await ref.current?.requestFullscreen(); } catch { /* The large dialog remains usable if fullscreen is unavailable. */ } }}>{full ? <Minimize size={20} /> : <Maximize size={20} />}</button>}
        <button className="icon-button" aria-label={presentation ? '关闭数据大屏' : '关闭器材控制台'} onClick={onClose}><X size={23} /></button>
      </header><div className="console-content">{children}</div>
    </div>
  </div>;
}
