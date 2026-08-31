export type InputDeviceMode = 'touch' | 'desktop' | 'unknown';

export interface InputDeviceSignals {
  readonly coarsePointer: boolean;
  readonly finePointer: boolean;
  readonly maxTouchPoints: number;
}

export function detectInputDeviceMode(signals: InputDeviceSignals): InputDeviceMode {
  if (signals.coarsePointer || (!signals.finePointer && signals.maxTouchPoints > 0)) {
    return 'touch';
  }
  if (signals.finePointer || signals.maxTouchPoints === 0) return 'desktop';
  return 'unknown';
}

export function inputDeviceModeLabel(mode: InputDeviceMode): string {
  if (mode === 'touch') return 'スマホ操作';
  if (mode === 'desktop') return 'PC操作';
  return '操作方法';
}

export function chargePercent(ratio: number): number {
  if (!Number.isFinite(ratio)) return 0;
  return Math.round(Math.max(0, Math.min(1, ratio)) * 100);
}

export function formatChargeRemaining(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '0.0秒';
  return `${seconds.toFixed(1)}秒`;
}
