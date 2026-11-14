import { useMemo, useRef } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  BookOpen,
  Download,
  FileJson,
  FileSpreadsheet,
  Info,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Save,
  Trash2,
  Upload,
} from 'lucide-react';
import type { Diagnostic, MeasurementRow } from '../circuit';
import { COURSE_LABS, getLab } from '../experiments/labs';
import { CourseDataPanel } from './CourseDataPanel';
import { useLabStore } from '../store/labStore';
import { validateWorkspace } from '../store/persistence';
import { NetworkAnalysisPanel } from './NetworkAnalysisPanel';
import { measurementIssue } from '../circuit/measurement';
import {
  formatCurrent,
  formatResistance,
  formatTime,
  formatTimestamp,
  formatVoltage,
} from './format';

function downloadText(filename: string, text: string, type: string): void {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // 慢速软件渲染环境中下载请求可能被推迟，过早释放 blob URL 会让下载静默失败。
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

function csvEscape(value: string | number | null): string {
  if (value === null) return '';
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function measurementsToCsv(rows: MeasurementRow[]): string {
  const header = ['实验ID', '实验名称', '记录时间', '记录标签', '电压(V)', '电流(A)', '计算电阻(Ω)', '备注'];
  const lines = [header.map(csvEscape).join(',')];
  for (const row of rows) {
    lines.push(
      [
        row.labId,
        getLab(row.labId).title,
        new Date(row.createdAt).toISOString(),
        row.label,
        row.voltage,
        row.current,
        row.resistance,
        row.note ?? '',
      ]
        .map(csvEscape)
        .join(','),
    );
  }
  return `\uFEFF${lines.join('\n')}`;
}

function diagnosticIcon(item: Diagnostic) {
  if (item.level === 'error') return <AlertCircle size={14} />;
  if (item.level === 'warning') return <AlertTriangle size={14} />;
  return <Info size={14} />;
}

function TransientChart() {
  const transient = useLabStore((state) => state.transient);
  const components = useLabStore((state) => state.components);
  const result = useLabStore((state) => state.result);
  const startTransient = useLabStore((state) => state.startTransient);
  const resumeTransient = useLabStore((state) => state.resumeTransient);
  const pauseTransient = useLabStore((state) => state.pauseTransient);
  const resetTransient = useLabStore((state) => state.resetTransient);
  const setParam = useLabStore((state) => state.setParam);
  const capacitor = components.find((component) => component.type === 'capacitor');
  const resistor = components.find((component) => component.type === 'resistor');
  const supply = components.find(
    (component) => component.type === 'power-supply' && Boolean(component.params.enabled),
  );
  const dischargeSupply = components.find(c => c.type === 'power-supply');

  if (!capacitor) return null;

  const values = transient.samples.map(
    (sample) => sample.values[capacitor.id] ?? 0,
  );
  const tau =
    resistor && capacitor
      ? Math.abs(Number(resistor.params.resistance)) *
        Number(capacitor.params.capacitanceUf) *
        1e-6
      : null;
  const targetVoltage = Math.abs(Number(supply?.params.voltage ?? 5));
  const maxVoltage = Math.max(targetVoltage, ...values, 0.01);
  const minVoltage = Math.min(0, ...values);
  const width = 310;
  const height = 96;
  const paddingX = 8;
  const paddingY = 10;
  const minTime = transient.samples[0]?.time ?? 0;
  const maxTime = Math.max(minTime + 0.02, transient.time);
  const chartPoints = values.map((value, index) => {
    const t = transient.samples[index]?.time ?? 0;
    const x = paddingX + ((t - minTime) / (maxTime - minTime)) * (width - paddingX * 2);
    const y = height - paddingY - ((value - minVoltage) / (maxVoltage - minVoltage)) * (height - paddingY * 2);
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  });
  const linePoints = chartPoints.join(' ');
  const zeroY = height - paddingY - ((0 - minVoltage) / (maxVoltage - minVoltage)) * (height - paddingY * 2);
  const areaPoints =
    values.length > 1
      ? `${paddingX},${zeroY} ${linePoints} ${width - paddingX},${zeroY}`
      : '';
  const currentVoltage = transient.active
    ? transient.capacitorVoltages[capacitor.id] ?? 0
    : Number(result.elements[capacitor.id]?.voltage ?? 0);

  return (
    <div className="panel-card transient-card">
      <div className="panel-card-title">
        <RotateCcw size={15} />
        RC 暂态分析
        <span className="transient-state">
          {transient.running ? '运行中' : transient.active ? '已暂停' : '待启动'}
        </span>
      </div>
      <div className="transient-metrics">
        <div>
          <span>仿真时间</span>
          <strong>{formatTime(transient.time)}</strong>
        </div>
        <div>
          <span>名义 RC（不含仪表）</span>
          <strong>{tau !== null ? formatTime(tau) : '—'}</strong>
        </div>
        <div>
          <span>u_C</span>
          <strong>{formatVoltage(currentVoltage)}</strong>
        </div>
      </div>
      <div className="chart-wrap">
        <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="电容电压随时间变化曲线">
          <defs>
            <linearGradient id="rcAreaGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#4b8579" stopOpacity="0.24" />
              <stop offset="100%" stopColor="#4b8579" stopOpacity="0" />
            </linearGradient>
          </defs>
          {[0.25, 0.5, 0.75].map((fraction) => (
            <line
              key={fraction}
              x1={paddingX}
              x2={width - paddingX}
              y1={paddingY + fraction * (height - paddingY * 2)}
              y2={paddingY + fraction * (height - paddingY * 2)}
              className="chart-grid"
            />
          ))}
          {areaPoints && <polygon points={areaPoints} fill="url(#rcAreaGradient)" />}
          {chartPoints.length > 1 && <polyline points={linePoints} className="chart-line" />}
          {chartPoints.length <= 1 && (
            <line
              x1={paddingX}
              x2={width - paddingX}
              y1={height - paddingY}
              y2={height - paddingY}
              className="chart-line is-empty"
            />
          )}
          <text x={paddingX} y={height - 1} className="chart-label">{minTime.toFixed(2)} s</text>
          <text x={width - paddingX} y={height - 1} textAnchor="end" className="chart-label">
            {maxTime.toFixed(2)} s
          </text>
          <text x={paddingX} y={paddingY + 8} className="chart-label">{maxVoltage.toFixed(1)} V</text>
        </svg>
      </div>
      <div className="chart-legend">
        <span><i />电容端电压</span>
        <span>{transient.samples.length} 点</span>
      </div>
      <div className="button-row wrap">
        {!transient.active ? (
          <button type="button" className="button button-primary compact" onClick={startTransient}>
            <Play size={14} />
            启动暂态
          </button>
        ) : transient.running ? (
          <button type="button" className="button button-secondary compact" onClick={pauseTransient}>
            <Pause size={14} />
            暂停
          </button>
        ) : (
          <button type="button" className="button button-primary compact" onClick={resumeTransient}>
            <Play size={14} />
            继续运行
          </button>
        )}
        <button
          type="button"
          className="button button-ghost compact"
          onClick={resetTransient}
          disabled={!transient.active && transient.samples.length === 0}
        >
          <RotateCcw size={14} />
          重置
        </button>
        <button type="button" className="button button-ghost compact" disabled={!transient.active || !dischargeSupply}
          onClick={() => { if (dischargeSupply) { setParam(dischargeSupply.id, 'enabled', true); setParam(dischargeSupply.id, 'voltage', 0); } }}>
          电源置 0 V 放电
        </button>
        <button type="button" className="button button-ghost compact" disabled={transient.samples.length < 2}
          onClick={() => {
            const caps = components.filter(c => c.type === 'capacitor');
            const lines = [['仿真时间(s)', ...caps.map(c => `${c.name}电压(V)`)].map(csvEscape).join(',')];
            for (const sample of transient.samples) lines.push([sample.time, ...caps.map(c => sample.values[c.id] ?? null)].map(csvEscape).join(','));
            downloadText('circuitlab-transient.csv', '\uFEFF' + lines.join('\n'), 'text/csv;charset=utf-8');
          }}><Download size={14} />导出曲线 CSV</button>
      </div>
      <details className="model-note collapsible">
        <summary>暂态模型</summary>
        <p>
        后向欧拉积分 2 ms、采样 20 ms。前台按实际时间推进，后台冻结，积压时暂停。快速暂态精度受限；放电按钮令电源电动势为零并保留内阻。曲线最多保留最近 1200 点。
        </p>
      </details>
    </div>
  );
}

export function DataPanel({ presentation = false }: { presentation?: boolean }) {
  const id = useLabStore(s => s.activeLabId);
  const mode = useLabStore(s => s.mode);
  return mode === 'guided' && COURSE_LABS.some(l => l.id === id) ? <CourseDataPanel presentation={presentation} /> : <LegacyDataPanel />;
}

function LegacyDataPanel() {
  const components = useLabStore((state) => state.components);
  const result = useLabStore((state) => state.result);
  const measurements = useLabStore((state) => state.measurements);
  const activeLabId = useLabStore((state) => state.activeLabId);
  const recordMeasurement = useLabStore((state) => state.recordMeasurement);
  const clearMeasurements = useLabStore((state) => state.clearMeasurements);
  const deleteMeasurement = useLabStore((state) => state.deleteMeasurement);
  const saveLocal = useLabStore((state) => state.saveLocal);
  const getWorkspace = useLabStore((state) => state.getWorkspace);
  const importWorkspace = useLabStore((state) => state.importWorkspace);
  const pushToast = useLabStore((state) => state.pushToast);
  const fileInput = useRef<HTMLInputElement>(null);
  const lab = getLab(activeLabId);
  const labRows = measurements.filter((row) => row.labId === activeLabId);
  const recordingIssue = measurementIssue(components, result);

  const supply = components.find((component) => component.type === 'power-supply' || component.type === 'programmable-supply');
  const dmm = components.find(c => c.type === 'multimeter');
  const dmmResult = dmm ? result.elements[dmm.id] : undefined;
  const ammeter = components.find((component) => component.type === 'ammeter');
  const voltmeter = components.find((component) => component.type === 'voltmeter');
  const capacitor = components.find((component) => component.type === 'capacitor');
  const resistor = components.find((component) => component.type === 'resistor');
  const supplyElement = supply ? result.elements[supply.id] : undefined;
  const voltageReading = result.solved
    ? (voltmeter ? result.elements[voltmeter.id]?.reading : undefined) ?? (dmmResult?.readingUnit === 'V' ? dmmResult.reading : undefined) ??
      (capacitor ? result.elements[capacitor.id]?.voltage : undefined) ??
      (resistor ? result.elements[resistor.id]?.voltage : undefined) ??
      supplyElement?.voltage
    : null;
  const currentReading = result.solved
    ? (ammeter ? result.elements[ammeter.id]?.reading : undefined) ?? (dmmResult?.readingUnit === 'A' ? dmmResult.reading : undefined) ??
      (resistor ? result.elements[resistor.id]?.current : undefined) ??
      supplyElement?.current
    : null;

  const diagnostics = useMemo(
    () =>
      result.diagnostics.filter(
        (item) =>
          item.level !== 'info' ||
          item.code === 'no-active-source' ||
          item.code === 'floating-network',
      ),
    [result.diagnostics],
  );

  const exportCsv = () => {
    downloadText(
      `circuitlab-${activeLabId}-measurements.csv`,
      measurementsToCsv(measurements),
      'text/csv;charset=utf-8',
    );
  };

  const exportJson = () => {
    const workspace = getWorkspace();
    downloadText(
      `circuitlab-${activeLabId}-${new Date().toISOString().slice(0, 10)}.json`,
      JSON.stringify(workspace, null, 2),
      'application/json;charset=utf-8',
    );
  };

  const handleImport = async (file: File | undefined) => {
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      const workspace = validateWorkspace(parsed);
      if (!workspace) {
        pushToast('error', '导入失败', '文件格式不符合 CircuitLab-3D v1 工作区规范。');
        return;
      }
      importWorkspace(workspace);
    } catch {
      pushToast('error', '导入失败', '无法读取该 JSON 文件。');
    } finally {
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  return (
    <div className="panel-stack">
      <div className="data-heading">
        <div>
          <h2>{lab.index} · {lab.title}</h2>
        </div>
        <span className="record-count">{labRows.length} 条记录</span>
      </div>

      <div className="live-readout-grid">
        <div className="readout-card">
          <span className="readout-label">当前电压</span>
          <strong>{formatVoltage(voltageReading)}</strong>
        </div>
        <div className="readout-card">
          <span className="readout-label">当前电流</span>
          <strong>{formatCurrent(currentReading)}</strong>
        </div>
      </div>
      <div className="data-actions-row">
        <button
          type="button"
          className="button button-primary"
          onClick={recordMeasurement}
          disabled={Boolean(recordingIssue)}
          title={recordingIssue ?? '记录当前有效测量值'}
        >
          <Plus size={15} />
          记录当前读数
        </button>
        <button type="button" className="button button-quiet" onClick={saveLocal}>
          <Save size={14} />
          保存工程
        </button>
      </div>
      {recordingIssue && <p className="data-note">{recordingIssue}</p>}

      <TransientChart />
      <NetworkAnalysisPanel />

      <div className="panel-card">
        <div className="panel-card-title">
          <FileSpreadsheet size={15} />
          数据记录
          <span>{labRows.length} 组</span>
        </div>
        {labRows.length === 0 ? (
          <div className="empty-table">
            <span>尚无本实验的测量数据</span>
          </div>
        ) : (
          <div className="measurement-table-wrap">
            <table className="measurement-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>U</th>
                  <th>I</th>
                  <th>R = U/I</th>
                  <th>时间</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {labRows.map((row, index) => (
                  <tr key={row.id}>
                    <td>{String(index + 1).padStart(2, '0')}</td>
                    <td>{formatVoltage(row.voltage)}</td>
                    <td>{formatCurrent(row.current)}</td>
                    <td>{formatResistance(row.resistance)}</td>
                    <td>{formatTimestamp(row.createdAt)}</td>
                    <td>
                      <button
                        type="button"
                        className="icon-button tiny"
                        title="删除记录"
                        onClick={() => deleteMeasurement(row.id)}
                      >
                        <Trash2 size={12} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="button-row wrap">
          <button type="button" className="button button-ghost compact" onClick={exportCsv} disabled={measurements.length === 0}>
            <Download size={14} />
            导出 CSV
          </button>
          {labRows.length > 0 && (
            <button type="button" className="button button-ghost compact danger-text" onClick={clearMeasurements}>
              <Trash2 size={14} />
              清空全部记录
            </button>
          )}
        </div>
      </div>

      <div className="panel-card">
        <div className="panel-card-title">
          <FileJson size={15} />
          工程存档与恢复
        </div>
        <div className="button-grid">
          <button type="button" className="button button-secondary compact" onClick={exportJson}>
            <Download size={14} />
            导出工程 JSON
          </button>
          <button
            type="button"
            className="button button-secondary compact"
            onClick={() => fileInput.current?.click()}
          >
            <Upload size={14} />
            导入工程 JSON
          </button>
          <button type="button" className="button button-ghost compact" onClick={saveLocal}>
            <Save size={14} />
            保存到浏览器
          </button>
          <button
            type="button"
            className="button button-ghost compact"
            onClick={() => {
              const raw = window.localStorage.getItem('circuitlab-3d:workspace:v1');
              if (!raw) {
                pushToast('warning', '没有本地存档', '请先保存工程到浏览器。');
                return;
              }
              try {
                const workspace = validateWorkspace(JSON.parse(raw));
                if (!workspace) throw new Error('invalid');
                importWorkspace(workspace);
              } catch {
                pushToast('error', '本地存档损坏', '无法解析浏览器中的工作区数据。');
              }
            }}
          >
            <BookOpen size={14} />
            恢复本地存档
          </button>
        </div>
        <input
          ref={fileInput}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(event) => void handleImport(event.target.files?.[0])}
        />
      </div>

      {diagnostics.length > 0 && <div className="panel-card diagnostics-card">
        <div className="panel-card-title">
          <AlertTriangle size={15} />
          求解诊断
          <span>{diagnostics.length} 条</span>
        </div>
        {diagnostics.length === 0 ? (
          <div className="diagnostic-empty">
            <Info size={14} />
            当前电路无异常诊断。
          </div>
        ) : (
          <div className="diagnostic-list">
            {diagnostics.slice(0, 8).map((item, index) => (
              <div className={`diagnostic-item ${item.level}`} key={`${item.code}-${index}`}>
                {diagnosticIcon(item)}
                <div>
                  <p>{item.message}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>}
    </div>
  );
}
