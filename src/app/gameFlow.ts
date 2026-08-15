export type AppScreen = 'HOME' | 'TUTORIAL' | 'SELECT' | 'GAME' | 'RESULT';

export type BoardId = 'straight-bench' | 'twin-block' | 'ricochet-lane';

export type DifficultyId = 'practice' | 'normal';

export type GameModeId = 'trial' | 'match';

export interface GameSelection {
  readonly board: BoardId;
  readonly difficulty: DifficultyId;
  readonly mode: GameModeId;
}

export type MatchWinner = 'PLAYER' | 'CPU' | 'DRAW';

export interface GameResult {
  readonly playerScore: number;
  readonly cpuScore: number;
  readonly selection: GameSelection;
  readonly winner: MatchWinner;
  readonly seed: number;
}

export interface AppFlowState {
  readonly screen: AppScreen;
  readonly tutorialStep: number;
  readonly tutorialActionCompleted: boolean;
  readonly selection: GameSelection;
  readonly result: GameResult | null;
}

export interface TutorialStep {
  readonly title: string;
  readonly body: string;
}

export const TUTORIAL_STEPS: readonly TutorialStep[] = [
  {
    title: '1. 方向を決める',
    body: 'まず白いパックを1回タップして、照準を試します。',
  },
  {
    title: '2. 指を離して撃つ',
    body: '指を離した瞬間に弾が出ます。弾がパックへ当たると、パックが動きます。',
  },
  {
    title: '3. 次の一発を待つ',
    body: '撃った後は輪が満ちるまで待ちます。相手へ向かうパックを横から止めるのも有効です。',
  },
];

export const TUTORIAL_STEP_COUNT = TUTORIAL_STEPS.length;

export const DEFAULT_GAME_SELECTION: GameSelection = {
  board: 'straight-bench',
  difficulty: 'practice',
  mode: 'match',
};

export function canStartSelection(selection: GameSelection): boolean {
  return (
    selection.board === 'straight-bench' &&
    selection.difficulty === 'practice' &&
    (selection.mode === 'trial' || selection.mode === 'match')
  );
}

export function createAppFlowState(): AppFlowState {
  return {
    screen: 'HOME',
    tutorialStep: 0,
    tutorialActionCompleted: false,
    selection: { ...DEFAULT_GAME_SELECTION },
    result: null,
  };
}

export function openTutorial(state: AppFlowState): AppFlowState {
  return {
    ...state,
    screen: 'TUTORIAL',
    tutorialStep: 0,
    tutorialActionCompleted: false,
    result: null,
  };
}

export function openSelection(state: AppFlowState): AppFlowState {
  return { ...state, screen: 'SELECT', result: null };
}

export function chooseBoard(state: AppFlowState, board: BoardId): AppFlowState {
  return { ...state, selection: { ...state.selection, board } };
}

export function chooseDifficulty(state: AppFlowState, difficulty: DifficultyId): AppFlowState {
  return { ...state, selection: { ...state.selection, difficulty } };
}

export function chooseGameMode(state: AppFlowState, mode: GameModeId): AppFlowState {
  return { ...state, selection: { ...state.selection, mode } };
}

export function completeTutorialAction(state: AppFlowState): AppFlowState {
  if (state.screen !== 'TUTORIAL' || state.tutorialStep !== 0) return state;
  return { ...state, tutorialActionCompleted: true };
}

export function nextTutorial(state: AppFlowState): AppFlowState {
  if (state.screen !== 'TUTORIAL') return state;
  if (state.tutorialStep === 0 && !state.tutorialActionCompleted) return state;
  if (state.tutorialStep >= TUTORIAL_STEP_COUNT - 1) {
    return { ...state, screen: 'SELECT', tutorialStep: TUTORIAL_STEP_COUNT - 1, result: null };
  }
  return { ...state, tutorialStep: state.tutorialStep + 1, tutorialActionCompleted: false };
}

export function skipTutorial(state: AppFlowState): AppFlowState {
  if (state.screen !== 'TUTORIAL') return state;
  return { ...state, screen: 'SELECT', tutorialActionCompleted: false, result: null };
}

export function startGame(state: AppFlowState): AppFlowState {
  if (state.screen !== 'SELECT' || !canStartSelection(state.selection)) return state;
  return { ...state, screen: 'GAME', result: null };
}

export function showResult(state: AppFlowState, result: GameResult): AppFlowState {
  if (state.screen !== 'GAME') return state;
  return { ...state, screen: 'RESULT', result };
}

export function startRematch(state: AppFlowState): AppFlowState {
  if (state.screen !== 'RESULT' || !state.result) return state;
  return { ...state, screen: 'GAME', result: null };
}

export function returnHome(): AppFlowState {
  return createAppFlowState();
}
