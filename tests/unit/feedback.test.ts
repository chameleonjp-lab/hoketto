import { describe, expect, it } from 'vitest';
import {
  createStraightBenchState,
  firePlayerShot,
  stepStraightBench,
  type BulletState,
  type PuckState,
} from '../../src/game/straightBench';
import { detectFeedbackEvents } from '../../src/game/feedback';

function quietState(board: 'straight-bench' | 'ricochet-lane' = 'straight-bench') {
  const state = createStraightBenchState(20260911, 90, 'practice', board);
  return { ...state, cpuCooldownTicks: 100_000, cpuThinkTicks: 100_000 };
}

function bullet(
  position: { x: number; y: number },
  velocity: { x: number; y: number },
): BulletState {
  return {
    id: 1,
    owner: 'player',
    position,
    velocity,
    radius: 7,
    remainingTicks: 120,
    reflections: 0,
  };
}

function puck(position: { x: number; y: number }, velocity: { x: number; y: number }): PuckState {
  return { id: 1, position, velocity, radius: 14, active: true, points: 1 };
}

describe('presentation feedback events', () => {
  it('発射された弾を検出する', () => {
    const previous = quietState();
    const fired = firePlayerShot(previous, { x: 180, y: 320 });

    expect(detectFeedbackEvents(previous, fired)).toContainEqual({
      kind: 'shot',
      owner: 'player',
      position: fired.bullets[0]!.position,
    });
  });

  it('弾がパックへ命中した出来事を検出する', () => {
    const previous = {
      ...quietState(),
      pucks: [puck({ x: 180, y: 320 }, { x: 0, y: 600 })],
      bullets: [bullet({ x: 180, y: 351 }, { x: 0, y: -900 })],
      nextBulletId: 2,
    };
    const next = stepStraightBench(previous);

    expect(detectFeedbackEvents(previous, next)).toContainEqual({
      kind: 'puck-hit',
      owner: 'player',
      puckId: 1,
      position: next.pucks[0]!.position,
    });
  });

  it('パックの壁反射と反射板での弾反射を検出する', () => {
    const wallPrevious = {
      ...quietState(),
      pucks: [puck({ x: 40, y: 320 }, { x: -600, y: 0 })],
    };
    const wallNext = stepStraightBench(wallPrevious);
    expect(detectFeedbackEvents(wallPrevious, wallNext)).toContainEqual(
      expect.objectContaining({ kind: 'surface', subject: 'puck' }),
    );

    let previous = firePlayerShot(quietState('ricochet-lane'), { x: 100, y: 220 });
    let reflected = false;
    for (let index = 0; index < 50; index += 1) {
      const next = stepStraightBench(previous);
      reflected ||= detectFeedbackEvents(previous, next).some(
        (event) => event.kind === 'surface' && event.subject === 'bullet',
      );
      previous = next;
    }
    expect(reflected).toBe(true);
  });

  it('得点と充電完了を検出する', () => {
    const scoringPrevious = {
      ...quietState(),
      pucks: [puck({ x: 180, y: 14 }, { x: 0, y: -600 })],
    };
    const scoringNext = stepStraightBench(scoringPrevious);
    expect(detectFeedbackEvents(scoringPrevious, scoringNext)).toContainEqual(
      expect.objectContaining({ kind: 'goal', team: 'player', points: 1 }),
    );

    const chargingPrevious = {
      ...quietState(),
      cooldownTicks: 1,
    };
    const chargingNext = stepStraightBench(chargingPrevious);
    expect(detectFeedbackEvents(chargingPrevious, chargingNext)).toContainEqual(
      expect.objectContaining({ kind: 'ready', position: { x: 180, y: 580 } }),
    );
  });
});
