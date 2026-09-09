import type { Aabb, Circle, Point, Segment } from '../domain/types';

export type SweepFeature = 'circle' | 'face' | 'endpoint' | 'corner';

export interface SweepHit {
  readonly time: number;
  /** The moving circle's center at `time`. */
  readonly point: Point;
  /** A unit normal pointing from the target shape towards the moving circle. */
  readonly normal: Point;
  readonly feature: SweepFeature;
}

const EPSILON = Number.EPSILON;
const QUADRANT_EPSILON = 1e-9;

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

/**
 * Return a unit vector for a displacement. At a coincident point there is no
 * geometric normal, so use the opposite motion direction and finally a fixed
 * upward direction. This keeps all time-zero hits finite and deterministic
 * while leaving separation filtering to the caller.
 */
function finiteNormal(
  displacement: Point,
  motion: Point,
  fallback: Point = { x: 0, y: -1 },
): Point {
  const positiveZero = (value: number): number => (value === 0 ? 0 : value);
  const displacementLength = Math.hypot(displacement.x, displacement.y);
  if (displacementLength > EPSILON && Number.isFinite(displacementLength)) {
    return {
      x: positiveZero(displacement.x / displacementLength),
      y: positiveZero(displacement.y / displacementLength),
    };
  }

  const motionLength = Math.hypot(motion.x, motion.y);
  if (motionLength > EPSILON && Number.isFinite(motionLength)) {
    return {
      x: positiveZero(-motion.x / motionLength),
      y: positiveZero(-motion.y / motionLength),
    };
  }

  const fallbackLength = Math.hypot(fallback.x, fallback.y);
  if (fallbackLength > EPSILON && Number.isFinite(fallbackLength)) {
    return {
      x: positiveZero(fallback.x / fallbackLength),
      y: positiveZero(fallback.y / fallbackLength),
    };
  }

  return { x: 0, y: -1 };
}

function atTime(start: Point, velocity: Point, time: number): Point {
  return {
    x: start.x + velocity.x * time,
    y: start.y + velocity.y * time,
  };
}

function normalizeTime(time: number): number {
  if (time <= 0) return 0;
  if (time >= 1) return 1;
  return time;
}

/** Return the earliest root in the normalized sweep interval. */
function firstQuadraticTime(a: number, b: number, c: number): number | null {
  if (a <= EPSILON) return null;

  const discriminant = b * b - 4 * a * c;
  if (discriminant < 0) return null;

  const root = Math.sqrt(discriminant);
  const denominator = 2 * a;
  const roots = [(-b - root) / denominator, (-b + root) / denominator];
  let first: number | null = null;
  for (const candidate of roots) {
    if (candidate < 0 || candidate > 1 || !Number.isFinite(candidate)) continue;
    if (first === null || candidate < first) first = candidate;
  }
  return first === null ? null : normalizeTime(first);
}

function hitAt(time: number, point: Point, normal: Point, feature: SweepFeature): SweepHit {
  return { time, point, normal, feature };
}

/**
 * Sweep two circles over one normalized tick. The quadratic is solved in
 * relative coordinates; `point` and `normal` are then reconstructed in world
 * coordinates at the contact time.
 */
export function sweptCircleAgainstMovingCircle(
  start: Point,
  end: Point,
  movingRadius: number,
  targetStart: Point,
  targetEnd: Point,
  targetRadius: number,
): SweepHit | null {
  const movingVelocity = { x: end.x - start.x, y: end.y - start.y };
  const targetVelocity = { x: targetEnd.x - targetStart.x, y: targetEnd.y - targetStart.y };
  const relativeStart = { x: start.x - targetStart.x, y: start.y - targetStart.y };
  const relativeVelocity = {
    x: movingVelocity.x - targetVelocity.x,
    y: movingVelocity.y - targetVelocity.y,
  };
  const combinedRadius = movingRadius + targetRadius;
  const c =
    relativeStart.x * relativeStart.x +
    relativeStart.y * relativeStart.y -
    combinedRadius * combinedRadius;

  if (c <= 0) {
    return hitAt(0, start, finiteNormal(relativeStart, relativeVelocity), 'circle');
  }

  const a = relativeVelocity.x * relativeVelocity.x + relativeVelocity.y * relativeVelocity.y;
  const b = 2 * (relativeStart.x * relativeVelocity.x + relativeStart.y * relativeVelocity.y);
  const time = firstQuadraticTime(a, b, c);
  if (time === null) return null;

  const point = atTime(start, movingVelocity, time);
  const targetPoint = atTime(targetStart, targetVelocity, time);
  return hitAt(
    time,
    point,
    finiteNormal({ x: point.x - targetPoint.x, y: point.y - targetPoint.y }, relativeVelocity),
    'circle',
  );
}

