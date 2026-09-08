import { getBoardDefinition, STRAIGHT_BENCH, type PlayableBoardId } from '../config/boards';
import {
  MATCH_SECONDS,
  OVERTIME_SECONDS,
  TICKS_PER_SECOND,
  advanceClock,
  applyGoals,
  advanceResumeCountdown,
  beginResume,
  createMatchState,
  invalidateMatch,
  suspendMatch,
  type GoalEvent,
  type MatchPhase,
  type MatchState,
  type SuspensionReason,
} from '../domain/match';
import type { Circle, Point, Team } from '../domain/types';
import { createBoardGeometry, type BoardGeometry } from '../physics/boardGeometry';
import { clampVectorMagnitude } from '../physics/geometry';
import { stepPhysics } from '../physics/stepPhysics';

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
export const CORE_NOTICE_SECONDS = 17;
export const CORE_ACTIVE_SECONDS = 15;
export const CORE_RESERVATION_TICKS = 2 * TICKS_PER_SECOND;
export const NO_SCORE_NOTICE_SECONDS = 11;
export const NO_SCORE_EXPANSION_SECONDS = 12;
export const NO_SCORE_PULSE_SECONDS = 20;
export const NO_SCORE_PULSE_INTERVAL_SECONDS = 10;
export const NO_SCORE_PULSE_SPEED = 160;
export const NO_SCORE_PULSE_DURATION_TICKS = Math.round(0.35 * TICKS_PER_SECOND);
export const GOAL_EXPANSION_RATIO = 0.12;
export const OVERTIME_GOAL_EXPANSION_RATIO = 0.2;
export type CpuDifficulty = 'practice' | 'normal';

export const PRACTICE_CPU_REACTION_TICKS = Math.round(0.48 * TICKS_PER_SECOND);
export const NORMAL_CPU_REACTION_TICKS = Math.round(0.28 * TICKS_PER_SECOND);
export const CPU_REACTION_TICKS = PRACTICE_CPU_REACTION_TICKS;
export const PRACTICE_CPU_AIM_LEAD_TICKS = 0;
export const NORMAL_CPU_AIM_LEAD_TICKS = Math.round(0.18 * TICKS_PER_SECOND);
export const CPU_AIM_LEAD_TICKS = NORMAL_CPU_AIM_LEAD_TICKS;

const PLAYER_TURRET: Point = { x: STRAIGHT_BENCH_WIDTH / 2, y: 580 };
const CPU_TURRET: Point = { x: STRAIGHT_BENCH_WIDTH / 2, y: 60 };
const CORE_RADIUS = PUCK_RADIUS;

export type CorePhase = 'INACTIVE' | 'RESERVED' | 'ACTIVE';

export interface CoreState {
  readonly phase: CorePhase;
  readonly position: Point | null;
  readonly candidateIndex: number | null;
}

export interface NoScoreState {
  readonly ticksSinceGoal: number;
  readonly goalExpanded: boolean;
  readonly nextPulseTicks: number;
  readonly pulseTicksRemaining: number;
}

