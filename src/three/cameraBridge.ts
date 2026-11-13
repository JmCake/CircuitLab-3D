export interface RenderStats {
  calls: number;
  triangles: number;
  lines: number;
  geometries: number;
  textures: number;
  dpr: number;
  buffer: [number, number];
}

export interface CameraBridge {
  reset: () => void;
  focus: (position: [number, number]) => void;
  screenToTable: (clientX: number, clientY: number) => [number, number] | null;
  worldToScreen: (point: [number, number, number]) => [number, number] | null;
  getRenderStats: () => RenderStats | null;
}

/**
 * DOM 面板与 Three.js 相机之间唯一的小桥接层。
 * 它只做视角/落点换算，不承载实验状态。
 */
export const cameraBridge: CameraBridge = {
  reset: () => undefined,
  focus: () => undefined,
  screenToTable: () => null,
  worldToScreen: () => null,
  getRenderStats: () => null,
};
