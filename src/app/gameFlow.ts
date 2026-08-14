export type AppScreen = 'HOME' | 'TUTORIAL' | 'GAME';

export interface AppFlowState {
  readonly screen: AppScreen;
  readonly tutorialStep: number;
}

export interface TutorialStep {
  readonly title: string;
  readonly body: string;
}

export const TUTORIAL_STEPS: readonly TutorialStep[] = [
  {
    title: '1. 方向を決める',
    body: '盤面の下から白いパックへ向けて、画面を触って狙います。',
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

export function createAppFlowState(): AppFlowState {
  return { screen: 'HOME', tutorialStep: 0 };
}

export function openTutorial(state: AppFlowState): AppFlowState {
  return { ...state, screen: 'TUTORIAL', tutorialStep: 0 };
}

export function nextTutorial(state: AppFlowState): AppFlowState {
  if (state.screen !== 'TUTORIAL') return state;
  if (state.tutorialStep >= TUTORIAL_STEP_COUNT - 1) {
    return { ...state, screen: 'GAME', tutorialStep: TUTORIAL_STEP_COUNT - 1 };
  }
  return { ...state, tutorialStep: state.tutorialStep + 1 };
}

export function skipTutorial(state: AppFlowState): AppFlowState {
  if (state.screen !== 'TUTORIAL') return state;
  return { ...state, screen: 'GAME' };
}

export function startGame(state: AppFlowState): AppFlowState {
  return { ...state, screen: 'GAME' };
}

export function returnHome(): AppFlowState {
  return createAppFlowState();
}
