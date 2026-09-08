import type { BoardDefinition, Circle, Point, Segment, Team } from '../domain/types';
import {
  circleOverlapsAabb,
  circleOverlapsSegment,
  circlesOverlap,
  distanceSquared,
  reflectVector,
  sweptCircleAgainstAabb,
  sweptCircleAgainstCircle,
  sweptCircleAgainstSegment,
  type SweepHit,
} from './geometry';
import type { BoardGeometry } from './boardGeometry';

/** A physics puck is deliberately structural so this module does not depend on the game state. */
export interface PhysicsPuck {
  readonly id: number;
  readonly position: Point;
  readonly velocity: Point;
  readonly radius: number;
  readonly active: boolean;
  readonly points?: 1 | 2;
}

export interface PhysicsBullet {
  readonly id: number;
  readonly owner: Team;
  readonly position: Point;
  readonly velocity: Point;
  readonly radius: number;
  readonly remainingTicks: number;
  readonly reflections: number;
}

export interface PhysicsGoalEvent {
  readonly team: Team;
  readonly points: 1 | 2;
  readonly puckId: number;
}

export interface StepPhysicsInput {
  readonly board: BoardDefinition;
  readonly geometry: BoardGeometry;
  readonly pucks: readonly PhysicsPuck[];
  readonly bullets: readonly PhysicsBullet[];
  readonly reservation: Circle | null;
  readonly dtSeconds: number;
  readonly puckSpeedLimit: number;
  readonly puckDecelerationPerSecond: number;
  readonly maxCollisionsPerObject?: number;
}

export interface StepPhysicsResult {
  readonly pucks: readonly PhysicsPuck[];
  readonly bullets: readonly PhysicsBullet[];
  readonly goals: readonly PhysicsGoalEvent[];
  readonly invalidReason?: string;
}

type MutablePuck = {
  id: number;
  position: Point;
  velocity: Point;
  radius: number;
  active: boolean;
  points?: 1 | 2;
};

type MutableBullet = {
  id: number;
  owner: Team;
  position: Point;
  velocity: Point;
  radius: number;
  remainingTicks: number;
  reflections: number;
  removed: boolean;
};

type SurfaceResponse = 'reflect' | 'remove' | 'ignore';

interface Surface {
  readonly id: number;
  readonly shape: 'segment' | 'circle' | 'box';
  readonly segment?: Segment;
  readonly circle?: Circle;
  readonly box?: {
    readonly minX: number;
    readonly minY: number;
    readonly maxX: number;
    readonly maxY: number;
  };
  readonly puckResponse: SurfaceResponse;
  readonly bulletResponse: SurfaceResponse;
}

interface ContactBase {
  readonly time: number;
  readonly priority: number;
  readonly stableKey: number;
}

interface PuckPairContact extends ContactBase {
  readonly kind: 'puck-pair';
  readonly puckA: number;
  readonly puckB: number;
  readonly normal: Point;
}

interface PuckSurfaceContact extends ContactBase {
  readonly kind: 'puck-surface';
  readonly puck: number;
  readonly surface: Surface;
  readonly normal: Point;
}

interface BulletPuckContact extends ContactBase {
  readonly kind: 'bullet-puck';
  readonly bullet: number;
  readonly puck: number;
  readonly normal: Point;
}

interface BulletSurfaceContact extends ContactBase {
  readonly kind: 'bullet-surface';
  readonly bullet: number;
  readonly surface: Surface;
  readonly normal: Point;
}

interface GoalContact extends ContactBase {
  readonly kind: 'goal';
  readonly puck: number;
  readonly team: Team;
  readonly points: 1 | 2;
}

type Contact =
  PuckPairContact | PuckSurfaceContact | BulletPuckContact | BulletSurfaceContact | GoalContact;

const TIME_EPSILON = 1e-8;
const CONTACT_EPSILON = 1e-7;
const SEPARATION_EPSILON = 0.05;
const UNRESOLVED_OVERLAP_EPSILON = 0.02;
const DEFAULT_COLLISION_LIMIT = 32;

function add(a: Point, b: Point): Point {
  return { x: a.x + b.x, y: a.y + b.y };
}

function scale(vector: Point, factor: number): Point {
  return { x: vector.x * factor, y: vector.y * factor };
}

function subtract(a: Point, b: Point): Point {
  return { x: a.x - b.x, y: a.y - b.y };
}

