import { describe, expect, it } from 'vitest';
import {
  circleOverlapsSegment,
  circlesOverlap,
  pointToAabbDistanceSquared,
  reflectVector,
  sweptCircleAgainstAabb,
  sweptCircleAgainstCircle,
  sweptCircleAgainstMovingCircle,
  sweptCircleAgainstSegment,
} from '../../src/physics/geometry';

describe('geometry', () => {
  it('高速な円が途中で別の円へ当たった時刻と法線を返す', () => {
    const hit = sweptCircleAgainstCircle({ x: 0, y: 0 }, { x: 100, y: 0 }, 5, {
      center: { x: 50, y: 0 },
      radius: 5,
    });

    expect(hit).not.toBeNull();
    expect(hit?.time).toBeCloseTo(0.4);
    expect(hit?.point).toEqual({ x: 40, y: 0 });
    expect(hit?.normal).toEqual({ x: -1, y: 0 });
    expect(hit?.feature).toBe('circle');
  });

  it('開始時に重なっている場合は有限な法線付きの時刻0を返す', () => {
    const hit = sweptCircleAgainstCircle({ x: 0, y: 0 }, { x: 100, y: 0 }, 10, {
      center: { x: 5, y: 0 },
      radius: 10,
    });

    expect(hit).toEqual({
      time: 0,
      point: { x: 0, y: 0 },
      normal: { x: -1, y: 0 },
      feature: 'circle',
    });
  });

  it('中心が一致する開始重なりには移動逆向きの決定的法線を返す', () => {
    const hit = sweptCircleAgainstCircle({ x: 5, y: 5 }, { x: 5, y: 15 }, 4, {
      center: { x: 5, y: 5 },
      radius: 4,
    });

    expect(hit?.time).toBe(0);
    expect(hit?.normal).toEqual({ x: 0, y: -1 });
    expect(Math.hypot(hit?.normal.x ?? 0, hit?.normal.y ?? 0)).toBeCloseTo(1);
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

  it('線分の内部へ高速に入る円を面の法線付きで検出する', () => {
    const hit = sweptCircleAgainstSegment({ x: 40, y: -40 }, { x: 40, y: 40 }, 5, {
      start: { x: 0, y: 0 },
      end: { x: 100, y: 0 },
    });

    expect(hit).not.toBeNull();
    expect(hit?.time).toBeCloseTo(35 / 80);
    expect(hit?.point).toEqual({ x: 40, y: -5 });
    expect(hit?.normal).toEqual({ x: 0, y: -1 });
    expect(hit?.feature).toBe('face');
  });

  it('線分端点では径方向の法線を返す', () => {
    const hit = sweptCircleAgainstSegment({ x: -10, y: -10 }, { x: 10, y: 10 }, 5, {
      start: { x: 0, y: 0 },
      end: { x: 10, y: 0 },
    });
    const coordinate = -5 / Math.SQRT2;

    expect(hit).not.toBeNull();
    expect(hit?.time).toBeCloseTo((10 + coordinate) / 20);
    expect(hit?.point.x).toBeCloseTo(coordinate);
    expect(hit?.point.y).toBeCloseTo(coordinate);
    expect(hit?.normal.x).toBeCloseTo(-1 / Math.SQRT2);
    expect(hit?.normal.y).toBeCloseTo(-1 / Math.SQRT2);
    expect(hit?.feature).toBe('endpoint');
  });

  it('長方形の面を検出し面の単位法線を返す', () => {
    const hit = sweptCircleAgainstAabb({ x: -20, y: 5 }, { x: 20, y: 5 }, 5, {
      minX: 0,
      minY: 0,
      maxX: 10,
      maxY: 10,
    });

    expect(hit).not.toBeNull();
    expect(hit?.time).toBeCloseTo(15 / 40);
    expect(hit?.point).toEqual({ x: -5, y: 5 });
    expect(hit?.normal).toEqual({ x: -1, y: 0 });
    expect(hit?.feature).toBe('face');
  });

  it('長方形の角を厳密な丸め角TOIと径方向法線で検出する', () => {
    const hit = sweptCircleAgainstAabb({ x: -20, y: -20 }, { x: 20, y: 20 }, 5, {
      minX: 0,
      minY: 0,
      maxX: 10,
      maxY: 10,
    });
    const coordinate = -5 / Math.SQRT2;

    expect(hit).not.toBeNull();
    expect(hit?.point.x).toBeCloseTo(coordinate);
    expect(hit?.point.y).toBeCloseTo(coordinate);
    expect(hit?.normal.x).toBeCloseTo(-1 / Math.SQRT2);
    expect(hit?.normal.y).toBeCloseTo(-1 / Math.SQRT2);
    expect(hit?.feature).toBe('corner');
  });

  it('移動円同士の相対運動で対向する衝突時刻とワールド位置を返す', () => {
    const hit = sweptCircleAgainstMovingCircle(
      { x: 180, y: 320 },
      { x: 180, y: 325 },
      14,
      { x: 180, y: 351 },
      { x: 180, y: 343.5 },
      7,
    );

    expect(hit).not.toBeNull();
    expect(hit?.time).toBeCloseTo(0.8);
    expect(hit?.point).toEqual({ x: 180, y: 324 });
    expect(hit?.normal).toEqual({ x: 0, y: -1 });
    expect(hit?.feature).toBe('circle');
  });

  it('同方向に追跡する円が1tick内で届かない場合はミスを返す', () => {
    const hit = sweptCircleAgainstMovingCircle(
      { x: 180, y: 320 },
      { x: 180, y: 325 },
      14,
      { x: 180, y: 345 },
      { x: 180, y: 352.5 },
      7,
    );

    expect(hit).toBeNull();
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
