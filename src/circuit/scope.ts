import type { CircuitSnapshot, LabComponent, SimulationResult } from './types';
import { magnitude, sub, zero } from './simulation/complex';
export interface ScopeTrace { connected: boolean; points: { time: number; voltage: number }[]; rms: number | null; vpp: number | null }
export interface ScopeFrame { traces: ScopeTrace[]; phase: number | null; frequency: number | null; duration: number; sampled: boolean }
export interface VoltageSample { time: number; values: Record<string, number> }
/** RMS phasors use exp(jωt): u(t)=√2(Re(U)cosωt−Im(U)sinωt). No invented source waveform. */
export function scopeFrame(c: LabComponent, snapshot: CircuitSnapshot, result: SimulationResult, samples: VoltageSample[] = []): ScopeFrame {
  const duration = Number(c.params.timeDiv) * 10;
  const wired = (key: string) => snapshot.wires.some(w => w.fromPortId === `${c.id}:${key}` || w.toPortId === `${c.id}:${key}`);
  const volts = [1, 2].map(ch => sub(result.ac?.portVoltages[`${c.id}:ch${ch}`] ?? zero(), result.ac?.portVoltages[`${c.id}:negative`] ?? zero()));
  const frequency = result.ac?.frequencyHz ?? null, omega = 2 * Math.PI * (frequency ?? 0);
  const amplitude = magnitude(volts[0]) * Math.SQRT2, level = Number(c.params.triggerLevel);
  const triggerTime = omega > 0 && amplitude > Math.abs(level) ? (-Math.acos(level / amplitude) - Math.atan2(volts[0].im, volts[0].re)) / omega - 2 * Number(c.params.timeDiv) : 0;
  const recent = samples.filter(s => s.time >= (samples.at(-1)?.time ?? 0) - duration);
  const sampled = recent.some(s => Number.isFinite(s.values[`port:${c.id}:ch1`])) && !frequency;
  const traces = [1, 2].map((ch): ScopeTrace => {
    const connected = Boolean(c.params.enabled) && result.solved && wired(`ch${ch}`) && wired('negative');
    const v = volts[ch - 1], dc = (result.portVoltages?.[`${c.id}:ch${ch}`] ?? 0) - (result.portVoltages?.[`${c.id}:negative`] ?? 0);
    const end = recent.at(-1)?.time ?? 0;
    const points = !connected ? [] : sampled ? recent.filter(s => Number.isFinite(s.values[`port:${c.id}:ch${ch}`]) && Number.isFinite(s.values[`port:${c.id}:negative`])).map(s => ({ time: s.time - end + duration, voltage: s.values[`port:${c.id}:ch${ch}`] - s.values[`port:${c.id}:negative`] })) : Array.from({ length: 501 }, (_, i) => { const time = duration * i / 500; return { time, voltage: frequency ? Math.SQRT2 * (v.re * Math.cos(omega * (time + triggerTime)) - v.im * Math.sin(omega * (time + triggerTime))) : dc }; });
    return { connected, points, rms: !connected || sampled ? null : frequency ? magnitude(v) : Math.abs(dc), vpp: !connected || sampled ? null : frequency ? 2 * Math.SQRT2 * magnitude(v) : 0 };
  });
  const phase = frequency && traces.every(t => t.connected) && volts.every(v => magnitude(v) > 1e-9) ? ((Math.atan2(volts[1].im, volts[1].re) - Math.atan2(volts[0].im, volts[0].re)) * 180 / Math.PI + 540) % 360 - 180 : null;
  return { traces, phase, frequency, duration, sampled };
}
