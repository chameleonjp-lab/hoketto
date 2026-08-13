import type { BoardDefinition, BoardValidationResult, Circle, Point } from '../domain/types';
import {
  circleOverlapsAabb,
  circlesOverlap,
  distanceSquared,
  isFinitePoint,
  rotatePoint180,
} from './geometry';

const DEFAULT_TOLERANCE = 1 / 16;
const DEFAULT_MIN_CANDIDATE_DISTANCE = 38;

function isFiniteCircle(circle: Circle): boolean {
  return isFinitePoint(circle.center) && Number.isFinite(circle.radius) && circle.radius > 0;
}

function pointsMatch(a: Point, b: Point, tolerance: number): boolean {
  return distanceSquared(a, b) <= tolerance * tolerance;
}

export function validateBoard(
  board: BoardDefinition,
  tolerance = DEFAULT_TOLERANCE,
): BoardValidationResult {
  const errors: string[] = [];

  if (
    !Number.isFinite(board.width) ||
    !Number.isFinite(board.height) ||
    board.width <= 0 ||
    board.height <= 0
  ) {
    errors.push('盤面の幅と高さは正の有限値である必要があります');
  }

  if (board.minimumCorridor < 38) {
    errors.push('通路幅が38論理ピクセル未満です');
  }

  for (const circle of board.staticCircles) {
    if (!isFiniteCircle(circle)) {
      errors.push('静止円に不正な値があります');
    }
  }

  for (const box of board.staticBoxes) {
    if (
      !Number.isFinite(box.minX) ||
      !Number.isFinite(box.minY) ||
      !Number.isFinite(box.maxX) ||
      !Number.isFinite(box.maxY) ||
      box.minX >= box.maxX ||
      box.minY >= box.maxY
    ) {
      errors.push('静止長方形に不正な値があります');
    }
  }

  for (const puck of board.initialPucks) {
    if (!isFiniteCircle(puck)) {
      errors.push('初期パックに不正な値があります');
      continue;
    }
    if (
      puck.center.x - puck.radius < 0 ||
      puck.center.x + puck.radius > board.width ||
      puck.center.y - puck.radius < 0 ||
      puck.center.y + puck.radius > board.height
    ) {
      errors.push('初期パックが盤面の外にあります');
    }
    if (board.staticBoxes.some((box) => circleOverlapsAabb(puck, box))) {
      errors.push('初期パックが静止長方形と重なっています');
    }
    if (board.staticCircles.some((circle) => circlesOverlap(puck, circle))) {
      errors.push('初期パックが静止円と重なっています');
    }
  }

  for (let i = 0; i < board.initialPucks.length; i += 1) {
    const puck = board.initialPucks[i];
    if (!puck) continue;
    for (let j = i + 1; j < board.initialPucks.length; j += 1) {
      const other = board.initialPucks[j];
      if (other && circlesOverlap(puck, other)) {
        errors.push('初期パック同士が重なっています');
      }
    }
  }

  const topGoal = board.goals.find((goal) => goal.side === 'top');
  const bottomGoal = board.goals.find((goal) => goal.side === 'bottom');
  if (!topGoal || !bottomGoal) {
    errors.push('上側と下側のゴールを1つずつ定義してください');
  } else {
    if (topGoal.scoreFor !== 'player' || bottomGoal.scoreFor !== 'cpu') {
      errors.push('上側ゴールはplayer、下側ゴールはcpuへ得点する必要があります');
    }
    for (const goal of [topGoal, bottomGoal]) {
      if (
        goal.openingMinX < 0 ||
        goal.openingMaxX > board.width ||
        goal.openingMinX >= goal.openingMaxX ||
        !Number.isFinite(goal.scorePlane) ||
        !Number.isFinite(goal.postRadius) ||
        goal.postRadius <= 0
      ) {
        errors.push(`${goal.side}ゴールの開口部または得点面が不正です`);
      }
    }
    if (topGoal.scorePlane >= bottomGoal.scorePlane) {
      errors.push('上側ゴールの得点面は下側ゴールより上に必要です');
    }
  }

  if (board.coreCandidates.length < 3) {
    errors.push('高出力コアの候補位置が3か所未満です');
  }

  for (const candidate of board.coreCandidates) {
    if (!isFinitePoint(candidate)) {
      errors.push('高出力コア候補に不正な値があります');
      continue;
    }
    if (
      candidate.x < 0 ||
      candidate.x > board.width ||
      candidate.y < 0 ||
      candidate.y > board.height
    ) {
      errors.push('高出力コア候補が盤面の外にあります');
    }
    const core = { center: candidate, radius: 14 };
    if (board.staticBoxes.some((box) => circleOverlapsAabb(core, box))) {
      errors.push('高出力コア候補が静止長方形と重なっています');
    }
    if (board.staticCircles.some((circle) => circlesOverlap(core, circle))) {
      errors.push('高出力コア候補が静止円と重なっています');
    }
  }

  for (let i = 0; i < board.coreCandidates.length; i += 1) {
    const candidate = board.coreCandidates[i];
    if (!candidate) continue;
    for (let j = i + 1; j < board.coreCandidates.length; j += 1) {
      const other = board.coreCandidates[j];
      if (other && distanceSquared(candidate, other) < DEFAULT_MIN_CANDIDATE_DISTANCE ** 2) {
        errors.push('高出力コア候補同士の間隔が38論理ピクセル未満です');
      }
    }
    const rotated = rotatePoint180(candidate, board.width, board.height);
    if (!board.coreCandidates.some((other) => pointsMatch(rotated, other, tolerance))) {
      errors.push('高出力コア候補が180度回転対称になっていません');
    }
  }

  return { ok: errors.length === 0, errors };
}

export function assertValidBoard(board: BoardDefinition): void {
  const result = validateBoard(board);
  if (!result.ok) {
    throw new Error(`盤面検査に失敗しました: ${result.errors.join('、')}`);
  }
}
