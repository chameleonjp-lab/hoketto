import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// H10〜H12の共通条件を、物理監査とは別の診断として測る。
// 勝率を自動で合格扱いにはせず、盤面・難易度・操作方針ごとの傾向を記録する。
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const compiled = mkdtempSync(join(tmpdir(), 'hoketto-gameplay-'));
const require = createRequire(import.meta.url);

const parsePositiveInteger = (value, fallback) => {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
};

const requestedSeeds = parsePositiveInteger(process.env.HOKETTO_GAMEPLAY_SEEDS, 30);
const maxTicks = parsePositiveInteger(process.env.HOKETTO_GAMEPLAY_TICKS, 20_000);
const select = (name, fallback) => {
  const requested = process.env[name]
    ?.split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  return requested?.length ? requested : fallback;
};

const boards = select('HOKETTO_GAMEPLAY_BOARDS', ['straight-bench', 'twin-block', 'ricochet-lane']);
const difficulties = select('HOKETTO_GAMEPLAY_DIFFICULTIES', ['normal', 'practice']);
const modes = select('HOKETTO_GAMEPLAY_MODES', ['idle', 'center', 'fixed-left', 'track']);
const TICKS_PER_SECOND = 120;
const NO_SCORE_PULSE_SECONDS = 20;
const VALID_INPUT = { minX: 24, maxX: 336, minY: 24, maxY: 548 };

function targetFor(mode, state) {
  if (mode === 'idle') return null;
  if (mode === 'fixed-left') return { x: 140, y: 320 };
  if (mode === 'track') {
    return state.pucks.find((puck) => puck.active)?.position ?? { x: 180, y: 320 };
  }
  return { x: 180, y: 320 };
}

function isActivePhase(phase) {
  return phase === 'PLAYING' || phase === 'OVERTIME';
}

function isRoundResetPhase(phase) {
  return phase === 'PLAYING' || phase === 'OVERTIME' || phase === 'OVERTIME_NOTICE';
}

function incrementCounter(map, key) {
  map[key] = (map[key] ?? 0) + 1;
}

