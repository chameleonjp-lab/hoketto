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
  readonly openingMinX: number;
  readonly openingMaxX: number;
  readonly scorePlane: number;
  readonly postRadius: number;
}

export interface BoardDefinition {
  readonly id: string;
  readonly width: number;
  readonly height: number;
  readonly minimumCorridor: number;
  readonly goals: readonly [GoalDefinition, GoalDefinition];
  readonly staticCircles: readonly Circle[];
  readonly staticBoxes: readonly Aabb[];
  readonly staticSegments: readonly Segment[];
  readonly initialPucks: readonly Circle[];
  readonly coreCandidates: readonly Point[];
}

export interface BoardValidationResult {
  readonly ok: boolean;
  readonly errors: readonly string[];
}
