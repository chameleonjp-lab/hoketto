import type { BoardDefinition } from '../domain/types';
import { assertValidBoard } from '../physics/boardValidator';

export type PlayableBoardId = 'straight-bench' | 'twin-block' | 'ricochet-lane';

export const STRAIGHT_BENCH: BoardDefinition = {
  id: 'straight-bench',
  width: 360,
  height: 640,
  minimumCorridor: 360,
  goals: [
    {
      side: 'top',
      scoreFor: 'player',
      openingMinX: 122,
      openingMaxX: 238,
      scorePlane: 24,
      postRadius: 14,
    },
    {
      side: 'bottom',
      scoreFor: 'cpu',
      openingMinX: 122,
      openingMaxX: 238,
      scorePlane: 616,
      postRadius: 14,
    },
  ],
  staticCircles: [],
  staticBoxes: [],
  staticSegments: [],
  initialPucks: [{ center: { x: 180, y: 320 }, radius: 14 }],
  coreCandidates: [
    { x: 90, y: 320 },
    { x: 180, y: 320 },
    { x: 270, y: 320 },
  ],
};

export const TWIN_BLOCK: BoardDefinition = {
  id: 'twin-block',
  width: 360,
  height: 640,
  minimumCorridor: 136,
  goals: STRAIGHT_BENCH.goals,
  staticCircles: [],
  staticBoxes: [
    { minX: 64, minY: 248, maxX: 112, maxY: 392 },
    { minX: 248, minY: 248, maxX: 296, maxY: 392 },
  ],
  staticSegments: [],
  initialPucks: [{ center: { x: 180, y: 320 }, radius: 14 }],
  coreCandidates: [
    { x: 140, y: 320 },
    { x: 180, y: 320 },
    { x: 220, y: 320 },
  ],
};

export const RICOCHET_LANE: BoardDefinition = {
  id: 'ricochet-lane',
  width: 360,
  height: 640,
  minimumCorridor: 110,
  goals: STRAIGHT_BENCH.goals,
  staticCircles: [],
  staticBoxes: [],
  staticSegments: [
    { start: { x: 78, y: 260 }, end: { x: 150, y: 188 } },
    { start: { x: 210, y: 452 }, end: { x: 282, y: 380 } },
  ],
  initialPucks: [{ center: { x: 180, y: 320 }, radius: 14 }],
  coreCandidates: [
    { x: 120, y: 320 },
    { x: 180, y: 320 },
    { x: 240, y: 320 },
  ],
};

export function getBoardDefinition(board: PlayableBoardId): BoardDefinition {
  if (board === 'twin-block') return TWIN_BLOCK;
  if (board === 'ricochet-lane') return RICOCHET_LANE;
  return STRAIGHT_BENCH;
}

assertValidBoard(STRAIGHT_BENCH);
assertValidBoard(TWIN_BLOCK);
assertValidBoard(RICOCHET_LANE);