export function sweptCircleAgainstCircle(
  start: Point,
  end: Point,
  movingRadius: number,
  target: Circle,
): SweepHit | null {
  return sweptCircleAgainstMovingCircle(
    start,
    end,
    movingRadius,
    target.center,
    target.center,
    target.radius,
  );
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

function withFeature(hit: SweepHit | null, feature: SweepFeature): SweepHit | null {
  return hit === null ? null : { ...hit, feature };
}

function closestPointOnSegment(point: Point, segment: Segment): Point {
  const dx = segment.end.x - segment.start.x;
  const dy = segment.end.y - segment.start.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return segment.start;

  const projection =
    ((point.x - segment.start.x) * dx + (point.y - segment.start.y) * dy) / lengthSquared;
  const t = Math.max(0, Math.min(1, projection));
  return {
    x: segment.start.x + dx * t,
    y: segment.start.y + dy * t,
  };
}

function segmentFeatureAtStart(start: Point, segment: Segment): 'face' | 'endpoint' {
  const dx = segment.end.x - segment.start.x;
  const dy = segment.end.y - segment.start.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared <= EPSILON) return 'endpoint';
  const projection =
    ((start.x - segment.start.x) * dx + (start.y - segment.start.y) * dy) / lengthSquared;
  return projection <= QUADRANT_EPSILON || projection >= 1 - QUADRANT_EPSILON ? 'endpoint' : 'face';
}

function normalAtSegmentStart(start: Point, velocity: Point, segment: Segment): Point {
  const closest = closestPointOnSegment(start, segment);
  const displacement = { x: start.x - closest.x, y: start.y - closest.y };
  const segmentDx = segment.end.x - segment.start.x;
  const segmentDy = segment.end.y - segment.start.y;
  const segmentLength = Math.hypot(segmentDx, segmentDy);
  if (segmentLength <= EPSILON) {
    return finiteNormal(displacement, velocity);
  }

  const faceNormal = { x: -segmentDy / segmentLength, y: segmentDx / segmentLength };
  return finiteNormal(displacement, velocity, faceNormal);
}

