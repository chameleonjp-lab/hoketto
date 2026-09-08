import { describe, expect, it } from 'vitest';
import type { Aabb, Circle, Point, Segment } from '../../src/domain/types';
import {
  clampVectorMagnitude,
  pointToAabbDistanceSquared,
  pointToSegmentDistanceSquared,
  sweptCircleAgainstAabb,
  sweptCircleAgainstCircle,
  sweptCircleAgainstMovingCircle,
  sweptCircleAgainstSegment,
  type SweepHit,
} from '../../src/physics/geometry';

function createRandom(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 0x1_0000_0000;
  };
}

function randomPoint(random: () => number, min: number, max: number): Point {
  return { x: min + (max - min) * random(), y: min + (max - min) * random() };
}

function randomCircle(random: () => number): Circle {
  return { center: randomPoint(random, -40, 400), radius: 1 + random() * 14 };
}

function randomSegment(random: () => number): Segment {
  return { start: randomPoint(random, -40, 400), end: randomPoint(random, -40, 400) };
}

function randomAabb(random: () => number): Aabb {
  const first = randomPoint(random, -20, 380);
  const width = 5 + random() * 80;
  const height = 5 + random() * 80;
  return { minX: first.x, minY: first.y, maxX: first.x + width, maxY: first.y + height };
}

function assertUnitNormal(normal: Point): void {
  expect(Number.isFinite(normal.x)).toBe(true);
  expect(Number.isFinite(normal.y)).toBe(true);
  expect(Math.hypot(normal.x, normal.y)).toBeCloseTo(1, 10);
}

function assertHitIsSafe(
  hit: SweepHit | null,
  start: Point,
  end: Point,
  distanceToShapeSquared: (point: Point) => number,
  radius: number,
): void {
  expect(hit === null || Number.isFinite(hit.time)).toBe(true);
  if (!hit) return;
  expect(hit.time).toBeGreaterThanOrEqual(0);
  expect(hit.time).toBeLessThanOrEqual(1);
  expect(hit.point.x).toBeCloseTo(start.x + (end.x - start.x) * hit.time, 8);
  expect(hit.point.y).toBeCloseTo(start.y + (end.y - start.y) * hit.time, 8);
  expect(distanceToShapeSquared(hit.point)).toBeLessThanOrEqual(radius * radius + 1e-7);
  assertUnitNormal(hit.normal);
  expect(['circle', 'face', 'endpoint', 'corner']).toContain(hit.feature);
}

describe('collision randomized properties', () => {
  it('10,000件の衝突条件で有限値・時刻範囲・速度上限を保つ', () => {
    const random = createRandom(0x0ce770);

    for (let index = 0; index < 10_000; index += 1) {
      const start = randomPoint(random, -40, 400);
      const end = randomPoint(random, -40, 400);
      const radius = 1 + random() * 14;
      const vector = clampVectorMagnitude({ x: end.x - start.x, y: end.y - start.y }, 600);
      expect(Number.isFinite(vector.x)).toBe(true);
      expect(Number.isFinite(vector.y)).toBe(true);
      expect(Math.hypot(vector.x, vector.y)).toBeLessThanOrEqual(600 + 1e-9);

      if (index % 3 === 0) {
        const target = randomCircle(random);
        const hit = sweptCircleAgainstCircle(start, end, radius, target);
        assertHitIsSafe(
          hit,
          start,
          end,
          (point) => {
            const dx = point.x - target.center.x;
            const dy = point.y - target.center.y;
            return Math.max(0, Math.hypot(dx, dy) - target.radius) ** 2;
          },
          radius,
        );
      } else if (index % 3 === 1) {
        const target = randomSegment(random);
        const hit = sweptCircleAgainstSegment(start, end, radius, target);
        assertHitIsSafe(
          hit,
          start,
          end,
          (point) => pointToSegmentDistanceSquared(point, target),
          radius,
        );
      } else {
        const target = randomAabb(random);
        const hit = sweptCircleAgainstAabb(start, end, radius, target);
        assertHitIsSafe(
          hit,
          start,
          end,
          (point) => pointToAabbDistanceSquared(point, target),
          radius,
        );
      }
    }
  });

  it('解析解に一致する生成済みの必ずヒット・必ずミスするケースを保つ', () => {
    const random = createRandom(0x51de);

    for (let index = 0; index < 512; index += 1) {
      const radius = 2 + random() * 12;
      const targetRadius = 1 + random() * 8;
      const startX = -120 - random() * 80;
      const targetX = 40 + random() * 80;
      const combinedRadius = radius + targetRadius;
      const travel = targetX - startX;
      const hitEndX = targetX + combinedRadius + 20;
      const hit = sweptCircleAgainstCircle({ x: startX, y: 0 }, { x: hitEndX, y: 0 }, radius, {
        center: { x: targetX, y: 0 },
        radius: targetRadius,
      });
      const expectedHitTime = (travel - combinedRadius) / (hitEndX - startX);
      expect(hit).not.toBeNull();
      expect(hit?.time).toBeCloseTo(expectedHitTime, 10);
      expect(hit?.normal).toEqual({ x: -1, y: 0 });

      const miss = sweptCircleAgainstCircle(
        { x: startX, y: 3 * combinedRadius },
        { x: hitEndX, y: 3 * combinedRadius },
        radius,
        { center: { x: targetX, y: 0 }, radius: targetRadius },
      );
      expect(miss).toBeNull();
    }
  });

  it('移動円同士の生成ケースで対向は当たり追跡は届かない', () => {
    const random = createRandom(0xadd0);

    for (let index = 0; index < 256; index += 1) {
      const gap = 24 + random() * 24;
      const radius = 8 + random() * 6;
      const targetRadius = 5 + random() * 4;
      const relativeTravel = gap - (radius + targetRadius) + 1;
      const first = { x: 100 + random() * 50, y: 200 + random() * 50 };
      const second = { x: first.x, y: first.y + gap };
      const movingEnd = { x: first.x, y: first.y + relativeTravel / 2 };
      const targetEnd = { x: second.x, y: second.y - relativeTravel / 2 };
      const hit = sweptCircleAgainstMovingCircle(
        first,
        movingEnd,
        radius,
        second,
        targetEnd,
        targetRadius,
      );
      expect(hit).not.toBeNull();
      expect(hit?.time).toBeCloseTo((gap - (radius + targetRadius)) / relativeTravel, 10);

      const targetTrackingEnd = { x: second.x, y: second.y + relativeTravel / 2 - 1 };
      const miss = sweptCircleAgainstMovingCircle(
        first,
        movingEnd,
        radius,
        second,
        targetTrackingEnd,
        targetRadius,
      );
      expect(miss).toBeNull();
    }
  });
});
