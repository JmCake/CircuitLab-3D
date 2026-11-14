export interface RenderStats {
  frame: number;
  calls: number;
  triangles: number;
  lines: number;
  geometries: number;
  textures: number;
  dpr: number;
  buffer: [number, number];
}

export interface CameraBridge {
  view: (preset: 'perspective' | 'top' | 'front') => void;
  reset: () => void;
  pan: (horizontal: number, vertical: number) => void;
  getPose: () => { position: number[]; target: number[] } | null;
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
  view: () => undefined,
  reset: () => undefined,
  pan: () => undefined,
  getPose: () => null,
  focus: () => undefined,
  screenToTable: () => null,
  worldToScreen: () => null,
  getRenderStats: () => null,
};
