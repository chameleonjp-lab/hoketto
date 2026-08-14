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

export function pointToAabbDistanceSquared(point: Point, box: Aabb): number {
  const dx = Math.max(box.minX - point.x, 0, point.x - box.maxX);
  const dy = Math.max(box.minY - point.y, 0, point.y - box.maxY);
  return dx * dx + dy * dy;
}

export function circlesOverlap(a: Circle, b: Circle): boolean {
  const combinedRadius = a.radius + b.radius;
  return distanceSquared(a.center, b.center) < combinedRadius * combinedRadius;
}

export function circleOverlapsAabb(circle: Circle, box: Aabb): boolean {
  return pointToAabbDistanceSquared(circle.center, box) < circle.radius * circle.radius;
}

export function circleOverlapsSegment(circle: Circle, segment: Segment): boolean {
  return pointToSegmentDistanceSquared(circle.center, segment) < circle.radius * circle.radius;
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

function earliestHit(hits: readonly (SweepHit | null)[]): SweepHit | null {
  let earliest: SweepHit | null = null;
  for (const hit of hits) {
    if (hit && (earliest === null || hit.time < earliest.time)) {
      earliest = hit;
    }
  }
  return earliest;
}

export function sweptCircleAgainstSegment(
  start: Point,
  end: Point,
  movingRadius: number,
  segment: Segment,
): SweepHit | null {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const segmentDx = segment.end.x - segment.start.x;
  const segmentDy = segment.end.y - segment.start.y;
  const segmentLength = Math.hypot(segmentDx, segmentDy);

  if (pointToSegmentDistanceSquared(start, segment) <= movingRadius * movingRadius) {
    return { time: 0, point: start };
  }

  if (segmentLength === 0) {
    return sweptCircleAgainstCircle(start, end, movingRadius, {
      center: segment.start,
      radius: 0,
    });
  }

  const capHits = [
    sweptCircleAgainstCircle(start, end, movingRadius, {
      center: segment.start,
      radius: 0,
    }),
    sweptCircleAgainstCircle(start, end, movingRadius, {
      center: segment.end,
      radius: 0,
    }),
  ];

  const ux = segmentDx / segmentLength;
  const uy = segmentDy / segmentLength;
  const nx = -uy;
  const ny = ux;
  const startOffsetX = start.x - segment.start.x;
  const startOffsetY = start.y - segment.start.y;
  const signedDistance = startOffsetX * nx + startOffsetY * ny;
  const normalVelocity = dx * nx + dy * ny;
  const stripHits: SweepHit[] = [];

  if (Math.abs(normalVelocity) > Number.EPSILON) {
    for (const boundary of [-movingRadius, movingRadius]) {
      const time = (boundary - signedDistance) / normalVelocity;
      if (time < 0 || time > 1) continue;
      const hitX = start.x + dx * time;
      const hitY = start.y + dy * time;
      const along = (hitX - segment.start.x) * ux + (hitY - segment.start.y) * uy;
      if (along >= 0 && along <= segmentLength) {
        stripHits.push({ time, point: { x: hitX, y: hitY } });
      }
    }
  }

  return earliestHit([...capHits, ...stripHits]);
}

export function sweptCircleAgainstAabb(
  start: Point,
  end: Point,
  movingRadius: number,
  box: Aabb,
): SweepHit | null {
  const startCircle: Circle = { center: start, radius: movingRadius };
  if (circleOverlapsAabb(startCircle, box)) {
    return { time: 0, point: start };
  }

  const top: Segment = {
    start: { x: box.minX, y: box.minY },
    end: { x: box.maxX, y: box.minY },
  };
  const right: Segment = {
    start: { x: box.maxX, y: box.minY },
    end: { x: box.maxX, y: box.maxY },
  };
  const bottom: Segment = {
    start: { x: box.maxX, y: box.maxY },
    end: { x: box.minX, y: box.maxY },
  };
  const left: Segment = {
    start: { x: box.minX, y: box.maxY },
    end: { x: box.minX, y: box.minY },
  };

  return earliestHit([
    sweptCircleAgainstSegment(start, end, movingRadius, top),
    sweptCircleAgainstSegment(start, end, movingRadius, right),
    sweptCircleAgainstSegment(start, end, movingRadius, bottom),
    sweptCircleAgainstSegment(start, end, movingRadius, left),
  ]);
}

export function clampVectorMagnitude(vector: Point, maximum: number): Point {
  const magnitude = Math.hypot(vector.x, vector.y);
  if (magnitude === 0 || magnitude <= maximum) return vector;
  const scale = maximum / magnitude;
  return { x: vector.x * scale, y: vector.y * scale };
}

export function rotatePoint180(point: Point, width: number, height: number): Point {
  return { x: width - point.x, y: height - point.y };
}

export function isFinitePoint(point: Point): boolean {
  return Number.isFinite(point.x) && Number.isFinite(point.y);
}
