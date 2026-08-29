import { describe, expect, it } from 'vitest';
import {
  CPU_REACTION_TICKS,
  CORE_ACTIVE_SECONDS,
  CORE_NOTICE_SECONDS,
  CORE_RESERVATION_TICKS,
  NO_SCORE_EXPANSION_SECONDS,
  NO_SCORE_NOTICE_SECONDS,
  NO_SCORE_PULSE_INTERVAL_SECONDS,
  NO_SCORE_PULSE_SECONDS,
  OVERTIME_GOAL_EXPANSION_RATIO,
  GOAL_PAUSE_TICKS,
  NORMAL_CPU_REACTION_TICKS,
  SHOT_COOLDOWN_TICKS,
  createStraightBenchState,
  createStraightBenchRematch,
  fireCpuShot,
  firePlayerShot,
  getCpuTurretReadiness,
  getGoalOpeningBounds,
  getPlayerTurretReadiness,
  beginStraightBenchResume,
  invalidateStraightBench,
  suspendStraightBench,
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

  it('手動停止中は時計と物理を止め、明示再開後に3秒数える', () => {
    const progressed = stepStraightBench(createStraightBenchState(20260814), 30);
    const suspended = suspendStraightBench(progressed);

    expect(suspended.match.phase).toBe('SUSPENDED');
    expect(stepStraightBench(suspended, 120)).toEqual(suspended);

    const countdown = beginStraightBenchResume(suspended);
    expect(countdown.match.phase).toBe('COUNTDOWN');
    expect(countdown.match.resumeCountdownTicks).toBe(3 * 120);
    const resumed = stepStraightBench(countdown, 3 * 120);
    expect(resumed.match.phase).toBe('PLAYING');
    expect(resumed.match.tick).toBe(progressed.match.tick);
  });

  it('復元不能な試合はINVALIDへ移り、弾を残さない', () => {
    const fired = firePlayerShot(createStraightBenchState(20260814), { x: 180, y: 320 });
    const invalid = invalidateStraightBench(fired, 'render-restore-timeout');

    expect(invalid.match.phase).toBe('INVALID');
    expect(invalid.match.invalidReason).toBe('render-restore-timeout');
    expect(invalid.invalidReason).toBe('render-restore-timeout');
    expect(invalid.bullets).toHaveLength(0);
  });

  it('ふつうCPUは、れんしゅうより早く考え、同じ弾速と命中規則を使う', () => {
    const practice = createStraightBenchState(20260814, 90, 'practice');
    const normal = createStraightBenchState(20260814, 90, 'normal');

    expect(practice.difficulty).toBe('practice');
    expect(normal.difficulty).toBe('normal');
    expect(normal.cpuThinkTicks).toBe(NORMAL_CPU_REACTION_TICKS);
    expect(normal.cpuThinkTicks).toBeLessThan(practice.cpuThinkTicks);
    expect(stepStraightBench(normal, NORMAL_CPU_REACTION_TICKS).bullets[0]?.owner).toBe('cpu');
  });

  it('試し撃ちの再戦も30秒を保つ', () => {
    const initial = createStraightBenchState(20260814, 30);
    const result = { ...initial, match: { ...initial.match, phase: 'RESULT' as const } };
    const rematch = createStraightBenchRematch(result);

    expect(rematch.durationSeconds).toBe(30);
    expect(rematch.match.ticksRemaining).toBe(30 * 120);
    expect(rematch.match.seed).toBe(20260815);
  });

  it('ふつうCPUの再戦でも難易度を保持する', () => {
    const initial = createStraightBenchState(20260814, 90, 'normal');
    const result = { ...initial, match: { ...initial.match, phase: 'RESULT' as const } };

    expect(createStraightBenchRematch(result).difficulty).toBe('normal');
  });

  it('ツイン・ブロックは選択した盤面と初期パックを保持する', () => {
    const state = createStraightBenchState(20260814, 90, 'practice', 'twin-block');

    expect(state.board).toBe('twin-block');
    expect(state.pucks[0]?.position).toEqual({ x: 180, y: 320 });
  });

  it('ツイン・ブロックの障害物は弾を止める', () => {
    const fired = firePlayerShot(createStraightBenchState(20260814, 90, 'practice', 'twin-block'), {
      x: 80,
      y: 320,
    });
    const afterBlock = stepStraightBench(fired, 50);

    expect(afterBlock.bullets.filter((bullet) => bullet.owner === 'player')).toHaveLength(0);
    expect(afterBlock.pucks[0]?.velocity).toEqual({ x: 0, y: 0 });
  });

  it('ツイン・ブロックのパックは障害物の面で跳ね返る', () => {
    const initial = createStraightBenchState(20260814, 90, 'practice', 'twin-block');
    const nearBlock = {
      ...initial,
      pucks: [
        {
          ...initial.pucks[0]!,
          position: { x: 130, y: 320 },
          velocity: { x: -360, y: 0 },
        },
      ],
    };

    const bounced = stepStraightBench(nearBlock, 5);

    expect(bounced.pucks[0]?.velocity.x).toBeGreaterThan(0);
    expect(bounced.pucks[0]?.position.x).toBeGreaterThan(112);
  });

  it('リフレクト・レーンの反射板は弾を1回反射し、パックの軌道を反転する', () => {
    const state = createStraightBenchState(20260814, 90, 'practice', 'ricochet-lane');
    const fired = firePlayerShot(state, { x: 100, y: 220 });
    const reflected = stepStraightBench(fired, 50);
    expect(reflected.bullets.filter((bullet) => bullet.owner === 'player')[0]?.reflections).toBe(1);

    const nearRail = {
      ...state,
      pucks: [
        {
          ...state.pucks[0]!,
          position: { x: 100, y: 270 },
          velocity: { x: 0, y: -360 },
        },
      ],
    };
    const bounced = stepStraightBench(nearRail, 7);

    expect(bounced.pucks[0]?.velocity.x).toBeGreaterThan(0);
    expect(bounced.pucks[0]?.velocity.y).toBeGreaterThan(-360);
  });

  it('反射板の裏側から当たっても、パックは反射後に張り付かない', () => {
    const state = createStraightBenchState(20260814, 90, 'practice', 'ricochet-lane');
    const nearRail = {
      ...state,
      pucks: [
        {
          ...state.pucks[0]!,
          position: { x: 90, y: 210 },
          velocity: { x: 0, y: 360 },
        },
      ],
    };

    const bounced = stepStraightBench(nearRail, 7);

    expect(bounced.pucks[0]?.velocity.x).toBeLessThan(0);
    expect(Math.abs(bounced.pucks[0]?.velocity.y ?? 0)).toBeLessThan(30);
    expect(bounced.pucks[0]?.position.y).toBeLessThan(250);
  });

  it('残り17秒で予約リングを出し、15秒で2点コアへ置き換える', () => {
    const initial = createStraightBenchState(20260814, 90, 'practice');
    const nearCoreWindow = {
      ...initial,
      match: {
        ...initial.match,
        ticksRemaining: CORE_NOTICE_SECONDS * 120 + 1,
      },
      cpuCooldownTicks: 100_000,
      cpuThinkTicks: 100_000,
    };

    const reserved = stepStraightBench(nearCoreWindow, 1);
    expect(reserved.core.phase).toBe('RESERVED');
    expect(reserved.core.position).not.toBeNull();
    expect(reserved.pucks).toHaveLength(1);

    const active = stepStraightBench(reserved, CORE_RESERVATION_TICKS);
    expect(active.match.ticksRemaining).toBe(CORE_ACTIVE_SECONDS * 120);
    expect(active.core.phase).toBe('ACTIVE');
    expect(active.pucks.filter((puck) => puck.points === 2)).toHaveLength(1);
  });

  it('予約リングはパックだけを跳ね返し、弾は通り抜ける', () => {
    const initial = createStraightBenchState(20260814, 90, 'practice');
    const reserved = stepStraightBench(
      {
        ...initial,
        match: { ...initial.match, ticksRemaining: CORE_NOTICE_SECONDS * 120 + 1 },
        cpuCooldownTicks: 100_000,
        cpuThinkTicks: 100_000,
      },
      1,
    );
    const target = reserved.core.position ?? { x: 90, y: 320 };
    const fired = firePlayerShot(reserved, target);
    const afterRing = stepStraightBench(fired, 25);

    expect(afterRing.bullets.filter((bullet) => bullet.owner === 'player')).toHaveLength(1);
    expect(afterRing.pucks).toHaveLength(1);
  });

  it('2点コアがゴールへ入ると2点を加算する', () => {
    const initial = createStraightBenchState(20260814, 90, 'practice');
    const active = {
      ...initial,
      core: { phase: 'ACTIVE' as const, position: { x: 90, y: 320 }, candidateIndex: 0 },
      pucks: [
        {
          ...initial.pucks[0]!,
          points: 1 as const,
        },
        {
          id: 2,
          position: { x: 180, y: 30 },
          velocity: { x: 0, y: -300 },
          radius: 14,
          active: true,
          points: 2 as const,
        },
      ],
      cpuCooldownTicks: 100_000,
      cpuThinkTicks: 100_000,
    };

    const scored = stepStraightBench(active, 10);

    expect(scored.match.playerScore).toBe(2);
    expect(scored.match.lastGoalPoints).toBe(2);
    expect(scored.match.phase).toBe('GOAL_PAUSE');
    expect(scored.pucks.filter((puck) => puck.points === 2)).toHaveLength(1);

    const resumed = stepStraightBench(scored, GOAL_PAUSE_TICKS);
    expect(resumed.core.phase).toBe('ACTIVE');
    expect(resumed.pucks.filter((puck) => puck.points === 2)).toHaveLength(1);
  });

  it('同点延長へ入る時は予約リングと2点コアを除く', () => {
    const initial = createStraightBenchState(20260814, 90, 'practice');
    const notice = {
      ...initial,
      match: { ...initial.match, phase: 'OVERTIME_NOTICE' as const },
      core: { phase: 'ACTIVE' as const, position: { x: 90, y: 320 }, candidateIndex: 0 },
      pucks: [
        { ...initial.pucks[0]!, points: 1 as const },
        {
          id: 2,
          position: { x: 90, y: 320 },
          velocity: { x: 0, y: 0 },
          radius: 14,
          active: true,
          points: 2 as const,
        },
      ],
      overtimeNoticeTicks: 1,
    };

    const overtime = stepStraightBench(notice, 1);

    expect(overtime.match.phase).toBe('OVERTIME');
    expect(overtime.core.phase).toBe('INACTIVE');
    expect(overtime.pucks).toHaveLength(1);
  });

  it('延長中はゴール開口部を20%広げ、通常時間では入らない位置も得点対象にする', () => {
    const initial = createStraightBenchState(20260814, 90, 'practice');
    const overtime = {
      ...initial,
      match: {
        ...initial.match,
        phase: 'OVERTIME' as const,
        ticksRemaining: 15 * 120,
      },
      pucks: [
        {
          ...initial.pucks[0]!,
          position: { x: 130, y: 30 },
          velocity: { x: 0, y: -300 },
        },
      ],
      cpuCooldownTicks: 100_000,
      cpuThinkTicks: 100_000,
    };
    const baseOpening = getGoalOpeningBounds(initial, 'top');
    const overtimeOpening = getGoalOpeningBounds(overtime, 'top');

    expect(overtimeOpening.maxX - overtimeOpening.minX).toBeCloseTo(
      (baseOpening.maxX - baseOpening.minX) * (1 + OVERTIME_GOAL_EXPANSION_RATIO),
    );
    expect(stepStraightBench(overtime, 10).match.playerScore).toBe(1);
  });

  it('無得点11秒で予告し、12秒で両ゴールを12%広げる', () => {
    const initial = createStraightBenchState(20260814, 90, 'practice');
    const beforeNotice = {
      ...initial,
      match: { ...initial.match, ticksRemaining: 80 * 120 },
      noScore: {
        ...initial.noScore,
        ticksSinceGoal: NO_SCORE_NOTICE_SECONDS * 120 - 1,
      },
      cpuCooldownTicks: 100_000,
      cpuThinkTicks: 100_000,
    };

    const notice = stepStraightBench(beforeNotice, 1);
    expect(notice.noScore.ticksSinceGoal).toBe(NO_SCORE_NOTICE_SECONDS * 120);
    expect(notice.noScore.goalExpanded).toBe(false);

    const expanded = stepStraightBench(notice, 120);
    const baseOpening = getGoalOpeningBounds(initial, 'top');
    const expandedOpening = getGoalOpeningBounds(expanded, 'top');
    expect(expanded.noScore.ticksSinceGoal).toBe(NO_SCORE_EXPANSION_SECONDS * 120);
    expect(expanded.noScore.goalExpanded).toBe(true);
    expect(expandedOpening.maxX - expandedOpening.minX).toBeCloseTo(
      (baseOpening.maxX - baseOpening.minX) * 1.12,
    );

    const baseEdge = {
      ...initial,
      pucks: [
        {
          ...initial.pucks[0]!,
          position: { x: 130, y: 30 },
          velocity: { x: 0, y: -300 },
        },
      ],
      cpuCooldownTicks: 100_000,
      cpuThinkTicks: 100_000,
    };
    const expandedEdge = {
      ...baseEdge,
      noScore: { ...expanded.noScore },
    };
    expect(stepStraightBench(baseEdge, 10).match.playerScore).toBe(0);
    expect(stepStraightBench(expandedEdge, 10).match.playerScore).toBe(1);
  });

  it('無得点20秒で中心向きの弱い波を出し、10秒後にもう一度出す', () => {
    const initial = createStraightBenchState(20260814, 90, 'practice');
    const beforePulse = {
      ...initial,
      match: { ...initial.match, ticksRemaining: 70 * 120 },
      noScore: {
        ...initial.noScore,
        ticksSinceGoal: NO_SCORE_PULSE_SECONDS * 120 - 1,
        nextPulseTicks: 1,
      },
      pucks: [
        {
          ...initial.pucks[0]!,
          position: { x: 90, y: 320 },
          velocity: { x: 0, y: 0 },
        },
      ],
      cpuCooldownTicks: 100_000,
      cpuThinkTicks: 100_000,
    };

    const pulsed = stepStraightBench(beforePulse, 1);
    expect(pulsed.noScore.pulseTicksRemaining).toBeGreaterThan(0);
    expect(pulsed.noScore.nextPulseTicks).toBe(NO_SCORE_PULSE_INTERVAL_SECONDS * 120);
    expect(pulsed.pucks[0]?.velocity.x).toBeGreaterThan(0);

    const repeated = stepStraightBench(pulsed, NO_SCORE_PULSE_INTERVAL_SECONDS * 120);
    expect(repeated.noScore.pulseTicksRemaining).toBeGreaterThan(0);
    expect(repeated.noScore.nextPulseTicks).toBe(NO_SCORE_PULSE_INTERVAL_SECONDS * 120);
  });

  it('得点するとゴール幅、無得点時間、中央波の待ち時間を通常へ戻す', () => {
    const initial = createStraightBenchState();
    const stalled = {
      ...initial,
      noScore: {
        ...initial.noScore,
        ticksSinceGoal: 30 * 120,
        goalExpanded: true,
        nextPulseTicks: 600,
        pulseTicksRemaining: 10,
      },
      pucks: [
        {
          ...initial.pucks[0]!,
          position: { x: 180, y: 30 },
          velocity: { x: 0, y: -300 },
        },
      ],
      cpuCooldownTicks: 100_000,
      cpuThinkTicks: 100_000,
    };

    const scored = stepStraightBench(stalled, 10);
    expect(scored.match.playerScore).toBe(1);
    expect(scored.noScore.ticksSinceGoal).toBe(0);
    expect(scored.noScore.goalExpanded).toBe(false);
    expect(scored.noScore.nextPulseTicks).toBe(NO_SCORE_PULSE_SECONDS * 120);
    expect(scored.noScore.pulseTicksRemaining).toBe(0);
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
