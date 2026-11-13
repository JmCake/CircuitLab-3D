import { describe, expect, it } from 'vitest';
import { buildLabCircuit, LABS } from '../../experiments/labs';
import { makeWorkspacePayload, validateWorkspace } from '../persistence';

describe('实验工程持久化校验', () => {
  function payload() {
    return makeWorkspacePayload({ ...buildLabCircuit('ohms-law', true), measurements: [], activeLabId: 'ohms-law', mode: 'guided' });
  }
  it('拒绝重复组件 ID，而非在构建 Set 后丢失重复信息', () => {
    const value = payload();
    value.components.push({ ...value.components[0] });
    expect(validateWorkspace(value)).toBeNull();
  });
  it('拒绝存在组件下的不存在端口', () => {
    const value = payload();
    value.wires[0].fromPortId = value.components[0].id + ':nonexistent';
    expect(validateWorkspace(value)).toBeNull();
  });
  it('拒绝重复导线与自连接', () => {
    const value = payload();
    value.wires.push({ ...value.wires[0], id: 'extra' });
    expect(validateWorkspace(value)).toBeNull();
    const self = payload();
    self.wires[0].toPortId = self.wires[0].fromPortId;
    expect(validateWorkspace(self)).toBeNull();
  });
  it('拒绝原型属性作为器材类型', () => {
    const value = payload();
    (value.components[0] as { type: string }).type = 'toString';
    expect(validateWorkspace(value)).toBeNull();
  });
  it('全部九组实验的示范工程通过严格的真实端口与堆叠数校验', () => {
    for (const lab of LABS) {
      const value = makeWorkspacePayload({ ...buildLabCircuit(lab.id, true), measurements: [], activeLabId: lab.id, mode: 'guided' });
      expect(validateWorkspace(value), lab.title).not.toBeNull();
    }
  });
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
