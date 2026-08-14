import type { Point } from '../domain/types';

export type PointerInputPhase = 'READY' | 'AIMING' | 'CHARGING';

export interface PointerInputRules {
  readonly board: {
    readonly left: number;
    readonly top: number;
    readonly right: number;
    readonly bottom: number;
  };
  readonly viewport: { readonly width: number; readonly height: number };
  readonly exclusionPixels: number;
}

export type PointerInputEvent =
  | {
      readonly kind: 'aim-start';
      readonly point: Point;
      readonly pointerId: number;
      readonly capture: true;
    }
  | { readonly kind: 'aim-update'; readonly point: Point; readonly pointerId: number }
  | { readonly kind: 'fire'; readonly point: Point; readonly pointerId: number }
  | { readonly kind: 'cancel'; readonly pointerId: number | null; readonly reason: string }
  | { readonly kind: 'charging-notice'; readonly pointerId: number }
  | { readonly kind: 'ignored'; readonly pointerId: number };

export interface PointerInputState {
  readonly phase: PointerInputPhase;
  readonly activePointerId: number | null;
  readonly point: Point | null;
  readonly valid: boolean;
}

const initialState: PointerInputState = {
  phase: 'READY',
  activePointerId: null,
  point: null,
  valid: false,
};

function insideBoard(point: Point, rules: PointerInputRules): boolean {
  return (
    point.x >= rules.board.left &&
    point.x <= rules.board.right &&
    point.y >= rules.board.top &&
    point.y <= rules.board.bottom
  );
}

function insideExclusionBand(point: Point, rules: PointerInputRules): boolean {
  const band = rules.exclusionPixels;
  return (
    point.x < band ||
    point.y < band ||
    point.x > rules.viewport.width - band ||
    point.y > rules.viewport.height - band
  );
}

function isValidPoint(point: Point, rules: PointerInputRules): boolean {
  return insideBoard(point, rules) && !insideExclusionBand(point, rules);
}

export class PointerInputController {
  private state: PointerInputState = initialState;

  public constructor(private readonly rules: PointerInputRules) {}

  public getState(): PointerInputState {
    return this.state;
  }

  public setCharging(charging: boolean): void {
    if (this.state.phase === 'AIMING') this.cancel('state-change');
    this.state = charging ? { ...initialState, phase: 'CHARGING' } : initialState;
  }

  public pointerDown(pointerId: number, point: Point): PointerInputEvent {
    if (this.state.phase === 'CHARGING') {
      return { kind: 'charging-notice', pointerId };
    }
    if (this.state.phase !== 'READY' || !isValidPoint(point, this.rules)) {
      return { kind: 'ignored', pointerId };
    }
    this.state = {
      phase: 'AIMING',
      activePointerId: pointerId,
      point,
      valid: true,
    };
    return { kind: 'aim-start', pointerId, point, capture: true };
  }

  public pointerMove(pointerId: number, point: Point): PointerInputEvent {
    if (this.state.activePointerId !== pointerId || this.state.phase !== 'AIMING') {
      return { kind: 'ignored', pointerId };
    }
    if (!isValidPoint(point, this.rules)) {
      return this.cancel('outside-input-area');
    }
    this.state = { ...this.state, point, valid: true };
    return { kind: 'aim-update', pointerId, point };
  }

  public pointerUp(pointerId: number, point: Point): PointerInputEvent {
    if (this.state.activePointerId !== pointerId || this.state.phase !== 'AIMING') {
      return { kind: 'ignored', pointerId };
    }
    if (!isValidPoint(point, this.rules) || !this.state.valid) {
      return this.cancel('outside-input-area');
    }
    this.state = { ...initialState, phase: 'CHARGING' };
    return { kind: 'fire', pointerId, point };
  }

  public pointerCancel(pointerId: number, reason = 'pointercancel'): PointerInputEvent {
    if (this.state.activePointerId !== pointerId) {
      return { kind: 'ignored', pointerId };
    }
    return this.cancel(reason);
  }

  public lostPointerCapture(pointerId: number): PointerInputEvent {
    if (this.state.activePointerId !== pointerId) {
      return { kind: 'ignored', pointerId };
    }
    return this.cancel('lostpointercapture');
  }

  public stateChanged(reason: string): PointerInputEvent {
    if (this.state.phase !== 'AIMING') {
      return { kind: 'cancel', pointerId: null, reason };
    }
    return this.cancel(reason);
  }

  private cancel(reason: string): PointerInputEvent {
    const pointerId = this.state.activePointerId;
    this.state = initialState;
    return { kind: 'cancel', pointerId, reason };
  }
}
