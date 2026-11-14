import {
  FlaskConical,
  HelpCircle,
  PanelLeftClose,
  PanelLeftOpen,
  MonitorUp,
  Save,
  Sparkles,
  Waves,
} from 'lucide-react';
import { getLab } from '../experiments/labs';
import { useLabStore } from '../store/labStore';
import { useViewStore } from '../store/viewStore';

function LogoMark() {
  return (
    <div className="brand-mark" aria-hidden="true">
      <svg viewBox="0 0 40 40" fill="none">
        <rect x="1" y="1" width="38" height="38" rx="10" fill="url(#logoGradient)" />
        <path
          d="M10 25.5h5.2l2.1-8.5 3.2 14 2.8-10.8 1.8 5.3H30"
          stroke="#f6f1e4"
          strokeWidth="1.9"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="10" cy="25.5" r="2.1" fill="#f4c984" />
        <circle cx="30" cy="25.5" r="2.1" fill="#f4c984" />
        <defs>
          <linearGradient id="logoGradient" x1="6" y1="2" x2="35" y2="40" gradientUnits="userSpaceOnUse">
            <stop stopColor="#3a5d57" />
            <stop offset="1" stopColor="#203a38" />
          </linearGradient>
        </defs>
      </svg>
    </div>
  );
}

export function TopBar({ onOpenHelp }: { onOpenHelp: () => void }) {
  const activeLabId = useLabStore((state) => state.activeLabId);
  const mode = useLabStore((state) => state.mode);
  const setMode = useLabStore((state) => state.setMode);
  const libraryOpen = useLabStore((state) => state.libraryOpen);
  const setLibraryOpen = useLabStore((state) => state.setLibraryOpen);
  const saveLocal = useLabStore((state) => state.saveLocal);
  const activeLab = getLab(activeLabId);

  return (
    <header className="topbar">
      <div className="brand">
        <LogoMark />
        <div className="brand-text">
          <div className="brand-title">
            CircuitLab <span>3D</span>
          </div>
          <div className="brand-subtitle">大学电路虚拟实验室</div>
        </div>
      </div>

      <div className="topbar-center">
        <div className="mode-switch" role="group" aria-label="实验模式">
          <button
            type="button"
            className={mode === 'guided' ? 'is-active' : ''}
            onClick={() => setMode('guided')}
            title="按教学步骤完成实验"
          >
            <FlaskConical size={14} />
            指导实验
          </button>
          <button
            type="button"
            className={mode === 'free' ? 'is-active' : ''}
            onClick={() => setMode('free')}
            title="不受步骤约束，自由搭建电路"
          >
            <Waves size={14} />
            自由搭建
          </button>
        </div>
        <div className="active-lab-chip">
          <span className="eyebrow">{activeLab.index}</span>
          <span>{activeLab.title}</span>
        </div>
      </div>

      <div className="topbar-actions">
        <button className="button button-quiet" aria-label="数据大屏" title="数据大屏" onClick={() => useViewStore.getState().setDataScreen(true)}><MonitorUp size={18} /><span>演示</span></button>
        <button
          type="button"
          className="button button-quiet save-button"
          onClick={saveLocal}
          title="保存到浏览器本地存储"
        >
          <Save size={15} />
          <span>保存</span>
        </button>
        <button
          type="button"
          className="icon-button"
          onClick={onOpenHelp}
          title="实验台操作说明"
          aria-label="打开操作说明"
        >
          <HelpCircle size={18} />
        </button>
        <div className="topbar-separator" />
        <button
          type="button"
          className="icon-button library-toggle"
          onClick={() => setLibraryOpen(!libraryOpen)}
          title={libraryOpen ? '收起器材库' : '展开器材库'}
          aria-label={libraryOpen ? '收起器材库' : '展开器材库'}
        >
          {libraryOpen ? <PanelLeftClose size={18} /> : <PanelLeftOpen size={18} />}
        </button>
      </div>
    </header>
  );
}

export function SceneBadge() {
  return (
    <div className="scene-badge">
      <Sparkles size={13} />
      <span>WebGL 2 · 程序化建模</span>
    </div>
  );
}
