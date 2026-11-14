import { useEffect, useRef } from 'react';
import {
  Cable,
  CircuitBoard,
  FlaskConical,
  Gauge,
  Keyboard,
  MousePointer2,
  MousePointerClick,
  Move3d,
  Rotate3d,
  X,
} from 'lucide-react';

export function HelpModal({ onClose }: { onClose: () => void }) {
  const modalRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    modalRef.current?.querySelector<HTMLButtonElement>('button')?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (event.key === 'Tab' && modalRef.current) {
        const targets = Array.from(modalRef.current.querySelectorAll<HTMLElement>('button, a[href], input, select, [tabindex="0"]'));
        const first = targets[0];
        const last = targets[targets.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => { window.removeEventListener('keydown', onKeyDown); previousFocus?.focus(); };
  }, [onClose]);

  return (
    <div className="modal-backdrop" role="presentation" onPointerDown={onClose}>
      <div
        ref={modalRef}
        className="help-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="help-title"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <header className="modal-header">
          <div>
            <span className="panel-eyebrow">INTERACTION GUIDE</span>
            <h2 id="help-title">实验台操作说明</h2>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="关闭操作说明">
            <X size={18} />
          </button>
        </header>
        <div className="modal-content">
          <section className="help-section">
            <div className="help-section-title">
              <MousePointer2 size={16} />
              视角与器材
            </div>
            <div className="help-grid">
              <div className="help-tip">
                <MousePointer2 size={17} />
                <strong>左键拖动空白处</strong>
                <p>绕实验台旋转视角。拖动器材时相机会自动暂停，避免误操作。</p>
              </div>
              <div className="help-tip">
                <Move3d size={17} />
                <strong>右键拖动</strong>
                <p>平移观察中心；滚轮缩放。右键不会移动器材，拖拽器材时也不会旋转相机。</p>
              </div>
              <div className="help-tip">
                <Rotate3d size={17} />
                <strong>R / Shift + R</strong>
                <p>将选中器材旋转 ±15°，保持贴在实验桌面上，并在属性面板中精确查看朝向。</p>
              </div>
              <div className="help-tip">
                <CircuitBoard size={17} />
                <strong>F 聚焦 / Home 重置</strong>
                <p>快速放大查看器材细节，或恢复初始的 45° 实验台全景。</p>
              </div>
            </div>
          </section>

          <section className="help-section">
            <div className="help-section-title">
              <Cable size={16} />
              接线与测量
            </div>
            <ul className="help-list">
              <li>
                在三维场景中按住任一接线柱并拖动，松开在另一个端口上即可完成连接。接线期间其他可连接端口会显示绿色提示环。
              </li>
              <li>
                点击已连接的导线可以选中它，在属性面板中拔除。导线交叉不会相连；每个接线柱最多堆叠三根导线，重复连接会被拒绝。
              </li>
              <li>
                电流表串联接入支路，电压表并联在被测元件两端。仪表读数由实际端口的节点电压与支路电流计算，不依赖器材摆放位置。
              </li>
              <li>
                器材移动、旋转、删除、接线、断线以及参数调整均可撤销/重做；Ctrl/Cmd + Z 撤销，Ctrl/Cmd + Shift + Z 重做。
              </li>
            </ul>
          </section>

          <section className="help-section">
            <div className="help-section-title">
              <Gauge size={16} />
              仿真与教学
            </div>
            <div className="help-note-grid">
              <div>
                <strong>实时、事件驱动</strong>
                <p>稳态只在接线或参数改变时求解。暂态积分 2 ms、采样 20 ms；后台冻结。相机和机械动画停止后不再连续绘制。</p>
              </div>
              <div>
                <strong>模型边界清晰</strong>
                <p>直流线性网络使用节点分析；电源带 0.2 Ω 内部电阻；LED 为分段线性模型；RC 暂态使用后向欧拉方法。</p>
              </div>
              <div>
                <strong>可保存、可复现</strong>
                <p>工程 JSON 保存器材参数、端口 ID、导线与布局，恢复时重新计算，不保存旧的仪表读数。</p>
              </div>
              <div>
                <strong>键盘快捷键</strong>
                <p><kbd>R</kbd> 旋转 · <kbd>F</kbd> 聚焦 · <kbd>Delete</kbd> 删除 · <kbd>Esc</kbd> 取消 · <kbd>Home</kbd> 重置视角</p>
              </div>
            </div>
          </section>

          <section className="help-section help-about">
            <div className="help-about-icon">
              <FlaskConical size={22} />
            </div>
            <div>
              <strong>CircuitLab-3D · 大学电路虚拟实验室</strong>
              <p>
                本平台当前覆盖直流稳态线性电路、分段线性 LED、灯泡亮度映射和 RC 暂态。
                三维器材、桌面、光照与导线均由 Three.js 代码程序化生成。
              </p>
            </div>
            <span className="help-version">v0.2.0</span>
          </section>

          <div className="help-footer-hint">
            <MousePointerClick size={14} />
            提示：拖动左侧器材库中的仪器到实验台，是开始自由实验最快的方式。
          </div>
        </div>
      </div>
    </div>
  );
}