export interface PuckState {
  readonly id: number;
  readonly position: Point;
  readonly velocity: Point;
  readonly radius: number;
  readonly active: boolean;
  readonly points?: 1 | 2;
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
  readonly core: CoreState;
  readonly noScore: NoScoreState;
  readonly bullets: readonly BulletState[];
  readonly cooldownTicks: number;
  readonly cpuCooldownTicks: number;
  readonly cpuThinkTicks: number;
  readonly goalPauseTicks: number;
  readonly goalResumePhase?: GoalResumePhase;
  readonly overtimeNoticeTicks: number;
  readonly nextBulletId: number;
  /** 中断・再開中も、現在見えていたゴール幅を保持する。 */
  readonly goalExpansionRatio?: number;
  readonly goalSnapshot?: {
    readonly pucks: readonly PuckState[];
    readonly bullets: readonly BulletState[];
    readonly expansionRatio: number;
  };
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

function inactiveCore(): CoreState {
  return { phase: 'INACTIVE', position: null, candidateIndex: null };
}

function resetNoScoreState(): NoScoreState {
  return {
    ticksSinceGoal: 0,
    goalExpanded: false,
    nextPulseTicks: NO_SCORE_PULSE_SECONDS * TICKS_PER_SECOND,
    pulseTicksRemaining: 0,
  };
}

function expansionRatioFor(state: StraightBenchState): number {
  if (state.match.phase === 'GOAL_PAUSE' && state.goalSnapshot) {
    return state.goalSnapshot.expansionRatio;
  }
  if (state.match.phase === 'OVERTIME') return OVERTIME_GOAL_EXPANSION_RATIO;
  if (state.goalExpansionRatio !== undefined) return state.goalExpansionRatio;
  return state.noScore.goalExpanded ? GOAL_EXPANSION_RATIO : 0;
}

export function getStraightBenchGeometry(state: StraightBenchState): BoardGeometry {
  return createBoardGeometry(boardFor(state), expansionRatioFor(state));
}

export function getGoalOpeningBounds(
  state: StraightBenchState,
  side: 'top' | 'bottom',
): { readonly minX: number; readonly maxX: number } {
  const goal = getStraightBenchGeometry(state).goals.find((candidate) => candidate.side === side);
  if (!goal) return { minX: 0, maxX: 0 };
  return { minX: goal.openingMinX, maxX: goal.openingMaxX };
}

function advanceNoScorePressure(state: StraightBenchState): {
  readonly state: StraightBenchState;
  readonly pulse: boolean;
} {
  // Count the final PLAYING tick as part of the no-score window.  A goal can
  // still be detected during this tick (including a goal on the time limit),
  // and its snapshot must retain the expansion that was active at contact.
  if (state.match.phase !== 'PLAYING') {
    return {
      state: {
        ...state,
        noScore: resetNoScoreState(),
      },
      pulse: false,
    };
  }

  const ticksSinceGoal = state.noScore.ticksSinceGoal + 1;
  const nextPulseTicks = Math.max(0, state.noScore.nextPulseTicks - 1);
  const pulse = ticksSinceGoal >= NO_SCORE_PULSE_SECONDS * TICKS_PER_SECOND && nextPulseTicks === 0;
  return {
    state: {
      ...state,
      noScore: {
        ticksSinceGoal,
        goalExpanded: ticksSinceGoal >= NO_SCORE_EXPANSION_SECONDS * TICKS_PER_SECOND,
        nextPulseTicks: pulse ? NO_SCORE_PULSE_INTERVAL_SECONDS * TICKS_PER_SECOND : nextPulseTicks,
        pulseTicksRemaining: pulse
          ? NO_SCORE_PULSE_DURATION_TICKS
          : Math.max(0, state.noScore.pulseTicksRemaining - 1),
      },
    },
    pulse,
  };
}

function applyNoScorePulse(state: StraightBenchState): StraightBenchState {
  const center = { x: STRAIGHT_BENCH_WIDTH / 2, y: STRAIGHT_BENCH_HEIGHT / 2 };
  return {
    ...state,
    pucks: state.pucks.map((puck) => {
      if (!puck.active) return puck;
      const fallback = puck.id % 2 === 0 ? { x: 1, y: 0 } : { x: -1, y: 0 };
      const direction = normalize(
        { x: center.x - puck.position.x, y: center.y - puck.position.y },
        fallback,
      );
      return {
        ...puck,
        velocity: clampVectorMagnitude(
          add(puck.velocity, scale(direction, NO_SCORE_PULSE_SPEED)),
          MAX_PUCK_SPEED,
        ),
      };
    }),
  };
}

function coreReservationCircle(state: StraightBenchState): Circle | null {
  if (state.core.phase !== 'RESERVED' || !state.core.position) return null;
  return { center: state.core.position, radius: CORE_RADIUS };
}

function candidateIsClear(state: StraightBenchState, candidate: Point): boolean {
  return state.pucks.every((puck) => {
    if (!puck.active) return true;
    const minimumDistance = puck.radius + CORE_RADIUS;
    return (
      (candidate.x - puck.position.x) ** 2 + (candidate.y - puck.position.y) ** 2 >=
      minimumDistance ** 2
    );
  });
}

function chooseCoreCandidate(
  state: StraightBenchState,
): { readonly index: number; readonly position: Point } | null {
  const candidates = boardFor(state)
    .coreCandidates.map((position, index) => ({ position, index }))
    .filter(({ position }) => candidateIsClear(state, position));
  if (candidates.length === 0) return null;
  const selected = candidates[Math.abs(state.match.seed) % candidates.length];
  return selected ?? null;
}

function coreBirthPosition(state: StraightBenchState): Point | null {
  const candidateIndex = state.core.candidateIndex;
  if (candidateIndex === null) return null;
  return boardFor(state).coreCandidates[candidateIndex] ?? null;
}

function coreRoundResetFor(state: StraightBenchState): readonly Circle[] | null {
  const candidateIndex = state.core.candidateIndex;
  if (candidateIndex === null) return null;
  const variants = boardFor(state).coreRoundResets.filter(
    (reset) => reset.candidateIndex === candidateIndex,
  );
  if (variants.length === 0) return null;
  const selected = variants[Math.abs(state.match.seed) % variants.length];
  return selected?.normalPucks ?? null;
}

function startsCoreReservation(state: StraightBenchState, nextMatch: MatchState): boolean {
  const noticeTicks = CORE_NOTICE_SECONDS * TICKS_PER_SECOND;
  const activeTicks = CORE_ACTIVE_SECONDS * TICKS_PER_SECOND;
  return (
    state.core.phase === 'INACTIVE' &&
    state.match.ticksRemaining > noticeTicks &&
    nextMatch.ticksRemaining <= noticeTicks &&
    nextMatch.ticksRemaining > activeTicks
  );
}

function prepareCoreReservation(
  state: StraightBenchState,
  nextMatch: MatchState,
): StraightBenchState {
  if (!startsCoreReservation(state, nextMatch)) return state;
  const candidate = chooseCoreCandidate(state);
  if (!candidate) return state;
  return {
    ...state,
    core: {
      phase: 'RESERVED',
      position: candidate.position,
      candidateIndex: candidate.index,
    },
  };
}

function addCorePuck(state: StraightBenchState): readonly PuckState[] {
  if (state.core.phase !== 'ACTIVE' || !state.core.position) return state.pucks;
  if (state.pucks.some((puck) => puck.points === 2)) return state.pucks;
  return [
    ...state.pucks,
    {
      id: Math.max(0, ...state.pucks.map((puck) => puck.id)) + 1,
      position: state.core.position,
      velocity: { x: 0, y: 0 },
      radius: CORE_RADIUS,
      active: true,
      points: 2,
    },
  ];
}

function activateCoreIfDue(state: StraightBenchState, nextMatch: MatchState): StraightBenchState {
  const activeTicks = CORE_ACTIVE_SECONDS * TICKS_PER_SECOND;
  if (
    state.core.phase !== 'RESERVED' ||
    nextMatch.ticksRemaining > activeTicks ||
    nextMatch.phase === 'RESULT' ||
    nextMatch.phase === 'OVERTIME_NOTICE'
  ) {
    return state;
  }
  const activeState: StraightBenchState = {
    ...state,
    core: { ...state.core, phase: 'ACTIVE' },
  };
  return { ...activeState, pucks: addCorePuck(activeState) };
}

function syncActiveCorePosition(state: StraightBenchState): StraightBenchState {
  if (state.core.phase !== 'ACTIVE') return state;
  const corePuck = state.pucks.find((puck) => puck.points === 2 && puck.active);
  if (!corePuck) return state;
  return { ...state, core: { ...state.core, position: corePuck.position } };
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
    points: 1,
  };
}