export function sweptCircleAgainstSegment(
  start: Point,
  end: Point,
  movingRadius: number,
  segment: Segment,
): SweepHit | null {
  const velocity = { x: end.x - start.x, y: end.y - start.y };
  const radiusSquared = movingRadius * movingRadius;
  if (pointToSegmentDistanceSquared(start, segment) <= radiusSquared) {
    return hitAt(
      0,
      start,
      normalAtSegmentStart(start, velocity, segment),
      segmentFeatureAtStart(start, segment),
    );
  }

  const segmentDx = segment.end.x - segment.start.x;
  const segmentDy = segment.end.y - segment.start.y;
  const segmentLength = Math.hypot(segmentDx, segmentDy);
  if (segmentLength <= EPSILON) {
    return withFeature(
      sweptCircleAgainstCircle(start, end, movingRadius, {
        center: segment.start,
        radius: 0,
      }),
      'endpoint',
    );
  }

  const ux = segmentDx / segmentLength;
  const uy = segmentDy / segmentLength;
  const nx = -uy;
  const ny = ux;
  const signedDistance = (start.x - segment.start.x) * nx + (start.y - segment.start.y) * ny;
  const normalVelocity = velocity.x * nx + velocity.y * ny;
  const capHits = [
    withFeature(
      sweptCircleAgainstCircle(start, end, movingRadius, {
        center: segment.start,
        radius: 0,
      }),
      'endpoint',
    ),
    withFeature(
      sweptCircleAgainstCircle(start, end, movingRadius, {
        center: segment.end,
        radius: 0,
      }),
      'endpoint',
    ),
  ];
  const faceHits: SweepHit[] = [];

  if (Math.abs(normalVelocity) > EPSILON) {
    for (const boundary of [-movingRadius, movingRadius]) {
      const time = (boundary - signedDistance) / normalVelocity;
      if (time < 0 || time > 1 || !Number.isFinite(time)) continue;
      const point = atTime(start, velocity, time);
      const along = (point.x - segment.start.x) * ux + (point.y - segment.start.y) * uy;
      if (along < -QUADRANT_EPSILON || along > segmentLength + QUADRANT_EPSILON) continue;
      faceHits.push(
        hitAt(
          normalizeTime(time),
          point,
          boundary < 0 ? { x: -nx, y: -ny } : { x: nx, y: ny },
          'face',
        ),
      );
    }
  }

  // Cap candidates precede face candidates so a contact exactly at an
  // endpoint receives the radial endpoint normal.
  return earliestHit([...capHits, ...faceHits]);
}

function aabbFeatureAtStart(start: Point, box: Aabb): 'face' | 'corner' {
  const outsideX = start.x < box.minX || start.x > box.maxX;
  const outsideY = start.y < box.minY || start.y > box.maxY;
  if (outsideX && outsideY) return 'corner';
  if (start.x === box.minX || start.x === box.maxX) {
    if (start.y === box.minY || start.y === box.maxY) return 'corner';
  }
  return 'face';
}

function aabbNormalAtStart(start: Point, velocity: Point, box: Aabb): Point {
  const closest = {
    x: Math.max(box.minX, Math.min(box.maxX, start.x)),
    y: Math.max(box.minY, Math.min(box.maxY, start.y)),
  };
  const displacement = { x: start.x - closest.x, y: start.y - closest.y };
  if (Math.hypot(displacement.x, displacement.y) > EPSILON) {
    return finiteNormal(displacement, velocity);
  }

  const distances = [
    { distance: Math.abs(start.x - box.minX), normal: { x: -1, y: 0 } },
    { distance: Math.abs(box.maxX - start.x), normal: { x: 1, y: 0 } },
    { distance: Math.abs(start.y - box.minY), normal: { x: 0, y: -1 } },
    { distance: Math.abs(box.maxY - start.y), normal: { x: 0, y: 1 } },
  ];
  let nearest = distances[0]!;
  for (const candidate of distances.slice(1)) {
    if (candidate.distance < nearest.distance) nearest = candidate;
  }
  return nearest.normal;
}

function cornerIsValid(
  point: Point,
  corner: 'top-left' | 'top-right' | 'bottom-right' | 'bottom-left',
  box: Aabb,
): boolean {
  if (corner === 'top-left') {
    return point.x <= box.minX + QUADRANT_EPSILON && point.y <= box.minY + QUADRANT_EPSILON;
  }
  if (corner === 'top-right') {
    return point.x >= box.maxX - QUADRANT_EPSILON && point.y <= box.minY + QUADRANT_EPSILON;
  }
  if (corner === 'bottom-right') {
    return point.x >= box.maxX - QUADRANT_EPSILON && point.y >= box.maxY - QUADRANT_EPSILON;
  }
  return point.x <= box.minX + QUADRANT_EPSILON && point.y >= box.maxY - QUADRANT_EPSILON;
}

