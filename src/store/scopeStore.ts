import { create } from 'zustand';
import type { CircuitSnapshot, SimulationResult } from '../circuit/types';
import type { VoltageSample } from '../circuit/scope';
export interface ScopeCapture extends CircuitSnapshot { result: SimulationResult; samples: VoltageSample[] }
/** A single acquisition is shared by the physical screen and every console instance. */
export const useScopeStore = create<{ held: Record<string, ScopeCapture>; reset: () => void; hold: (id: string, capture: ScopeCapture) => void }>(set => ({ held: {}, reset: () => set({ held: {} }), hold: (id, capture) => set(s => ({ held: { ...s.held, [id]: capture } })) }));
