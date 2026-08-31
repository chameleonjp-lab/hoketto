import type { TurretReadiness } from '../game/straightBench';

export type DeviceMode = 'touch' | 'desktop' | 'unknown';

export interface DeviceSignals {
  readonly coarsePointer: boolean;
  readonly finePointer: boolean;
  readonly touchPoints: number;
}

export interface ReadinessPresentation {
  readonly state: 'ready' | 'charging' | 'stopped';
  readonly title: string;
  readonly detail: string;
  readonly progress: number;
  readonly ariaValueText: string;
}

export function detectDeviceMode(signals: DeviceSignals): DeviceMode {
  if (signals.coarsePointer || (!signals.finePointer && signals.touchPoints > 0)) {
    return 'touch';
  }
  if (signals.finePointer || signals.touchPoints === 0) return 'desktop';
  return 'unknown';
}

export function getReadinessPresentation(
  readiness: TurretReadiness,
  cooldownSeconds: number,
  chargeRatio: number,
): ReadinessPresentation {
  const progress = Math.round(Math.max(0, Math.min(1, chargeRatio)) * 100);
  if (readiness === 'ready') {
    return {
      state: 'ready',
      title: '撃てます',
      detail: '今すぐ発射できます。ゲージが満ちています。',
      progress: 100,
      ariaValueText: '充電完了。今すぐ発射できます。',
    };
  }
  if (readiness === 'charging') {
    const remaining = Math.max(0.1, Math.ceil(Math.max(0, cooldownSeconds) * 10) / 10);
    return {
      state: 'charging',
      title: '充電中',
      detail: `次の一発まであと${remaining.toFixed(1)}秒。ゲージが満ちるまで待ちます。`,
      progress,
      ariaValueText: `充電${progress}パーセント。あと${remaining.toFixed(1)}秒で発射できます。`,
    };
  }
  return {
    state: 'stopped',
    title: '停止中',
    detail: '試合が始まると発射できます。',
    progress: 0,
    ariaValueText: '充電停止中。',
  };
}

export function deviceModeLabel(mode: DeviceMode): string {
  if (mode === 'touch') return 'スマホ操作';
  if (mode === 'desktop') return 'PC操作';
  return '操作方法';
}