function cornerHit(
  start: Point,
  end: Point,
  radius: number,
  center: Point,
  corner: 'top-left' | 'top-right' | 'bottom-right' | 'bottom-left',
  box: Aabb,
): SweepHit | null {
  const velocity = { x: end.x - start.x, y: end.y - start.y };
  const relativeStart = { x: start.x - center.x, y: start.y - center.y };
  const c = relativeStart.x * relativeStart.x + relativeStart.y * relativeStart.y - radius * radius;
  if (c <= 0) return null;

  const a = velocity.x * velocity.x + velocity.y * velocity.y;
  const b = 2 * (relativeStart.x * velocity.x + relativeStart.y * velocity.y);
  const discriminant = b * b - 4 * a * c;
  if (discriminant < 0 || a <= EPSILON) return null;
  const root = Math.sqrt(discriminant);
  const denominator = 2 * a;
  const candidates = [(-b - root) / denominator, (-b + root) / denominator];
  let best: SweepHit | null = null;
  for (const candidate of candidates) {
    if (candidate < 0 || candidate > 1 || !Number.isFinite(candidate)) continue;
    const time = normalizeTime(candidate);
    const point = atTime(start, velocity, time);
    if (!cornerIsValid(point, corner, box)) continue;
    const hit = hitAt(
      time,
      point,
      finiteNormal({ x: point.x - center.x, y: point.y - center.y }, velocity),
      'corner',
    );
    if (best === null || hit.time < best.time) best = hit;
  }
  return best;
}

function aabbFaceHits(start: Point, end: Point, radius: number, box: Aabb): SweepHit[] {
  const velocity = { x: end.x - start.x, y: end.y - start.y };
  const hits: SweepHit[] = [];
  const addVertical = (x: number, normal: Point): void => {
    if (Math.abs(velocity.x) <= EPSILON) return;
    const time = (x - start.x) / velocity.x;
    if (time < 0 || time > 1 || !Number.isFinite(time)) return;
    const point = atTime(start, velocity, time);
    if (point.y < box.minY - QUADRANT_EPSILON || point.y > box.maxY + QUADRANT_EPSILON) return;
    hits.push(hitAt(normalizeTime(time), point, normal, 'face'));
  };
  const addHorizontal = (y: number, normal: Point): void => {
    if (Math.abs(velocity.y) <= EPSILON) return;
    const time = (y - start.y) / velocity.y;
    if (time < 0 || time > 1 || !Number.isFinite(time)) return;
    const point = atTime(start, velocity, time);
    if (point.x < box.minX - QUADRANT_EPSILON || point.x > box.maxX + QUADRANT_EPSILON) return;
    hits.push(hitAt(normalizeTime(time), point, normal, 'face'));
  };

  addVertical(box.minX - radius, { x: -1, y: 0 });
  addVertical(box.maxX + radius, { x: 1, y: 0 });
  addHorizontal(box.minY - radius, { x: 0, y: -1 });
  addHorizontal(box.maxY + radius, { x: 0, y: 1 });
  return hits;
}

export function sweptCircleAgainstAabb(
  start: Point,
  end: Point,
  movingRadius: number,
  box: Aabb,
): SweepHit | null {
  const velocity = { x: end.x - start.x, y: end.y - start.y };
  if (pointToAabbDistanceSquared(start, box) <= movingRadius * movingRadius) {
    return hitAt(0, start, aabbNormalAtStart(start, velocity, box), aabbFeatureAtStart(start, box));
  }

  const corners = [
    cornerHit(start, end, movingRadius, { x: box.minX, y: box.minY }, 'top-left', box),
    cornerHit(start, end, movingRadius, { x: box.maxX, y: box.minY }, 'top-right', box),
    cornerHit(start, end, movingRadius, { x: box.maxX, y: box.maxY }, 'bottom-right', box),
    cornerHit(start, end, movingRadius, { x: box.minX, y: box.maxY }, 'bottom-left', box),
  ];
  // Corner candidates precede face candidates so a true quarter-circle
  // contact at a box corner retains its radial normal on an exact tie.
  return earliestHit([...corners, ...aabbFaceHits(start, end, movingRadius, box)]);
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
