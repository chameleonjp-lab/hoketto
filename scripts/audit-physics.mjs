import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// 2026-09-08監査と同じ3盤面×2難易度×4戦法×100seed。
// 純粋な固定更新のみ。ブラウザー・ランキング・外部サービスへ接続しない。
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const compiled = mkdtempSync(join(tmpdir(), 'hoketto-physics-'));
const require = createRequire(import.meta.url);
const requestedSeeds = Number.parseInt(process.env.HOKETTO_AUDIT_SEEDS ?? '100', 10);
const requestedTicks = Number.parseInt(process.env.HOKETTO_AUDIT_TICKS ?? '20000', 10);
const seedCount = Number.isSafeInteger(requestedSeeds) && requestedSeeds > 0 ? requestedSeeds : 100;
const maxTicks =
  Number.isSafeInteger(requestedTicks) && requestedTicks > 0 ? requestedTicks : 20_000;
const select = (name, fallback) => {
  const requested = process.env[name]
    ?.split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  return requested?.length ? requested : fallback;
};
const boards = select('HOKETTO_AUDIT_BOARDS', ['straight-bench', 'twin-block', 'ricochet-lane']);
const difficulties = select('HOKETTO_AUDIT_DIFFICULTIES', ['normal', 'practice']);
const modes = select('HOKETTO_AUDIT_MODES', ['idle', 'center', 'fixed-left', 'track']);

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
  for (const board of boards) {
    for (const difficulty of difficulties) {
      for (const mode of modes) {
        let wins = 0,
          losses = 0,
          draws = 0,
          goals = 0,
          stalled = 0,
          invalid = 0;
        let overlapMatches = 0,
          unsafeRoundResetMatches = 0,
          roundResets = 0;
        const invalidReasons = {};
        const invalidSeeds = [];
        for (let seed = 1; seed <= seedCount; seed += 1) {
          let state = create(seed, 90, difficulty, board);
          let maxStall = 0,
            overlap = false,
            unsafeReset = false;
          for (
            let tick = 0;
            tick < maxTicks && state.match.phase !== 'RESULT' && state.match.phase !== 'INVALID';
            tick += 1
          ) {
            if (
              state.cooldownTicks === 0 &&
              ['PLAYING', 'OVERTIME'].includes(state.match.phase) &&
              mode !== 'idle'
            ) {
              let target = mode === 'fixed-left' ? { x: 140, y: 320 } : { x: 180, y: 320 };
              if (mode === 'track') target = state.pucks.find((p) => p.active)?.position ?? target;
              if (target.x >= 24 && target.x <= 336 && target.y >= 24 && target.y <= 548)
                state = fire(state, target);
            }
            const before = state;
            state = step(state);
            maxStall = Math.max(maxStall, state.noScore.ticksSinceGoal);
            const active = state.pucks.filter((p) => p.active);
            for (let a = 0; a < active.length; a += 1) {
              for (let b = a + 1; b < active.length; b += 1) {
                if (
                  Math.hypot(
                    active[a].position.x - active[b].position.x,
                    active[a].position.y - active[b].position.y,
                  ) <
                  active[a].radius + active[b].radius - 1e-6
                )
                  overlap = true;
              }
            }
            // 得点凍結の位置と実際の再開位置を区別する。
            if (
              before.match.phase === 'GOAL_PAUSE' &&
              ['PLAYING', 'OVERTIME', 'OVERTIME_NOTICE'].includes(state.match.phase)
            ) {
              roundResets += 1;
              const normal = active.find((p) => p.points !== 2);
              const core = active.find((p) => p.points === 2);
              if (core && (core.position.y < 38 || core.position.y > 602)) unsafeReset = true;
              if (normal && state.core.phase !== 'INACTIVE' && state.core.position) {
                if (
                  Math.hypot(
                    normal.position.x - state.core.position.x,
                    normal.position.y - state.core.position.y,
                  ) <
                  normal.radius + 14 - 1e-6
                )
                  unsafeReset = true;
              }
            }
          }
          if (state.match.phase !== 'RESULT') {
            invalid += 1;
            const reason = state.invalidReason ?? 'tick-limit';
            invalidReasons[reason] = (invalidReasons[reason] ?? 0) + 1;
            invalidSeeds.push({ seed, reason });
          }
          if (state.match.playerScore > state.match.cpuScore) wins += 1;
          else if (state.match.playerScore < state.match.cpuScore) losses += 1;
          else draws += 1;
          goals += state.match.playerScore + state.match.cpuScore;
          if (maxStall > 2_400) stalled += 1;
          if (overlap) overlapMatches += 1;
          if (unsafeReset) unsafeRoundResetMatches += 1;
        }
        failures += invalid + overlapMatches + unsafeRoundResetMatches;
        console.log(
          JSON.stringify({
            board,
            difficulty,
            mode,
            wins,
            losses,
            draws,
            meanGoals: goals / seedCount,
            stalledOver20Sec: stalled,
            invalid,
            invalidSeeds,
            overlapMatches,
            unsafeRoundResetMatches,
            roundResets,
            invalidReasons,
          }),
        );
      }
    }
  }
  if (failures > 0) process.exitCode = 1;
} finally {
  rmSync(compiled, { recursive: true, force: true });
}