function dot(a: Point, b: Point): number {
  return a.x * b.x + a.y * b.y;
}

function length(vector: Point): number {
  return Math.hypot(vector.x, vector.y);
}

function normalize(vector: Point, fallback: Point): Point {
  const magnitude = length(vector);
  if (!Number.isFinite(magnitude) || magnitude <= Number.EPSILON) return fallback;
  return scale(vector, 1 / magnitude);
}

function clampVectorMagnitude(vector: Point, maximum: number): Point {
  const magnitude = length(vector);
  if (!Number.isFinite(magnitude) || magnitude <= maximum) return vector;
  return scale(vector, maximum / magnitude);
}

function dampVelocity(velocity: Point, dtSeconds: number, deceleration: number): Point {
  const speed = length(velocity);
  if (!Number.isFinite(speed) || speed <= Number.EPSILON) return { x: 0, y: 0 };
  return scale(velocity, Math.max(0, speed - deceleration * dtSeconds) / speed);
}

function isFinitePoint(point: Point): boolean {
  return Number.isFinite(point.x) && Number.isFinite(point.y);
}

function sameSegment(a: Segment, b: Segment): boolean {
  return (
    (a.start.x === b.start.x &&
      a.start.y === b.start.y &&
      a.end.x === b.end.x &&
      a.end.y === b.end.y) ||
    (a.start.x === b.end.x &&
      a.start.y === b.end.y &&
      a.end.x === b.start.x &&
      a.end.y === b.start.y)
  );
}

function surfaceList(input: StepPhysicsInput): readonly Surface[] {
  const surfaces: Surface[] = [];
  let id = 0;
  for (const box of input.board.staticBoxes) {
    surfaces.push({
      id: id++,
      shape: 'box',
      box,
      puckResponse: 'reflect',
      bulletResponse: 'remove',
    });
  }
  for (const circle of input.board.staticCircles) {
    surfaces.push({
      id: id++,
      shape: 'circle',
      circle,
      puckResponse: 'reflect',
      bulletResponse: 'remove',
    });
  }
  for (const post of input.geometry.posts) {
    surfaces.push({
      id: id++,
      shape: 'circle',
      circle: post,
      puckResponse: 'reflect',
      bulletResponse: 'remove',
    });
  }
  if (input.reservation) {
    surfaces.push({
      id: id++,
      shape: 'circle',
      circle: input.reservation,
      puckResponse: 'reflect',
      bulletResponse: 'ignore',
    });
  }
  for (const segment of input.board.staticSegments) {
    surfaces.push({
      id: id++,
      shape: 'segment',
      segment,
      puckResponse: 'reflect',
      bulletResponse: 'reflect',
    });
  }
  for (const segment of input.geometry.mouthSides) {
    surfaces.push({
      id: id++,
      shape: 'segment',
      segment,
      puckResponse: 'reflect',
      bulletResponse: 'remove',
    });
  }
  for (const wall of input.geometry.walls) {
    const isGoalRail = input.geometry.goals.some((goal) =>
      goal.rails.some((rail) => sameSegment(rail, wall)),
    );
    if (surfaces.some((surface) => surface.segment && sameSegment(surface.segment, wall))) continue;
    surfaces.push({
      id: id++,
      shape: 'segment',
      segment: wall,
      puckResponse: 'reflect',
      bulletResponse: isGoalRail ? 'reflect' : 'remove',
    });
  }
  return surfaces;
}

function asSweepHit(
  hit: SweepHit,
): SweepHit & { readonly normal?: Point; readonly feature?: string } {
  return hit as SweepHit & { readonly normal?: Point; readonly feature?: string };
}

function segmentNormal(segment: Segment): Point {
  const tangent = subtract(segment.end, segment.start);
  const segmentLength = length(tangent);
  if (segmentLength <= Number.EPSILON) return { x: 0, y: -1 };
  return { x: -tangent.y / segmentLength, y: tangent.x / segmentLength };
}

function pointOnSegment(point: Point, segment: Segment): Point {
  const tangent = subtract(segment.end, segment.start);
  const denominator = dot(tangent, tangent);
  if (denominator <= Number.EPSILON) return segment.start;
  const t = Math.max(0, Math.min(1, dot(subtract(point, segment.start), tangent) / denominator));
  return add(segment.start, scale(tangent, t));
}

