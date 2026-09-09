import { describe, expect, it } from 'vitest';
import { getBoardDefinition, type PlayableBoardId } from '../../src/config/boards';
import type { Point } from '../../src/domain/types';
import {
  GOAL_PAUSE_TICKS,
  RESUME_COUNTDOWN_TICKS,
  beginStraightBenchResume,
  createStraightBenchState,
  getStraightBenchGeometry,
  stepStraightBench,
  suspendStraightBench,
  type BulletState,
  type PuckState,
  type StraightBenchState,
} from '../../src/game/straightBench';
import { circlesOverlap } from '../../src/physics/geometry';

const BOARDS: readonly PlayableBoardId[] = ['straight-bench', 'twin-block', 'ricochet-lane'];

function quiet(board: PlayableBoardId = 'straight-bench'): StraightBenchState {
  return {
    ...createStraightBenchState(1, 90, 'normal', board),
    cpuCooldownTicks: 100_000,
    cpuThinkTicks: 100_000,
  };
}

function puck(id: number, position: Point, velocity: Point, points: 1 | 2 = 1): PuckState {
  return { id, position, velocity, radius: 14, active: true, points };
}

function bullet(id: number, position: Point, velocity: Point): BulletState {
  return {
    id,
    position,
    velocity,
    radius: 7,
    owner: 'player',
    remainingTicks: 120,
    reflections: 0,
  };
}

function withCore(
  state: StraightBenchState,
  normal: PuckState,
  core: PuckState,
  candidateIndex = 1,
): StraightBenchState {
  return {
    ...state,
    pucks: [normal, core],
    core: { phase: 'ACTIVE', position: core.position, candidateIndex },
  };
}

