import { useMemo, useState } from 'react';
import { Activity } from 'lucide-react';
import { analyzeSuperposition, analyzeThevenin, auditCircuit } from '../circuit/analysis';
import { useLabStore } from '../store/labStore';
import { formatCurrent, formatPower, formatResistance, formatVoltage } from './format';

export function NetworkAnalysisPanel() {
  const components = useLabStore(s => s.components);
  const wires = useLabStore(s => s.wires);
  const result = useLabStore(s => s.result);
  const transient = useLabStore(s => s.transient.active);
  const [targetId, setTargetId] = useState('');
  const loads = components.filter(c => ['resistor', 'resistor-box', 'bulb'].includes(c.type));
  const load = loads.find(c => c.id === targetId) ?? loads.find(c => c.type === 'resistor-box') ?? loads[0];
  const analysis = useMemo(() => {
    if (!load || transient) return null;
    const snapshot = { components, wires };
    return { eq: analyzeThevenin(snapshot, load.id), superposition: analyzeSuperposition(snapshot, load.id) };
  }, [components, wires, load, transient]);
  const audit = useMemo(() => auditCircuit({ components, wires }, result), [components, wires, result]);
  const eq = analysis?.eq;
  const superposition = analysis?.superposition;
  const actual = load ? result.elements[load.id] : undefined;
  const points = eq ? Array.from({ length: 65 }, (_, i) => {
    const ratio = i / 64 * 4;
    return `${(24 + ratio / 4 * 264).toFixed(2)},${(104 - (4 * ratio / (1 + ratio) ** 2) * 76).toFixed(2)}`;
  }).join(' ') : '';
  const ratio = eq && load ? Number(load.params.resistance) / eq.resistance : 0;
  return (
    <section className="panel-card network-analysis" aria-label="电路数值分析">
      <div className="panel-card-title"><Activity size={15} />电路数值分析<span>由当前网表计算</span></div>
      {audit && <div className={`conservation-readout ${audit.passed ? 'is-ok' : 'is-warning'}`}>
        <strong>{audit.passed ? '节点电流与功率平衡通过' : '守恒残差需要检查'}</strong>
        <span>最大 |ΣI| = {audit.kclResidual.toExponential(2)} A</span>
        <span>|P供 − P吸| = {audit.powerResidual.toExponential(2)} W</span>
      </div>}
      <details className="branch-results">
        <summary>查看各器材的有符号电压、电流与功率</summary>
        <div className="measurement-table-wrap"><table className="measurement-table">
          <thead><tr><th>器材</th><th>U</th><th>I</th><th>P</th></tr></thead>
          <tbody>{components.filter(c => c.type !== 'breadboard').map(c => {
            const e = result.solved ? result.elements[c.id] : undefined;
            return <tr key={c.id}><td>{c.name}</td><td>{formatVoltage(e?.voltage)}</td><td>{formatCurrent(e?.current)}</td><td>{formatPower(e?.power)}</td></tr>;
          })}</tbody>
        </table></div>
        <p className="param-help">电源 I、P 为向外提供；其他两端器材按首端→末端为正，电容放电 P 为负。变阻器 I 指 A→W，P 包括两段。</p>
      </details>
      {loads.length > 0 && <label className="analysis-load">分析负载
        <select value={load?.id} onChange={e => setTargetId(e.target.value)} aria-label="分析负载">
          {loads.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </label>}
      {eq && actual && result.solved ? <>
        <div className="equivalent-metrics">
          <div><span>开路 Uth</span><strong>{formatVoltage(eq.voltage)}</strong></div>
          <div><span>等效 Rth</span><strong>{formatResistance(eq.resistance)}</strong></div>
          <div><span>负载实测</span><strong>{formatCurrent(actual.current)}</strong></div>
          <div><span>等效预测</span><strong>{formatCurrent(eq.predictedCurrent)}</strong></div>
        </div>
        <div className="power-plot">
          <svg viewBox="0 0 310 132" role="img" aria-label="最大功率匹配曲线，横轴负载与等效电阻比，纵轴负载功率与最大功率比">
            {[0, 0.5, 1].map(v => <g key={v}><line x1="24" x2="288" y1={104 - v * 76} y2={104 - v * 76} className="chart-grid" /><text x="19" y={107 - v * 76} textAnchor="end" className="chart-label">{v}</text></g>)}
            <line x1="90" x2="90" y1="24" y2="104" className="chart-grid" strokeDasharray="3 3" />
            <polyline points={points} className="chart-line" />
            {ratio <= 4 && <circle cx={24 + ratio * 66} cy={104 - (actual.power / Math.max(1e-12, eq.maxPower)) * 76} r="4" className="power-marker" />}
            {[0, 1, 2, 3, 4].map(v => <text key={v} x={24 + v * 66} y="120" textAnchor="middle" className="chart-label">{v}</text>)}
            <text x="24" y="14" className="chart-label">P_L / P_max</text><text x="288" y="131" textAnchor="end" className="chart-label">R_L / R_th</text>
          </svg>
          <div className="chart-legend"><span><i />理论匹配曲线 · 圆点为当前解</span></div>
        </div>
        <p className="param-help">当前 P_L = {formatPower(actual.power)}；理论 Pmax = {formatPower(eq.maxPower)}，在 R_L = {formatResistance(eq.resistance)} 附近取得。保留仪表负载；未计过流保护，额定范围以外仅作理论参考。</p>
      </> : <p className="param-help">等效与叠加分析适用于已连接的线性直流阻性网络；需要可用的负载通路，含 LED 或电容时不显示线性等效。守恒检查仍使用实际求解结果。</p>}
      {superposition && <div className="superposition-results">
        <strong>各源单独作用的电流贡献</strong>
        {superposition.contributions.map(c => <div key={c.sourceId}><span>{c.name}</span><code>{formatCurrent(c.current)}</code></div>)}
        <div><span>贡献代数和 / 总响应</span><code>{formatCurrent(superposition.sum)} / {formatCurrent(superposition.total)}</code></div>
        <p className="param-help">残差 {superposition.error.toExponential(2)} A；其余电压源置零并保留内阻。功率不可叠加。</p>
      </div>}
    </section>
  );
}
