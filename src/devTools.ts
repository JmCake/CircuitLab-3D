import { getPortWorldPosition, parsePortId } from './circuit';
import { useLabStore } from './store/labStore';
import { cameraBridge } from './three/cameraBridge';
import { inspectRenderedWires } from './three/wireInspection';

/**
 * 仅在 Vite 开发环境挂载的自动化测试入口。
 * 生产构建不会执行此文件中的全局挂载。
 */
export function installDevTools(): void {
  if (!import.meta.env.DEV) return;
  const api = {
    version: '0.5.0',
    store: useLabStore,
    camera: cameraBridge,
    wireClearance: inspectRenderedWires,
    portScreen(portId: string): [number, number] | null {
      const state = useLabStore.getState();
      const parsed = parsePortId(portId);
      if (!parsed) return null;
      const component = state.components.find((item) => item.id === parsed.componentId);
      if (!component) return null;
      const world = getPortWorldPosition(component, parsed.portKey);
      if (!world) return null;
      return cameraBridge.worldToScreen(world);
    },
    renderStats() {
      return cameraBridge.getRenderStats();
    },
    localScreen(componentId: string, local: [number, number, number]): [number, number] | null {
      const state = useLabStore.getState();
      const component = state.components.find((item) => item.id === componentId);
      if (!component) return null;
      const c = Math.cos(component.rotationY);
      const s = Math.sin(component.rotationY);
      const world: [number, number, number] = [
        component.position[0] + local[0] * c + local[2] * s,
        local[1],
        component.position[1] - local[0] * s + local[2] * c,
      ];
      return cameraBridge.worldToScreen(world);
    },
    snapshot() {
      const state = useLabStore.getState();
      return {
        components: state.components.length,
        wires: state.wires.length,
        solved: state.result.solved,
        status: state.result.status,
        measurements: state.measurements.length,
        transientTime: state.transient.time,
        selectedId: state.selectedId,
      };
    },
  };
  (window as unknown as { __circuitlab?: typeof api }).__circuitlab = api;
}
