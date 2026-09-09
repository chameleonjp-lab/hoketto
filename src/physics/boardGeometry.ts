import type { Aabb, BoardDefinition, Circle, GoalDefinition, Segment } from '../domain/types';

export interface ResolvedGoal extends GoalDefinition {
  readonly posts: readonly [Circle, Circle];
  readonly rails: readonly [Segment, Segment];
  /** 開口の内縁。得点面の外側まで延び、端からのすり抜けを防ぐ。 */
  readonly mouthSides: readonly [Segment, Segment];
}

export interface BoardGeometry {
  readonly bounds: Aabb;
  readonly walls: readonly Segment[];
  readonly mouthSides: readonly Segment[];
  readonly posts: readonly Circle[];
  readonly goals: readonly ResolvedGoal[];
}

const geometryCache = new WeakMap<BoardDefinition, Map<number, BoardGeometry>>();

/** 開口、支柱、外周、得点面を物理と描画へ同じ形で渡す。 */
export function createBoardGeometry(board: BoardDefinition, expansionRatio = 0): BoardGeometry {
  if (!Number.isFinite(expansionRatio) || expansionRatio < 0) {
    throw new Error('ゴール拡大率は0以上の有限値で指定してください');
  }
  const cached = geometryCache.get(board)?.get(expansionRatio);
  if (cached) return cached;
  const { bounds } = board;
  const goals = board.goals.map((goal): ResolvedGoal => {
    const center = (goal.openingMinX + goal.openingMaxX) / 2;
    const halfWidth = ((goal.openingMaxX - goal.openingMinX) * (1 + expansionRatio)) / 2;
    const openingMinX = center - halfWidth;
    const openingMaxX = center + halfWidth;
    const left = { x: openingMinX - goal.postRadius, y: goal.scorePlane };
    const right = { x: openingMaxX + goal.postRadius, y: goal.scorePlane };
    const outerY =
      goal.side === 'top' ? bounds.minY - goal.postRadius : bounds.maxY + goal.postRadius;
    return {
      ...goal,
      openingMinX,
      openingMaxX,
      posts: [
        { center: left, radius: goal.postRadius },
        { center: right, radius: goal.postRadius },
      ],
      rails: [
        { start: { x: bounds.minX, y: goal.scorePlane }, end: left },
        { start: right, end: { x: bounds.maxX, y: goal.scorePlane } },
      ],
      mouthSides: [
        { start: { x: openingMinX, y: goal.scorePlane }, end: { x: openingMinX, y: outerY } },
        { start: { x: openingMaxX, y: goal.scorePlane }, end: { x: openingMaxX, y: outerY } },
      ],
    };
  });
  const geometry: BoardGeometry = {
    bounds,
    goals,
    walls: [
      { start: { x: bounds.minX, y: bounds.minY }, end: { x: bounds.minX, y: bounds.maxY } },
      { start: { x: bounds.maxX, y: bounds.minY }, end: { x: bounds.maxX, y: bounds.maxY } },
      ...goals.flatMap((goal) => goal.rails),
    ],
    mouthSides: goals.flatMap((goal) => goal.mouthSides),
    posts: goals.flatMap((goal) => goal.posts),
  };
  const ratios = geometryCache.get(board) ?? new Map<number, BoardGeometry>();
  ratios.set(expansionRatio, geometry);
  geometryCache.set(board, ratios);
  return geometry;
}
