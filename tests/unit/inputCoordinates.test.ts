import { describe, expect, it } from 'vitest';
import { getNativeClientPoint, mapClientPointToLogical } from '../../src/game/inputCoordinates';

describe('input coordinate mapping', () => {
  const rect = { left: 40, top: 80, width: 180, height: 320 };

  it('CSS縮尺されたCanvasの中心を論理盤面の中心へ戻す', () => {
    expect(mapClientPointToLogical({ clientX: 130, clientY: 240 }, rect, 360, 640)).toEqual({
      x: 180,
      y: 320,
    });
  });

  it('Canvasの外側も丸めず、論理座標として保持する', () => {
    expect(mapClientPointToLogical({ clientX: 40, clientY: 80 }, rect, 360, 640)).toEqual({
      x: 0,
      y: 0,
    });
    expect(mapClientPointToLogical({ clientX: 220, clientY: 400 }, rect, 360, 640)).toEqual({
      x: 360,
      y: 640,
    });
  });

  it('不正な矩形や論理サイズではフォールバックを要求する', () => {
    expect(
      mapClientPointToLogical({ clientX: 130, clientY: 240 }, { ...rect, width: 0 }, 360, 640),
    ).toBeNull();
    expect(mapClientPointToLogical({ clientX: 130, clientY: 240 }, rect, 0, 640)).toBeNull();
  });

  it('マウスとタッチのネイティブ座標を同じ契約へ変換する', () => {
    expect(getNativeClientPoint({ clientX: 12, clientY: 34 })).toEqual({
      clientX: 12,
      clientY: 34,
    });
    expect(getNativeClientPoint({ changedTouches: [{ clientX: 56, clientY: 78 }] })).toEqual({
      clientX: 56,
      clientY: 78,
    });
    expect(getNativeClientPoint({ touches: [] })).toBeNull();
  });
});
