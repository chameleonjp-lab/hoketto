import { describe, expect, it } from 'vitest';
import { KeyboardInputController } from '../../src/game/keyboardInput';

const rules = {
  board: { left: 24, top: 24, right: 336, bottom: 616 },
  viewport: { width: 360, height: 640 },
  exclusionPixels: 24,
  forward: { origin: { x: 180, y: 580 }, minimumDistance: 32, axis: 'up' as const },
};

function focusAndActivate(controller: KeyboardInputController): void {
  controller.setFocused(true);
  controller.setActive(true);
}

describe('keyboard input controller', () => {
  it('矢印キーで8論理ピクセル、Shift付きで1論理ピクセル動かす', () => {
    const controller = new KeyboardInputController(rules);
    focusAndActivate(controller);
    const start = controller.getState().point;

    expect(controller.keyDown({ key: 'ArrowLeft', shiftKey: false, repeat: false })).toEqual({
      kind: 'aim-update',
      point: { x: start.x - 8, y: start.y },
      key: 'ArrowLeft',
    });
    expect(controller.keyDown({ key: 'ArrowUp', shiftKey: true, repeat: false })).toEqual({
      kind: 'aim-update',
      point: { x: start.x - 8, y: start.y - 1 },
      key: 'ArrowUp',
    });
  });

  it('照準印を有効範囲の端で止め、砲台より後ろへ移動させない', () => {
    const controller = new KeyboardInputController(rules);
    focusAndActivate(controller);

    for (let index = 0; index < 100; index += 1) {
      controller.keyDown({ key: 'ArrowLeft', shiftKey: false, repeat: true });
      controller.keyDown({ key: 'ArrowUp', shiftKey: false, repeat: true });
    }
    expect(controller.getState().point).toEqual({ x: 24, y: 24 });

    for (let index = 0; index < 100; index += 1) {
      controller.keyDown({ key: 'ArrowRight', shiftKey: false, repeat: true });
      controller.keyDown({ key: 'ArrowDown', shiftKey: false, repeat: true });
    }
    expect(controller.getState().point).toEqual({ x: 336, y: 548 });
  });

  it('EnterとSpaceは1回の新しい押下につき最大1発で、充電中は予約しない', () => {
    const controller = new KeyboardInputController(rules);
    focusAndActivate(controller);

    expect(controller.keyDown({ key: 'Enter', shiftKey: false, repeat: false }).kind).toBe('fire');
    expect(controller.keyDown({ key: 'Enter', shiftKey: false, repeat: true }).kind).toBe(
      'ignored',
    );
    expect(controller.keyDown({ key: ' ', shiftKey: false, repeat: false }).kind).toBe(
      'charging-notice',
    );
    expect(controller.getState().phase).toBe('CHARGING');
  });

  it('Escapeで停止を要求し、無効化中のキー操作を発射へ変えない', () => {
    const controller = new KeyboardInputController(rules);
    focusAndActivate(controller);

    expect(controller.keyDown({ key: 'Escape', shiftKey: false, repeat: false })).toEqual({
      kind: 'pause-request',
    });
    controller.setPaused(true);
    expect(controller.keyDown({ key: 'Enter', shiftKey: false, repeat: false })).toEqual({
      kind: 'resume-request',
    });
    controller.setPaused(false);
    controller.setActive(false);
    expect(controller.keyDown({ key: 'Enter', shiftKey: false, repeat: false }).kind).toBe(
      'ignored',
    );
  });

  it('盤面のフォーカスがなければTabを奪わず、キー操作も発生させない', () => {
    const controller = new KeyboardInputController(rules);

    expect(controller.keyDown({ key: 'ArrowRight', shiftKey: false, repeat: false })).toEqual({
      kind: 'ignored',
    });
    expect(controller.keyDown({ key: 'Tab', shiftKey: false, repeat: false })).toEqual({
      kind: 'ignored',
    });
  });
});
