import { getBoardDefinition } from '../config/boards';
import type { Point, Team } from '../domain/types';
import {
  STRAIGHT_BENCH_SNAPSHOT,
  getStraightBenchGeometry,
  type StraightBenchState,
} from './straightBench';

/**
 * 物理状態の差から、画面と音が反応する出来事だけを取り出す。
 * 勝敗を決める状態は変更せず、表示のための情報として扱う。
 */
export type FeedbackEvent =
  | { readonly kind: 'shot'; readonly owner: Team; readonly position: Point }
  | {
      readonly kind: 'puck-hit';
      readonly owner: Team;
      readonly puckId: number;
      readonly position: Point;
    }
  | {
      readonly kind: 'surface';
      readonly subject: 'bullet' | 'puck';
      readonly owner?: Team;
      readonly position: Point;
    }
  | {
      readonly kind: 'goal';
      readonly team: Team;
      readonly points: 1 | 2;
      readonly position: Point;
    }
  | { readonly kind: 'ready'; readonly position: Point };

interface ClosestPoint {
  readonly distanceSquared: number;
  readonly point: Point;
}

function closestPointOnSegment(point: Point, start: Point, end: Point): ClosestPoint {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared <= Number.EPSILON) {
    return {
      distanceSquared: (point.x - start.x) ** 2 + (point.y - start.y) ** 2,
      point: start,
    };
  }
  const ratio = Math.max(
    0,
    Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared),
  );
  const closest = { x: start.x + dx * ratio, y: start.y + dy * ratio };
  return {
    distanceSquared: (point.x - closest.x) ** 2 + (point.y - closest.y) ** 2,
    point: closest,
  };
}

function closestPointOnBox(
  point: Point,
  box: {
    readonly minX: number;
    readonly minY: number;
    readonly maxX: number;
    readonly maxY: number;
  },
): ClosestPoint {
  const closest = {
    x: Math.max(box.minX, Math.min(box.maxX, point.x)),
    y: Math.max(box.minY, Math.min(box.maxY, point.y)),
  };
  return {
    distanceSquared: (point.x - closest.x) ** 2 + (point.y - closest.y) ** 2,
    point: closest,
  };
}

function nearestReflectiveSurface(state: StraightBenchState, point: Point): ClosestPoint | null {
  const board = getBoardDefinition(state.board);
  const geometry = getStraightBenchGeometry(state);
  const candidates: ClosestPoint[] = [];
  for (const segment of [...geometry.walls, ...geometry.mouthSides, ...board.staticSegments]) {
    candidates.push(closestPointOnSegment(point, segment.start, segment.end));
  }
  for (const post of geometry.posts) {
    const dx = point.x - post.center.x;
    const dy = point.y - post.center.y;
    const distance = Math.hypot(dx, dy);
    const scale = distance > Number.EPSILON ? post.radius / distance : 0;
    const closest = {
      x: post.center.x + dx * scale,
      y: post.center.y + dy * scale,
    };
    candidates.push({
      distanceSquared: Math.max(0, distance - post.radius) ** 2,
      point: closest,
    });
  }
  for (const box of board.staticBoxes) candidates.push(closestPointOnBox(point, box));
  return candidates.reduce<ClosestPoint | null>(
    (nearest, candidate) =>
      nearest === null || candidate.distanceSquared < nearest.distanceSquared ? candidate : nearest,
    null,
  );
}

function isNearReflectiveSurface(
  state: StraightBenchState,
  point: Point,
  radius: number,
): ClosestPoint | null {
  const nearest = nearestReflectiveSurface(state, point);
  if (!nearest) return null;
  return nearest.distanceSquared <= (radius + 10) ** 2 ? nearest : null;
}

function velocityDelta(
  before: { readonly x: number; readonly y: number },
  after: { readonly x: number; readonly y: number },
): number {
  return Math.hypot(after.x - before.x, after.y - before.y);
}

function goalPosition(state: StraightBenchState, team: Team): Point {
  const goal = getStraightBenchGeometry(state).goals.find(
    (candidate) => candidate.scoreFor === team,
  );
  if (!goal) return { x: STRAIGHT_BENCH_SNAPSHOT.playerTurret.x, y: 320 };
  return { x: (goal.openingMinX + goal.openingMaxX) / 2, y: goal.scorePlane };
}

