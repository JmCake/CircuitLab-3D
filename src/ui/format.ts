export function formatVoltage(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  const abs = Math.abs(value);
  if (abs >= 1000) return `${(value / 1000).toFixed(2)} kV`;
  return `${value.toFixed(digits)} V`;
}

export function formatCurrent(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  if (Math.abs(value) < 1) return `${(value * 1000).toFixed(2)} mA`;
  return `${value.toFixed(3)} A`;
}

export function formatResistance(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(2)} MΩ`;
  if (Math.abs(value) >= 1000) return `${(value / 1000).toFixed(2)} kΩ`;
  return `${value.toFixed(value < 10 ? 2 : 1)} Ω`;
}

export function formatPower(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  if (Math.abs(value) < 0.001) return `${(value * 1_000_000).toFixed(1)} µW`;
  if (Math.abs(value) < 1) return `${(value * 1000).toFixed(2)} mW`;
  return `${value.toFixed(3)} W`;
}

export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds)) return '—';
  if (seconds < 1) return `${(seconds * 1000).toFixed(0)} ms`;
  return `${seconds.toFixed(2)} s`;
}

export function formatParamValue(value: number, precision = 2): string {
  if (!Number.isFinite(value)) return '—';
  if (Math.abs(value) >= 10000) return value.toFixed(0);
  if (Math.abs(value) >= 100) return value.toFixed(precision);
  return value.toFixed(Math.max(precision, 1));
}

export function formatTimestamp(timestamp: number): string {
  return new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(timestamp));
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function percent(value: number): string {
  return `${Math.round(clamp(value, 0, 1) * 100)}%`;
}
