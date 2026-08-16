export type SystemLifecycleReason = 'hidden' | 'orientation' | 'resize' | 'render-loss';

export type SystemLifecyclePhase = 'ACTIVE' | 'SUSPENDED';

export interface SystemLifecycleState {
  readonly phase: SystemLifecyclePhase;
  readonly reason: SystemLifecycleReason | null;
  readonly visible: boolean;
  readonly portrait: boolean;
  readonly renderReady: boolean;
  readonly resizeReady: boolean;
}

export type SystemLifecycleEvent =
  | { readonly kind: 'suspend'; readonly reason: SystemLifecycleReason }
  | { readonly kind: 'resume-available'; readonly reason: SystemLifecycleReason }
  | { readonly kind: 'resume-blocked'; readonly reason: SystemLifecycleReason }
  | { readonly kind: 'resume-requested'; readonly reason: SystemLifecycleReason }
  | { readonly kind: 'ignored' };

const initialState: SystemLifecycleState = {
  phase: 'ACTIVE',
  reason: null,
  visible: true,
  portrait: true,
  renderReady: true,
  resizeReady: true,
};

export class SystemLifecycleController {
  private state: SystemLifecycleState = initialState;

  public getState(): SystemLifecycleState {
    return this.state;
  }

  public isReady(): boolean {
    return (
      this.state.visible && this.state.portrait && this.state.renderReady && this.state.resizeReady
    );
  }

  public setVisibility(visible: boolean): SystemLifecycleEvent {
    this.state = { ...this.state, visible };
    return visible ? this.statusEvent() : this.suspend('hidden');
  }

  public setPortrait(portrait: boolean): SystemLifecycleEvent {
    this.state = { ...this.state, portrait };
    return portrait ? this.statusEvent() : this.suspend('orientation');
  }

  public setRenderReady(renderReady: boolean): SystemLifecycleEvent {
    this.state = { ...this.state, renderReady };
    return renderReady ? this.statusEvent() : this.suspend('render-loss');
  }

  public setResizeReady(resizeReady: boolean): SystemLifecycleEvent {
    this.state = { ...this.state, resizeReady };
    return resizeReady ? this.statusEvent() : this.suspend('resize');
  }

  public requestResume(): SystemLifecycleEvent {
    if (this.state.phase !== 'SUSPENDED' || !this.state.reason) {
      return { kind: 'ignored' };
    }
    if (!this.isReady()) {
      return { kind: 'resume-blocked', reason: this.state.reason };
    }
    const reason = this.state.reason;
    this.state = { ...this.state, phase: 'ACTIVE', reason: null };
    return { kind: 'resume-requested', reason };
  }

  private suspend(reason: SystemLifecycleReason): SystemLifecycleEvent {
    this.state = { ...this.state, phase: 'SUSPENDED', reason };
    return { kind: 'suspend', reason };
  }

  private statusEvent(): SystemLifecycleEvent {
    if (this.state.phase !== 'SUSPENDED' || !this.state.reason) {
      return { kind: 'ignored' };
    }
    return this.isReady()
      ? { kind: 'resume-available', reason: this.state.reason }
      : { kind: 'resume-blocked', reason: this.state.reason };
  }
}
