import type {
  Aabb,
  BoardDefinition,
  BoardValidationResult,
  Circle,
  GoalDefinition,
  Point,
  Segment,
} from '../domain/types';
import { createBoardGeometry, type BoardGeometry } from './boardGeometry';
import {
  circleOverlapsAabb,
  circleOverlapsSegment,
  circlesOverlap,
  distanceSquared,
  pointToAabbDistanceSquared,
  pointToSegmentDistanceSquared,
  rotatePoint180,
} from './geometry';

const DEFAULT_TOLERANCE = 1 / 16;
const DEFAULT_MIN_CANDIDATE_DISTANCE = 38;
const PUCK_RADIUS = 14;
const NORMAL_GOAL_OPENING_MIN_X = 122;
const NORMAL_GOAL_OPENING_MAX_X = 238;
const NORMAL_GOAL_POST_RADIUS = 14;
const GEOMETRY_EXPANSION_RATIOS = [0, 0.12, 0.2] as const;

interface CircleShape {
  readonly kind: 'circle';
  readonly value: Circle;
}

interface BoxShape {
  readonly kind: 'box';
  readonly value: Aabb;
}

interface SegmentShape {
  readonly kind: 'segment';
  readonly value: Segment;
}

type StaticShape = CircleShape | BoxShape | SegmentShape;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isFinitePoint(value: unknown): value is Point {
  return isRecord(value) && isFiniteNumber(value.x) && isFiniteNumber(value.y);
}

function isFiniteCircle(value: unknown): value is Circle {
  return (
    isRecord(value) &&
    isFinitePoint(value.center) &&
    isFiniteNumber(value.radius) &&
    value.radius > 0
  );
}

function isFiniteAabb(value: unknown): value is Aabb {
  return (
    isRecord(value) &&
    isFiniteNumber(value.minX) &&
    isFiniteNumber(value.minY) &&
    isFiniteNumber(value.maxX) &&
    isFiniteNumber(value.maxY) &&
    value.minX < value.maxX &&
    value.minY < value.maxY
  );
}

function isFiniteSegment(value: unknown): value is Segment {
  return isRecord(value) && isFinitePoint(value.start) && isFinitePoint(value.end);
}

function isGoal(value: unknown): value is GoalDefinition {
  return isRecord(value) && (value.side === 'top' || value.side === 'bottom');
}

function pointsMatch(a: Point, b: Point, tolerance: number): boolean {
  return distanceSquared(a, b) <= tolerance * tolerance;
}

function numbersMatch(a: number, b: number, tolerance: number): boolean {
  return Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= tolerance;
}

function safeTolerance(tolerance: number): number {
  return Number.isFinite(tolerance) && tolerance >= 0 ? tolerance : DEFAULT_TOLERANCE;
}

function circleInsideBounds(circle: Circle, bounds: Aabb): boolean {
  return (
    circle.center.x - circle.radius >= bounds.minX &&
    circle.center.x + circle.radius <= bounds.maxX &&
    circle.center.y - circle.radius >= bounds.minY &&
    circle.center.y + circle.radius <= bounds.maxY
  );
}

function circleInsideWorld(circle: Circle, width: number, height: number): boolean {
  return (
    circle.center.x - circle.radius >= 0 &&
    circle.center.x + circle.radius <= width &&
    circle.center.y - circle.radius >= 0 &&
    circle.center.y + circle.radius <= height
  );
}

function boxInsideBounds(box: Aabb, bounds: Aabb): boolean {
  return (
    box.minX >= bounds.minX &&
    box.maxX <= bounds.maxX &&
    box.minY >= bounds.minY &&
    box.maxY <= bounds.maxY
  );
}

function segmentInsideBounds(segment: Segment, bounds: Aabb): boolean {
  return (
    segment.start.x >= bounds.minX &&
    segment.start.x <= bounds.maxX &&
    segment.end.x >= bounds.minX &&
    segment.end.x <= bounds.maxX &&
    segment.start.y >= bounds.minY &&
    segment.start.y <= bounds.maxY &&
    segment.end.y >= bounds.minY &&
    segment.end.y <= bounds.maxY
  );
}

function segmentInsideWorld(segment: Segment, width: number, height: number): boolean {
  return (
    segment.start.x >= 0 &&
    segment.start.x <= width &&
    segment.end.x >= 0 &&
    segment.end.x <= width &&
    segment.start.y >= 0 &&
    segment.start.y <= height &&
    segment.end.y >= 0 &&
    segment.end.y <= height
  );
}

function circleOverlapsStatic(
  circle: Circle,
  staticCircles: readonly Circle[],
  staticBoxes: readonly Aabb[],
  staticSegments: readonly Segment[],
): boolean {
  return (
    staticBoxes.some((box) => circleOverlapsAabb(circle, box)) ||
    staticCircles.some((other) => circlesOverlap(circle, other)) ||
    staticSegments.some((segment) => circleOverlapsSegment(circle, segment))
  );
}

function circleOverlapsPosts(circle: Circle, posts: readonly Circle[]): boolean {
  return posts.some((post) => circlesOverlap(circle, post));
}

function aabbEdges(box: Aabb): readonly [Segment, Segment, Segment, Segment] {
  return [
    { start: { x: box.minX, y: box.minY }, end: { x: box.maxX, y: box.minY } },
    { start: { x: box.maxX, y: box.minY }, end: { x: box.maxX, y: box.maxY } },
    { start: { x: box.maxX, y: box.maxY }, end: { x: box.minX, y: box.maxY } },
    { start: { x: box.minX, y: box.maxY }, end: { x: box.minX, y: box.minY } },
  ];
}