try {
  execFileSync(
    process.execPath,
    [
      join(root, 'node_modules/typescript/bin/tsc'),
      '--ignoreConfig',
      '--target',
      'ES2022',
      '--module',
      'commonjs',
      '--moduleResolution',
      'node',
      '--ignoreDeprecations',
      '6.0',
      '--skipLibCheck',
      '--strict',
      '--rootDir',
      'src',
      '--outDir',
      compiled,
      'src/game/straightBench.ts',
    ],
    { cwd: root, stdio: 'inherit' },
  );

  const {
    createStraightBenchState: create,
    stepStraightBench: step,
    firePlayerShot: fire,
  } = require(join(compiled, 'game/straightBench.js'));

  let failures = 0;
  let totalMatches = 0;
  const summary = {
    invalid: 0,
    tickLimit: 0,
    unsafeReadyReset: 0,
    unexpectedPuckCount: 0,
  };

  for (const board of boards) {
    for (const difficulty of difficulties) {
      for (const mode of modes) {
        totalMatches += requestedSeeds;
        let playerWins = 0;
        let cpuWins = 0;
        let draws = 0;
        let totalGoals = 0;
        let playerShots = 0;
        let cpuShots = 0;
        let coreActivations = 0;
        const coreCandidateCounts = [0, 0, 0];
        const decisionReasons = { defense: 0, attack: 0, fallback: 0 };
        let maxAimErrorDegrees = 0;
        let goalExpansions = 0;
        let pressurePulses = 0;
        let roundResets = 0;
        let maxNoScoreTicks = 0;
        let overTwentySecondStalls = 0;
        let maxConcurrentPucks = 0;
        let maxConcurrentBullets = 0;
        let unsafeReadyResets = 0;
        let unexpectedPucks = 0;
        let unexpectedPuckMatches = 0;
        let invalid = 0;
        let tickLimit = 0;

        for (let seed = 1; seed <= requestedSeeds; seed += 1) {
          let state = create(seed, 90, difficulty, board);
          let previousCorePhase = state.core.phase;
          let previousGoalExpanded = state.noScore.goalExpanded;
          let previousPulseTicks = state.noScore.pulseTicksRemaining;
          let maxStallForMatch = 0;
          let hadUnexpectedPucks = false;
          let hadUnsafeReadyReset = false;

          for (
            let tick = 0;
            tick < maxTicks && state.match.phase !== 'RESULT' && state.match.phase !== 'INVALID';
            tick += 1
          ) {
            const target = targetFor(mode, state);
            if (
              target &&
              state.cooldownTicks === 0 &&
              isActivePhase(state.match.phase) &&
              target.x >= VALID_INPUT.minX &&
              target.x <= VALID_INPUT.maxX &&
              target.y >= VALID_INPUT.minY &&
              target.y <= VALID_INPUT.maxY
            ) {
              state = fire(state, target);
              playerShots += 1;
            }

            const before = state;
            state = step(state);

            const newBullets = state.bullets.filter(
              (bullet) => !before.bullets.some((candidate) => candidate.id === bullet.id),
            );
            const newCpuShots = newBullets.filter((bullet) => bullet.owner === 'cpu');
            cpuShots += newCpuShots.length;
            if (newCpuShots.length > 0 && state.cpuLastDecision) {
              decisionReasons[state.cpuLastDecision.reason] += newCpuShots.length;
              maxAimErrorDegrees = Math.max(
                maxAimErrorDegrees,
                Math.abs((state.cpuLastDecision.aimErrorRadians * 180) / Math.PI),
              );
            }

            maxNoScoreTicks = Math.max(maxNoScoreTicks, state.noScore.ticksSinceGoal);
            maxStallForMatch = Math.max(maxStallForMatch, state.noScore.ticksSinceGoal);
            maxConcurrentPucks = Math.max(
              maxConcurrentPucks,
              state.pucks.filter((puck) => puck.active).length,
            );
            maxConcurrentBullets = Math.max(maxConcurrentBullets, state.bullets.length);

            if (state.pucks.filter((puck) => puck.active).length > 2) {
              hadUnexpectedPucks = true;
              unexpectedPucks += 1;
            }
            if (previousCorePhase !== 'ACTIVE' && state.core.phase === 'ACTIVE') {
              coreActivations += 1;
              if (state.core.candidateIndex !== null) {
                coreCandidateCounts[state.core.candidateIndex] =
                  (coreCandidateCounts[state.core.candidateIndex] ?? 0) + 1;
              }
            }
            if (!previousGoalExpanded && state.noScore.goalExpanded) {
              goalExpansions += 1;
            }
            if (previousPulseTicks === 0 && state.noScore.pulseTicksRemaining > 0) {
              pressurePulses += 1;
            }
            if (before.match.phase === 'GOAL_PAUSE' && isRoundResetPhase(state.match.phase)) {
              roundResets += 1;
              if (state.cooldownTicks !== 0 || state.cpuCooldownTicks !== 0) {
                hadUnsafeReadyReset = true;
                unsafeReadyResets += 1;
              }
            }

            previousCorePhase = state.core.phase;
            previousGoalExpanded = state.noScore.goalExpanded;
            previousPulseTicks = state.noScore.pulseTicksRemaining;
          }

          if (maxStallForMatch > NO_SCORE_PULSE_SECONDS * TICKS_PER_SECOND) {
            overTwentySecondStalls += 1;
          }
          if (state.match.phase === 'INVALID') {
            invalid += 1;
            incrementCounter(summary, 'invalid');
          } else if (state.match.phase !== 'RESULT') {
            tickLimit += 1;
            incrementCounter(summary, 'tickLimit');
          }
          if (hadUnsafeReadyReset) incrementCounter(summary, 'unsafeReadyReset');
          if (hadUnexpectedPucks) {
            unexpectedPuckMatches += 1;
            incrementCounter(summary, 'unexpectedPuckCount');
          }

          totalGoals += state.match.playerScore + state.match.cpuScore;
          if (state.match.playerScore > state.match.cpuScore) playerWins += 1;
          else if (state.match.playerScore < state.match.cpuScore) cpuWins += 1;
          else draws += 1;
        }

        failures += invalid + tickLimit + unsafeReadyResets + unexpectedPuckMatches;
        console.log(
          JSON.stringify({
            board,
            difficulty,
            mode,
            matches: requestedSeeds,
            playerWins,
            cpuWins,
            draws,
            playerWinRate: Number((playerWins / requestedSeeds).toFixed(3)),
            meanGoals: Number((totalGoals / requestedSeeds).toFixed(2)),
            playerShots,
            cpuShots,
            coreActivations,
            coreCandidateCounts,
            decisionReasons,
            maxAimErrorDegrees: Number(maxAimErrorDegrees.toFixed(2)),
            goalExpansions,
            pressurePulses,
            roundResets,
            maxNoScoreSeconds: Number((maxNoScoreTicks / TICKS_PER_SECOND).toFixed(2)),
            overTwentySecondStalls,
            maxConcurrentPucks,
            maxConcurrentBullets,
            invalid,
            tickLimit,
            unsafeReadyResets,
            unexpectedPucks,
          }),
        );
      }
    }
  }

  console.log(
    JSON.stringify({
      audit: 'gameplay-v1',
      totalMatches,
      boards,
      difficulties,
      modes,
      seedsPerCondition: requestedSeeds,
      maxTicks,
      failures,
      failureSummary: summary,
      note: '勝率・無得点区間は診断値。初見試遊と公平感の合否には使わない。',
    }),
  );

  if (failures > 0) process.exitCode = 1;
} finally {
  rmSync(compiled, { recursive: true, force: true });
}
