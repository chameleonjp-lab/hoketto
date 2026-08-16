import { describe, expect, it } from 'vitest';
import { SystemLifecycleController } from '../../src/game/systemLifecycle';

describe('system lifecycle controller', () => {
  it('画面非表示を中断し、表示へ戻っても明示再開までACTIVEへ戻さない', () => {
    const controller = new SystemLifecycleController();

    expect(controller.setVisibility(false)).toEqual({ kind: 'suspend', reason: 'hidden' });
    expect(controller.getState().phase).toBe('SUSPENDED');
    expect(controller.setVisibility(true)).toEqual({
      kind: 'resume-available',
      reason: 'hidden',
    });
    expect(controller.getState().phase).toBe('SUSPENDED');
    expect(controller.requestResume()).toEqual({
      kind: 'resume-requested',
      reason: 'hidden',
    });
    expect(controller.getState().phase).toBe('ACTIVE');
  });

  it('向き、表示領域、描画のどれかが未復元なら再開操作を拒否する', () => {
    const controller = new SystemLifecycleController();

    controller.setPortrait(false);
    controller.setResizeReady(false);
    controller.setRenderReady(false);
    expect(controller.requestResume()).toEqual({
      kind: 'resume-blocked',
      reason: 'render-loss',
    });

    controller.setPortrait(true);
    controller.setResizeReady(true);
    expect(controller.requestResume()).toEqual({
      kind: 'resume-blocked',
      reason: 'render-loss',
    });

    controller.setRenderReady(true);
    expect(controller.requestResume()).toEqual({
      kind: 'resume-requested',
      reason: 'render-loss',
    });
  });

  it('再開カウント中の再中断では、最新のシステム理由を保持する', () => {
    const controller = new SystemLifecycleController();

    controller.setVisibility(false);
    controller.setVisibility(true);
    expect(controller.requestResume().kind).toBe('resume-requested');
    expect(controller.setResizeReady(false)).toEqual({ kind: 'suspend', reason: 'resize' });
    expect(controller.setResizeReady(true)).toEqual({
      kind: 'resume-available',
      reason: 'resize',
    });
  });
});