function cross(a: Point, b: Point, c: Point): number {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

function pointOnSegment(point: Point, segment: Segment): boolean {
  const epsilon =
    Number.EPSILON *
    Math.max(
      1,
      Math.abs(segment.start.x),
      Math.abs(segment.start.y),
      Math.abs(segment.end.x),
      Math.abs(segment.end.y),
      Math.abs(point.x),
      Math.abs(point.y),
    );
  return (
    Math.abs(cross(segment.start, segment.end, point)) <= epsilon &&
    point.x >= Math.min(segment.start.x, segment.end.x) - epsilon &&
    point.x <= Math.max(segment.start.x, segment.end.x) + epsilon &&
    point.y >= Math.min(segment.start.y, segment.end.y) - epsilon &&
    point.y <= Math.max(segment.start.y, segment.end.y) + epsilon
  );
}

function segmentsIntersect(a: Segment, b: Segment): boolean {
  const a1 = cross(a.start, a.end, b.start);
  const a2 = cross(a.start, a.end, b.end);
  const b1 = cross(b.start, b.end, a.start);
  const b2 = cross(b.start, b.end, a.end);
  if (a1 === 0 && pointOnSegment(b.start, a)) return true;
  if (a2 === 0 && pointOnSegment(b.end, a)) return true;
  if (b1 === 0 && pointOnSegment(a.start, b)) return true;
  if (b2 === 0 && pointOnSegment(a.end, b)) return true;
  return a1 > 0 !== a2 > 0 && b1 > 0 !== b2 > 0;
}

function segmentSegmentDistanceSquared(a: Segment, b: Segment): number {
  if (segmentsIntersect(a, b)) return 0;
  return Math.min(
    pointToSegmentDistanceSquared(a.start, b),
    pointToSegmentDistanceSquared(a.end, b),
    pointToSegmentDistanceSquared(b.start, a),
    pointToSegmentDistanceSquared(b.end, a),
  );
}

function segmentIntersectsAabb(segment: Segment, box: Aabb): boolean {
  const inside = (point: Point): boolean =>
    point.x >= box.minX && point.x <= box.maxX && point.y >= box.minY && point.y <= box.maxY;
  return (
    inside(segment.start) ||
    inside(segment.end) ||
    aabbEdges(box).some((edge) => segmentsIntersect(segment, edge))
  );
}

function segmentAabbDistanceSquared(segment: Segment, box: Aabb): number {
  if (segmentIntersectsAabb(segment, box)) return 0;
  return Math.min(...aabbEdges(box).map((edge) => segmentSegmentDistanceSquared(segment, edge)));
}

function shapeDistance(a: StaticShape, b: StaticShape): number {
  if (a.kind === 'circle' && b.kind === 'circle') {
    return Math.max(
      0,
      Math.hypot(a.value.center.x - b.value.center.x, a.value.center.y - b.value.center.y) -
        a.value.radius -
        b.value.radius,
    );
  }
  if (a.kind === 'box' && b.kind === 'box') {
    const dx = Math.max(b.value.minX - a.value.maxX, a.value.minX - b.value.maxX, 0);
    const dy = Math.max(b.value.minY - a.value.maxY, a.value.minY - b.value.maxY, 0);
    return Math.hypot(dx, dy);
  }
  if (a.kind === 'circle' && b.kind === 'box') {
    return Math.max(
      0,
      Math.sqrt(pointToAabbDistanceSquared(a.value.center, b.value)) - a.value.radius,
    );
  }
  if (a.kind === 'box' && b.kind === 'circle') return shapeDistance(b, a);
  if (a.kind === 'circle' && b.kind === 'segment') {
    return Math.max(
      0,
      Math.sqrt(pointToSegmentDistanceSquared(a.value.center, b.value)) - a.value.radius,
    );
  }
  if (a.kind === 'segment' && b.kind === 'circle') return shapeDistance(b, a);
  if (a.kind === 'segment' && b.kind === 'segment') {
    return Math.sqrt(segmentSegmentDistanceSquared(a.value, b.value));
  }
  if (a.kind === 'box' && b.kind === 'segment') {
    return Math.sqrt(segmentAabbDistanceSquared(b.value, a.value));
  }
  if (a.kind === 'segment' && b.kind === 'box') {
    return Math.sqrt(segmentAabbDistanceSquared(a.value, b.value));
  }
  return Number.NaN;
}

function circleShape(value: Circle): CircleShape {
  return { kind: 'circle', value };
}

function boxShape(value: Aabb): BoxShape {
  return { kind: 'box', value };
}

function segmentShape(value: Segment): SegmentShape {
  return { kind: 'segment', value };
}

function staticShapes(
  staticCircles: readonly Circle[],
  staticBoxes: readonly Aabb[],
  staticSegments: readonly Segment[],
): readonly StaticShape[] {
  return [
    ...staticCircles.map(circleShape),
    ...staticBoxes.map(boxShape),
    ...staticSegments.map(segmentShape),
  ];
}

function tryCreateBoardGeometry(
  board: BoardDefinition,
  expansionRatio: number,
): BoardGeometry | null {
  try {
    return createBoardGeometry(board, expansionRatio);
  } catch {
    return null;
  }
}

/** 盤面に存在する境界、開口、静止形状から最小の実測間隔を返します。 */
export function measureMinimumCorridor(board: BoardDefinition): number {
  if (!isRecord(board)) return Number.NaN;
  const bounds = board.bounds;
  if (!isFiniteAabb(bounds)) return Number.NaN;
  const staticCircles = Array.isArray(board.staticCircles) ? board.staticCircles : null;
  const staticBoxes = Array.isArray(board.staticBoxes) ? board.staticBoxes : null;
  const staticSegments = Array.isArray(board.staticSegments) ? board.staticSegments : null;
  const goals = Array.isArray(board.goals) ? board.goals : null;
  if (!staticCircles || !staticBoxes || !staticSegments || !goals) return Number.NaN;
  if (
    !staticCircles.every(isFiniteCircle) ||
    !staticBoxes.every(isFiniteAabb) ||
    !staticSegments.every(isFiniteSegment) ||
    !goals.every(isGoal)
  ) {
    return Number.NaN;
  }
  const geometry = tryCreateBoardGeometry(board, 0);
  if (!geometry) return Number.NaN;
  const shapes = staticShapes(staticCircles, staticBoxes, staticSegments);
  const candidates: number[] = [bounds.maxX - bounds.minX, bounds.maxY - bounds.minY];
  for (const goal of goals) candidates.push(goal.openingMaxX - goal.openingMinX);
  for (let i = 0; i < shapes.length; i += 1) {
    const shape = shapes[i];
    if (!shape) continue;
    for (let j = i + 1; j < shapes.length; j += 1) {
      const other = shapes[j];
      if (other) candidates.push(shapeDistance(shape, other));
    }
    for (const wall of geometry.walls) candidates.push(shapeDistance(shape, segmentShape(wall)));
    for (const mouthSide of geometry.mouthSides)
      candidates.push(shapeDistance(shape, segmentShape(mouthSide)));
    for (const post of geometry.posts) candidates.push(shapeDistance(shape, circleShape(post)));
  }
  const finiteCandidates = candidates.filter((candidate) => Number.isFinite(candidate));
  return finiteCandidates.length > 0 ? Math.min(...finiteCandidates) : Number.NaN;
}

function addUniqueError(errors: string[], error: string): void {
  if (!errors.includes(error)) errors.push(error);
}

function matchesRotatedCircle(
  circle: Circle,
  other: Circle,
  width: number,
  height: number,
  tolerance: number,
): boolean {
  const rotated = rotatePoint180(circle.center, width, height);
  return (
    pointsMatch(rotated, other.center, tolerance) &&
    numbersMatch(circle.radius, other.radius, tolerance)
  );
}

function matchesRotatedBox(
  box: Aabb,
  other: Aabb,
  width: number,
  height: number,
  tolerance: number,
): boolean {
  return (
    numbersMatch(width - box.maxX, other.minX, tolerance) &&
    numbersMatch(height - box.maxY, other.minY, tolerance) &&
    numbersMatch(width - box.minX, other.maxX, tolerance) &&
    numbersMatch(height - box.minY, other.maxY, tolerance)
  );
}

function matchesRotatedSegment(
  segment: Segment,
  other: Segment,
  width: number,
  height: number,
  tolerance: number,
): boolean {
  const start = rotatePoint180(segment.start, width, height);
  const end = rotatePoint180(segment.end, width, height);
  return (
    (pointsMatch(start, other.start, tolerance) && pointsMatch(end, other.end, tolerance)) ||
    (pointsMatch(start, other.end, tolerance) && pointsMatch(end, other.start, tolerance))
  );
}

function hasOneToOneMatch<T>(
  values: readonly T[],
  candidates: readonly T[],
  matcher: (value: T, candidate: T) => boolean,
): boolean {
  const used = new Set<number>();
  for (const value of values) {
    let found = -1;
    for (let index = 0; index < candidates.length; index += 1) {
      if (used.has(index)) continue;
      const candidate = candidates[index];
      if (candidate !== undefined && matcher(value, candidate)) {
        found = index;
        break;
      }
    }
    if (found < 0) return false;
    used.add(found);
  }
  return true;
}

function validateGeometry(
  board: BoardDefinition,
  geometry: BoardGeometry,
  expansionRatio: number,
  errors: string[],
  tolerance: number,
): void {
  const bounds = board.bounds;
  if (!isFiniteAabb(geometry.bounds)) {
    addUniqueError(errors, '生成された盤面境界に不正な値があります');
    return;
  }
  if (
    !numbersMatch(geometry.bounds.minX, bounds.minX, tolerance) ||
    !numbersMatch(geometry.bounds.minY, bounds.minY, tolerance) ||
    !numbersMatch(geometry.bounds.maxX, bounds.maxX, tolerance) ||
    !numbersMatch(geometry.bounds.maxY, bounds.maxY, tolerance)
  ) {
    addUniqueError(errors, '生成された盤面境界が定義と一致しません');
  }
  if (
    !Array.isArray(geometry.walls) ||
    !Array.isArray(geometry.mouthSides) ||
    !Array.isArray(geometry.posts) ||
    !Array.isArray(geometry.goals)
  ) {
    addUniqueError(errors, '生成された盤面形状が不正です');
    return;
  }
  for (const mouthSide of geometry.mouthSides) {
    if (!isFiniteSegment(mouthSide)) {
      addUniqueError(errors, 'ゴール開口の側壁に不正な値があります');
    } else if (!segmentInsideWorld(mouthSide, board.width, board.height)) {
      addUniqueError(errors, 'ゴール開口の側壁が盤面外にあります');
    }
  }
  for (const wall of geometry.walls) {
    if (!isFiniteSegment(wall)) {
      addUniqueError(errors, '盤面の壁に不正な値があります');
    } else if (!segmentInsideBounds(wall, bounds)) {
      addUniqueError(errors, '盤面の壁が境界の外にあります');
    }
  }
  for (const post of geometry.posts) {
    if (!isFiniteCircle(post)) {
      addUniqueError(errors, 'ゴール支柱に不正な値があります');
    } else if (!circleInsideWorld(post, board.width, board.height)) {
      addUniqueError(errors, 'ゴール支柱が盤面外にあります');
    }
  }
  for (const goalValue of geometry.goals) {
    const goal = goalValue;
    const expandedMin = goal.openingMinX;
    const expandedMax = goal.openingMaxX;
    if (
      !isFiniteNumber(expandedMin) ||
      !isFiniteNumber(expandedMax) ||
      expandedMin >= expandedMax ||
      expandedMin < bounds.minX ||
      expandedMax > bounds.maxX
    ) {
      addUniqueError(errors, 'ゴール開口部または拡大開口部が不正です');
    }
    if (
      !Array.isArray(goal.posts) ||
      goal.posts.length !== 2 ||
      !goal.posts.every(isFiniteCircle)
    ) {
      addUniqueError(errors, 'ゴール支柱に不正な値があります');
    } else {
      const [leftPost, rightPost] = goal.posts;
      if (leftPost && rightPost && circlesOverlap(leftPost, rightPost)) {
        addUniqueError(errors, 'ゴール支柱同士が重なっています');
      }
      if (leftPost && rightPost && isFiniteNumber(expandedMin) && isFiniteNumber(expandedMax)) {
        const expectedLeftX = expandedMin - leftPost.radius;
        const expectedRightX = expandedMax + rightPost.radius;
        if (
          !numbersMatch(leftPost.center.x, expectedLeftX, tolerance) ||
          !numbersMatch(rightPost.center.x, expectedRightX, tolerance) ||
          !numbersMatch(leftPost.center.y, goal.scorePlane, tolerance) ||
          !numbersMatch(rightPost.center.y, goal.scorePlane, tolerance) ||
          !numbersMatch(leftPost.radius, rightPost.radius, tolerance)
        ) {
          addUniqueError(errors, 'ゴール支柱の位置または半径が開口部と一致しません');
        }
      }
    }
    if (
      !Array.isArray(goal.rails) ||
      goal.rails.length !== 2 ||
      !goal.rails.every(isFiniteSegment)
    ) {
      addUniqueError(errors, 'ゴールレールに不正な値があります');
    } else if (
      Array.isArray(goal.posts) &&
      goal.posts.length === 2 &&
      goal.posts.every(isFiniteCircle)
    ) {
      const [leftPost, rightPost] = goal.posts;
      const [leftRail, rightRail] = goal.rails;
      if (leftPost && rightPost && leftRail && rightRail) {
        const leftRailEndsAtPost = pointsMatch(leftRail.end, leftPost.center, tolerance);
        const rightRailStartsAtPost = pointsMatch(rightRail.start, rightPost.center, tolerance);
        if (!leftRailEndsAtPost || !rightRailStartsAtPost) {
          addUniqueError(errors, 'ゴールレールと支柱が接続していません');
        }
      }
    }
    if (
      !Array.isArray(goal.mouthSides) ||
      goal.mouthSides.length !== 2 ||
      !goal.mouthSides.every(isFiniteSegment)
    ) {
      addUniqueError(errors, 'ゴール開口の側壁に不正な値があります');
    } else {
      const [leftMouth, rightMouth] = goal.mouthSides;
      if (leftMouth && rightMouth && isFiniteNumber(expandedMin) && isFiniteNumber(expandedMax)) {
        const expectedTop = goal.side === 'top' ? bounds.minY : bounds.maxY;
        const expectedOuter =
          goal.side === 'top' ? bounds.minY - goal.postRadius : bounds.maxY + goal.postRadius;
        if (
          !numbersMatch(leftMouth.start.x, expandedMin, tolerance) ||
          !numbersMatch(rightMouth.start.x, expandedMax, tolerance) ||
          !numbersMatch(leftMouth.start.y, expectedTop, tolerance) ||
          !numbersMatch(rightMouth.start.y, expectedTop, tolerance) ||
          !numbersMatch(leftMouth.end.y, expectedOuter, tolerance) ||
          !numbersMatch(rightMouth.end.y, expectedOuter, tolerance)
        ) {
          addUniqueError(errors, 'ゴール開口の側壁が開口部と一致しません');
        }
      }
    }
    const expectedWidth =
      isFiniteNumber(expandedMin) && isFiniteNumber(expandedMax)
        ? expandedMax - expandedMin
        : Number.NaN;
    const sourceGoal = board.goals.find((candidate) => candidate.side === goal.side);
    const baseWidth = sourceGoal ? sourceGoal.openingMaxX - sourceGoal.openingMinX : Number.NaN;
    if (
      !Number.isFinite(expectedWidth) ||
      !Number.isFinite(baseWidth) ||
      (expansionRatio >= 0 &&
        baseWidth > 0 &&
        !numbersMatch(expectedWidth, baseWidth * (1 + expansionRatio), tolerance))
    ) {
      addUniqueError(errors, 'ゴール開口部が拡大率に対して不正です');
    }
  }
}

function validateGoalSymmetry(
  topGoal: GoalDefinition,
  bottomGoal: GoalDefinition,
  board: BoardDefinition,
  errors: string[],
  tolerance: number,
): void {
  if (topGoal.scoreFor === bottomGoal.scoreFor) {
    addUniqueError(errors, '上下ゴールの得点担当が180度回転対称になっていません');
  }
  if (
    !numbersMatch(board.width - topGoal.openingMaxX, bottomGoal.openingMinX, tolerance) ||
    !numbersMatch(board.width - topGoal.openingMinX, bottomGoal.openingMaxX, tolerance) ||
    !numbersMatch(board.height - topGoal.scorePlane, bottomGoal.scorePlane, tolerance) ||
    !numbersMatch(topGoal.postRadius, bottomGoal.postRadius, tolerance)
  ) {
    addUniqueError(errors, '上下ゴールが180度回転対称になっていません');
  }
}

function validateGeometrySymmetry(
  board: BoardDefinition,
  geometries: readonly BoardGeometry[],
  errors: string[],
  tolerance: number,
): void {
  for (const geometry of geometries) {
    if (
      !hasOneToOneMatch(geometry.posts, geometry.posts, (post, candidate) =>
        matchesRotatedCircle(post, candidate, board.width, board.height, tolerance),
      )
    ) {
      addUniqueError(errors, '生成されたゴール支柱が180度回転対称になっていません');
    }
    if (
      !hasOneToOneMatch(geometry.walls, geometry.walls, (wall, candidate) =>
        matchesRotatedSegment(wall, candidate, board.width, board.height, tolerance),
      )
    ) {
      addUniqueError(errors, '生成された壁が180度回転対称になっていません');
    }
    if (
      !hasOneToOneMatch(geometry.mouthSides, geometry.mouthSides, (side, candidate) =>
        matchesRotatedSegment(side, candidate, board.width, board.height, tolerance),
      )
    ) {
      addUniqueError(errors, '生成されたゴール側壁が180度回転対称になっていません');
    }
  }
}

function validateStaticSymmetry(
  board: BoardDefinition,
  staticCircles: readonly Circle[],
  staticBoxes: readonly Aabb[],
  staticSegments: readonly Segment[],
  errors: string[],
  tolerance: number,
): void {
  if (
    !hasOneToOneMatch(staticCircles, staticCircles, (circle, candidate) =>
      matchesRotatedCircle(circle, candidate, board.width, board.height, tolerance),
    )
  ) {
    addUniqueError(errors, '静止円が180度回転対称になっていません');
  }
  if (
    !hasOneToOneMatch(staticBoxes, staticBoxes, (box, candidate) =>
      matchesRotatedBox(box, candidate, board.width, board.height, tolerance),
    )
  ) {
    addUniqueError(errors, '静止長方形が180度回転対称になっていません');
  }
  if (
    !hasOneToOneMatch(staticSegments, staticSegments, (segment, candidate) =>
      matchesRotatedSegment(segment, candidate, board.width, board.height, tolerance),
    )
  ) {
    addUniqueError(errors, '静止線分が180度回転対称になっていません');
  }
}

function validateInitialPuckSymmetry(
  board: BoardDefinition,
  initialPucks: readonly Circle[],
  errors: string[],
  tolerance: number,
): void {
  if (
    !hasOneToOneMatch(initialPucks, initialPucks, (puck, candidate) =>
      matchesRotatedCircle(puck, candidate, board.width, board.height, tolerance),
    )
  ) {
    addUniqueError(errors, '初期パックが180度回転対称になっていません');
  }
}

function validateCandidateSymmetry(
  board: BoardDefinition,
  candidates: readonly Point[],
  errors: string[],
  tolerance: number,
): void {
  if (
    !hasOneToOneMatch(candidates, candidates, (candidate, other) =>
      pointsMatch(rotatePoint180(candidate, board.width, board.height), other, tolerance),
    )
  ) {
    addUniqueError(errors, '高出力コア候補が180度回転対称になっていません');
  }
}

function resetPucksMatch(
  pucks: readonly Circle[],
  expected: readonly Circle[],
  width: number,
  height: number,
  tolerance: number,
): boolean {
  return (
    hasOneToOneMatch(pucks, expected, (puck, candidate) =>
      matchesRotatedCircle(puck, candidate, width, height, tolerance),
    ) && pucks.length === expected.length
  );
}

function validateResetSymmetry(
  board: BoardDefinition,
  candidates: readonly Point[],
  resets: readonly { readonly candidateIndex: number; readonly normalPucks: readonly Circle[] }[],
  errors: string[],
  tolerance: number,
): void {
  for (const reset of resets) {
    const candidate = candidates[reset.candidateIndex];
    if (!candidate) continue;
    const rotatedCandidate = rotatePoint180(candidate, board.width, board.height);
    const targetIndex = candidates.findIndex((other) =>
      pointsMatch(rotatedCandidate, other, tolerance),
    );
    if (targetIndex < 0) {
      addUniqueError(errors, 'コアリセットの候補位置が180度回転対称になっていません');
      continue;
    }
    const counterpart = resets.some(
      (other) =>
        other.candidateIndex === targetIndex &&
        resetPucksMatch(other.normalPucks, reset.normalPucks, board.width, board.height, tolerance),
    );
    if (!counterpart) {
      addUniqueError(errors, 'コアリセット集合が180度回転対称になっていません');
    }
  }
}

function validateResetPatterns(
  board: BoardDefinition,
  candidates: readonly Point[],
  resets: readonly { readonly candidateIndex: number; readonly normalPucks: readonly Circle[] }[],
  errors: string[],
  tolerance: number,
): void {
  for (let index = 0; index < candidates.length; index += 1) {
    if (!resets.some((reset) => reset.candidateIndex === index)) {
      addUniqueError(errors, '高出力コア候補ごとにコアリセットが1つ以上必要です');
    }
  }
  if (candidates.length === 0) return;
  const centerIndex = Math.floor((candidates.length - 1) / 2);
  const center = { x: board.width / 2, y: board.height / 2 };
  const centerResets = resets.filter((reset) => reset.candidateIndex === centerIndex);
  const hasLeftVariant = centerResets.some((reset) =>
    reset.normalPucks.some((puck) =>
      pointsMatch(puck.center, { x: center.x - 40, y: center.y }, tolerance),
    ),
  );
  const hasRightVariant = centerResets.some((reset) =>
    reset.normalPucks.some((puck) =>
      pointsMatch(puck.center, { x: center.x + 40, y: center.y }, tolerance),
    ),
  );
  if (!hasLeftVariant || !hasRightVariant || centerResets.length < 2) {
    addUniqueError(errors, '中央の高出力コア候補には左右40のリセットが必要です');
  }
  for (const reset of resets) {
    if (reset.candidateIndex === centerIndex) continue;
    if (!reset.normalPucks.some((puck) => pointsMatch(puck.center, center, tolerance))) {
      addUniqueError(errors, '中央候補以外のコアリセットには中央通常パックが必要です');
    }
  }
}

function validateResetSafety(
  candidates: readonly Point[],
  resets: readonly { readonly candidateIndex: number; readonly normalPucks: readonly Circle[] }[],
  staticCircles: readonly Circle[],
  staticBoxes: readonly Aabb[],
  staticSegments: readonly Segment[],
  posts: readonly Circle[],
  bounds: Aabb,
  errors: string[],
): void {
  for (const reset of resets) {
    const candidate = candidates[reset.candidateIndex];
    if (!candidate) continue;
    const core: Circle = { center: candidate, radius: PUCK_RADIUS };
    if (circleOverlapsStatic(core, staticCircles, staticBoxes, staticSegments)) {
      addUniqueError(errors, 'コアリセットの予約輪が静止形状と重なっています');
    }
    if (circleOverlapsPosts(core, posts)) {
      addUniqueError(errors, 'コアリセットの予約輪がゴール支柱と重なっています');
    }
    for (const puck of reset.normalPucks) {
      if (!circleInsideBounds(puck, bounds)) {
        addUniqueError(errors, 'コアリセットの通常パックが盤面外にあります');
      }
      if (circleOverlapsStatic(puck, staticCircles, staticBoxes, staticSegments)) {
        addUniqueError(errors, 'コアリセットの通常パックが静止形状と重なっています');
      }
      if (circleOverlapsPosts(puck, posts)) {
        addUniqueError(errors, 'コアリセットの通常パックがゴール支柱と重なっています');
      }
      if (circlesOverlap(puck, core)) {
        addUniqueError(errors, 'コアリセットの通常パックが予約輪と重なっています');
      }
    }
    for (let i = 0; i < reset.normalPucks.length; i += 1) {
      const puck = reset.normalPucks[i];
      if (!puck) continue;
      for (let j = i + 1; j < reset.normalPucks.length; j += 1) {
        const other = reset.normalPucks[j];
        if (other && circlesOverlap(puck, other)) {
          addUniqueError(errors, 'コアリセットの通常パック同士が重なっています');
        }
      }
    }
  }
}

export function validateBoard(
  board: BoardDefinition,
  tolerance = DEFAULT_TOLERANCE,
): BoardValidationResult {
  const errors: string[] = [];
  const matchTolerance = safeTolerance(tolerance);

  if (!isRecord(board)) {
    return { ok: false, errors: ['盤面定義が不正です'] };
  }

  const hasValidDimensions =
    isFiniteNumber(board.width) &&
    isFiniteNumber(board.height) &&
    board.width > 0 &&
    board.height > 0;
  if (!hasValidDimensions) {
    addUniqueError(errors, '盤面の幅と高さは正の有限値である必要があります');
  }

  const bounds = board.bounds;
  const hasValidBounds = isFiniteAabb(bounds);
  if (!hasValidBounds) {
    addUniqueError(errors, '盤面の境界に不正な値があります');
  } else {
    if (
      !hasValidDimensions ||
      bounds.minX < 0 ||
      bounds.minY < 0 ||
      bounds.maxX > board.width ||
      bounds.maxY > board.height
    ) {
      addUniqueError(errors, '盤面の境界が盤面の外にあります');
    }
    if (
      !numbersMatch(bounds.minX, 24, matchTolerance) ||
      !numbersMatch(bounds.minY, 24, matchTolerance) ||
      !numbersMatch(bounds.maxX, 336, matchTolerance) ||
      !numbersMatch(bounds.maxY, 616, matchTolerance)
    ) {
      addUniqueError(errors, '盤面の境界は標準値(24,24)-(336,616)である必要があります');
    }
    if (
      hasValidDimensions &&
      (!numbersMatch(bounds.minX, board.width - bounds.maxX, matchTolerance) ||
        !numbersMatch(bounds.minY, board.height - bounds.maxY, matchTolerance))
    ) {
      addUniqueError(errors, '盤面の境界が180度回転対称になっていません');
    }
  }

  const staticCircles = Array.isArray(board.staticCircles) ? board.staticCircles : [];
  const staticBoxes = Array.isArray(board.staticBoxes) ? board.staticBoxes : [];
  const staticSegments = Array.isArray(board.staticSegments) ? board.staticSegments : [];
  for (const circle of staticCircles) {
    if (!isFiniteCircle(circle)) {
      addUniqueError(errors, '静止円に不正な値があります');
    } else if (hasValidBounds && !circleInsideBounds(circle, bounds)) {
      addUniqueError(errors, '静止円が盤面の外にあります');
    }
  }
  for (const box of staticBoxes) {
    if (!isFiniteAabb(box)) {
      addUniqueError(errors, '静止長方形に不正な値があります');
    } else if (hasValidBounds && !boxInsideBounds(box, bounds)) {
      addUniqueError(errors, '静止長方形が盤面の外にあります');
    }
  }
  for (const segment of staticSegments) {
    if (!isFiniteSegment(segment)) {
      addUniqueError(errors, '静止線分に不正な値があります');
    } else if (hasValidBounds && !segmentInsideBounds(segment, bounds)) {
      addUniqueError(errors, '静止線分が盤面の外にあります');
    }
  }

  const goalValues = Array.isArray(board.goals) ? board.goals : [];
  const topGoal = goalValues.find((goal) => isGoal(goal) && goal.side === 'top');
  const bottomGoal = goalValues.find((goal) => isGoal(goal) && goal.side === 'bottom');
  if (!topGoal || !bottomGoal || goalValues.length !== 2) {
    addUniqueError(errors, '上側と下側のゴールを1つずつ定義してください');
  } else {
    if (topGoal.scoreFor !== 'player' || bottomGoal.scoreFor !== 'cpu') {
      addUniqueError(errors, '上側ゴールはplayer、下側ゴールはcpuへ得点する必要があります');
    }
    for (const goal of [topGoal, bottomGoal]) {
      const openingIsFinite =
        isFiniteNumber(goal.openingMinX) &&
        isFiniteNumber(goal.openingMaxX) &&
        isFiniteNumber(goal.scorePlane) &&
        isFiniteNumber(goal.postRadius);
      if (
        !openingIsFinite ||
        goal.openingMinX >= goal.openingMaxX ||
        goal.postRadius <= 0 ||
        (hasValidBounds && (goal.openingMinX < bounds.minX || goal.openingMaxX > bounds.maxX))
      ) {
        addUniqueError(errors, `${goal.side}ゴールの開口部または得点面が不正です`);
      }
      if (
        openingIsFinite &&
        (!numbersMatch(goal.openingMinX, NORMAL_GOAL_OPENING_MIN_X, matchTolerance) ||
          !numbersMatch(goal.openingMaxX, NORMAL_GOAL_OPENING_MAX_X, matchTolerance))
      ) {
        addUniqueError(errors, `${goal.side}ゴールの開口部は122..238である必要があります`);
      }
      if (
        openingIsFinite &&
        !numbersMatch(goal.postRadius, NORMAL_GOAL_POST_RADIUS, matchTolerance)
      ) {
        addUniqueError(errors, `${goal.side}ゴールの支柱半径は14である必要があります`);
      }
      if (
        openingIsFinite &&
        hasValidBounds &&
        !numbersMatch(
          goal.scorePlane,
          goal.side === 'top' ? bounds.minY : bounds.maxY,
          matchTolerance,
        )
      ) {
        addUniqueError(errors, `${goal.side}ゴールの得点面が盤面境界と一致しません`);
      }
    }
    if (topGoal.scorePlane >= bottomGoal.scorePlane) {
      addUniqueError(errors, '上側ゴールの得点面は下側ゴールより上に必要です');
    }
    if (hasValidDimensions)
      validateGoalSymmetry(topGoal, bottomGoal, board, errors, matchTolerance);
  }

  const geometries: BoardGeometry[] = [];
  for (const expansionRatio of GEOMETRY_EXPANSION_RATIOS) {
    const geometry = tryCreateBoardGeometry(board, expansionRatio);
    if (!geometry) {
      addUniqueError(errors, '盤面形状を生成できません');
      continue;
    }
    geometries.push(geometry);
    if (hasValidBounds && hasValidDimensions) {
      validateGeometry(board, geometry, expansionRatio, errors, matchTolerance);
    }
  }
  if (hasValidDimensions && geometries.length > 0) {
    validateGeometrySymmetry(board, geometries, errors, matchTolerance);
  }
  const posts = geometries.flatMap((geometry) => geometry.posts.filter(isFiniteCircle));

  const initialPucks = Array.isArray(board.initialPucks) ? board.initialPucks : [];
  const validStaticCircles = staticCircles.filter(isFiniteCircle);
  const validStaticBoxes = staticBoxes.filter(isFiniteAabb);
  const validStaticSegments = staticSegments.filter(isFiniteSegment);
  for (const puck of initialPucks) {
    if (!isFiniteCircle(puck)) {
      addUniqueError(errors, '初期パックに不正な値があります');
      continue;
    }
    if (hasValidBounds && !circleInsideBounds(puck, bounds)) {
      addUniqueError(errors, '初期パックが盤面の外にあります');
    }
    if (circleOverlapsStatic(puck, validStaticCircles, validStaticBoxes, validStaticSegments)) {
      addUniqueError(errors, '初期パックが静止形状と重なっています');
    }
    if (circleOverlapsPosts(puck, posts)) {
      addUniqueError(errors, '初期パックがゴール支柱と重なっています');
    }
  }
  for (let i = 0; i < initialPucks.length; i += 1) {
    const puck = initialPucks[i];
    if (!isFiniteCircle(puck)) continue;
    for (let j = i + 1; j < initialPucks.length; j += 1) {
      const other = initialPucks[j];
      if (isFiniteCircle(other) && circlesOverlap(puck, other)) {
        addUniqueError(errors, '初期パック同士が重なっています');
      }
    }
  }

  const candidates = Array.isArray(board.coreCandidates) ? board.coreCandidates : [];
  if (candidates.length < 3) {
    addUniqueError(errors, '高出力コアの候補位置が3か所未満です');
  }
  for (const candidate of candidates) {
    if (!isFinitePoint(candidate)) {
      addUniqueError(errors, '高出力コア候補に不正な値があります');
      continue;
    }
    const core = { center: candidate, radius: PUCK_RADIUS };
    if (hasValidBounds && !circleInsideBounds(core, bounds)) {
      addUniqueError(errors, '高出力コア候補が盤面の外にあります');
    }
    if (circleOverlapsStatic(core, validStaticCircles, validStaticBoxes, validStaticSegments)) {
      addUniqueError(errors, '高出力コア候補が静止形状と重なっています');
    }
    if (circleOverlapsPosts(core, posts)) {
      addUniqueError(errors, '高出力コア候補がゴール支柱と重なっています');
    }
  }
  for (let i = 0; i < candidates.length; i += 1) {
    const candidate = candidates[i];
    if (!isFinitePoint(candidate)) continue;
    for (let j = i + 1; j < candidates.length; j += 1) {
      const other = candidates[j];
      if (
        isFinitePoint(other) &&
        distanceSquared(candidate, other) < DEFAULT_MIN_CANDIDATE_DISTANCE ** 2
      ) {
        addUniqueError(errors, '高出力コア候補同士の間隔が38論理ピクセル未満です');
      }
    }
    const rotated = hasValidDimensions
      ? rotatePoint180(candidate, board.width, board.height)
      : null;
    if (
      rotated &&
      !candidates.some(
        (other) => isFinitePoint(other) && pointsMatch(rotated, other, matchTolerance),
      )
    ) {
      addUniqueError(errors, '高出力コア候補が180度回転対称になっていません');
    }
  }

  const resetsRaw = board.coreRoundResets;
  const resets: { readonly candidateIndex: number; readonly normalPucks: readonly Circle[] }[] = [];
  if (!Array.isArray(resetsRaw)) {
    addUniqueError(errors, 'コアリセットを定義してください');
  } else {
    for (const resetValue of resetsRaw) {
      if (
        !isRecord(resetValue) ||
        !isFiniteNumber(resetValue.candidateIndex) ||
        !Number.isInteger(resetValue.candidateIndex)
      ) {
        addUniqueError(errors, 'コアリセットの候補番号が不正です');
        continue;
      }
      if (!Array.isArray(resetValue.normalPucks)) {
        addUniqueError(errors, 'コアリセットの通常パック定義が不正です');
        continue;
      }
      const normalPucks = resetValue.normalPucks;
      if (normalPucks.length === 0) {
        addUniqueError(errors, 'コアリセットに通常パックがありません');
      }
      if (resetValue.candidateIndex < 0 || resetValue.candidateIndex >= candidates.length) {
        addUniqueError(errors, 'コアリセットが存在しない候補を指しています');
        continue;
      }
      if (!normalPucks.every(isFiniteCircle)) {
        addUniqueError(errors, 'コアリセットの通常パックに不正な値があります');
        continue;
      }
      resets.push({ candidateIndex: resetValue.candidateIndex, normalPucks });
    }
  }
  if (hasValidBounds) {
    validateResetSafety(
      candidates.filter(isFinitePoint),
      resets,
      validStaticCircles,
      validStaticBoxes,
      validStaticSegments,
      posts,
      bounds,
      errors,
    );
  }
  if (hasValidDimensions) {
    const validCandidates = candidates.filter(isFinitePoint);
    validateResetPatterns(board, validCandidates, resets, errors, matchTolerance);
    validateResetSymmetry(board, validCandidates, resets, errors, matchTolerance);
    validateStaticSymmetry(
      board,
      validStaticCircles,
      validStaticBoxes,
      validStaticSegments,
      errors,
      matchTolerance,
    );
    validateInitialPuckSymmetry(board, initialPucks.filter(isFiniteCircle), errors, matchTolerance);
    if (hasValidBounds) validateCandidateSymmetry(board, validCandidates, errors, matchTolerance);
  }

  const measuredCorridor = measureMinimumCorridor(board);
  if (!Number.isFinite(board.minimumCorridor) || board.minimumCorridor < 38) {
    addUniqueError(errors, '通路幅が38論理ピクセル未満です');
  } else if (
    Number.isFinite(measuredCorridor) &&
    board.minimumCorridor > measuredCorridor + matchTolerance
  ) {
    addUniqueError(errors, '自己申告の通路幅が実測値を超えています');
  } else if (!Number.isFinite(measuredCorridor)) {
    addUniqueError(errors, '通路幅を実測できません');
  }

  return { ok: errors.length === 0, errors };
}

export function assertValidBoard(board: BoardDefinition): void {
  const result = validateBoard(board);
  if (!result.ok) {
    throw new Error(`盤面検査に失敗しました: ${result.errors.join('、')}`);
  }
}
