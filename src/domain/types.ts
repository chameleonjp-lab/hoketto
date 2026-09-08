export type Team = 'player' | 'cpu';

export type BoardSide = 'top' | 'bottom';

export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface Circle {
  readonly center: Point;
  readonly radius: number;
}

export interface Segment {
  readonly start: Point;
  readonly end: Point;
}

export interface Aabb {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

export interface GoalDefinition {
  readonly side: BoardSide;
  readonly scoreFor: Team;
  /** 支柱の内側にある、パックが通れる開口の端。 */
  readonly openingMinX: number;
  readonly openingMaxX: number;
  readonly scorePlane: number;
  readonly postRadius: number;
}

export interface CoreRoundReset {
  readonly candidateIndex: number;
  readonly normalPucks: readonly Circle[];
}

export interface BoardDefinition {
  readonly id: string;
  readonly width: number;
  readonly height: number;
  /** 描画するレールの中心線。物理もこの境界を使う。 */
  readonly bounds: Aabb;
  readonly minimumCorridor: number;
  readonly goals: readonly [GoalDefinition, GoalDefinition];
  readonly staticCircles: readonly Circle[];
  readonly staticBoxes: readonly Aabb[];
  readonly staticSegments: readonly Segment[];
  readonly initialPucks: readonly Circle[];
  readonly coreCandidates: readonly Point[];
  /** 同じ候補に複数ある場合は試合の乱数種で選ぶ。集合全体が回転対称。 */
  readonly coreRoundResets: readonly CoreRoundReset[];
}

export interface BoardValidationResult {
  readonly ok: boolean;
  readonly errors: readonly string[];
}
