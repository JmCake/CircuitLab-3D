import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  FlaskConical,
  PackagePlus,
  Play,
  XCircle,
} from 'lucide-react';
import { useMemo } from 'react';
import {
  COMPONENT_DEFINITIONS,
  type ComponentType,
} from '../circuit';
import { COURSE_LABS as LABS, getLab, type LabContext } from '../experiments/labs';
import { useLabStore } from '../store/labStore';

function requiredKitCounts(types: ComponentType[]): [ComponentType, number][] {
  const map = new Map<ComponentType, number>();
  for (const type of types) map.set(type, (map.get(type) ?? 0) + 1);
  return Array.from(map.entries());
}

export function LabPanel() {
  const mode = useLabStore((state) => state.mode);
  const activeLabId = useLabStore((state) => state.activeLabId);
  const setActiveLab = useLabStore((state) => state.setActiveLab);
  const loadLab = useLabStore((state) => state.loadLab);
  const clearBench = useLabStore((state) => state.clearBench);
  const components = useLabStore((state) => state.components);
  const wires = useLabStore((state) => state.wires);
  const result = useLabStore((state) => state.result);
  const measurements = useLabStore((state) => state.measurements);
  const transient = useLabStore((state) => state.transient);
  const setSideTab = useLabStore((state) => state.setSideTab);
  const setMode = useLabStore((state) => state.setMode);
  const lab = getLab(activeLabId);

  const context: LabContext = useMemo(() => {
    const capacitor = components.find((component) => component.type === 'capacitor');
    return {
      components,
      wires,
      result,
      measurements,
      transient: {
        running: transient.running,
        time: transient.time,
        samples: transient.samples.length,
        lastCapacitorVoltage: capacitor
          ? transient.capacitorVoltages[capacitor.id] ?? 0
          : 0,
      },
    };
  }, [components, wires, result, measurements, transient]);

  const checks = useMemo(
    () => (mode === 'guided' ? lab.steps.map((step) => step.check(context)) : []),
    [lab, context, mode],
  );
  const completed = checks.filter((check) => check.done).length;
  const progress = checks.length > 0 ? completed / checks.length : 0;
  const kitCounts = requiredKitCounts(lab.kit.map(type => lab.id === 'iv-characteristics' && type === 'resistor' && components.some(c => c.id === 'iv-characteristics-r1' && c.type === 'bulb') ? 'bulb' : type));
  const diagnosticErrors = result.diagnostics.filter((item) => item.level === 'error');
  const diagnosticWarnings = result.diagnostics.filter((item) => item.level === 'warning');

  if (mode === 'free') {
    return (
      <div className="panel-stack">
        <div className="lab-hero free-hero">
          <div className="lab-hero-top">
            <div>
              <h2>自由搭建实验台</h2>
            </div>
          </div>
          <div className="free-stats">
            <div>
              <strong>{components.length}</strong>
              <span>器材</span>
            </div>
            <div>
              <strong>{wires.length}</strong>
              <span>导线</span>
            </div>
            <div>
              <strong>{result.solved ? 'OK' : '!'}</strong>
              <span>求解状态</span>
            </div>
          </div>
          <div className="button-row">
            <button type="button" className="button button-primary" onClick={() => setMode('guided')}>
              <FlaskConical size={15} />
              返回指导实验
            </button>
            <button type="button" className="button button-secondary" onClick={clearBench}>
              清空台面
            </button>
          </div>
        </div>
        <div className="panel-card">
          <div className="panel-card-title">加载实验器材</div>
          <div className="lab-quick-list">
            {LABS.map((item) => (
              <button
                type="button"
                key={item.id}
                className="lab-quick-row"
                onClick={() => {
                  loadLab(item.id, false);
                  setMode('guided');
                }}
              >
                <span className="lab-index small">{item.index}</span>
                <span>
                  <strong>{item.title}</strong>
                </span>
                <ArrowRight size={14} />
              </button>
            ))}
          </div>
        </div>
        <details className="model-note collapsible">
          <summary>模型边界</summary>
          <p>
            直流线性网络使用节点分析求解；LED 为分段线性模型，小灯泡为线性电阻 + 功率亮度映射，RC
            采用后向欧拉暂态。所有近似均不会冒充未建模的物理效应。
          </p>
        </details>
      </div>
    );
  }

  return (
    <div className="panel-stack">
      <div className="lab-picker-row">
        <select
          className="select-control"
          value={activeLabId}
          aria-label="选择教学实验"
          onChange={(event) => setActiveLab(event.target.value)}
        >
          {!LABS.some(l => l.id === activeLabId) && <option value={activeLabId}>{lab.title}（已存实验）</option>}
          {LABS.map((item) => (
            <option key={item.id} value={item.id}>
              {item.index} · {item.title}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="button button-primary compact"
          onClick={() => loadLab(activeLabId, false)}
          title="重新摆放本实验所需器材（可撤销）"
        >
          <PackagePlus size={15} />
          重置器材
        </button>
      </div>

      <div className="lab-hero">
        <div className="lab-hero-top">
          <div>
            <h2>{lab.title}</h2>
          </div>
          <span className="lab-index">{lab.index}</span>
        </div>
        <p>{lab.objective}</p>
        <div className="formula-strip">
          <code>{lab.formula}</code>
        </div>
        <div className="lab-progress-row">
          <div className="progress-track">
            <span style={{ width: `${progress * 100}%` }} />
          </div>
          <strong>{completed} / {lab.steps.length}</strong>
        </div>
      </div>

      <div className="kit-check">
        <div className="panel-card-title">
          <FlaskConical size={14} />
          实验器材清单
        </div>
        <div className="kit-chips">
          {kitCounts.map(([type, required]) => {
            const present = components.filter((component) => component.type === type).length;
            const ok = present >= required;
            return (
              <span key={type} className={`kit-chip ${ok ? 'is-ready' : ''}`}>
                {ok ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
                {COMPONENT_DEFINITIONS[type].shortName}
                <em>
                  {Math.min(present, required)}/{required}
                </em>
              </span>
            );
          })}
        </div>
      </div>

      {(diagnosticErrors.length > 0 || diagnosticWarnings.length > 0) && (
        <div className={`diagnostic-banner ${diagnosticErrors.length > 0 ? 'is-error' : 'is-warning'}`}>
          <AlertTriangle size={16} />
          <div>
            <strong>{diagnosticErrors[0]?.message ?? diagnosticWarnings[0]?.message}</strong>
            {diagnosticErrors.length + diagnosticWarnings.length > 1 && (
              <span>另有 {diagnosticErrors.length + diagnosticWarnings.length - 1} 条诊断，请在数据页查看。</span>
            )}
          </div>
        </div>
      )}

      <div className="lab-steps">
        {lab.steps.map((step, index) => {
          const check = checks[index];
          return (
            <details key={step.id} className={`lab-step ${check.done ? 'is-done' : ''}`} open={index === checks.findIndex(item => !item.done)}>
              <summary className="step-summary" aria-label={`${step.title}${check.done ? '，已完成' : ''}`}>
                <span className="step-marker" aria-hidden="true">
                  {check.done ? <CheckCircle2 size={17} /> : <span>{String(index + 1).padStart(2, '0')}</span>}
                </span>
                <strong>{step.title}</strong>
                <ChevronDown size={14} className="step-chevron" />
              </summary>
              <div className="step-body">
                <p>{step.instruction}</p>
                <div className={`step-feedback ${check.done ? 'done' : ''}`}>{check.message}</div>
              </div>
            </details>
          );
        })}
      </div>

      {completed === lab.steps.length && (
        <div className="completion-card">
          <CheckCircle2 size={22} />
          <div>
            <strong>实验步骤已完成</strong>
            <p>请记录最终数据，并比较测量值与理论值。数据会随保存的工程一起恢复。</p>
            <button type="button" className="text-button" onClick={() => setSideTab('data')}>
              前往数据记录
              <ArrowRight size={14} />
            </button>
          </div>
        </div>
      )}

      <div className="button-row">
        <button
          type="button"
          className="button button-secondary"
          onClick={() => loadLab(activeLabId, true)}
          title="载入完整示范接线，用于演示或自检"
        >
          <Play size={14} />
          载入示范接线
        </button>
        <button type="button" className="button button-ghost" onClick={() => setSideTab('data')}>
          数据与记录
        </button>
      </div>

      <details className="model-note collapsible">
        <summary>
          <ChevronDown size={14} />
          模型假设与教学边界
        </summary>
        <p>{lab.modelNote}</p>
      </details>
    </div>
  );
}