describe('品質監査 H04〜H09 の試合全体の回帰', () => {
  it('H04 見えるレールx24へ円周が接触し、残り時間も移動する', () => {
    const state = { ...quiet(), pucks: [puck(1, { x: 40, y: 320 }, { x: -600, y: 0 })] };
    const next = stepStraightBench(state);
    expect(next.match.phase).toBe('PLAYING');
    expect(next.pucks[0]!.position.x).toBeCloseTo(41.05, 2);
    expect(next.pucks[0]!.velocity.x).toBeCloseTo(599.25, 2);
  });

  it('H04 ゴール端の支柱を横切らず、接触した円弧に沿って反射する', () => {
    const state = { ...quiet(), pucks: [puck(1, { x: 130, y: 60 }, { x: 0, y: -600 })] };
    const next = stepStraightBench(state, 4);
    const moved = next.pucks[0]!;
    expect(next.match.phase).toBe('PLAYING');
    expect(next.match.playerScore).toBe(0);
    expect(moved.velocity.x).toBeGreaterThan(0);
    for (const post of getStraightBenchGeometry(next).posts) {
      expect(circlesOverlap({ center: moved.position, radius: moved.radius }, post)).toBe(false);
    }
  });

  it('H04 拡大開口の内縁を斜めに抜けず、側壁で反射する', () => {
    const initial = quiet();
    const state = {
      ...initial,
      noScore: { ...initial.noScore, goalExpanded: true, ticksSinceGoal: 12 * 120 },
      pucks: [puck(1, { x: 130, y: 625 }, { x: -300, y: 0 })],
    };
    const next = stepStraightBench(state);
    expect(next.match.phase).toBe('PLAYING');
    expect(next.invalidReason).toBeUndefined();
    expect(next.pucks[0]!.velocity.x).toBeGreaterThan(0);
    expect(next.pucks[0]!.position.y).toBeLessThan(630);
  });

  it('H04 ゴール拡大で動いた支柱に重なっても、時刻0で安全に離す', () => {
    const initial = quiet();
    const state = {
      ...initial,
      noScore: { ...initial.noScore, goalExpanded: true, ticksSinceGoal: 12 * 120 },
      pucks: [puck(1, { x: 80, y: 40 }, { x: 0, y: 0 })],
    };
    const next = stepStraightBench(state);
    expect(next.match.phase).toBe('PLAYING');
    expect(next.invalidReason).toBeUndefined();
    const topLeftPost = getStraightBenchGeometry(next).posts.find(
      (post) => post.center.y === 24 && post.center.x < 180,
    )!;
    expect(circlesOverlap({ center: next.pucks[0]!.position, radius: 14 }, topLeftPost)).toBe(
      false,
    );
  });

  it('H05 対向する弾とパックはtickの0.8で接触し、残り0.2を新速度で進む', () => {
    const state = {
      ...quiet(),
      pucks: [puck(1, { x: 180, y: 320 }, { x: 0, y: 600 })],
      bullets: [bullet(1, { x: 180, y: 351 }, { x: 0, y: -900 })],
      nextBulletId: 2,
    };
    const next = stepStraightBench(state);
    expect(next.match.phase).toBe('PLAYING');
    expect(next.bullets).toHaveLength(0);
    expect(next.pucks[0]!.position.y).toBeCloseTo(324.4, 2);
    expect(next.pucks[0]!.velocity.y).toBeCloseTo(239.25, 2);
  });

  it('H05 同方向へ離れていくパックに未接触の弾を命中させない', () => {
    const state = {
      ...quiet(),
      pucks: [puck(1, { x: 180, y: 320 }, { x: 0, y: -600 })],
      bullets: [bullet(1, { x: 180, y: 345 }, { x: 0, y: -900 })],
      nextBulletId: 2,
    };
    const next = stepStraightBench(state);
    expect(next.bullets).toHaveLength(1);
    expect(next.pucks[0]!.position.y).toBeCloseTo(315);
    expect(next.bullets[0]!.position.y).toBeCloseTo(337.5);
  });

  it('H05 同時命中の力はまとめてから速度制限し、弾の配列順に依存しない', () => {
    // 接触時刻0.5: パックは右へ2.5進み、左右の弾が同時に円周へ届く。
    const state = {
      ...quiet(),
      pucks: [puck(1, { x: 180, y: 320 }, { x: 600, y: 0 })],
      bullets: [
        bullet(1, { x: 157.75, y: 320 }, { x: 900, y: 0 }),
        bullet(2, { x: 207.25, y: 320 }, { x: -900, y: 0 }),
      ],
      nextBulletId: 3,
    };
    const normal = stepStraightBench(state);
    const reversed = stepStraightBench({ ...state, bullets: [...state.bullets].reverse() });
    expect(normal.bullets).toHaveLength(0);
    expect(normal.pucks[0]!.velocity.x).toBeCloseTo(599.25, 2);
    expect(reversed.pucks).toEqual(normal.pucks);
  });

  it('H06 通常パックとコアが相対速度で衝突し、互いを通り抜けない', () => {
    const state = withCore(
      quiet(),
      puck(1, { x: 160, y: 320 }, { x: 600, y: 0 }),
      puck(2, { x: 200, y: 320 }, { x: -600, y: 0 }, 2),
    );
    const next = stepStraightBench(state, 4);
    const [normal, core] = next.pucks as readonly [PuckState, PuckState];
    expect(next.match.phase).toBe('PLAYING');
    expect(normal.velocity.x).toBeLessThan(0);
    expect(core.velocity.x).toBeGreaterThan(0);
    expect(core.position.x - normal.position.x).toBeGreaterThanOrEqual(28);
    expect(normal.velocity.x + core.velocity.x).toBeCloseTo(0, 6);
    expect(Math.hypot(normal.velocity.x, normal.velocity.y)).toBeLessThanOrEqual(600);
  });

  it('H07 予約リングを通過する弾は時刻0の接触を繰り返さない', () => {
    const initial = quiet();
    const state: StraightBenchState = {
      ...initial,
      core: { phase: 'RESERVED', position: { x: 180, y: 320 }, candidateIndex: 1 },
      pucks: [puck(1, { x: 80, y: 320 }, { x: 0, y: 0 })],
      bullets: [bullet(1, { x: 180, y: 341 }, { x: 0, y: -900 })],
    };
    const next = stepStraightBench(state);
    expect(next.match.phase).toBe('PLAYING');
    expect(next.invalidReason).toBeUndefined();
    expect(next.bullets).toHaveLength(1);
    expect(next.bullets[0]!.position.y).toBeLessThan(341);
  });

  it.each(BOARDS)('H07 %s のコア出現中・予約中に得点しても安全な開始位置へ戻す', (board) => {
    for (const phase of ['ACTIVE', 'RESERVED'] as const) {
      const initial = quiet(board);
      const center = { x: 180, y: 320 };
      const normal = puck(1, { x: 180, y: 14 }, { x: 0, y: -600 });
      const state: StraightBenchState = {
        ...initial,
        core: { phase, position: center, candidateIndex: 1 },
        pucks: phase === 'ACTIVE' ? [normal, puck(2, center, { x: 0, y: 0 }, 2)] : [normal],
      };
      const scored = stepStraightBench(state);
      expect(scored.match.phase).toBe('GOAL_PAUSE');
      expect(scored.goalSnapshot?.pucks[0]!.position.y).toBeLessThanOrEqual(10);
      const resumed = stepStraightBench(scored, GOAL_PAUSE_TICKS);
      expect(resumed.match.phase).toBe('PLAYING');
      expect(resumed.goalSnapshot).toBeUndefined();
      const resetNormal = resumed.pucks.find((p) => p.points !== 2)!;
      expect(
        Math.hypot(resetNormal.position.x - center.x, resetNormal.position.y - center.y),
      ).toBeGreaterThanOrEqual(28);
      expect(resumed.core.position).toEqual(center);
      if (phase === 'ACTIVE')
        expect(resumed.pucks.find((p) => p.points === 2)!.position).toEqual(center);
    }
  });

  it.each(BOARDS)('H07 %s のコア自身が得点した場合も出生候補へ戻る', (board) => {
    const state = withCore(
      quiet(board),
      puck(1, { x: 180, y: 320 }, { x: 0, y: 0 }),
      puck(2, { x: 180, y: 14 }, { x: 0, y: -600 }, 2),
      0,
    );
    const scored = stepStraightBench(state);
    expect(scored.match.playerScore).toBe(2);
    const resumed = stepStraightBench(scored, GOAL_PAUSE_TICKS);
    expect(resumed.core.position).toEqual(getBoardDefinition(board).coreCandidates[0]);
    expect(resumed.pucks.find((p) => p.points === 2)!.position).toEqual(
      getBoardDefinition(board).coreCandidates[0],
    );
  });

  it('H08 反射板の端では面の法線を使わず、右上へ反射する', () => {
    const state = {
      ...quiet('ricochet-lane'),
      pucks: [puck(1, { x: 168, y: 180 }, { x: -600, y: 0 })],
    };
    const next = stepStraightBench(state, 2);
    expect(next.match.phase).toBe('PLAYING');
    expect(next.pucks[0]!.velocity.x).toBeGreaterThan(0);
    expect(next.pucks[0]!.velocity.y).toBeLessThan(0);
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    'H09 非有限速度 %s は得点を加える前に無効終了する',
    (bad) => {
      const initial = quiet();
      const state = { ...initial, pucks: [puck(1, { x: 180, y: 14 }, { x: bad, y: -600 })] };
      const next = stepStraightBench(state);
      expect(next.match.phase).toBe('INVALID');
      expect(next.invalidReason).toBeTruthy();
      expect(next.match.playerScore).toBe(0);
      expect(next.bullets).toHaveLength(0);
      expect(stepStraightBench(next, 500)).toBe(next);
    },
  );

  it('H09 復元できない深い重なりは正常な結果として進めない', () => {
    const state = withCore(
      quiet(),
      puck(1, { x: 180, y: 320 }, { x: 0, y: 0 }),
      puck(2, { x: 180, y: 320 }, { x: 0, y: 0 }, 2),
    );
    const next = stepStraightBench(state);
    expect(next.match.phase).toBe('INVALID');
    expect(next.match.playerScore + next.match.cpuScore).toBe(0);
  });

  it('同じtickに上下で得点した場合は両方を加算してから時間切れを決める', () => {
    const initial = quiet();
    const state = withCore(
      { ...initial, match: { ...initial.match, ticksRemaining: 1 } },
      puck(1, { x: 180, y: 14 }, { x: 0, y: -600 }),
      puck(2, { x: 180, y: 626 }, { x: 0, y: 600 }, 2),
      0,
    );
    const next = stepStraightBench(state);
    expect(next.match.playerScore).toBe(1);
    expect(next.match.cpuScore).toBe(2);
    expect(next.goalResumePhase).toBe('RESULT');
    expect(stepStraightBench(next, GOAL_PAUSE_TICKS).match.phase).toBe('RESULT');
  });

  it.each([0, 0.12, 0.2])('開口率 %s の得点面・支柱・再開カウントが同じ形状を使う', (expansion) => {
    const initial = quiet();
    const state: StraightBenchState = {
      ...initial,
      match: { ...initial.match, phase: expansion === 0.2 ? 'OVERTIME' : 'PLAYING' },
      noScore: {
        ...initial.noScore,
        goalExpanded: expansion === 0.12,
        ticksSinceGoal: expansion === 0.12 ? 12 * 120 : 0,
      },
    };
    const geometry = getStraightBenchGeometry(state);
    const top = geometry.goals.find((g) => g.side === 'top')!;
    expect(top.openingMaxX - top.openingMinX).toBeCloseTo(116 * (1 + expansion));
    expect(top.posts[0].center.x + top.posts[0].radius).toBeCloseTo(top.openingMinX);
    const suspended = suspendStraightBench(state);
    const countdown = beginStraightBenchResume(suspended);
    expect(getStraightBenchGeometry(suspended)).toEqual(geometry);
    expect(getStraightBenchGeometry(countdown)).toEqual(geometry);
    expect(getStraightBenchGeometry(stepStraightBench(countdown, RESUME_COUNTDOWN_TICKS))).toEqual(
      geometry,
    );
    const scored = stepStraightBench({
      ...state,
      pucks: [puck(1, { x: 180, y: 14 }, { x: 0, y: -600 })],
    });
    expect(scored.match.playerScore).toBe(1);
    expect(getStraightBenchGeometry(scored)).toEqual(geometry);
  });

  it.each([0.12, 0.2])('拡大率 %s の追加開口を、支柱に触れず通り得点できる', (expansion) => {
    const initial = quiet();
    const x = expansion === 0.12 ? 130 : 126;
    const pucks = [puck(1, { x, y: 60 }, { x: 0, y: -600 })];
    const expanded: StraightBenchState = {
      ...initial,
      pucks,
      match: { ...initial.match, phase: expansion === 0.2 ? 'OVERTIME' : 'PLAYING' },
      noScore: {
        ...initial.noScore,
        goalExpanded: expansion === 0.12,
        ticksSinceGoal: expansion === 0.12 ? 12 * 120 : 0,
      },
    };
    expect(stepStraightBench(expanded, 14).match.playerScore).toBe(1);
    expect(stepStraightBench({ ...initial, pucks }, 14).match.playerScore).toBe(0);
  });

  it.each(BOARDS)('%s は180度回転しても壁・端点への反射が対応する', (board) => {
    const position = board === 'ricochet-lane' ? { x: 168, y: 180 } : { x: 40, y: 200 };
    const velocity = { x: -600, y: 0 };
    const a = stepStraightBench({ ...quiet(board), pucks: [puck(1, position, velocity)] }, 3);
    const b = stepStraightBench(
      {
        ...quiet(board),
        pucks: [puck(1, { x: 360 - position.x, y: 640 - position.y }, { x: 600, y: 0 })],
      },
      3,
    );
    expect(a.match.phase).toBe('PLAYING');
    expect(b.match.phase).toBe('PLAYING');
    expect(b.pucks[0]!.position.x).toBeCloseTo(360 - a.pucks[0]!.position.x, 6);
    expect(b.pucks[0]!.position.y).toBeCloseTo(640 - a.pucks[0]!.position.y, 6);
    expect(b.pucks[0]!.velocity.x).toBeCloseTo(-a.pucks[0]!.velocity.x, 6);
    expect(b.pucks[0]!.velocity.y).toBeCloseTo(-a.pucks[0]!.velocity.y, 6);
  });
});
