import { describe, expect, it } from 'vitest';
import { buildLabCircuit } from '../../experiments/labs';
import { makeWorkspacePayload, validateWorkspace } from '../persistence';

describe('实验工程持久化校验', () => {
  it('有效 v1 工作区可往返序列化', () => {
    const built = buildLabCircuit('ohms-law', true);
    const payload = makeWorkspacePayload({
      components: built.components,
      wires: built.wires,
      measurements: [
        {
          id: 'm1',
          labId: 'ohms-law',
          createdAt: 1,
          label: '测试',
          voltage: 5,
          current: 0.005,
          resistance: 1000,
        },
      ],
      activeLabId: 'ohms-law',
      mode: 'guided',
    });
    const restored = validateWorkspace(JSON.parse(JSON.stringify(payload)));
    expect(restored).not.toBeNull();
    expect(restored?.components).toHaveLength(built.components.length);
    expect(restored?.wires).toHaveLength(built.wires.length);
    expect(restored?.measurements[0].voltage).toBe(5);
  });

  it('拒绝格式错误的工作区', () => {
    expect(validateWorkspace(null)).toBeNull();
    expect(validateWorkspace({ schema: 'wrong', version: 1 })).toBeNull();
    expect(
      validateWorkspace({
        schema: 'circuitlab-3d/workspace',
        version: 1,
        components: [{ id: 'x' }],
        wires: [],
      }),
    ).toBeNull();
  });

  it('拒绝引用不存在组件的导线', () => {
    const built = buildLabCircuit('ohms-law', false);
    const payload = makeWorkspacePayload({
      components: built.components,
      wires: [
        {
          id: 'w1',
          fromPortId: 'ghost:positive',
          toPortId: `${built.components[0].id}:negative`,
          color: '#000',
        },
      ],
      measurements: [],
      activeLabId: 'ohms-law',
      mode: 'guided',
    });
    expect(validateWorkspace(payload)).toBeNull();
  });
});
