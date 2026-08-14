import { describe, expect, it } from 'vitest';
import {
  GOAL_PAUSE_TICKS,
  SHOT_COOLDOWN_TICKS,
  createStraightBenchState,
  firePlayerShot,
  stepStraightBench,
} from '../../src/game/straightBench';

describe('straight bench simulation', () => {
  it('90秒、中央の1パック、両者の得点を初期化する', () => {
    const state = createStraightBenchState(20260814);

    expect(state.match.ticksRemaining).toBe(90 * 120);
    expect(state.match.playerScore).toBe(0);
    expect(state.match.cpuScore).toBe(0);
    expect(state.pucks).toHaveLength(1);
    expect(state.pucks[0]?.position).toEqual({ x: 180, y: 320 });
  });

  it('弾が高速でもパックを通り抜けず、命中した方向へ押す', () => {
    const fired = firePlayerShot(createStraightBenchState(), { x: 180, y: 320 });
    const afterHit = stepStraightBench(fired, 40);

    expect(afterHit.bullets).toHaveLength(0);
    expect(afterHit.pucks[0]?.velocity.y).toBeLessThan(0);
    expect(afterHit.pucks[0]?.position.y).toBeLessThan(320);
  });

  it('発射待ち時間中は2発目を予約せず、満ちた後だけ再発射できる', () => {
    const first = firePlayerShot(createStraightBenchState(), { x: 180, y: 320 });
    const blocked = firePlayerShot(first, { x: 250, y: 250 });

    expect(blocked).toBe(first);

    const almostReady = stepStraightBench(first, SHOT_COOLDOWN_TICKS - 1);
    expect(firePlayerShot(almostReady, { x: 250, y: 250 })).toBe(almostReady);

    const ready = stepStraightBench(almostReady, 1);
    expect(firePlayerShot(ready, { x: 250, y: 250 }).bullets).toHaveLength(1);
  });

  it('上のゴールに入るとプレイヤーへ1点を加え、短い停止へ移る', () => {
    const initial = createStraightBenchState();
    const nearGoal = {
      ...initial,
      pucks: [
        {
          ...initial.pucks[0]!,
          position: { x: 180, y: 30 },
          velocity: { x: 0, y: -300 },
        },
      ],
    };

    const scored = stepStraightBench(nearGoal, 10);

    expect(scored.match.playerScore).toBe(1);
    expect(scored.match.cpuScore).toBe(0);
    expect(scored.match.phase).toBe('GOAL_PAUSE');
    expect(scored.goalPauseTicks).toBeGreaterThan(0);
    expect(scored.goalPauseTicks).toBeLessThanOrEqual(GOAL_PAUSE_TICKS);
  });

  it('下のゴールに入るとCPUへ1点を加え、停止後は同じ試合へ戻る', () => {
    const initial = createStraightBenchState();
    const nearGoal = {
      ...initial,
      pucks: [
        {
          ...initial.pucks[0]!,
          position: { x: 180, y: 626 },
          velocity: { x: 0, y: 600 },
        },
      ],
    };

    const scored = stepStraightBench(nearGoal, 10);
    const resumed = stepStraightBench(scored, GOAL_PAUSE_TICKS);

    expect(scored.match.cpuScore).toBe(1);
    expect(resumed.match.phase).toBe('PLAYING');
    expect(resumed.match.cpuScore).toBe(1);
    expect(resumed.pucks[0]?.position).toEqual({ x: 180, y: 320 });
  });

  it('ゴール開口の外では得点せず、外周レールで跳ね返る', () => {
    const initial = createStraightBenchState();
    const outsideOpening = {
      ...initial,
      pucks: [
        {
          ...initial.pucks[0]!,
          position: { x: 60, y: 30 },
          velocity: { x: 0, y: -300 },
        },
      ],
    };

    const bounced = stepStraightBench(outsideOpening, 7);

    expect(bounced.match.playerScore).toBe(0);
    expect(bounced.match.phase).toBe('PLAYING');
    expect(bounced.pucks[0]?.position.y).toBe(14);
    expect(bounced.pucks[0]?.velocity.y).toBeGreaterThan(0);
  });

  it('時計が尽きると勝敗を結果へ移し、同点だけ延長予告へ移す', () => {
    const leading = createStraightBenchState();
    const result = stepStraightBench({
      ...leading,
      match: { ...leading.match, playerScore: 1, ticksRemaining: 1 },
    });
    const tied = stepStraightBench({ ...leading, match: { ...leading.match, ticksRemaining: 1 } });

    expect(result.match.phase).toBe('RESULT');
    expect(tied.match.phase).toBe('OVERTIME_NOTICE');
    expect(tied.overtimeNoticeTicks).toBe(3 * 120);
  });

  it('時間切れと同じ固定更新で追いついた得点は延長予告へ進む', () => {
    const initial = createStraightBenchState();
    const nearGoal = {
      ...initial,
      match: { ...initial.match, playerScore: 1, ticksRemaining: 1 },
      pucks: [
        {
          ...initial.pucks[0]!,
          position: { x: 180, y: 626 },
          velocity: { x: 0, y: 600 },
        },
      ],
    };

    const scored = stepStraightBench(nearGoal, 1);

    expect(scored.match.playerScore).toBe(1);
    expect(scored.match.cpuScore).toBe(1);
    expect(scored.match.phase).toBe('GOAL_PAUSE');
    expect(scored.goalResumePhase).toBe('OVERTIME_NOTICE');
  });

  it('有限でない照準は弾を作らない', () => {
    const state = createStraightBenchState();

    expect(firePlayerShot(state, { x: Number.NaN, y: 320 })).toBe(state);
    expect(firePlayerShot(state, { x: 180, y: Number.POSITIVE_INFINITY })).toBe(state);
  });
});
