import { describe, expect, it } from 'vitest';
import {
  chargePercent,
  detectInputDeviceMode,
  formatChargeRemaining,
  inputDeviceModeLabel,
} from '../../src/app/gamePresentation';

describe('game presentation helpers', () => {
  it('coarse pointer devices use touch instructions', () => {
    expect(
      detectInputDeviceMode({ coarsePointer: true, finePointer: false, maxTouchPoints: 5 }),
    ).toBe('touch');
    expect(inputDeviceModeLabel('touch')).toBe('スマホ操作');
  });

  it('fine pointer devices use desktop instructions', () => {
    expect(
      detectInputDeviceMode({ coarsePointer: false, finePointer: true, maxTouchPoints: 0 }),
    ).toBe('desktop');
    expect(inputDeviceModeLabel('desktop')).toBe('PC操作');
  });

  it('touch hardware is used when pointer media is inconclusive', () => {
    expect(
      detectInputDeviceMode({ coarsePointer: false, finePointer: false, maxTouchPoints: 2 }),
    ).toBe('touch');
  });

  it('unknown signals keep both instruction sets available', () => {
    expect(
      detectInputDeviceMode({ coarsePointer: false, finePointer: false, maxTouchPoints: -1 }),
    ).toBe('unknown');
    expect(inputDeviceModeLabel('unknown')).toBe('操作方法');
  });

  it('clamps the visible charge percentage', () => {
    expect(chargePercent(-1)).toBe(0);
    expect(chargePercent(0.456)).toBe(46);
    expect(chargePercent(2)).toBe(100);
    expect(chargePercent(Number.NaN)).toBe(0);
  });

  it('formats remaining charge time for the status panel', () => {
    expect(formatChargeRemaining(0.9)).toBe('0.9秒');
    expect(formatChargeRemaining(0)).toBe('0.0秒');
    expect(formatChargeRemaining(Number.NaN)).toBe('0.0秒');
  });
});
