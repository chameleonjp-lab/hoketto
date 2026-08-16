import type { Point } from '../domain/types';
import { getInputBounds, type PointerInputRules } from './pointerInput';

export type KeyboardInputPhase = 'DISABLED' | 'READY' | 'CHARGING' | 'PAUSED';

export type KeyboardInputEvent =
  | { readonly kind: 'aim-update'; readonly point: Point; readonly key: string }
  | { readonly kind: 'fire'; readonly point: Point }
  | { readonly kind: 'charging-notice' }
  | { readonly kind: 'pause-request' }
  | { readonly kind: 'resume-request' }
  | { readonly kind: 'ignored' };

export interface KeyboardInputState {
  readonly phase: KeyboardInputPhase;
  readonly focused: boolean;
  readonly point: Point;
}

const DEFAULT_STEP = 8;
const FINE_STEP = 1;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function centerOf(bounds: ReturnType<typeof getInputBounds>): Point {
  return {
    x: (bounds.left + bounds.right) / 2,
    y: (bounds.top + bounds.bottom) / 2,
  };
}

export class KeyboardInputController {
  private readonly bounds: ReturnType<typeof getInputBounds>;
  private state: KeyboardInputState;

  public constructor(rules: PointerInputRules) {
    this.bounds = getInputBounds(rules);
    this.state = {
      phase: 'DISABLED',
      focused: false,
      point: centerOf(this.bounds),
    };
  }

  public getState(): KeyboardInputState {
    return this.state;
  }

  public setFocused(focused: boolean): void {
    this.state = { ...this.state, focused };
  }

  public setActive(active: boolean): void {
    if (!active) {
      if (this.state.phase === 'PAUSED') return;
      this.state = { ...this.state, phase: 'DISABLED' };
      return;
    }
    if (this.state.phase === 'DISABLED') {
      this.state = { ...this.state, phase: 'READY' };
    }
  }

  public setCharging(charging: boolean): void {
    if (this.state.phase === 'DISABLED' || this.state.phase === 'PAUSED') return;
    this.state = { ...this.state, phase: charging ? 'CHARGING' : 'READY' };
  }

  public setPaused(paused: boolean): void {
    if (paused) {
      this.state = { ...this.state, phase: 'PAUSED' };
      return;
    }
    if (this.state.phase === 'PAUSED') {
      this.state = { ...this.state, phase: 'READY' };
    }
  }

  public keyDown(event: Pick<KeyboardEvent, 'key' | 'shiftKey' | 'repeat'>): KeyboardInputEvent {
    if (!this.state.focused) return { kind: 'ignored' };

    if (event.key === 'Escape') {
      return this.state.phase === 'PAUSED' ? { kind: 'ignored' } : { kind: 'pause-request' };
    }

    if (this.state.phase === 'PAUSED') {
      if ((event.key === 'Enter' || event.key === ' ') && !event.repeat) {
        return { kind: 'resume-request' };
      }
      return { kind: 'ignored' };
    }
    if (this.state.phase === 'DISABLED') {
      return { kind: 'ignored' };
    }

    if (event.key === 'Enter' || event.key === ' ') {
      if (event.repeat) return { kind: 'ignored' };
      if (this.state.phase === 'CHARGING') return { kind: 'charging-notice' };
      this.state = { ...this.state, phase: 'CHARGING' };
      return { kind: 'fire', point: this.state.point };
    }

    const step = event.shiftKey ? FINE_STEP : DEFAULT_STEP;
    const delta =
      event.key === 'ArrowLeft'
        ? { x: -step, y: 0 }
        : event.key === 'ArrowRight'
          ? { x: step, y: 0 }
          : event.key === 'ArrowUp'
            ? { x: 0, y: -step }
            : event.key === 'ArrowDown'
              ? { x: 0, y: step }
              : null;
    if (!delta) return { kind: 'ignored' };

    const point = {
      x: clamp(this.state.point.x + delta.x, this.bounds.left, this.bounds.right),
      y: clamp(this.state.point.y + delta.y, this.bounds.top, this.bounds.bottom),
    };
    this.state = { ...this.state, point };
    return { kind: 'aim-update', point, key: event.key };
  }
}
