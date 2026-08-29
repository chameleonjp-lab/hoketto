import { describe, expect, it } from 'vitest';
import {
  MATCH_SECONDS,
  OVERTIME_SECONDS,
  TICKS_PER_SECOND,
  advanceClock,
  advanceResumeCountdown,
  applyGoals,
  beginResume,
  createMatchState,
  invalidateMatch,
  suspendMatch,
} from '../../src/domain/match';

describe('match state', () => {
  it('90秒を固定更新数で表す', () => {
    const state = createMatchState(1234);
    const next = advanceClock(state, MATCH_SECONDS * TICKS_PER_SECOND);

    expect(next.phase).toBe('OVERTIME_NOTICE');
    expect(next.ticksRemaining).toBe(0);
  });

  it('指定した試合時間を固定更新数へ変換する', () => {
    const state = createMatchState(1234, 30);

    expect(state.ticksRemaining).toBe(30 * TICKS_PER_SECOND);
  });

  it('0秒や小数の試合時間を受け付けない', () => {
    expect(() => createMatchState(1234, 0)).toThrow();
    expect(() => createMatchState(1234, 1.5)).toThrow();
  });

  it('同じ固定更新内の両側の得点を捨てない', () => {
    const state = createMatchState(1234);
    const next = applyGoals(state, [
      { team: 'player', points: 1 },
      { team: 'cpu', points: 2 },
    ]);

    expect(next.playerScore).toBe(1);
    expect(next.cpuScore).toBe(2);
    expect(next.phase).toBe('GOAL_PAUSE');
  });

  it('延長が15秒で結果へ進む', () => {
    const state = {
      ...createMatchState(1234),
      phase: 'OVERTIME' as const,
      ticksRemaining: OVERTIME_SECONDS * TICKS_PER_SECOND,
    };
    const next = advanceClock(state, OVERTIME_SECONDS * TICKS_PER_SECOND);

    expect(next.phase).toBe('RESULT');
  });

  it('中断中は元の状態を保存し、明示的な再開操作後に3秒数える', () => {
    const suspended = suspendMatch(createMatchState(1234), 'hidden');
    const countdown = beginResume(suspended);
    const resumed = advanceResumeCountdown(countdown, 3 * TICKS_PER_SECOND);

    expect(suspended.phase).toBe('SUSPENDED');
    expect(suspended.resumeTarget).toBe('PLAYING');
    expect(countdown.resumeCountdownTicks).toBe(3 * TICKS_PER_SECOND);
    expect(resumed.phase).toBe('PLAYING');
    expect(resumed.suspensionReason).toBeUndefined();
  });

  it('再開カウント中の再中断でも、同じ復帰先へ戻る', () => {
    const suspended = suspendMatch(createMatchState(1234), 'hidden');
    const countdown = beginResume(suspended);
    const interrupted = suspendMatch(countdown, 'resize');
    const restarted = beginResume(interrupted);
    const resumed = advanceResumeCountdown(restarted, 3 * TICKS_PER_SECOND);

    expect(interrupted.phase).toBe('SUSPENDED');
    expect(interrupted.suspensionReason).toBe('resize');
    expect(interrupted.resumeTarget).toBe('PLAYING');
    expect(resumed.phase).toBe('PLAYING');
  });

  it('復元不能はINVALIDへ移り、通常の結果にしない', () => {
    const invalid = invalidateMatch(
      suspendMatch(createMatchState(1234), 'render-loss'),
      'restore-failed',
    );

    expect(invalid.phase).toBe('INVALID');
    expect(invalid.invalidReason).toBe('restore-failed');
  });
});
