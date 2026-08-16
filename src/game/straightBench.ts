import { getBoardDefinition, STRAIGHT_BENCH, type PlayableBoardId } from '../config/boards';
import {
  MATCH_SECONDS,
  OVERTIME_SECONDS,
  TICKS_PER_SECOND,
  advanceClock,
  applyGoals,
  createMatchState,
  type MatchPhase,
  type MatchState,
} from '../domain/match';
import type { Aabb, Point, Segment, Team } from '../domain/types';
import {
  clampVectorMagnitude,
  reflectVector,
  sweptCircleAgainstAabb,
  sweptCircleAgainstCircle,
  sweptCircleAgainstSegment,
  type SweepHit,
} from '../physics/geometry';

export const STRAIGHT_BENCH_WIDTH = STRAIGHT_BENCH.width;
export const STRAIGHT_BENCH_HEIGHT = STRAIGHT_BENCH.height;
export const FIXED_HZ = TICKS_PER_SECOND;
export const PUCK_RADIUS = 14;
export const BULLET_RADIUS = 7;
export const BULLET_SPEED = 900;
export const BULLET_LIFETIME_TICKS = TICKS_PER_SECOND;
export const SHOT_COOLDOWN_TICKS = Math.round(0.9 * TICKS_PER_SECOND);
export const GOAL_PAUSE_TICKS = Math.round(0.8 * TICKS_PER_SECOND);
export const RESUME_COUNTDOWN_TICKS = 3 * TICKS_PER_SECOND;
export const PUCK_HIT_IMPULSE = 360;
export const MAX_PUCK_SPEED = 600;
export const PUCK_DECELERATION_PER_SECOND = 90;
export type CpuDifficulty = 'practice' | 'normal';

export const PRACTICE_CPU_REACTION_TICKS = Math.round(0.48 * TICKS_PER_SECOND);
export const NORMAL_CPU_REACTION_TICKS = Math.round(0.28 * TICKS_PER_SECOND);
export const CPU_REACTION_TICKS = PRACTICE_CPU_REACTION_TICKS;
export const PRACTICE_CPU_AIM_LEAD_TICKS = 0;
export const NORMAL_CPU_AIM_LEAD_TICKS = Math.round(0.18 * TICKS_PER_SECOND);
export const CPU_AIM_LEAD_TICKS = NORMAL_CPU_AIM_LEAD_TICKS;

const PLAYER_TURRET: Point = { x: STRAIGHT_BENCH_WIDTH / 2, y: 580 };
const CPU_TURRET: Point = { x: STRAIGHT_BENCH_WIDTH / 2, y: 60 };
const GOAL_OPENING_PADDING = PUCK_RADIUS;
const GOAL_THRESHOLD_EPSILON = 1e-9;

export interface PuckState {
  readonly id: number;
  readonly position: Point;
  readonly velocity: Point;
  readonly radius: number;
  readonly active: boolean;
}

export interface BulletState {
  readonly id: number;
  readonly owner: Team;
  readonly position: Point;
  readonly velocity: Point;
  readonly radius: number;
  readonly remainingTicks: number;
  readonly reflections: number;
}

export type GoalResumePhase = 'PLAYING' | 'OVERTIME' | 'OVERTIME_NOTICE' | 'RESULT';

export interface StraightBenchState {
  readonly durationSeconds: number;
  readonly board: PlayableBoardId;
  readonly difficulty: CpuDifficulty;
  readonly match: MatchState;
  readonly pucks: readonly PuckState[];
  readonly bullets: readonly BulletState[];
  readonly cooldownTicks: number;
  readonly cpuCooldownTicks: number;
  readonly cpuThinkTicks: number;
  readonly goalPauseTicks: number;
  readonly goalResumePhase?: GoalResumePhase;
  readonly overtimeNoticeTicks: number;
  readonly nextBulletId: number;
  readonly invalidReason?: string;
}

export interface StraightBenchSnapshot {
  readonly playerTurret: Point;
  readonly cpuTurret: Point;
  readonly playerCanFire: boolean;
}

export type TurretReadiness = 'ready' | 'thinking' | 'charging' | 'stopped';