function surfaceNormal(surface: Surface, hit: SweepHit, movingCenter: Point): Point {
  const extended = asSweepHit(hit);
  if (extended.normal && isFinitePoint(extended.normal)) {
    return normalize(extended.normal, { x: 0, y: -1 });
  }
  if (surface.shape === 'circle' && surface.circle) {
    return normalize(subtract(movingCenter, surface.circle.center), { x: 0, y: -1 });
  }
  if (surface.shape === 'segment' && surface.segment) {
    const closest = pointOnSegment(movingCenter, surface.segment);
    const radial = subtract(movingCenter, closest);
    if (length(radial) > CONTACT_EPSILON) return normalize(radial, segmentNormal(surface.segment));
    return segmentNormal(surface.segment);
  }
  if (surface.shape === 'box' && surface.box) {
    const closest = {
      x: Math.max(surface.box.minX, Math.min(surface.box.maxX, movingCenter.x)),
      y: Math.max(surface.box.minY, Math.min(surface.box.maxY, movingCenter.y)),
    };
    const radial = subtract(movingCenter, closest);
    if (length(radial) > CONTACT_EPSILON) return normalize(radial, { x: 0, y: -1 });
    const distances = [
      { distance: Math.abs(movingCenter.x - surface.box.minX), normal: { x: -1, y: 0 } },
      { distance: Math.abs(surface.box.maxX - movingCenter.x), normal: { x: 1, y: 0 } },
      { distance: Math.abs(movingCenter.y - surface.box.minY), normal: { x: 0, y: -1 } },
      { distance: Math.abs(surface.box.maxY - movingCenter.y), normal: { x: 0, y: 1 } },
    ];
    return distances.reduce((best, candidate) =>
      candidate.distance < best.distance ? candidate : best,
    ).normal;
  }
  return { x: 0, y: -1 };
}

function surfaceHit(
  surface: Surface,
  start: Point,
  end: Point,
  radius: number,
): { readonly hit: SweepHit; readonly normal: Point } | null {
  let hit: SweepHit | null = null;
  if (surface.shape === 'segment' && surface.segment) {
    hit = sweptCircleAgainstSegment(start, end, radius, surface.segment);
  } else if (surface.shape === 'circle' && surface.circle) {
    hit = sweptCircleAgainstCircle(start, end, radius, surface.circle);
  } else if (surface.shape === 'box' && surface.box) {
    hit = sweptCircleAgainstAabb(start, end, radius, surface.box);
  }
  if (!hit) return null;
  return {
    hit,
    normal: surfaceNormal(surface, hit, add(start, scale(subtract(end, start), hit.time))),
  };
}

interface MovingCircleHit {
  readonly time: number;
  readonly normal: Point;
}

/** Continuous collision for two moving circles, expressed as one relative sweep. */
function movingCircleHit(
  movingStart: Point,
  movingEnd: Point,
  movingRadius: number,
  targetStart: Point,
  targetEnd: Point,
  targetRadius: number,
): MovingCircleHit | null {
  const relativeStart = subtract(movingStart, targetStart);
  const relativeDelta = subtract(
    subtract(movingEnd, movingStart),
    subtract(targetEnd, targetStart),
  );
  const combinedRadius = movingRadius + targetRadius;
  const c = dot(relativeStart, relativeStart) - combinedRadius * combinedRadius;
  if (c <= CONTACT_EPSILON) {
    return {
      time: 0,
      normal: normalize(relativeStart, normalize(relativeDelta, { x: 1, y: 0 })),
    };
  }
  const a = dot(relativeDelta, relativeDelta);
  if (a <= Number.EPSILON) return null;
  const b = 2 * dot(relativeStart, relativeDelta);
  const discriminant = b * b - 4 * a * c;
  if (discriminant < 0) return null;
  const time = (-b - Math.sqrt(Math.max(0, discriminant))) / (2 * a);
  if (time < -TIME_EPSILON || time > 1 + TIME_EPSILON) return null;
  const clampedTime = Math.max(0, Math.min(1, time));
  const at = add(relativeStart, scale(relativeDelta, clampedTime));
  return {
    time: clampedTime,
    normal: normalize(at, normalize(relativeDelta, { x: 1, y: 0 })),
  };
}

function contactApproaching(relativeVelocity: Point, normal: Point): boolean {
  return dot(relativeVelocity, normal) > CONTACT_EPSILON;
}

