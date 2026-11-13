import { create } from 'zustand';
export type ViewPreset = 'perspective' | 'top' | 'front';
export type RenderQuality = 'fine' | 'smooth';
export const useViewStore = create<{
  quality: RenderQuality;
  setQuality: (quality: RenderQuality) => void;
}>((set) => ({ quality: 'fine', setQuality: quality => set({ quality }) }));
