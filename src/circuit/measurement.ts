import type { LabComponent, SimulationResult } from './types';

/** Computed out-of-range values are useful for diagnostics, not valid instrument observations. */
export function measurementIssue(components: LabComponent[], result: SimulationResult): string | null {
  if (!result.solved || result.status === 'error') return '当前电路存在求解错误，请修复接线后再记录。';
  const dmm = components.find(c => c.type === 'multimeter' && result.elements[c.id]?.flags?.activeProbe && (result.elements[c.id]?.flags?.invalidReading || result.elements[c.id]?.overRange));
  if (dmm) return '请检查万用表挡位、插孔、量程及电路是否带电。';
  const wrongMode = components.find(c => ['ammeter', 'voltmeter'].includes(c.type) && (c.params.mode === 'ac') !== (result.domain === 'ac'));
  if (wrongMode) return `请将${wrongMode.name}切换到${result.domain === 'ac' ? '交流' : '直流'}测量模式。`;
  const meter = components.find(c => ['ammeter', 'voltmeter'].includes(c.type) && result.elements[c.id]?.overRange);
  return meter ? `${meter.name} 已超量程，请切换到合适量程后再记录。` : null;
}
