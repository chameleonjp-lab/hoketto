import type { Team } from './types';

export const TICKS_PER_SECOND = 120;
export const MATCH_SECONDS = 90;
export const OVERTIME_SECONDS = 15;

export type MatchPhase =
  | 'COUNTDOWN'
  | 'PLAYING'
  | 'GOAL_PAUSE'
  | 'OVERTIME_NOTICE'
  | 'OVERTIME'
  | 'RESULT'
  | 'SUSPENDED'
  | 'INVALID';

export interface MatchState {
  readonly phase: MatchPhase;
  readonly seed: number;
  readonly tick: number;
  readonly ticksRemaining: number;
  readonly playerScore: number;
  readonly cpuScore: number;
  readonly lastGoalPoints: number;
}

export interface GoalEvent {
  readonly team: Team;
  readonly points: 1 | 2;
}

export function createMatchState(seed: number): MatchState {
  if (!Number.isSafeInteger(seed)) {
    throw new Error('試合の乱数種は安全な整数で指定してください');
  }
  return {
    phase: 'PLAYING',
    seed,
    tick: 0,
    ticksRemaining: MATCH_SECONDS * TICKS_PER_SECOND,
    playerScore: 0,
    cpuScore: 0,
    lastGoalPoints: 0,
  };
}

export function applyGoals(state: MatchState, goals: readonly GoalEvent[]): MatchState {
  if (state.phase !== 'PLAYING' && state.phase !== 'OVERTIME') {
    return state;
  }

  let playerScore = state.playerScore;
  let cpuScore = state.cpuScore;
  let lastGoalPoints = 0;
  for (const goal of goals) {
    lastGoalPoints = Math.max(lastGoalPoints, goal.points);
    if (goal.team === 'player') playerScore += goal.points;
    if (goal.team === 'cpu') cpuScore += goal.points;
  }

  return {
    ...state,
    playerScore,
    cpuScore,
    lastGoalPoints,
    phase: goals.length > 0 ? 'GOAL_PAUSE' : state.phase,
  };
}

export function advanceClock(state: MatchState, ticks: number): MatchState {
  if (!Number.isSafeInteger(ticks) || ticks < 0) {
    throw new Error('進める固定更新数は0以上の安全な整数で指定してください');
  }
  if (state.phase !== 'PLAYING' && state.phase !== 'OVERTIME') {
    return state;
  }

  const nextRemaining = Math.max(0, state.ticksRemaining - ticks);
  if (nextRemaining > 0) {
    return { ...state, tick: state.tick + ticks, ticksRemaining: nextRemaining };
  }

  const nextPhase =
    state.phase === 'OVERTIME'
      ? 'RESULT'
      : state.playerScore === state.cpuScore
        ? 'OVERTIME_NOTICE'
        : 'RESULT';
  return { ...state, tick: state.tick + state.ticksRemaining, ticksRemaining: 0, phase: nextPhase };
}
