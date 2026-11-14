import { create } from 'zustand';
export type ViewPreset = 'perspective' | 'top' | 'front';
export type RenderQuality = 'fine' | 'smooth';
export const useViewStore = create<{
  blockedWires: number;
  quality: RenderQuality;
  setQuality: (quality: RenderQuality) => void;
  sideOpen: boolean;
  libraryFolded: boolean;
  panMode: boolean;
  consoleId: string | null;
  dataScreen: boolean;
  setSideOpen: (open: boolean) => void;
  setLibraryFolded: (folded: boolean) => void;
  setPanMode: (pan: boolean) => void;
  openConsole: (id: string | null) => void;
  setDataScreen: (open: boolean) => void;
}>((set) => ({ blockedWires: 0, quality: 'fine', setQuality: quality => set({ quality }),
  sideOpen: true, libraryFolded: false, panMode: false, consoleId: null, dataScreen: false,
  setSideOpen: sideOpen => set({ sideOpen }), setLibraryFolded: libraryFolded => set({ libraryFolded }),
  setPanMode: panMode => set({ panMode }), openConsole: consoleId => set({ consoleId, dataScreen: false }), setDataScreen: dataScreen => set({ dataScreen, ...(dataScreen ? { consoleId: null } : {}) }),
}));
