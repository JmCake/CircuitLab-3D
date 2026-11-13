import type { CircuitSnapshot, SimulationResult } from '../types';
import { simulateCircuit } from './simulator';

export const TRANSIENT_SAMPLE_DT = 0.02;
export const TRANSIENT_MAX_STEP = 0.002;

/** Advance a requested physical duration with bounded backward-Euler substeps. No rendering dependency. */
export function advanceTransient(
  snapshot: CircuitSnapshot,
  voltages: Record<string, number>,
  time: number,
  duration = TRANSIENT_SAMPLE_DT,
  maxStep = TRANSIENT_MAX_STEP,
): SimulationResult {
  if (!Number.isFinite(duration) || duration <= 0 || !Number.isFinite(maxStep) || maxStep <= 0) {
    throw new Error('暂态时长与积分步长必须是有限正数。');
  }
  const steps = Math.ceil(duration / maxStep);
  if (steps > 1000) throw new Error('单次暂态请求超过 1000 个积分步，请分批推进。');
  const dt = duration / steps;
  let state = voltages;
  let result!: SimulationResult;
  for (let i = 0; i < steps; i++) {
    result = simulateCircuit(snapshot, { transient: { capacitorVoltages: state, dt, time: time + (i + 1) * dt } });
    if (!result.solved) return result;
    state = result.capacitorVoltages ?? state;
  }
  return result;
}

/** Fixed-step accumulator: delayed browser callbacks never change the electrical integration step. */
export class SimulationClock {
  private remainder = 0;
  consume(elapsed: number, dt = TRANSIENT_SAMPLE_DT, maxTicks = 10) {
    if (!Number.isFinite(elapsed) || elapsed < 0 || !Number.isFinite(dt) || dt <= 0) return { ticks: 0, lag: this.remainder };
    this.remainder += elapsed;
    const ticks = Math.min(maxTicks, Math.floor((this.remainder + 1e-10) / dt));
    this.remainder = Math.max(0, this.remainder - ticks * dt);
    return { ticks, lag: this.remainder };
  }
}
