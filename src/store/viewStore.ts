import { create } from 'zustand';
export type ViewPreset = 'perspective' | 'top' | 'front';
export type RenderQuality = 'fine' | 'smooth';
export const useViewStore = create<{
  blockedWires: number;
  quality: RenderQuality;
  setQuality: (quality: RenderQuality) => void;
}>((set) => ({ blockedWires: 0, quality: 'fine', setQuality: quality => set({ quality }) }));