export const STRAIGHT_BENCH_SNAPSHOT: StraightBenchSnapshot = {
  playerTurret: PLAYER_TURRET,
  cpuTurret: CPU_TURRET,
  playerCanFire: true,
};

function isActivePhase(phase: MatchPhase): phase is 'PLAYING' | 'OVERTIME' {
  return phase === 'PLAYING' || phase === 'OVERTIME';
}

function add(a: Point, b: Point): Point {
  return { x: a.x + b.x, y: a.y + b.y };
}

function scale(vector: Point, factor: number): Point {
  return { x: vector.x * factor, y: vector.y * factor };
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function magnitude(vector: Point): number {
  return Math.hypot(vector.x, vector.y);
}

function normalize(vector: Point, fallback: Point): Point {
  const length = magnitude(vector);
  if (length <= Number.EPSILON) return fallback;
  return scale(vector, 1 / length);
}

function dampVelocity(velocity: Point): Point {
  const speed = magnitude(velocity);
  if (speed <= Number.EPSILON) return { x: 0, y: 0 };
  return scale(
    velocity,
    Math.max(0, speed - PUCK_DECELERATION_PER_SECOND / TICKS_PER_SECOND) / speed,
  );
}

function cpuReactionTicks(difficulty: CpuDifficulty): number {
  return difficulty === 'normal' ? NORMAL_CPU_REACTION_TICKS : PRACTICE_CPU_REACTION_TICKS;
}

function cpuAimLeadTicks(difficulty: CpuDifficulty): number {
  return difficulty === 'normal' ? NORMAL_CPU_AIM_LEAD_TICKS : PRACTICE_CPU_AIM_LEAD_TICKS;
}

function cpuAimErrorRadians(state: StraightBenchState): number {
  const maximumDegrees = state.difficulty === 'normal' ? 4 : 8;
  const deterministicSample = Math.sin(state.match.seed * 12.9898 + state.nextBulletId * 78.233);
  return (deterministicSample * maximumDegrees * Math.PI) / 180;
}

function rotate(vector: Point, radians: number): Point {
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  return {
    x: vector.x * cosine - vector.y * sine,
    y: vector.x * sine + vector.y * cosine,
  };
}

function boardFor(state: StraightBenchState): ReturnType<typeof getBoardDefinition> {
  return getBoardDefinition(state.board);
}

function goalOpeningContainsX(state: StraightBenchState, x: number): boolean {
  const goal = boardFor(state).goals[0];
  return (
    x >= goal.openingMinX + GOAL_OPENING_PADDING && x <= goal.openingMaxX - GOAL_OPENING_PADDING
  );
}

function crossingAtY(start: Point, end: Point, y: number): Point | null {
  const direction = end.y - start.y;
  if (Math.abs(direction) <= GOAL_THRESHOLD_EPSILON) return null;
  const time = (y - start.y) / direction;
  if (time < -GOAL_THRESHOLD_EPSILON || time > 1 + GOAL_THRESHOLD_EPSILON) return null;
  const clampedTime = Math.max(0, Math.min(1, time));
  return {
    x: start.x + (end.x - start.x) * clampedTime,
    y,
  };
}

function crossedGoal(
  state: StraightBenchState,
  start: Point,
  end: Point,
  radius: number,
): Team | null {
  const [topGoal, bottomGoal] = boardFor(state).goals;
  const topThreshold = topGoal.scorePlane - radius;
  const bottomThreshold = bottomGoal.scorePlane + radius;

  if (start.y > topThreshold && end.y <= topThreshold) {
    const crossing = crossingAtY(start, end, topThreshold);
    if (crossing && goalOpeningContainsX(state, crossing.x)) return topGoal.scoreFor;
  }
  if (start.y < bottomThreshold && end.y >= bottomThreshold) {
    const crossing = crossingAtY(start, end, bottomThreshold);
    if (crossing && goalOpeningContainsX(state, crossing.x)) return bottomGoal.scoreFor;
  }
  return null;
}

function bounceInsideBoard(
  state: StraightBenchState,
  position: Point,
  velocity: Point,
  radius: number,
): {
  readonly position: Point;
  readonly velocity: Point;
} {
  let nextPosition = position;
  let nextVelocity = velocity;

  if (nextPosition.x < radius) {
    nextPosition = { ...nextPosition, x: radius };
    nextVelocity = { ...nextVelocity, x: Math.abs(nextVelocity.x) };
  } else if (nextPosition.x > STRAIGHT_BENCH_WIDTH - radius) {
    nextPosition = { ...nextPosition, x: STRAIGHT_BENCH_WIDTH - radius };
    nextVelocity = { ...nextVelocity, x: -Math.abs(nextVelocity.x) };
  }

  if (nextPosition.y < radius && !goalOpeningContainsX(state, nextPosition.x)) {
    nextPosition = { ...nextPosition, y: radius };
    nextVelocity = { ...nextVelocity, y: Math.abs(nextVelocity.y) };
  } else if (
    nextPosition.y > STRAIGHT_BENCH_HEIGHT - radius &&
    !goalOpeningContainsX(state, nextPosition.x)
  ) {
    nextPosition = { ...nextPosition, y: STRAIGHT_BENCH_HEIGHT - radius };
    nextVelocity = { ...nextVelocity, y: -Math.abs(nextVelocity.y) };
  }

  return { position: nextPosition, velocity: nextVelocity };
}

function resetPuck(state: StraightBenchState, id: number): PuckState {
  const template = boardFor(state).initialPucks[(id - 1) % boardFor(state).initialPucks.length] ?? {
    center: { x: STRAIGHT_BENCH_WIDTH / 2, y: STRAIGHT_BENCH_HEIGHT / 2 },
    radius: PUCK_RADIUS,
  };
  return {
    id,
    position: template.center,
    velocity: { x: 0, y: 0 },
    radius: template.radius,
    active: true,
  };
}

function resetForNextRound(state: StraightBenchState): StraightBenchState {
  return {
    ...state,
    pucks: state.pucks.map((puck) => resetPuck(state, puck.id)),
    bullets: [],
    cooldownTicks: SHOT_COOLDOWN_TICKS,
    cpuCooldownTicks: SHOT_COOLDOWN_TICKS,
    cpuThinkTicks: cpuReactionTicks(state.difficulty),
  };
}

function goalResumePhaseFor(
  matchBeforeTick: MatchState,
  scored: MatchState,
  clocked: MatchState,
): GoalResumePhase {
  if (clocked.phase === 'RESULT') {
    return matchBeforeTick.phase === 'PLAYING' && scored.playerScore === scored.cpuScore
      ? 'OVERTIME_NOTICE'
      : 'RESULT';
  }
  if (clocked.phase === 'OVERTIME_NOTICE') {
    return scored.playerScore === scored.cpuScore ? 'OVERTIME_NOTICE' : 'RESULT';
  }
  if (matchBeforeTick.phase === 'OVERTIME') return 'RESULT';
  return clocked.phase === 'OVERTIME' ? 'OVERTIME' : 'PLAYING';
}

function applyPhysicalGoals(
  state: StraightBenchState,
  goals: readonly Team[],
  clockedMatch: MatchState,
): StraightBenchState {
  if (goals.length === 0) {
    return { ...state, match: clockedMatch };
  }

  const goalEvents = goals.map((team) => ({ team, points: 1 as const }));
  const scored = applyGoals(state.match, goalEvents);
  const goalResumePhase = goalResumePhaseFor(state.match, scored, clockedMatch);
  const match: MatchState = {
    ...scored,
    tick: clockedMatch.tick,
    ticksRemaining: clockedMatch.ticksRemaining,
    phase: 'GOAL_PAUSE',
  };
  return {
    ...state,
    match,
    pucks: state.pucks.map((puck) => resetPuck(state, puck.id)),
    bullets: [],
    cooldownTicks: SHOT_COOLDOWN_TICKS,
    cpuCooldownTicks: SHOT_COOLDOWN_TICKS,
    cpuThinkTicks: cpuReactionTicks(state.difficulty),
    goalPauseTicks: GOAL_PAUSE_TICKS,
    goalResumePhase,
  };
}

function stepGoalPause(state: StraightBenchState): StraightBenchState {
  if (state.goalPauseTicks > 1) {
    return { ...state, goalPauseTicks: state.goalPauseTicks - 1 };
  }

  const goalResumePhase = state.goalResumePhase ?? 'PLAYING';
  if (goalResumePhase === 'RESULT') {
    return {
      ...state,
      match: { ...state.match, phase: 'RESULT' },
      goalPauseTicks: 0,
      goalResumePhase: undefined,
    };
  }
  if (goalResumePhase === 'OVERTIME_NOTICE') {
    return {
      ...resetForNextRound(state),
      match: { ...state.match, phase: 'OVERTIME_NOTICE' },
      goalPauseTicks: 0,
      goalResumePhase: undefined,
      overtimeNoticeTicks: RESUME_COUNTDOWN_TICKS,
    };
  }
  return {
    ...resetForNextRound(state),
    match: { ...state.match, phase: goalResumePhase },
    goalPauseTicks: 0,
    goalResumePhase: undefined,
  };
}

function stepOvertimeNotice(state: StraightBenchState): StraightBenchState {
  if (state.overtimeNoticeTicks > 1) {
    return { ...state, overtimeNoticeTicks: state.overtimeNoticeTicks - 1 };
  }
  return {
    ...resetForNextRound(state),
    match: {
      ...state.match,
      phase: 'OVERTIME',
      ticksRemaining: OVERTIME_SECONDS * TICKS_PER_SECOND,
    },
    overtimeNoticeTicks: 0,
  };
}

function moveBullets(state: StraightBenchState): {
  readonly bullets: readonly BulletState[];
  readonly pucks: readonly PuckState[];
} {
  const pucks = state.pucks.map((puck) => ({ ...puck }));
  const bullets: BulletState[] = [];

  for (const bullet of state.bullets) {
    if (bullet.remainingTicks <= 0) continue;
    const nextPosition = add(bullet.position, scale(bullet.velocity, 1 / TICKS_PER_SECOND));
    let hitPuckIndex = -1;
    let hitTime = Number.POSITIVE_INFINITY;
    for (let index = 0; index < pucks.length; index += 1) {
      const puck = pucks[index];
      if (!puck || !puck.active) continue;
      const hit = sweptCircleAgainstCircle(bullet.position, nextPosition, bullet.radius, {
        center: puck.position,
        radius: puck.radius,
      });
      if (hit && hit.time < hitTime) {
        hitPuckIndex = index;
        hitTime = hit.time;
      }
    }

    const obstacleHit = earliestObstacleHit(state, bullet.position, nextPosition, bullet.radius);
    if (obstacleHit && obstacleHit.hit.time <= hitTime) {
      if (obstacleHit.kind === 'reflector' && bullet.reflections === 0) {
        const normal = outwardCollisionNormal(obstacleHit.normal, bullet.velocity);
        bullets.push({
          ...bullet,
          position: {
            x: obstacleHit.hit.point.x + normal.x * 0.1,
            y: obstacleHit.hit.point.y + normal.y * 0.1,
          },
          velocity: reflectVector(bullet.velocity, normal),
          remainingTicks: bullet.remainingTicks - 1,
          reflections: 1,
        });
      }
      continue;
    }

    if (hitPuckIndex >= 0) {
      const puck = pucks[hitPuckIndex];
      if (puck) {
        const direction = normalize(bullet.velocity, { x: 0, y: -1 });
        pucks[hitPuckIndex] = {
          ...puck,
          velocity: clampVectorMagnitude(
            add(puck.velocity, scale(direction, PUCK_HIT_IMPULSE)),
            MAX_PUCK_SPEED,
          ),
        };
      }
      continue;
    }

    if (
      nextPosition.x < -bullet.radius ||
      nextPosition.x > STRAIGHT_BENCH_WIDTH + bullet.radius ||
      nextPosition.y < -bullet.radius ||
      nextPosition.y > STRAIGHT_BENCH_HEIGHT + bullet.radius
    ) {
      continue;
    }
    bullets.push({
      ...bullet,
      position: nextPosition,
      remainingTicks: bullet.remainingTicks - 1,
    });
  }

  return { bullets, pucks };
}

interface ObstacleHit {
  readonly hit: SweepHit;
  readonly kind: 'solid' | 'reflector';
  readonly normal: Point;
}

function earliestObstacleHit(
  state: StraightBenchState,
  start: Point,
  end: Point,
  movingRadius: number,
): ObstacleHit | null {
  const hits: ObstacleHit[] = [];
  const board = boardFor(state);
  for (const box of board.staticBoxes) {
    const hit = sweptCircleAgainstAabb(start, end, movingRadius, box);
    if (hit) hits.push({ hit, kind: 'solid', normal: { x: 0, y: -1 } });
  }
  for (const circle of board.staticCircles) {
    const hit = sweptCircleAgainstCircle(start, end, movingRadius, circle);
    if (hit) hits.push({ hit, kind: 'solid', normal: { x: 0, y: -1 } });
  }
  for (const segment of board.staticSegments) {
    const hit = sweptCircleAgainstSegment(start, end, movingRadius, segment);
    if (hit) hits.push({ hit, kind: 'reflector', normal: segmentNormal(segment) });
  }
  return hits.reduce<ObstacleHit | null>(
    (earliest, candidate) =>
      earliest === null || candidate.hit.time < earliest.hit.time ? candidate : earliest,
    null,
  );
}

function boxNormalAtHit(hit: SweepHit, box: Aabb, radius: number): Point {
  const expanded = {
    left: box.minX - radius,
    right: box.maxX + radius,
    top: box.minY - radius,
    bottom: box.maxY + radius,
  };
  const candidates = [
    { distance: Math.abs(hit.point.x - expanded.left), normal: { x: -1, y: 0 } },
    { distance: Math.abs(hit.point.x - expanded.right), normal: { x: 1, y: 0 } },
    { distance: Math.abs(hit.point.y - expanded.top), normal: { x: 0, y: -1 } },
    { distance: Math.abs(hit.point.y - expanded.bottom), normal: { x: 0, y: 1 } },
  ];
  return candidates.reduce((best, candidate) =>
    candidate.distance < best.distance ? candidate : best,
  ).normal;
}

function segmentNormal(segment: Segment): Point {
  const dx = segment.end.x - segment.start.x;
  const dy = segment.end.y - segment.start.y;
  const length = Math.hypot(dx, dy);
  if (length <= Number.EPSILON) return { x: 0, y: -1 };
  return { x: -dy / length, y: dx / length };
}

function outwardCollisionNormal(normal: Point, velocity: Point): Point {
  const dot = velocity.x * normal.x + velocity.y * normal.y;
  return dot > 0 ? { x: -normal.x, y: -normal.y } : normal;
}

function bounceFromObstacles(
  state: StraightBenchState,
  start: Point,
  end: Point,
  velocity: Point,
  radius: number,
): { readonly position: Point; readonly velocity: Point } {
  let earliest: { readonly hit: SweepHit; readonly normal: Point } | null = null;
  for (const box of boardFor(state).staticBoxes) {
    const hit = sweptCircleAgainstAabb(start, end, radius, box);
    if (hit && (earliest === null || hit.time < earliest.hit.time)) {
      earliest = { hit, normal: boxNormalAtHit(hit, box, radius) };
    }
  }
  for (const circle of boardFor(state).staticCircles) {
    const hit = sweptCircleAgainstCircle(start, end, radius, circle);
    if (hit && (earliest === null || hit.time < earliest.hit.time)) {
      earliest = {
        hit,
        normal: normalize(
          { x: hit.point.x - circle.center.x, y: hit.point.y - circle.center.y },
          { x: 0, y: -1 },
        ),
      };
    }
  }
  for (const segment of boardFor(state).staticSegments) {
    const hit = sweptCircleAgainstSegment(start, end, radius, segment);
    if (hit && (earliest === null || hit.time < earliest.hit.time)) {
      earliest = { hit, normal: segmentNormal(segment) };
    }
  }
  if (!earliest) return { position: end, velocity };

  const normal = outwardCollisionNormal(earliest.normal, velocity);

  return {
    position: {
      x: earliest.hit.point.x + normal.x * 0.1,
      y: earliest.hit.point.y + normal.y * 0.1,
    },
    velocity: reflectVector(velocity, normal),
  };
}

function movePucks(state: StraightBenchState): {
  readonly pucks: readonly PuckState[];
  readonly goals: readonly Team[];
} {
  const pucks = state.pucks;
  const nextPucks: PuckState[] = [];
  const goals: Team[] = [];

  for (const puck of pucks) {
    if (!puck.active) {
      nextPucks.push(puck);
      continue;
    }
    const start = puck.position;
    const velocity = clampVectorMagnitude(puck.velocity, MAX_PUCK_SPEED);
    const end = add(start, scale(velocity, 1 / TICKS_PER_SECOND));
    const goal = crossedGoal(state, start, end, puck.radius);
    if (goal) {
      goals.push(goal);
      nextPucks.push({ ...puck, active: false, position: end, velocity: { x: 0, y: 0 } });
      continue;
    }
    const obstacleBounce = bounceFromObstacles(state, start, end, velocity, puck.radius);
    const bounced = bounceInsideBoard(
      state,
      obstacleBounce.position,
      obstacleBounce.velocity,
      puck.radius,
    );
    nextPucks.push({
      ...puck,
      position: bounced.position,
      velocity: dampVelocity(bounced.velocity),
    });
  }

  return { pucks: nextPucks, goals };
}

function stepPlaying(state: StraightBenchState): StraightBenchState {
  const cooldownTicks = Math.max(0, state.cooldownTicks - 1);
  const cpuCooldownTicks = Math.max(0, state.cpuCooldownTicks - 1);
  const cpuThinkTicks = Math.max(0, state.cpuThinkTicks - 1);
  const clockedMatch = advanceClock(state.match, 1);
  const preparedState: StraightBenchState = {
    ...state,
    cooldownTicks,
    cpuCooldownTicks,
    cpuThinkTicks,
  };
  const cpuReadyState =
    isActivePhase(clockedMatch.phase) && cpuCooldownTicks === 0 && cpuThinkTicks === 0
      ? fireCpuShot(preparedState, chooseCpuTarget(preparedState))
      : preparedState;
  const movedBullets = moveBullets(cpuReadyState);
  const movedPucks = movePucks({ ...cpuReadyState, pucks: movedBullets.pucks });
  const movedState: StraightBenchState = {
    ...cpuReadyState,
    match: state.match,
    bullets: movedBullets.bullets,
    pucks: movedPucks.pucks,
  };
  const scoredState = applyPhysicalGoals(movedState, movedPucks.goals, clockedMatch);
  if (movedPucks.goals.length > 0) return scoredState;
  if (clockedMatch.phase === 'RESULT') return { ...scoredState, bullets: [] };
  if (clockedMatch.phase === 'OVERTIME_NOTICE') {
    return { ...scoredState, bullets: [], overtimeNoticeTicks: RESUME_COUNTDOWN_TICKS };
  }
  return scoredState;
}

function stepOne(state: StraightBenchState): StraightBenchState {
  if (state.invalidReason || state.match.phase === 'INVALID' || state.match.phase === 'RESULT') {
    return state;
  }
  if (state.match.phase === 'GOAL_PAUSE') return stepGoalPause(state);
  if (state.match.phase === 'OVERTIME_NOTICE') return stepOvertimeNotice(state);
  if (!isActivePhase(state.match.phase)) return state;
  return stepPlaying(state);
}

export function createStraightBenchState(
  seed = 1,
  durationSeconds = MATCH_SECONDS,
  difficulty: CpuDifficulty = 'practice',
  board: PlayableBoardId = 'straight-bench',
): StraightBenchState {
  const definition = getBoardDefinition(board);
  return {
    durationSeconds,
    board,
    difficulty,
    match: createMatchState(seed, durationSeconds),
    pucks: definition.initialPucks.map((puck, index) => ({
      id: index + 1,
      position: puck.center,
      velocity: { x: 0, y: 0 },
      radius: puck.radius,
      active: true,
    })),
    bullets: [],
    cooldownTicks: 0,
    cpuCooldownTicks: 0,
    cpuThinkTicks: cpuReactionTicks(difficulty),
    goalPauseTicks: 0,
    overtimeNoticeTicks: 0,
    nextBulletId: 1,
  };
}

function fireShot(state: StraightBenchState, owner: Team, target: Point): StraightBenchState {
  const cooldownTicks = owner === 'player' ? state.cooldownTicks : state.cpuCooldownTicks;
  if (!isActivePhase(state.match.phase) || cooldownTicks > 0) return state;
  if (!Number.isFinite(target.x) || !Number.isFinite(target.y)) return state;

  const turret = owner === 'player' ? PLAYER_TURRET : CPU_TURRET;
  const direction = normalize(
    { x: target.x - turret.x, y: target.y - turret.y },
    owner === 'player' ? { x: 0, y: -1 } : { x: 0, y: 1 },
  );
  const bullet: BulletState = {
    id: state.nextBulletId,
    owner,
    position: turret,
    velocity: scale(direction, BULLET_SPEED),
    radius: BULLET_RADIUS,
    remainingTicks: BULLET_LIFETIME_TICKS,
    reflections: 0,
  };
  return {
    ...state,
    bullets: [...state.bullets, bullet],
    ...(owner === 'player'
      ? { cooldownTicks: SHOT_COOLDOWN_TICKS }
      : {
          cpuCooldownTicks: SHOT_COOLDOWN_TICKS,
          cpuThinkTicks: cpuReactionTicks(state.difficulty),
        }),
    nextBulletId: state.nextBulletId + 1,
  };
}

function chooseCpuTarget(state: StraightBenchState): Point {
  const puck = state.pucks.find((candidate) => candidate.active);
  if (!puck) return { x: STRAIGHT_BENCH_WIDTH / 2, y: STRAIGHT_BENCH_HEIGHT / 2 };

  const leadSeconds = cpuAimLeadTicks(state.difficulty) / TICKS_PER_SECOND;
  const predicted = add(puck.position, scale(puck.velocity, leadSeconds));
  const clamped = {
    x: clamp(predicted.x, puck.radius, STRAIGHT_BENCH_WIDTH - puck.radius),
    y: clamp(predicted.y, puck.radius, STRAIGHT_BENCH_HEIGHT - puck.radius),
  };
  const distance = Math.max(
    1,
    magnitude({ x: clamped.x - CPU_TURRET.x, y: clamped.y - CPU_TURRET.y }),
  );
  const direction = rotate(
    normalize({ x: clamped.x - CPU_TURRET.x, y: clamped.y - CPU_TURRET.y }, { x: 0, y: 1 }),
    cpuAimErrorRadians(state),
  );
  return {
    x: CPU_TURRET.x + direction.x * distance,
    y: CPU_TURRET.y + direction.y * distance,
  };
}

export function firePlayerShot(state: StraightBenchState, target: Point): StraightBenchState {
  return fireShot(state, 'player', target);
}

export function fireCpuShot(state: StraightBenchState, target: Point): StraightBenchState {
  if (state.cpuThinkTicks > 0) return state;
  return fireShot(state, 'cpu', target);
}

export function getPlayerTurretReadiness(state: StraightBenchState): TurretReadiness {
  if (!isActivePhase(state.match.phase)) return 'stopped';
  return state.cooldownTicks === 0 ? 'ready' : 'charging';
}

export function getCpuTurretReadiness(state: StraightBenchState): TurretReadiness {
  if (!isActivePhase(state.match.phase)) return 'stopped';
  if (state.cpuCooldownTicks > 0) return 'charging';
  return state.cpuThinkTicks === 0 ? 'ready' : 'thinking';
}

export function createStraightBenchRematch(state: StraightBenchState): StraightBenchState {
  if (state.match.phase !== 'RESULT') return state;
  return createStraightBenchState(
    state.match.seed + 1,
    state.durationSeconds,
    state.difficulty,
    state.board,
  );
}

export function stepStraightBench(state: StraightBenchState, ticks = 1): StraightBenchState {
  if (!Number.isSafeInteger(ticks) || ticks < 0) {
    throw new Error('ストレート・ベンチの固定更新数は0以上の安全な整数で指定してください');
  }
  let next = state;
  for (let index = 0; index < ticks; index += 1) {
    next = stepOne(next);
  }
  return next;
}

export function getPlayerTurret(): Point {
  return PLAYER_TURRET;
}

export function getCpuTurret(): Point {
  return CPU_TURRET;
}

export function secondsRemaining(state: StraightBenchState): number {
  return state.match.ticksRemaining / TICKS_PER_SECOND;
}

export function matchDurationTicks(): number {
  return MATCH_SECONDS * TICKS_PER_SECOND;
}
