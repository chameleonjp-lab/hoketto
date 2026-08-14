import { describe, expect, it } from 'vitest';
import {
  circlesOverlap,
  reflectVector,
  sweptCircleAgainstCircle,
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
});