/** 前後の固定更新から、演出に使える出来事を順序を保って返す。 */
export function detectFeedbackEvents(
  previous: StraightBenchState,
  next: StraightBenchState,
): readonly FeedbackEvent[] {
  const events: FeedbackEvent[] = [];
  const previousBullets = new Map(previous.bullets.map((bullet) => [bullet.id, bullet]));
  const nextBullets = new Map(next.bullets.map((bullet) => [bullet.id, bullet]));
  const nextPucks = new Map(next.pucks.map((puck) => [puck.id, puck]));
  const hitPuckIds = new Set<number>();

  for (const bullet of next.bullets) {
    if (!previousBullets.has(bullet.id)) {
      events.push({ kind: 'shot', owner: bullet.owner, position: bullet.position });
    }
  }

  for (const previousBullet of previous.bullets) {
    const nextBullet = nextBullets.get(previousBullet.id);
    if (nextBullet) {
      if (nextBullet.reflections > previousBullet.reflections) {
        events.push({
          kind: 'surface',
          subject: 'bullet',
          owner: previousBullet.owner,
          position: nextBullet.position,
        });
      }
      continue;
    }
    // 寿命切れは壁への接触と区別し、画面を不必要に点滅させない。
    if (previousBullet.remainingTicks <= 1) continue;

    let bestHit: {
      readonly puckId: number;
      readonly position: Point;
      readonly delta: number;
    } | null = null;
    for (const previousPuck of previous.pucks) {
      if (!previousPuck.active) continue;
      const nextPuck = nextPucks.get(previousPuck.id);
      if (!nextPuck || !nextPuck.active) continue;
      const distance = Math.hypot(
        previousBullet.position.x - previousPuck.position.x,
        previousBullet.position.y - previousPuck.position.y,
      );
      if (distance > 48) continue;
      const delta = velocityDelta(previousPuck.velocity, nextPuck.velocity);
      if (delta < 40 || (bestHit !== null && bestHit.delta >= delta)) continue;
      bestHit = { puckId: previousPuck.id, position: nextPuck.position, delta };
    }
    if (bestHit) {
      hitPuckIds.add(bestHit.puckId);
      events.push({
        kind: 'puck-hit',
        owner: previousBullet.owner,
        puckId: bestHit.puckId,
        position: bestHit.position,
      });
      continue;
    }
    const surface = isNearReflectiveSurface(
      previous,
      previousBullet.position,
      previousBullet.radius,
    );
    if (surface) {
      events.push({
        kind: 'surface',
        subject: 'bullet',
        owner: previousBullet.owner,
        position: surface.point,
      });
    }
  }

  for (const previousPuck of previous.pucks) {
    if (!previousPuck.active || hitPuckIds.has(previousPuck.id)) continue;
    const nextPuck = nextPucks.get(previousPuck.id);
    if (!nextPuck || !nextPuck.active) continue;
    if (velocityDelta(previousPuck.velocity, nextPuck.velocity) < 70) continue;
    const surface = isNearReflectiveSurface(next, nextPuck.position, nextPuck.radius);
    if (surface) events.push({ kind: 'surface', subject: 'puck', position: surface.point });
  }

  const playerScoreDelta = next.match.playerScore - previous.match.playerScore;
  const cpuScoreDelta = next.match.cpuScore - previous.match.cpuScore;
  if (playerScoreDelta > 0) {
    events.push({
      kind: 'goal',
      team: 'player',
      points: playerScoreDelta >= 2 ? 2 : 1,
      position: goalPosition(next, 'player'),
    });
  }
  if (cpuScoreDelta > 0) {
    events.push({
      kind: 'goal',
      team: 'cpu',
      points: cpuScoreDelta >= 2 ? 2 : 1,
      position: goalPosition(next, 'cpu'),
    });
  }

  if (
    previous.cooldownTicks > 0 &&
    next.cooldownTicks === 0 &&
    (next.match.phase === 'PLAYING' || next.match.phase === 'OVERTIME')
  ) {
    events.push({ kind: 'ready', position: STRAIGHT_BENCH_SNAPSHOT.playerTurret });
  }

  return events;
}
