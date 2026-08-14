import type { BoardDefinition } from '../domain/types';
import { assertValidBoard } from '../physics/boardValidator';

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

assertValidBoard(STRAIGHT_BENCH);
