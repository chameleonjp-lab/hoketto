import { describe, expect, it } from 'vitest';
import { PointerInputController } from '../../src/game/pointerInput';

const rules = {
  board: { left: 24, top: 24, right: 336, bottom: 616 },
  viewport: { width: 360, height: 640 },
  exclusionPixels: 24,
};

describe('pointer input controller', () => {
  it('有効領域で置いて離した操作だけを発射にする', () => {
    const controller = new PointerInputController(rules);

    expect(controller.pointerDown(1, { x: 180, y: 500 }).kind).toBe('aim-start');
    expect(controller.pointerMove(1, { x: 210, y: 400 }).kind).toBe('aim-update');
    expect(controller.pointerUp(1, { x: 210, y: 400 })).toEqual({
      kind: 'fire',
      pointerId: 1,
      point: { x: 210, y: 400 },
    });
    expect(controller.getState().phase).toBe('CHARGING');
  });

  it('画面端帯へ出た操作は取り消し、後から発射しない', () => {
    const controller = new PointerInputController(rules);

    controller.pointerDown(1, { x: 180, y: 500 });
    expect(controller.pointerMove(1, { x: 10, y: 400 })).toEqual({
      kind: 'cancel',
      pointerId: 1,
      reason: 'outside-input-area',
    });
    expect(controller.pointerUp(1, { x: 180, y: 400 }).kind).toBe('ignored');
  });

  it('充電中の新しい指は予約せず、2本目の指も無視する', () => {
    const controller = new PointerInputController(rules);

    controller.pointerDown(1, { x: 180, y: 500 });
    expect(controller.pointerDown(2, { x: 200, y: 400 }).kind).toBe('ignored');
    controller.pointerUp(1, { x: 180, y: 400 });
    expect(controller.pointerDown(2, { x: 200, y: 400 }).kind).toBe('charging-notice');
  });

  it('pointercancelとlostpointercaptureはどちらも後発射を止める', () => {
    const controller = new PointerInputController(rules);

    controller.pointerDown(7, { x: 180, y: 500 });
    expect(controller.pointerCancel(7)).toEqual({
      kind: 'cancel',
      pointerId: 7,
      reason: 'pointercancel',
    });
    expect(controller.pointerUp(7, { x: 180, y: 400 }).kind).toBe('ignored');

    controller.pointerDown(8, { x: 180, y: 500 });
    expect(controller.lostPointerCapture(8)).toEqual({
      kind: 'cancel',
      pointerId: 8,
      reason: 'lostpointercapture',
    });
    expect(controller.pointerUp(8, { x: 180, y: 400 }).kind).toBe('ignored');
  });

  it('得点や中断などの状態変更中は狙いを破棄する', () => {
    const controller = new PointerInputController(rules);

    controller.pointerDown(3, { x: 180, y: 500 });
    expect(controller.stateChanged('goal')).toEqual({
      kind: 'cancel',
      pointerId: 3,
      reason: 'goal',
    });
    expect(controller.pointerUp(3, { x: 180, y: 400 }).kind).toBe('ignored');
  });
});
