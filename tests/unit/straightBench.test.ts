import { describe, expect, it } from 'vitest';
import {
  CPU_REACTION_TICKS,
  GOAL_PAUSE_TICKS,
  SHOT_COOLDOWN_TICKS,
  createStraightBenchState,
  createStraightBenchRematch,
  fireCpuShot,
  firePlayerShot,
  getCpuTurretReadiness,
  getPlayerTurretReadiness,
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

  it('30秒の試し撃ちは同じ物理で時間だけ短くする', () => {
    const state = createStraightBenchState(20260814, 30);

    expect(state.durationSeconds).toBe(30);
    expect(state.match.ticksRemaining).toBe(30 * 120);
    expect(state.pucks).toHaveLength(1);
  });

  it('試し撃ちの再戦も30秒を保つ', () => {
    const initial = createStraightBenchState(20260814, 30);
    const result = { ...initial, match: { ...initial.match, phase: 'RESULT' as const } };
    const rematch = createStraightBenchRematch(result);

    expect(rematch.durationSeconds).toBe(30);
    expect(rematch.match.ticksRemaining).toBe(30 * 120);
    expect(rematch.match.seed).toBe(20260815);
  });

  it('弾が高速でもパックを通り抜けず、命中した方向へ押す', () => {
    const fired = firePlayerShot(createStraightBenchState(), { x: 180, y: 320 });
    const afterHit = stepStraightBench(fired, 40);

    expect(afterHit.bullets.filter((bullet) => bullet.owner === 'player')).toHaveLength(0);
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

  it('延長中も通常と同じ発射待ち規則で撃てる', () => {
    const initial = createStraightBenchState();
    const overtime = {
      ...initial,
      match: { ...initial.match, phase: 'OVERTIME' as const, ticksRemaining: 15 * 120 },
    };

    const fired = firePlayerShot(overtime, { x: 180, y: 320 });

    expect(fired.bullets).toHaveLength(1);
    expect(fired.cooldownTicks).toBe(SHOT_COOLDOWN_TICKS);
  });

  it('有限でない照準は弾を作らない', () => {
    const state = createStraightBenchState();

    expect(firePlayerShot(state, { x: Number.NaN, y: 320 })).toBe(state);
    expect(firePlayerShot(state, { x: 180, y: Number.POSITIVE_INFINITY })).toBe(state);
  });

  it('CPUは初回の反応待ち後に、プレイヤー入力なしで1発を撃つ', () => {
    const initial = createStraightBenchState();

    expect(initial.cpuThinkTicks).toBe(CPU_REACTION_TICKS);
    expect(fireCpuShot(initial, { x: 180, y: 320 })).toBe(initial);
    const afterReaction = stepStraightBench(initial, CPU_REACTION_TICKS);
    const cpuBullets = afterReaction.bullets.filter((bullet) => bullet.owner === 'cpu');

    expect(cpuBullets).toHaveLength(1);
    expect(cpuBullets[0]?.velocity.y).toBeGreaterThan(0);
    expect(afterReaction.cpuCooldownTicks).toBe(SHOT_COOLDOWN_TICKS);

    const stillCooling = stepStraightBench(afterReaction, CPU_REACTION_TICKS);
    expect(stillCooling.nextBulletId).toBe(afterReaction.nextBulletId);
  });

  it('CPU弾も同じ命中判定でパックを自陣方向へ押す', () => {
    const initial = createStraightBenchState();
    const ready = {
      ...initial,
      cpuThinkTicks: 0,
      cpuCooldownTicks: 0,
    };

    const afterHit = stepStraightBench(ready, 40);

    expect(afterHit.pucks[0]?.velocity.y).toBeGreaterThan(0);
    expect(afterHit.bullets.filter((bullet) => bullet.owner === 'cpu')).toHaveLength(0);
  });

  it('プレイヤーとCPUの発射待ちは別々で、両方の弾を保持できる', () => {
    const initial = createStraightBenchState();
    const cpuReady = stepStraightBench(initial, CPU_REACTION_TICKS);
    const playerFired = firePlayerShot(cpuReady, { x: 180, y: 320 });

    expect(playerFired.bullets.filter((bullet) => bullet.owner === 'cpu')).toHaveLength(1);
    expect(playerFired.bullets.filter((bullet) => bullet.owner === 'player')).toHaveLength(1);
    expect(fireCpuShot(playerFired, { x: 180, y: 320 })).toBe(playerFired);
  });

  it('ゴール停止、延長予告、結果、停止中はCPUが後から発射しない', () => {
    const initial = createStraightBenchState();
    const noCpuShot = (phase: 'GOAL_PAUSE' | 'OVERTIME_NOTICE' | 'RESULT' | 'SUSPENDED') =>
      ({
        ...initial,
        match: { ...initial.match, phase },
        cpuCooldownTicks: 0,
        cpuThinkTicks: 0,
        goalPauseTicks: phase === 'GOAL_PAUSE' ? 10 : 0,
        overtimeNoticeTicks: phase === 'OVERTIME_NOTICE' ? 10 : 0,
      }) as const;

    for (const phase of ['GOAL_PAUSE', 'OVERTIME_NOTICE', 'RESULT', 'SUSPENDED'] as const) {
      const state = noCpuShot(phase);
      const stepped = stepStraightBench(state, 1);

      expect(stepped.bullets).toHaveLength(0);
      expect(stepped.nextBulletId).toBe(state.nextBulletId);
    }
  });

  it('時計が尽きる更新ではCPUを新規発射せず、結果画面へ弾を持ち越さない', () => {
    const initial = createStraightBenchState();
    const lastTick = {
      ...initial,
      match: { ...initial.match, playerScore: 1, ticksRemaining: 1 },
      cpuCooldownTicks: 0,
      cpuThinkTicks: 0,
    };

    const result = stepStraightBench(lastTick, 1);

    expect(result.match.phase).toBe('RESULT');
    expect(result.bullets).toHaveLength(0);
    expect(result.nextBulletId).toBe(lastTick.nextBulletId);
  });

  it('両砲台の発射状態は、待ち時間と試合状態から一意に読める', () => {
    const initial = createStraightBenchState();
    const playerCharging = firePlayerShot(initial, { x: 180, y: 320 });
    const cpuThinking = initial;
    const cpuCharging = stepStraightBench(cpuThinking, CPU_REACTION_TICKS);
    const result = {
      ...initial,
      match: { ...initial.match, phase: 'RESULT' as const },
    };

    expect(getPlayerTurretReadiness(initial)).toBe('ready');
    expect(getPlayerTurretReadiness(playerCharging)).toBe('charging');
    expect(getCpuTurretReadiness(cpuThinking)).toBe('thinking');
    expect(getCpuTurretReadiness(cpuCharging)).toBe('charging');
    expect(getPlayerTurretReadiness(result)).toBe('stopped');
    expect(getCpuTurretReadiness(result)).toBe('stopped');
  });

  it('結果からの再戦は同じ盤面の新しい種を使い、結果前の状態は変えない', () => {
    const initial = createStraightBenchState(20260814);
    const beforeResult = createStraightBenchRematch(initial);
    const result = { ...initial, match: { ...initial.match, phase: 'RESULT' as const } };
    const rematch = createStraightBenchRematch(result);

    expect(beforeResult).toBe(initial);
    expect(rematch.match.seed).toBe(initial.match.seed + 1);
    expect(rematch.match.phase).toBe('PLAYING');
    expect(rematch.match.playerScore).toBe(0);
    expect(rematch.match.cpuScore).toBe(0);
    expect(rematch.pucks[0]?.position).toEqual({ x: 180, y: 320 });
  });
});