function goalHit(
  puck: MutablePuck,
  velocity: Point,
  remainingSeconds: number,
  geometry: BoardGeometry,
): { readonly time: number; readonly team: Team; readonly points: 1 | 2 } | null {
  const end = add(puck.position, scale(velocity, remainingSeconds));
  let earliest: { readonly time: number; readonly team: Team; readonly points: 1 | 2 } | null =
    null;
  for (const goal of geometry.goals) {
    const threshold =
      goal.side === 'top' ? goal.scorePlane - puck.radius : goal.scorePlane + puck.radius;
    const movingToward =
      goal.side === 'top' ? velocity.y < -CONTACT_EPSILON : velocity.y > CONTACT_EPSILON;
    if (!movingToward) continue;
    if (
      goal.side === 'top'
        ? !(puck.position.y > threshold && end.y <= threshold)
        : !(puck.position.y < threshold && end.y >= threshold)
    ) {
      continue;
    }
    const time = (threshold - puck.position.y) / (end.y - puck.position.y);
    if (time < -TIME_EPSILON || time > 1 + TIME_EPSILON) continue;
    const clampedTime = Math.max(0, Math.min(1, time));
    const x = puck.position.x + (end.x - puck.position.x) * clampedTime;
    if (
      x < goal.openingMinX + puck.radius - CONTACT_EPSILON ||
      x > goal.openingMaxX - puck.radius + CONTACT_EPSILON
    )
      continue;
    const candidate = {
      time: clampedTime,
      team: goal.scoreFor,
      points: puck.points ?? (1 as 1 | 2),
    };
    if (earliest === null || candidate.time < earliest.time) earliest = candidate;
  }
  return earliest;
}

function moveAll(
  pucks: readonly MutablePuck[],
  bullets: readonly MutableBullet[],
  seconds: number,
): void {
  if (seconds <= 0) return;
  for (const puck of pucks) {
    if (puck.active) puck.position = add(puck.position, scale(puck.velocity, seconds));
  }
  for (const bullet of bullets) {
    bullet.position = add(bullet.position, scale(bullet.velocity, seconds));
  }
}

function separatePucks(a: MutablePuck, b: MutablePuck, normal: Point): void {
  const distance = length(subtract(b.position, a.position));
  const required = a.radius + b.radius;
  if (distance >= required + SEPARATION_EPSILON) return;
  const direction =
    distance > Number.EPSILON ? scale(subtract(b.position, a.position), 1 / distance) : normal;
  const correction = (required + SEPARATION_EPSILON - distance) / 2;
  a.position = add(a.position, scale(direction, -correction));
  b.position = add(b.position, scale(direction, correction));
}

function separateSurface(puck: MutablePuck, surface: Surface, normal: Point): void {
  let overlap = 0;
  const center = puck.position;
  if (surface.shape === 'circle' && surface.circle) {
    overlap =
      puck.radius +
      surface.circle.radius -
      Math.sqrt(distanceSquared(center, surface.circle.center));
  } else if (surface.shape === 'segment' && surface.segment) {
    overlap =
      puck.radius - Math.sqrt(distanceSquared(center, pointOnSegment(center, surface.segment)));
  } else if (surface.shape === 'box' && surface.box) {
    const distanceX = Math.max(surface.box.minX - center.x, 0, center.x - surface.box.maxX);
    const distanceY = Math.max(surface.box.minY - center.y, 0, center.y - surface.box.maxY);
    overlap = puck.radius - Math.hypot(distanceX, distanceY);
  }
  // Exact boundary contact must still leave a small gap. Otherwise the next
  // sweep sees the same t=0 contact and can reflect forever.
  puck.position = add(puck.position, scale(normal, Math.max(0, overlap) + SEPARATION_EPSILON));
}

function isPuckInAllowedRange(
  puck: MutablePuck,
  bounds: StepPhysicsInput['geometry']['bounds'],
): boolean {
  const tolerance = puck.radius + 1;
  return (
    puck.position.x >= bounds.minX - tolerance &&
    puck.position.x <= bounds.maxX + tolerance &&
    puck.position.y >= bounds.minY - tolerance &&
    puck.position.y <= bounds.maxY + tolerance
  );
}

