import { describe, expect, it } from 'vitest';
import {
  FIXED_STEP_HZ,
  MAX_FIXED_STEPS_PER_FRAME,
  MAX_PENDING_FIXED_TICKS,
  MAX_SUSTAINED_BACKLOG_FRAMES,
  advanceFixedStepClock,
  createFixedStepClockState,
  type FixedStepClockState,
} from '../../src/game/fixedStepClock';

const tickMilliseconds = 1000 / FIXED_STEP_HZ;

describe('fixed step clock', () => {
  it('初期状態から1固定更新を進める', () => {
    const next = advanceFixedStepClock(createFixedStepClockState(), tickMilliseconds);

    expect(next.steps).toBe(1);
    expect(next.pendingTicks).toBe(0);
    expect(next.shouldSuspend).toBe(false);
    expect(next.state.backlogFrames).toBe(0);
  });

  it('1描画あたりの固定更新を最大8回に制限し、残りを持ち越す', () => {
    const next = advanceFixedStepClock(createFixedStepClockState(), 100);

    expect(next.steps).toBe(MAX_FIXED_STEPS_PER_FRAME);
    expect(next.pendingTicks).toBe(4);
    expect(next.state.backlogFrames).toBe(1);
    expect(next.shouldSuspend).toBe(false);
  });

  it('30更新以上の遅延では更新せず、停止と蓄積破棄を要求する', () => {
    const next = advanceFixedStepClock(createFixedStepClockState(), 250);

    expect(next.pendingTicks).toBe(MAX_PENDING_FIXED_TICKS);
    expect(next.steps).toBe(0);
    expect(next.shouldSuspend).toBe(true);
    expect(next.state).toEqual(createFixedStepClockState());
  });

  it('30更新未満の遅延では最大8更新だけ進める', () => {
    const next = advanceFixedStepClock(createFixedStepClockState(), 200);

    expect(next.steps).toBe(MAX_FIXED_STEPS_PER_FRAME);
    expect(next.pendingTicks).toBe(16);
    expect(next.shouldSuspend).toBe(false);
  });

  it('蓄積が2更新以下へ戻ると連続フレーム数をリセットする', () => {
    const delayed = advanceFixedStepClock(createFixedStepClockState(), 100);
    const recovered = advanceFixedStepClock(delayed.state, 0);

    expect(delayed.state.backlogFrames).toBe(1);
    expect(recovered.pendingTicks).toBe(0);
    expect(recovered.state.backlogFrames).toBe(0);
    expect(recovered.shouldSuspend).toBe(false);
  });

  it('2更新超の蓄積が30描画続くと停止し、残りを破棄する', () => {
    let state: FixedStepClockState = {
      accumulatorSeconds: 3 / FIXED_STEP_HZ,
      backlogFrames: 0,
    };

    for (let frame = 0; frame < MAX_SUSTAINED_BACKLOG_FRAMES - 1; frame += 1) {
      const next = advanceFixedStepClock(state, 8 * tickMilliseconds);
      expect(next.shouldSuspend).toBe(false);
      state = next.state;
    }

    const next = advanceFixedStepClock(state, 8 * tickMilliseconds);

    expect(next.pendingTicks).toBe(3);
    expect(next.steps).toBe(0);
    expect(next.shouldSuspend).toBe(true);
    expect(next.state).toEqual(createFixedStepClockState());
  });

  it('負数とNaNの経過時間は時計を進めない', () => {
    const negative = advanceFixedStepClock(createFixedStepClockState(), -1);
    const nan = advanceFixedStepClock(createFixedStepClockState(), Number.NaN);

    expect(negative.steps).toBe(0);
    expect(negative.pendingTicks).toBe(0);
    expect(nan.steps).toBe(0);
    expect(nan.pendingTicks).toBe(0);
  });
});
