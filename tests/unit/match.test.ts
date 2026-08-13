import { describe, expect, it } from 'vitest';
import {
  MATCH_SECONDS,
  OVERTIME_SECONDS,
  TICKS_PER_SECOND,
  advanceClock,
  applyGoals,
  createMatchState,
} from '../../src/domain/match';

describe('match state', () => {
  it('90秒を固定更新数で表す', () => {
    const state = createMatchState(1234);
    const next = advanceClock(state, MATCH_SECONDS * TICKS_PER_SECOND);

    expect(next.phase).toBe('OVERTIME_NOTICE');
    expect(next.ticksRemaining).toBe(0);
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
});