function isBulletInAllowedRange(
  bullet: { readonly position: Point; readonly radius: number },
  bounds: StepPhysicsInput['geometry']['bounds'],
): boolean {
  const tolerance = bullet.radius + 1;
  return (
    bullet.position.x >= bounds.minX - tolerance &&
    bullet.position.x <= bounds.maxX + tolerance &&
    bullet.position.y >= bounds.minY - tolerance &&
    bullet.position.y <= bounds.maxY + tolerance
  );
}

function puckOverlapsSurface(puck: MutablePuck, surface: Surface): boolean {
  const circle = { center: puck.position, radius: puck.radius };
  if (surface.shape === 'circle' && surface.circle) return circlesOverlap(circle, surface.circle);
  if (surface.shape === 'segment' && surface.segment) {
    return circleOverlapsSegment(circle, surface.segment);
  }
  if (surface.shape === 'box' && surface.box) {
    return circleOverlapsAabb(circle, surface.box);
  }
  return false;
}

function initialValidation(input: StepPhysicsInput): string | null {
  if (!Number.isFinite(input.dtSeconds) || input.dtSeconds <= 0) return 'physics-invalid-dt';
  if (!Number.isFinite(input.puckSpeedLimit) || input.puckSpeedLimit <= 0)
    return 'physics-invalid-speed-limit';
  const puckIds = new Set<number>();
  for (const puck of input.pucks) {
    if (puckIds.has(puck.id)) return `physics-duplicate-puck-${puck.id}`;
    puckIds.add(puck.id);
    if (!Number.isFinite(puck.id) || !Number.isFinite(puck.radius) || puck.radius <= 0)
      return `physics-invalid-puck-${puck.id}`;
    if (!isFinitePoint(puck.position) || !isFinitePoint(puck.velocity))
      return `physics-non-finite-puck-${puck.id}`;
    if (puck.active && !isPuckInAllowedRange({ ...puck }, input.geometry.bounds))
      return `physics-puck-out-of-range-${puck.id}`;
  }
  const bulletIds = new Set<number>();
  for (const bullet of input.bullets) {
    if (bulletIds.has(bullet.id)) return `physics-duplicate-bullet-${bullet.id}`;
    bulletIds.add(bullet.id);
    if (
      !Number.isFinite(bullet.id) ||
      !Number.isFinite(bullet.radius) ||
      bullet.radius <= 0 ||
      !Number.isFinite(bullet.remainingTicks)
    )
      return `physics-invalid-bullet-${bullet.id}`;
    if (!isFinitePoint(bullet.position) || !isFinitePoint(bullet.velocity))
      return `physics-non-finite-bullet-${bullet.id}`;
    if (!isBulletInAllowedRange({ ...bullet }, input.geometry.bounds))
      return `physics-bullet-out-of-range-${bullet.id}`;
  }
  return null;
}

function finalValidation(
  input: StepPhysicsInput,
  pucks: readonly MutablePuck[],
  bullets: readonly MutableBullet[],
  surfaces: readonly Surface[],
): string | null {
  for (const puck of pucks) {
    if (!isFinitePoint(puck.position) || !isFinitePoint(puck.velocity))
      return `physics-non-finite-puck-${puck.id}`;
    if (puck.active && !isPuckInAllowedRange(puck, input.geometry.bounds))
      return `physics-puck-out-of-range-${puck.id}`;
  }
  for (const bullet of bullets) {
    if (!isFinitePoint(bullet.position) || !isFinitePoint(bullet.velocity))
      return `physics-non-finite-bullet-${bullet.id}`;
    if (!isBulletInAllowedRange(bullet, input.geometry.bounds))
      return `physics-bullet-out-of-range-${bullet.id}`;
  }
  const activePucks = pucks.filter((puck) => puck.active);
  for (const puck of activePucks) {
    for (const surface of surfaces) {
      if (surface.puckResponse === 'reflect' && puckOverlapsSurface(puck, surface)) {
        return `physics-unresolved-surface-overlap-${puck.id}-${surface.id}`;
      }
    }
  }
  for (let aIndex = 0; aIndex < activePucks.length; aIndex += 1) {
    const a = activePucks[aIndex];
    if (!a) continue;
    for (let bIndex = aIndex + 1; bIndex < activePucks.length; bIndex += 1) {
      const b = activePucks[bIndex];
      if (!b) continue;
      if (
        distanceSquared(a.position, b.position) <
        (a.radius + b.radius - UNRESOLVED_OVERLAP_EPSILON) ** 2
      ) {
        return `physics-unresolved-puck-overlap-${a.id}-${b.id}`;
      }
    }
  }
  return null;
}

