import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useLabStore } from '../labStore';
import { validateWorkspace } from '../persistence';

describe('课程切换、参考点与测量存档', () => {
  beforeEach(() => { vi.stubGlobal('window', { innerWidth: 1600, setTimeout: () => 0 }); useLabStore.setState({ history: { past: [], future: [], transactionBefore: null }, measurements: [], toasts: [] }); });
  afterEach(() => vi.unstubAllGlobals());
  it('切换实验后撤销和重做，同时恢复目录、器材、参考点与模式', () => {
    const store = useLabStore;
    store.getState().loadLab('potentials', true); store.getState().setReferencePort('potentials-r2:a');
    store.getState().addComponent('resistor');
    const before = store.getState().components.map(c => c.id);
    store.getState().setActiveLab('three-phase-star');
    expect(store.getState().activeLabId).toBe('three-phase-star');
    store.getState().undo();
    expect(store.getState().activeLabId).toBe('potentials'); expect(store.getState().referencePortId).toBe('potentials-r2:a');
    expect(store.getState().components.map(c => c.id)).toEqual(before); expect(store.getState().mode).toBe('guided');
    store.getState().redo(); expect(store.getState().activeLabId).toBe('three-phase-star'); expect(store.getState().referencePortId).toBeNull();
    expect(store.getState().result.domain).toBe('ac');
  });
  it('工程往返保留参考点和测量参数，拒绝非有限观测数据', () => {
    const store = useLabStore;
    store.getState().loadLab('potentials', true); store.getState().setReferencePort('potentials-r2:a'); store.getState().recordMeasurement();
    const workspace = store.getState().getWorkspace(), restored = validateWorkspace(JSON.parse(JSON.stringify(workspace)))!;
    expect(restored.referencePortId).toBe('potentials-r2:a'); expect(restored.measurements[0].observation?.values['v:potentials-r2:a']).toBeGreaterThan(9);
    const bad = structuredClone(workspace); bad.measurements[0].observation!.values.bad = NaN;
    expect(validateWorkspace(bad)!.measurements).toEqual([]);
    store.getState().importWorkspace(restored); expect(store.getState().referencePortId).toBe('potentials-r2:a');
  });
});
