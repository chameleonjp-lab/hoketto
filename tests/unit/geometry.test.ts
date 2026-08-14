import { describe, expect, it } from 'vitest';
import {
  circleOverlapsSegment,
  circlesOverlap,
  pointToAabbDistanceSquared,
  reflectVector,
  sweptCircleAgainstAabb,
  sweptCircleAgainstCircle,
  sweptCircleAgainstSegment,
} from '../../src/physics/geometry';

describe('geometry', () => {
  it('高速な円が途中で別の円へ当たった時刻を返す', () => {
    const hit = sweptCircleAgainstCircle({ x: 0, y: 0 }, { x: 100, y: 0 }, 5, {
      center: { x: 50, y: 0 },
      radius: 5,
    });

    expect(hit).not.toBeNull();
    expect(hit?.time).toBeCloseTo(0.4);
    expect(hit?.point.x).toBeCloseTo(40);
  });

  it('開始時に重なっている場合は時刻0を返す', () => {
    const hit = sweptCircleAgainstCircle({ x: 0, y: 0 }, { x: 100, y: 0 }, 10, {
      center: { x: 5, y: 0 },
      radius: 10,
    });

    expect(hit).toEqual({ time: 0, point: { x: 0, y: 0 } });
  });

  it('進行方向と反射面の法線から反射ベクトルを求める', () => {
    expect(reflectVector({ x: 3, y: -4 }, { x: 0, y: 1 })).toEqual({ x: 3, y: 4 });
  });

  it('接触していない円は重なりと判定しない', () => {
    expect(
      circlesOverlap(
        { center: { x: 0, y: 0 }, radius: 10 },
        { center: { x: 25, y: 0 }, radius: 10 },
      ),
    ).toBe(false);
  });

  it('線分の内部へ高速に入る円を検出する', () => {
    const hit = sweptCircleAgainstSegment({ x: 40, y: -40 }, { x: 40, y: 40 }, 5, {
      start: { x: 0, y: 0 },
      end: { x: 100, y: 0 },
    });

    expect(hit).not.toBeNull();
    expect(hit?.time).toBeCloseTo(35 / 80);
    expect(hit?.point).toEqual({ x: 40, y: -5 });
  });

  it('長方形の角を丸い当たり範囲として検出する', () => {
    const hit = sweptCircleAgainstAabb({ x: -20, y: -20 }, { x: 20, y: 20 }, 5, {
      minX: 0,
      minY: 0,
      maxX: 10,
      maxY: 10,
    });

    expect(hit).not.toBeNull();
    expect(hit?.point.x).toBeCloseTo(-5 / Math.SQRT2);
    expect(hit?.point.y).toBeCloseTo(-5 / Math.SQRT2);
  });

  it('長方形との距離を求める', () => {
    expect(
      pointToAabbDistanceSquared({ x: -3, y: 4 }, { minX: 0, minY: 0, maxX: 10, maxY: 10 }),
    ).toBe(9);
  });

  it('線分上の円は重なりと判定する', () => {
    expect(
      circleOverlapsSegment(
        { center: { x: 20, y: 2 }, radius: 3 },
        { start: { x: 0, y: 0 }, end: { x: 40, y: 0 } },
      ),
    ).toBe(true);
  });
});
