export const FIXED_STEP_HZ = 120;
export const MAX_FIXED_STEPS_PER_FRAME = 8;
export const MAX_PENDING_FIXED_TICKS = 30;
export const BACKLOG_TOLERANCE_TICKS = 2;
export const MAX_SUSTAINED_BACKLOG_FRAMES = 30;
export const MAX_ACCUMULATED_DELTA_MS = 1_000;

const TICK_EPSILON = 1e-9;

export interface FixedStepClockState {
  readonly accumulatorSeconds: number;
  readonly backlogFrames: number;
}

export interface FixedStepAdvance {
  readonly state: FixedStepClockState;
  readonly steps: number;
  /**
   * This is the number of fixed ticks waiting after this frame's permitted steps.
   * When shouldSuspend is true, the clock state has already discarded the remainder.
   */
  readonly pendingTicks: number;
  readonly shouldSuspend: boolean;
}

export function createFixedStepClockState(): FixedStepClockState {
  return { accumulatorSeconds: 0, backlogFrames: 0 };
}

function safeDeltaMilliseconds(deltaMilliseconds: number): number {
  if (Number.isNaN(deltaMilliseconds)) return 0;
  if (deltaMilliseconds === Number.POSITIVE_INFINITY) return MAX_ACCUMULATED_DELTA_MS;
  return Math.min(Math.max(deltaMilliseconds, 0), MAX_ACCUMULATED_DELTA_MS);
}

function pendingTicksFor(accumulatorSeconds: number, fixedSeconds: number): number {
  return Math.max(0, Math.floor(accumulatorSeconds / fixedSeconds + TICK_EPSILON));
}

export function advanceFixedStepClock(
  state: FixedStepClockState,
  deltaMilliseconds: number,
  fixedHz = FIXED_STEP_HZ,
): FixedStepAdvance {
  if (!Number.isFinite(fixedHz) || fixedHz <= 0) {
    throw new Error('固定更新の周波数は正の有限値で指定してください');
  }

  const fixedSeconds = 1 / fixedHz;
  const totalSeconds =
    Math.max(0, state.accumulatorSeconds) + safeDeltaMilliseconds(deltaMilliseconds) / 1000;
  const pendingBeforeSteps = pendingTicksFor(totalSeconds, fixedSeconds);
  if (pendingBeforeSteps >= MAX_PENDING_FIXED_TICKS) {
    return {
      state: createFixedStepClockState(),
      steps: 0,
      pendingTicks: pendingBeforeSteps,
      shouldSuspend: true,
    };
  }

  const steps = Math.min(pendingBeforeSteps, MAX_FIXED_STEPS_PER_FRAME);
  const accumulatorSeconds = totalSeconds - steps * fixedSeconds;
  const pendingTicks = pendingTicksFor(accumulatorSeconds, fixedSeconds);
  const backlogFrames = pendingTicks > BACKLOG_TOLERANCE_TICKS ? state.backlogFrames + 1 : 0;
  if (backlogFrames >= MAX_SUSTAINED_BACKLOG_FRAMES) {
    return {
      state: createFixedStepClockState(),
      steps: 0,
      pendingTicks,
      shouldSuspend: true,
    };
  }

  return {
    state: { accumulatorSeconds, backlogFrames },
    steps,
    pendingTicks,
    shouldSuspend: false,
  };
}
