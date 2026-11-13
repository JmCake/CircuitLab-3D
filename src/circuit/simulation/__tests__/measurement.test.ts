import { describe, expect, it } from 'vitest';
import { buildLabCircuit } from '../../../experiments/labs';
import { simulateCircuit } from '../simulator';
import { measurementIssue } from '../../measurement';
describe('仪表记录有效性', () => {
  it('正常量程允许记录', () => {
    const circuit = buildLabCircuit('ohms-law', true);
    expect(measurementIssue(circuit.components, simulateCircuit(circuit))).toBeNull();
  });
  it('超量程只保留诊断数值，不当作有效测量记录', () => {
    const circuit = buildLabCircuit('ohms-law', true);
    circuit.components.find(c => c.type === 'ammeter')!.params.range = 0.002;
    expect(measurementIssue(circuit.components, simulateCircuit(circuit))).toContain('超量程');
  });
  it('电路有解但存在错误诊断时，不能记录为正常实验数据', () => {
    const circuit = buildLabCircuit('ohms-law', true);
    const result = simulateCircuit(circuit);
    result.status = 'error';
    expect(measurementIssue(circuit.components, result)).toContain('求解错误');
  });
});