function resetPucksForRound(state: StraightBenchState): readonly PuckState[] {
  const normalReset =
    state.core.phase === 'RESERVED' || state.core.phase === 'ACTIVE'
      ? coreRoundResetFor(state)
      : null;
  const basePucks = (normalReset ?? boardFor(state).initialPucks).map((template, index) => ({
    ...resetPuck(state, index + 1),
    position: template.center,
    radius: template.radius,
  }));
  const corePosition = state.core.phase === 'ACTIVE' ? coreBirthPosition(state) : null;
  return state.core.phase === 'ACTIVE' && corePosition
    ? [
        ...basePucks,
        {
          id: basePucks.length + 1,
          position: corePosition,
          velocity: { x: 0, y: 0 },
          radius: CORE_RADIUS,
          active: true,
          points: 2 as const,
        },
      ]
    : basePucks;
}

function resetForNextRound(state: StraightBenchState): StraightBenchState {
  const corePosition =
    state.core.phase === 'ACTIVE' ? coreBirthPosition(state) : state.core.position;
  const roundState =
    state.core.phase === 'ACTIVE' && corePosition
      ? { ...state, core: { ...state.core, position: corePosition } }
      : state;
  return {
    ...roundState,
    pucks: resetPucksForRound(roundState),
    bullets: [],
    cooldownTicks: SHOT_COOLDOWN_TICKS,
    cpuCooldownTicks: SHOT_COOLDOWN_TICKS,
    cpuThinkTicks: cpuReactionTicks(state.difficulty),
    goalSnapshot: undefined,
    goalExpansionRatio: undefined,
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
  goals: readonly GoalEvent[],
  clockedMatch: MatchState,
): StraightBenchState {
  if (goals.length === 0) {
    return { ...state, match: clockedMatch };
  }

  const scored = applyGoals(state.match, goals);
  const goalResumePhase = goalResumePhaseFor(state.match, scored, clockedMatch);
  const match: MatchState = {
    ...scored,
    tick: clockedMatch.tick,
    ticksRemaining: clockedMatch.ticksRemaining,
    phase: 'GOAL_PAUSE',
  };
  const goalPuckIds = new Set(
    goals.map((goal) => goal.puckId).filter((id): id is number => Number.isSafeInteger(id)),
  );
  const snapshotPucks = state.pucks.map((puck) =>
    goalPuckIds.has(puck.id) ? { ...puck, active: true, velocity: { x: 0, y: 0 } } : { ...puck },
  );
  return {
    ...state,
    match,
    noScore: resetNoScoreState(),
    pucks: state.pucks,
    bullets: state.bullets,
    goalSnapshot: {
      pucks: snapshotPucks,
      bullets: state.bullets.map((bullet) => ({ ...bullet })),
      expansionRatio: expansionRatioFor(state),
    },
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
  const overtimeState = {
    ...state,
    core: inactiveCore(),
    noScore: resetNoScoreState(),
  };
  return {
    ...resetForNextRound(overtimeState),
    match: {
      ...state.match,
      phase: 'OVERTIME',
      ticksRemaining: OVERTIME_SECONDS * TICKS_PER_SECOND,
    },
    overtimeNoticeTicks: 0,
  };
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
  const pressure = advanceNoScorePressure(preparedState);
  const pressuredState = pressure.pulse ? applyNoScorePulse(pressure.state) : pressure.state;
  const corePreparedState = prepareCoreReservation(pressuredState, clockedMatch);
  const cpuReadyState =
    isActivePhase(clockedMatch.phase) && cpuCooldownTicks === 0 && cpuThinkTicks === 0
      ? fireCpuShot(corePreparedState, chooseCpuTarget(corePreparedState))
      : corePreparedState;
  const physics = stepPhysics({
    board: boardFor(cpuReadyState),
    geometry: getStraightBenchGeometry(cpuReadyState),
    pucks: cpuReadyState.pucks,
    bullets: cpuReadyState.bullets,
    reservation: coreReservationCircle(cpuReadyState),
    dtSeconds: 1 / FIXED_HZ,
    puckSpeedLimit: MAX_PUCK_SPEED,
    puckDecelerationPerSecond: PUCK_DECELERATION_PER_SECOND,
  });
  if (physics.invalidReason) return invalidateStraightBench(cpuReadyState, physics.invalidReason);
  const movedState: StraightBenchState = {
    ...cpuReadyState,
    match: state.match,
    bullets: physics.bullets,
    pucks: physics.pucks,
  };
  const scoredState = applyPhysicalGoals(
    syncActiveCorePosition(movedState),
    physics.goals,
    clockedMatch,
  );
  const activatedState = activateCoreIfDue(scoredState, clockedMatch);
  if (physics.goals.length > 0) return activatedState;
  if (clockedMatch.phase === 'RESULT') return { ...activatedState, bullets: [] };
  if (clockedMatch.phase === 'OVERTIME_NOTICE') {
    return { ...activatedState, bullets: [], overtimeNoticeTicks: RESUME_COUNTDOWN_TICKS };
  }
  return activatedState;
}

function stepOne(state: StraightBenchState): StraightBenchState {
  if (state.invalidReason || state.match.phase === 'INVALID' || state.match.phase === 'RESULT') {
    return state;
  }
  if (state.match.phase === 'COUNTDOWN') {
    return { ...state, match: advanceResumeCountdown(state.match, 1) };
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
    core: inactiveCore(),
    noScore: resetNoScoreState(),
    pucks: definition.initialPucks.map((puck, index) => ({
      id: index + 1,
      position: puck.center,
      velocity: { x: 0, y: 0 },
      radius: puck.radius,
      active: true,
      points: 1,
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

export function suspendStraightBench(
  state: StraightBenchState,
  reason: SuspensionReason = 'manual',
): StraightBenchState {
  const match = suspendMatch(state.match, reason);
  return match === state.match
    ? state
    : { ...state, match, goalExpansionRatio: expansionRatioFor(state) };
}

export function beginStraightBenchResume(state: StraightBenchState): StraightBenchState {
  const match = beginResume(state.match);
  return match === state.match ? state : { ...state, match };
}

export function invalidateStraightBench(
  state: StraightBenchState,
  reason: string,
): StraightBenchState {
  const match = invalidateMatch(state.match, reason);
  if (match === state.match) return state;
  return {
    ...state,
    match,
    bullets: [],
    invalidReason: reason,
  };
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