function contactTimeSort(a: Contact, b: Contact): number {
  if (Math.abs(a.time - b.time) > TIME_EPSILON) return a.time - b.time;
  if (a.priority !== b.priority) return a.priority - b.priority;
  return a.stableKey - b.stableKey;
}

function sortPucks(pucks: readonly MutablePuck[]): MutablePuck[] {
  return [...pucks].sort((a, b) => a.id - b.id);
}

function sortBullets(bullets: readonly MutableBullet[]): MutableBullet[] {
  return [...bullets].sort((a, b) => a.id - b.id);
}

export function stepPhysics(input: StepPhysicsInput): StepPhysicsResult {
  const invalid = initialValidation(input);
  if (invalid) return { pucks: input.pucks, bullets: [], goals: [], invalidReason: invalid };

  const pucks = input.pucks.map((puck) => ({ ...puck }));
  const bullets = input.bullets
    .filter((bullet) => bullet.remainingTicks > 0)
    .map((bullet) => ({ ...bullet, removed: false }));
  const surfaces = surfaceList(input);
  const collisionLimit = input.maxCollisionsPerObject ?? DEFAULT_COLLISION_LIMIT;
  const collisionCounts = new Map<string, number>();
  const goals: PhysicsGoalEvent[] = [];
  let remainingSeconds = input.dtSeconds;

  const bump = (key: string, id: number): string | null => {
    const count = (collisionCounts.get(key) ?? 0) + 1;
    collisionCounts.set(key, count);
    return count > collisionLimit ? `physics-collision-limit-${key}-${id}` : null;
  };

  while (remainingSeconds > TIME_EPSILON) {
    const contacts: Contact[] = [];
    const puckEnds = pucks.map((puck) =>
      puck.active ? add(puck.position, scale(puck.velocity, remainingSeconds)) : puck.position,
    );
    const bulletEnds = bullets.map((bullet) =>
      add(bullet.position, scale(bullet.velocity, remainingSeconds)),
    );

    for (let aIndex = 0; aIndex < pucks.length; aIndex += 1) {
      const a = pucks[aIndex];
      if (!a || !a.active) continue;
      for (let bIndex = aIndex + 1; bIndex < pucks.length; bIndex += 1) {
        const b = pucks[bIndex];
        if (!b || !b.active) continue;
        const hit = movingCircleHit(
          a.position,
          puckEnds[aIndex] ?? a.position,
          a.radius,
          b.position,
          puckEnds[bIndex] ?? b.position,
          b.radius,
        );
        if (!hit) continue;
        const relativeVelocity = subtract(a.velocity, b.velocity);
        if (hit.time <= CONTACT_EPSILON && !contactApproaching(relativeVelocity, hit.normal))
          continue;
        const lowId = Math.min(a.id, b.id);
        const highId = Math.max(a.id, b.id);
        contacts.push({
          time: hit.time,
          priority: 0,
          stableKey: lowId * 1_000_000 + highId,
          kind: 'puck-pair',
          puckA: aIndex,
          puckB: bIndex,
          normal: hit.normal,
        });
      }
    }

    for (let puckIndex = 0; puckIndex < pucks.length; puckIndex += 1) {
      const puck = pucks[puckIndex];
      if (!puck || !puck.active) continue;
      for (const surface of surfaces) {
        const hit = surfaceHit(
          surface,
          puck.position,
          puckEnds[puckIndex] ?? puck.position,
          puck.radius,
        );
        if (!hit) continue;
        const normal = hit.normal;
        contacts.push({
          time: hit.hit.time,
          priority: 1,
          stableKey: puck.id * 1_000_000 + surface.id,
          kind: 'puck-surface',
          puck: puckIndex,
          surface,
          normal,
        });
      }
      const goal = goalHit(puck, puck.velocity, remainingSeconds, input.geometry);
      if (goal)
        contacts.push({
          time: goal.time,
          priority: 4,
          stableKey: puck.id * 1_000 + (goal.team === 'player' ? 0 : 1),
          kind: 'goal',
          puck: puckIndex,
          team: goal.team,
          points: goal.points,
        });
    }

    for (let bulletIndex = 0; bulletIndex < bullets.length; bulletIndex += 1) {
      const bullet = bullets[bulletIndex];
      if (!bullet || bullet.removed) continue;
      for (let puckIndex = 0; puckIndex < pucks.length; puckIndex += 1) {
        const puck = pucks[puckIndex];
        if (!puck || !puck.active) continue;
        const hit = movingCircleHit(
          bullet.position,
          bulletEnds[bulletIndex] ?? bullet.position,
          bullet.radius,
          puck.position,
          puckEnds[puckIndex] ?? puck.position,
          puck.radius,
        );
        if (!hit) continue;
        contacts.push({
          time: hit.time,
          priority: 2,
          stableKey: bullet.id * 1_000_000 + puck.id,
          kind: 'bullet-puck',
          bullet: bulletIndex,
          puck: puckIndex,
          normal: hit.normal,
        });
      }
      for (const surface of surfaces) {
        const hit = surfaceHit(
          surface,
          bullet.position,
          bulletEnds[bulletIndex] ?? bullet.position,
          bullet.radius,
        );
        if (!hit) continue;
        const normal = hit.normal;
        if (hit.hit.time <= CONTACT_EPSILON && dot(bullet.velocity, normal) >= -CONTACT_EPSILON)
          continue;
        contacts.push({
          time: hit.hit.time,
          priority: 3,
          stableKey: bullet.id * 1_000_000 + surface.id,
          kind: 'bullet-surface',
          bullet: bulletIndex,
          surface,
          normal,
        });
      }
    }

    if (contacts.length === 0) {
      moveAll(pucks, bullets, remainingSeconds);
      remainingSeconds = 0;
      break;
    }
    contacts.sort(contactTimeSort);
    const first = contacts[0];
    if (!first) break;
    const time = Math.max(0, Math.min(1, first.time));
    const elapsed = remainingSeconds * time;
    moveAll(pucks, bullets, elapsed);
    remainingSeconds -= elapsed;
    const simultaneous = contacts.filter(
      (contact) => Math.abs(contact.time - first.time) <= TIME_EPSILON,
    );

    const usedBulletSurfaces = new Set<number>();
    const usedBullets = new Set<number>();
    const goalPucks = new Set<number>();
    const surfaceContactPucks = new Set<number>();
    let stepInvalid: string | null = null;

    for (const contact of simultaneous) {
      if (contact.kind !== 'puck-pair') continue;
      const a = pucks[contact.puckA];
      const b = pucks[contact.puckB];
      if (!a || !b || !a.active || !b.active) continue;
      stepInvalid = stepInvalid ?? bump(`puck-${a.id}`, a.id);
      stepInvalid = stepInvalid ?? bump(`puck-${b.id}`, b.id);
      const relative = subtract(a.velocity, b.velocity);
      const normal = normalize(subtract(b.position, a.position), contact.normal);
      const approach = dot(relative, normal);
      if (approach > CONTACT_EPSILON) {
        a.velocity = clampVectorMagnitude(
          subtract(a.velocity, scale(normal, approach)),
          input.puckSpeedLimit,
        );
        b.velocity = clampVectorMagnitude(
          add(b.velocity, scale(normal, approach)),
          input.puckSpeedLimit,
        );
      }
      separatePucks(a, b, normal);
    }
    for (const contact of simultaneous) {
      if (contact.kind !== 'puck-surface') continue;
      const puck = pucks[contact.puck];
      if (!puck || !puck.active) continue;
      stepInvalid = stepInvalid ?? bump(`puck-${puck.id}`, puck.id);
      if (contact.surface.puckResponse === 'reflect') {
        surfaceContactPucks.add(contact.puck);
      }
      if (
        contact.surface.puckResponse === 'reflect' &&
        dot(puck.velocity, contact.normal) < -CONTACT_EPSILON
      ) {
        puck.velocity = clampVectorMagnitude(
          reflectVector(puck.velocity, contact.normal),
          input.puckSpeedLimit,
        );
      }
      separateSurface(puck, contact.surface, contact.normal);
    }

    const impulseByPuck = new Map<number, Point>();
    const chosenBulletPuck = new Set<number>();
    for (const contact of simultaneous) {
      if (contact.kind !== 'bullet-puck') continue;
      const bullet = bullets[contact.bullet];
      const puck = pucks[contact.puck];
      if (
        !bullet ||
        !puck ||
        !puck.active ||
        usedBullets.has(contact.bullet) ||
        chosenBulletPuck.has(contact.bullet)
      )
        continue;
      chosenBulletPuck.add(contact.bullet);
      const previous = impulseByPuck.get(contact.puck) ?? { x: 0, y: 0 };
      const impulse = scale(
        normalize(bullet.velocity, { x: 0, y: bullet.owner === 'player' ? -1 : 1 }),
        360,
      );
      impulseByPuck.set(contact.puck, add(previous, impulse));
    }
    for (const [puckIndex, impulse] of impulseByPuck.entries()) {
      const puck = pucks[puckIndex];
      if (!puck || !puck.active) continue;
      stepInvalid = stepInvalid ?? bump(`puck-${puck.id}`, puck.id);
      puck.velocity = clampVectorMagnitude(add(puck.velocity, impulse), input.puckSpeedLimit);
    }
    for (const contact of simultaneous) {
      if (contact.kind !== 'bullet-puck') continue;
      if (!chosenBulletPuck.has(contact.bullet)) continue;
      usedBullets.add(contact.bullet);
      const bullet = bullets[contact.bullet];
      if (bullet) bullet.removed = true;
    }
    for (const contact of simultaneous) {
      if (contact.kind !== 'bullet-surface') continue;
      const bullet = bullets[contact.bullet];
      if (
        !bullet ||
        bullet.removed ||
        usedBullets.has(contact.bullet) ||
        usedBulletSurfaces.has(contact.bullet)
      )
        continue;
      usedBulletSurfaces.add(contact.bullet);
      if (contact.surface.bulletResponse === 'ignore') {
        // A pass-through surface must still make progress.  Otherwise a
        // bullet touching the reservation ring at t=0 would be rediscovered
        // forever in the remaining-time loop.
        bullet.position = add(
          bullet.position,
          scale(normalize(bullet.velocity, { x: 0, y: -1 }), SEPARATION_EPSILON),
        );
        continue;
      }
      if (contact.surface.bulletResponse === 'reflect' && bullet.reflections === 0) {
        bullet.velocity = reflectVector(bullet.velocity, contact.normal);
        bullet.reflections = 1;
        bullet.position = add(bullet.position, scale(contact.normal, SEPARATION_EPSILON));
      } else {
        usedBullets.add(contact.bullet);
        bullet.removed = true;
      }
    }
    for (const contact of simultaneous) {
      if (contact.kind !== 'goal') continue;
      if (goalPucks.has(contact.puck)) continue;
      if (surfaceContactPucks.has(contact.puck)) continue;
      const puck = pucks[contact.puck];
      if (!puck || !puck.active) continue;
      goalPucks.add(contact.puck);
      puck.active = false;
      puck.velocity = { x: 0, y: 0 };
      goals.push({ team: contact.team, points: contact.points, puckId: puck.id });
    }
    if (stepInvalid) {
      return { pucks: sortPucks(pucks), bullets: [], goals: [], invalidReason: stepInvalid };
    }
    if (time <= TIME_EPSILON) {
      // A resolving contact at t=0 must still make progress through velocity separation.
      // If every candidate was discarded by a tie, consume a tiny amount of time.
      remainingSeconds = Math.max(
        0,
        remainingSeconds - Math.min(remainingSeconds, input.dtSeconds * 1e-7),
      );
    }
  }

  for (const puck of pucks) {
    if (puck.active) {
      puck.velocity = dampVelocity(puck.velocity, input.dtSeconds, input.puckDecelerationPerSecond);
      puck.velocity = clampVectorMagnitude(puck.velocity, input.puckSpeedLimit);
    }
  }
  const survivingBullets = bullets
    .filter((bullet) => {
      if (bullet.removed) return false;
      if (bullet.remainingTicks <= 0) return false;
      if (!isBulletInAllowedRange(bullet, input.geometry.bounds)) return false;
      return true;
    })
    .map((bullet) => ({ ...bullet, remainingTicks: bullet.remainingTicks - 1 }));
  const finalInvalid = finalValidation(input, pucks, survivingBullets, surfaces);
  if (finalInvalid)
    return { pucks: sortPucks(pucks), bullets: [], goals: [], invalidReason: finalInvalid };
  return { pucks: sortPucks(pucks), bullets: sortBullets(survivingBullets), goals };
}
