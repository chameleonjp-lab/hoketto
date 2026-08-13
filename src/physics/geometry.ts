import type { Aabb, Circle, Point, Segment } from '../domain/types';

export interface SweepHit {
  readonly time: number;
  readonly point: Point;
}

export function distanceSquared(a: Point, b: Point): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

export function pointToSegmentDistanceSquared(point: Point, segment: Segment): number {
  const dx = segment.end.x - segment.start.x;
  const dy = segment.end.y - segment.start.y;
  const lengthSquared = dx * dx + dy * dy;

  if (lengthSquared === 0) {
    return distanceSquared(point, segment.start);
  }

  const projection =
    ((point.x - segment.start.x) * dx + (point.y - segment.start.y) * dy) / lengthSquared;
  const t = Math.max(0, Math.min(1, projection));
  return distanceSquared(point, {
    x: segment.start.x + dx * t,
    y: segment.start.y + dy * t,
  });
}

export function circlesOverlap(a: Circle, b: Circle): boolean {
  const combinedRadius = a.radius + b.radius;
  return distanceSquared(a.center, b.center) < combinedRadius * combinedRadius;
}

export function circleOverlapsAabb(circle: Circle, box: Aabb): boolean {
  const nearestX = Math.max(box.minX, Math.min(circle.center.x, box.maxX));
  const nearestY = Math.max(box.minY, Math.min(circle.center.y, box.maxY));
  return (
    distanceSquared(circle.center, { x: nearestX, y: nearestY }) < circle.radius * circle.radius
  );
}

export function reflectVector(vector: Point, normal: Point): Point {
  const dot = vector.x * normal.x + vector.y * normal.y;
  return {
    x: vector.x - 2 * dot * normal.x,
    y: vector.y - 2 * dot * normal.y,
  };
}

export function sweptCircleAgainstCircle(
  start: Point,
  end: Point,
  movingRadius: number,
  target: Circle,
): SweepHit | null {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const fx = start.x - target.center.x;
  const fy = start.y - target.center.y;
  const radius = movingRadius + target.radius;
  const c = fx * fx + fy * fy - radius * radius;

  if (c <= 0) {
    return { time: 0, point: start };
  }

  const a = dx * dx + dy * dy;
  if (a === 0) {
    return null;
  }

  const b = 2 * (fx * dx + fy * dy);
  const discriminant = b * b - 4 * a * c;
  if (discriminant < 0) {
    return null;
  }

  const time = (-b - Math.sqrt(discriminant)) / (2 * a);
  if (time < 0 || time > 1) {
    return null;
  }

  return {
    time,
    point: {
      x: start.x + dx * time,
      y: start.y + dy * time,
    },
  };
}

export function rotatePoint180(point: Point, width: number, height: number): Point {
  return { x: width - point.x, y: height - point.y };
}

export function isFinitePoint(point: Point): boolean {
  return Number.isFinite(point.x) && Number.isFinite(point.y);
}
