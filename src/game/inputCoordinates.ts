import type { Point } from '../domain/types';

export interface ClientRectLike {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

export interface ClientPointLike {
  readonly clientX: number;
  readonly clientY: number;
}

/** Convert browser client coordinates into the fixed logical game space. */
export function mapClientPointToLogical(
  point: ClientPointLike,
  rect: ClientRectLike,
  logicalWidth: number,
  logicalHeight: number,
): Point | null {
  if (
    !Number.isFinite(point.clientX) ||
    !Number.isFinite(point.clientY) ||
    !Number.isFinite(rect.left) ||
    !Number.isFinite(rect.top) ||
    !Number.isFinite(rect.width) ||
    !Number.isFinite(rect.height) ||
    rect.width <= 0 ||
    rect.height <= 0 ||
    !Number.isFinite(logicalWidth) ||
    !Number.isFinite(logicalHeight) ||
    logicalWidth <= 0 ||
    logicalHeight <= 0
  ) {
    return null;
  }

  return {
    x: ((point.clientX - rect.left) / rect.width) * logicalWidth,
    y: ((point.clientY - rect.top) / rect.height) * logicalHeight,
  };
}

export function getNativeClientPoint(event: unknown): ClientPointLike | null {
  if (!event || typeof event !== 'object') return null;
  const candidate = event as {
    readonly clientX?: unknown;
    readonly clientY?: unknown;
    readonly changedTouches?: { readonly length?: number; readonly [index: number]: unknown };
    readonly touches?: { readonly length?: number; readonly [index: number]: unknown };
  };
  if (typeof candidate.clientX === 'number' && typeof candidate.clientY === 'number') {
    return { clientX: candidate.clientX, clientY: candidate.clientY };
  }
  const touchList = candidate.changedTouches ?? candidate.touches;
  const touch = touchList && touchList.length && touchList[0];
  if (!touch || typeof touch !== 'object') return null;
  const touchPoint = touch as { readonly clientX?: unknown; readonly clientY?: unknown };
  if (typeof touchPoint.clientX !== 'number' || typeof touchPoint.clientY !== 'number') {
    return null;
  }
  return { clientX: touchPoint.clientX, clientY: touchPoint.clientY };
}
